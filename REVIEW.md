# Incovia App — Análise técnica

Stack: React 18 + Vite 5 + Supabase (auth, postgres, realtime). ~4.200 linhas em `src`, das quais 1.948 estão em `App.jsx`.

---

## 1. Crítico — segurança

### 1.1 Não há RLS no banco
`supabase/schema.sql` não tem uma única linha de `alter table ... enable row level security` nem policies. Todo o controle de permissão do app está no front-end (`userRole === 'admin'`, `disabled={userRole !== 'admin'}`).

A `VITE_SUPABASE_ANON_KEY` vai no bundle JavaScript público — qualquer pessoa que abrir o DevTools no site da Vercel consegue extrair a chave e chamar a API REST do Supabase direto. Sem RLS isso significa:

- ler todos os colaboradores, telefones, programações e faltas;
- inserir, editar e apagar qualquer registro;
- **atualizar a própria linha em `perfis` para `cargo = 'admin'`** e virar admin do sistema.

Este é o problema número 1. Antes de qualquer refatoração:

```sql
alter table public.perfis enable row level security;
alter table public.colaboradores enable row level security;
alter table public.veiculos enable row level security;
alter table public.programacoes enable row level security;
alter table public.faltas enable row level security;
```

E policies com uma função auxiliar de cargo, por exemplo:

```sql
create or replace function public.meu_cargo()
returns text language sql stable security definer set search_path = public as $$
  select cargo from public.perfis where id = auth.uid()
$$;

-- leitura: qualquer usuário aprovado
create policy "ler" on public.programacoes for select
  to authenticated using (public.meu_cargo() in ('admin','editor','leitor'));

-- escrita: admin e editor
create policy "escrever" on public.programacoes for insert
  to authenticated with check (public.meu_cargo() in ('admin','editor'));
create policy "atualizar" on public.programacoes for update
  to authenticated using (public.meu_cargo() in ('admin','editor'));
create policy "apagar" on public.programacoes for delete
  to authenticated using (public.meu_cargo() = 'admin');
```

Em `perfis`, o ponto mais sensível: o usuário pode ler a própria linha, mas **só admin** pode alterar a coluna `cargo`. O jeito seguro é bloquear update direto em `perfis` para não-admin e expor a promoção via RPC `security definer` que valida o cargo de quem chamou.

### 1.2 A RPC `deletar_usuario_completo` precisa validar quem chama
`deletePerfil()` chama `supabase.rpc('deletar_usuario_completo', { uid: id })`. Se essa função for `security definer` sem checar o cargo do chamador lá dentro, qualquer usuário autenticado apaga a conta de qualquer um — o `{userRole === 'admin' && ...}` no JSX não protege nada. Confira o corpo da função e adicione no início:

```sql
if public.meu_cargo() <> 'admin' then
  raise exception 'sem permissão';
end if;
```

### 1.3 Cadastro aberto
`Auth.jsx` permite `signUp` livre e mostra "aguarde a aprovação de um Administrador". Isso só é verdade se (a) existir trigger criando o perfil com `cargo = 'pendente'` e (b) as policies negarem tudo para `pendente`. Hoje, sem RLS, o usuário recém-cadastrado tem acesso total via API. Vale também manter a confirmação de e-mail ligada no painel do Supabase.

---

## 2. Schema no repositório está desatualizado

`supabase/schema.sql` não descreve o banco que o código usa:

| Código (`App.jsx`) | `schema.sql` |
|---|---|
| tabela `faltas` | `registro_faltas` |
| tabela `perfis` | não existe |
| colunas camelCase (`tipoEquipe`, `membroIds`, `statusExecucao`) | snake_case (`tipo_equipe`, `status_execucao`) |
| arrays `membroIds` / `veiculoIds` na própria linha | tabelas de junção `programacao_membros` / `programacao_veiculos` |
| `horarioInicioObra`, `horarioFimObra` | ausentes |

Consequência prática: clonar o repositório e rodar `schema.sql` **não** produz um app funcional, e você não tem o schema real versionado. Exporte o schema atual do Supabase (`supabase db dump --schema public`) e substitua o arquivo. O `seed.sql` está no mesmo estado.

Sobre os arrays vs. tabelas de junção: guardar `membroIds` como array funciona, mas custa integridade referencial (um colaborador apagado deixa IDs órfãos) e dificulta consultas do tipo "em quantas escalas o João esteve". Se for manter arrays, use `uuid[]` com índice GIN; se quiser consistência, volte para as tabelas de junção do schema antigo.

---

## 3. Bugs

**3.1 Precedência de operador — `App.jsx` ~linha 961**

```jsx
{userRole === 'admin' || userRole === 'editor' && (
  <button ...>Criar Programação</button>
)}
```

`&&` avalia antes de `||`. Para um admin isso vira `true || ...` → a expressão retorna `true`, que o React não renderiza: **o botão "Criar Programação" não aparece para o admin no estado vazio**. Corrija com parênteses:

