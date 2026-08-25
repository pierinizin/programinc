# Incovia — Programação e Avanço

Aplicação web para programação diária de equipes de campo (pintura viária,
tachas, defensa), controle de colaboradores, veículos, faltas e exportação de
relatórios em PDF/XLSX.

Stack: React 18 + Vite 5 + Supabase (auth, Postgres, realtime). Deploy na Vercel.

---

## Rodando localmente

Requer **Node 20.19+ ou 22.12+** (exigência do Vite 7). Confira com `node -v`;
se estiver abaixo disso, atualize em https://nodejs.org antes do `npm install`.

```bash
npm install
npm run dev
```

Se o `.env.local` ainda não existir, crie-o (veja abaixo). **Não use
`cp .env.example .env.local`** se o arquivo já existir — isso apaga as suas
credenciais e o site abre em branco.

### Variáveis de ambiente

Crie um `.env.local` na raiz (já está no `.gitignore`):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Os dois valores estão no painel do Supabase em **Project Settings → API**.
As mesmas variáveis precisam estar configuradas na Vercel em
**Settings → Environment Variables**.

> A `anon key` é pública por natureza — ela vai no bundle JavaScript do site.
> Quem protege os dados é a RLS no banco, não o segredo da chave. Nunca coloque
> a `service_role key` em variável `VITE_*`.

---

## Banco de dados

Rode no **SQL Editor** do Supabase, nesta ordem:

| Ordem | Arquivo | O que faz | Quando |
|---|---|---|---|
| 1 | `supabase/00-verificar.sql` | Só leitura: confere a estrutura real antes de mexer | **sempre, primeiro** |
| 2 | `supabase/schema.sql` | Tabelas, índices e triggers | banco novo, ou depois de conferir |
| 3 | `supabase/security.sql` | RLS, policies, papéis e RPCs | **sempre** |
| 4 | `supabase/seed.sql` | Dados fictícios | **só em banco vazio** |

> **Banco de produção já rodando:** comece pelo `00-verificar.sql` e leia o
> resumo no fim dele. O `schema.sql` cria triggers que assumem certas colunas —
> se a estrutura real divergir (por exemplo, sem `updated_at`), o trigger faz
> toda atualização falhar. O `seed.sql` aborta sozinho se achar qualquer
> registro, mas o lugar dele é banco vazio de teste, não produção.

`security.sql` é o que impede que qualquer pessoa com a anon key leia ou apague
o banco pela API REST. Sem ele o sistema está aberto. Antes de rodá-lo, garanta
que existe um usuário admin:

```sql
select id, email, cargo from public.perfis;
update public.perfis set cargo = 'admin' where email = 'SEU@EMAIL.COM';
```

### Níveis de acesso

| Cargo | Lê | Cria/edita | Exclui | Gerencia usuários |
|---|:--:|:--:|:--:|:--:|
| `pendente` | — | — | — | — |
| `visualizador` | ✓ | — | — | — |
| `editor` | ✓ | ✓ | — | — |
| `admin` | ✓ | ✓ | ✓ | ✓ |

Todo cadastro novo entra como `pendente` e não enxerga nada até um admin liberar
na aba **Acessos**. A promoção passa pela RPC `definir_cargo_usuario`, que
valida o cargo do chamador no servidor — o `userRole` do React é só interface.

---

## Estrutura

```
src/
  App.jsx                    aplicação (telas, estado, chamadas ao Supabase)
  main.jsx                   entrada
  styles.css                 estilos
  lib/supabase.js            cliente Supabase
  components/Auth.jsx        login, cadastro e recuperação de senha
  exportProgramacaoPdf.js    PDF da programação do dia
  exportProgramacaoXlsx.js   XLSX de programação, pessoas, veículos, histórico
  exportPdfModelo03.js       modelo alternativo de PDF
supabase/
  schema.sql  security.sql  seed.sql
```

---

## Scripts

```bash
npm run dev       # servidor de desenvolvimento com Fast Refresh
npm run build     # build de produção em dist/
npm run preview   # serve o build local
npm run lint      # ESLint
```

---

## Notas

- Os exports XLSX geram SpreadsheetML 2003 (XML). O Excel abre normalmente, mas
  pode exibir um aviso de formato — é esperado.
- `App.jsx` ainda concentra quase toda a aplicação (~1.900 linhas). Se for
  quebrar em módulos, comece pelos blocos mais isolados: a página de Acessos,
  os modais e o painel de programação.
