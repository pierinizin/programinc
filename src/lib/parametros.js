/* =============================================================================
   Parâmetros — as listas e regras que antes eram fixas no código
   -----------------------------------------------------------------------------
   Funções, tipos de serviço, motivos de "não realizado", tipos de veículo e
   as regras com número (horário padrão, máximo por equipe, dias do aviso de
   "falta dar baixa") moram nas tabelas parametros_itens e parametros_regras
   (28-parametros.sql). A tela é a Parâmetros (components/Parametros.jsx).

   Enquanto o 28 não foi rodado — ou se a busca falhar — vale o PADRÃO daqui,
   que é exatamente o que o app usava antes. Nada muda até alguém editar.

   O App carrega uma vez e chama definirParametros(); quem precisa (o quadro,
   o painel da equipe, a regra de documentos) lê pelas funções abaixo, sem
   ter que receber prop por prop.
   ============================================================================= */

export const LISTAS = [
  {
    chave: 'funcao', grupo: 'Pessoas', titulo: 'Funções', singular: 'função',
    texto: 'Aparecem no cadastro de colaborador. Renomear muda em todo mundo que tem a função.',
    comSetor: true, comMarcas: true,
  },
  {
    chave: 'tipo_servico', grupo: 'Programação', titulo: 'Tipos de serviço', singular: 'tipo de serviço',
    texto: 'O tipo de cada equipe na programação. Renomear muda também nas programações já lançadas.',
  },
  {
    chave: 'motivo_nao_realizado', grupo: 'Programação', titulo: 'Motivos de "não realizado"', singular: 'motivo',
    texto: 'Aparecem no status da equipe quando a obra não aconteceu.', maiusculo: true,
  },
  {
    chave: 'tipo_veiculo', grupo: 'Veículos', titulo: 'Tipos de veículo', singular: 'tipo de veículo',
    texto: 'Aparecem no cadastro de veículo.',
  },
];

const it = (valor, dados = {}) => ({ valor, dados, ativo: true });

export const PADRAO_ITENS = {
  funcao: [
    it('Encarregado', { setor: 'trecho', lidera: true }),
    it('Motorista de Veículos Médios', { setor: 'trecho', dirige: true }),
    it('Ajudante de produção', { setor: 'trecho' }),
    it('Operador de máquina de pintura', { setor: 'trecho' }),
    it('Auxiliar administrativo', { setor: 'fora' }),
    it('Assistente administrativo', { setor: 'fora' }),
    it('Mecânico', { setor: 'fora' }),
    it('Almoxarife', { setor: 'fora' }),
    it('Técnico de segurança do trabalho', { setor: 'fora' }),
    it('Auxiliar de serviços gerais', { setor: 'fora' }),
  ],
  tipo_servico: [it('Pintura - Mecânica e Manual'), it('Implantação de Tachas'), it('Implantação de Defensa')],
  motivo_nao_realizado: [it('CHUVA'), it('MANUTENÇÃO'), it('VIAGEM'), it('INTEGRAÇÃO'), it('OUTROS')],
  tipo_veiculo: [it('Caminhão'), it('Caminhonete'), it('Carro'), it('Outro')],
};

export const REGRAS = [
  { chave: 'horario_padrao', titulo: 'Horário padrão de uma equipe nova', texto: 'O "usar o padrão" do painel da equipe também usa estes.' },
  { chave: 'max_equipe', titulo: 'Máximo de pessoas por equipe', texto: 'Contando o encarregado.', unidade: 'pessoas', min: 1, max: 30 },
  { chave: 'dias_sem_baixa', titulo: 'Aviso de "falta dar baixa"', texto: 'Quantos dias para trás o aviso amarelo da programação olha.', unidade: 'dias', min: 1, max: 365 },
];

export const PADRAO_REGRAS = {
  horario_padrao: {
    horarioInicio: '06:30', horarioInicioObra: '07:30', horarioSaidaAlmoco: '11:30',
    horarioRetornoAlmoco: '13:00', horarioFimObra: '17:00', horarioSaida: '18:00',
  },
  max_equipe: 10,
  dias_sem_baixa: 30,
};

/* ------------------------------------------------------------ o que vale */
let atual = { itens: null, regras: {} };

/** linhas = { itens: [...parametros_itens], regras: [...parametros_regras] } ou null (sem o 28). */
export function definirParametros(linhas) {
  if (!linhas) { atual = { itens: null, regras: {} }; return; }
  const itens = {};
  (linhas.itens || []).forEach((r) => { (itens[r.lista] ||= []).push(r); });
  Object.values(itens).forEach((l) => l.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.valor).localeCompare(String(b.valor), 'pt-BR')));
  const regras = Object.fromEntries((linhas.regras || []).map((r) => [r.chave, r.valor]));
  atual = { itens, regras };
}

/** Itens de uma lista. Sem o 28 (ou lista vazia no banco), o padrão. */
export function itensDe(lista, { inativos = false } = {}) {
  const doBanco = atual.itens?.[lista];
  const base = doBanco && doBanco.length ? doBanco : PADRAO_ITENS[lista] || [];
  return inativos ? base : base.filter((x) => x.ativo !== false);
}
export const valoresDe = (lista) => itensDe(lista).map((x) => x.valor);

export function regra(chave) {
  const v = atual.regras[chave];
  return v == null ? PADRAO_REGRAS[chave] : v;
}

/* Função → marcações. Função que não está na lista (texto antigo, digitado
   à mão) cai na regra de sempre: pelo nome. */
function itemDaFuncao(nome) {
  return itensDe('funcao', { inativos: true }).find((x) => x.valor === nome) || null;
}
export function funcaoLidera(nome) {
  const i = itemDaFuncao(nome);
  return i ? Boolean(i.dados?.lidera) : /encarregad/i.test(String(nome || ''));
}
export function funcaoDirige(nome) {
  const i = itemDaFuncao(nome);
  return i ? Boolean(i.dados?.dirige) : /motorista/i.test(String(nome || ''));
}
/** Funções para escolher no cadastro, do setor da pessoa ('trecho' ou outro). */
export function funcoesDoSetor(setor) {
  const alvo = setor === 'trecho' || !setor ? 'trecho' : 'fora';
  return itensDe('funcao').filter((x) => (x.dados?.setor || 'trecho') === alvo).map((x) => x.valor);
}