```jsx
{(userRole === 'admin' || userRole === 'editor') && ( ... )}
```

Vale grepar o arquivo por outros `||` seguidos de `&&` sem parênteses.

**3.2 `perfis` copiado dentro de cada programação — linha 129**

`normalizeDb` faz `perfis: Array.isArray(data?.perfis) ? data.perfis : []` **dentro do `.map()` das programações**. Cada programação carrega uma cópia da lista inteira de perfis. É por isso que existe o `delete payload.perfis` em `saveProgramacao()` — um remendo para um dado que nunca deveria estar ali. Remova a linha 129.

**3.3 Realtime dispara refetch total**

```js
.on('postgres_changes', { event: '*', schema: 'public' }, () => fetchDatabase())
```

Qualquer mudança em qualquer tabela refaz as 5 queries do banco inteiro, em todos os clientes conectados. Com 3–4 pessoas editando ao mesmo tempo isso vira cascata. Filtre por tabela (`table: 'programacoes'`) e, melhor ainda, aplique o `payload.new` no estado local em vez de refetchar. No mínimo, debounce de ~300 ms no `fetchDatabase`.

**3.4 Sem update otimista**

Todo `save*` e `updateProgramacaoField` refazem o fetch completo antes de a UI responder. Em conexão de campo (4G ruim) o usuário clica e espera. Atualize o estado local primeiro e reverta em caso de erro.

**3.5 `sort()` in-place em `normalizeDb`**

`data.colaboradores.sort(...)` muta o array recebido. Aqui os dados vêm frescos do fetch, então não quebra hoje, mas é uma armadilha — use `[...data.colaboradores].sort(...)`.

**3.6 `calculateWorkedHours` falha em silêncio**

Se qualquer um dos seis horários estiver vazio, retorna `00:00h` sem sinalizar. Num relatório de horas isso vira dado errado que parece dado válido. Devolva `null` e mostre "—" ou "incompleto" na interface.

**3.7 `alert()` para tudo**

Login, erros de banco, confirmações. Bloqueia a thread e, em erro de Supabase, expõe a mensagem crua do Postgres para o usuário final. Troque por estado de erro no formulário / toast.

---

## 4. Estrutura e código morto

`App.jsx` tem 79 KB e concentra praticamente todo o aplicativo. Ao mesmo tempo existe uma estrutura modularizada **inteira que não é importada por ninguém**:

- `src/lib/constants.js`, `helpers.js`, `derived.js`, `db.js` — nenhum é importado (só `lib/supabase.js` é)
- `src/components/common.jsx`, `modals.jsx`, `pages.jsx`, `drawers.jsx` — nenhum é importado (só `Auth.jsx` é)
- `src/styles/app.css` — duplicata de `src/styles.css`, que é o usado

Isso é uma versão anterior do app (a que rodava em `localStorage`) convivendo com a atual. Pior: as constantes divergiram. `lib/constants.js` tem `'Pintura - Mecânica'`, `'Pintura - Manual'` e `ROLE_OPTIONS` com `'Eletricista'`/`'Técnico'`; `App.jsx` tem outra lista, com `'Operadador de máquina de pintura'` (com typo — "Operadador"). Se alguém voltar a importar de `lib/`, aparecem opções erradas.

Recomendação: apague `src/lib/{constants,helpers,derived,db}.js`, `src/components/{common,modals,pages,drawers}.jsx` e `src/styles/app.css` (o git guarda o histórico). Depois, se quiser quebrar o `App.jsx`, extraia de verdade — começando pelos blocos mais isolados: a página de Acessos, os modais e o painel de programação.

Outros pontos menores:

- `vite.config.js` está vazio — sem `@vitejs/plugin-react`. O JSX funciona por esbuild, mas você perde Fast Refresh no `dev`. Adicione o plugin.
- Sem ESLint, sem testes, sem CI. Um ESLint com `react-hooks` teria pego o bug 3.1 e a dependência do `useEffect`.
- `README.md` tem duas linhas. Falta: variáveis de ambiente necessárias (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), como rodar o schema, como subir local.
- Os exports XLSX geram SpreadsheetML 2003 (XML) — o Excel abre, mas exibe aviso de formato. Funciona; só saiba que é isso.
- Typo em `ROLE_OPTIONS`: `'Operadador de máquina de pintura'` → `'Operador'`. Como está gravado no banco, corrigir exige um `update` nos registros existentes.

---

## 5. Ordem sugerida

1. Ligar RLS e escrever as policies (hoje o app está aberto na internet sem controle de acesso real).
2. Auditar a RPC `deletar_usuario_completo`.
3. Corrigir o bug de precedência (3.1) e o `perfis` duplicado (3.2).
4. Exportar o schema real para `supabase/schema.sql`.
5. Apagar o código morto e adicionar `@vitejs/plugin-react` + ESLint.
6. Só então refatorar o `App.jsx`.

Os passos 1 e 2 são de segurança e valem para hoje; o resto pode ser incremental.
