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
    chave: 'setor', grupo: 'Pessoas', titulo: 'Setores', singular: 'setor', codigo: true, comCor: true,
    texto: 'Onde cada pessoa trabalha. Aparecem no cadastro de colaborador e nas abas do Administrativo.',
  },
  {
    chave: 'funcao', grupo: 'Pessoas', titulo: 'Funções', singular: 'função',
    texto: 'Aparecem no cadastro de colaborador. Renomear muda em todo mundo que tem a função.',
    comSetor: true, comMarcas: true,
  },
  {
    chave: 'motivo_falta', grupo: 'Pessoas', titulo: 'Motivos de ausência', singular: 'motivo', codigo: true, comCor: true,
    texto: 'Aparecem ao lançar uma ausência no quadro e na ficha. A cor é o contorno da pessoa na zona de Ausências.',
  },
  {
    chave: 'tipo_licenca', grupo: 'Pessoas', titulo: 'Tipos de licença', singular: 'tipo de licença',
    texto: 'Aparecem ao registrar uma licença (atestado ou licença → Licença).',
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
  {
    chave: 'situacao_veiculo', grupo: 'Veículos', titulo: 'Situações do veículo', singular: 'situação',
    texto: 'O status de cada veículo. Renomear muda também nos veículos que já estão nela.',
  },
];

/* Listas com CÓDIGO fixo (setor, motivo de ausência): o que fica gravado nas
   pessoas e nas faltas é o código (`valor`), que nunca muda; o nome que
   aparece é dados.rotulo. Renomear é só trocar o rótulo. */
export const rotuloItem = (it) => (it ? it.dados?.rotulo || it.valor : '');

/** 'Almoxarifado Central' → 'almoxarifado_central' (código de setor/motivo). */
export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const CORES_PARAMETRO = ['#E8A317', '#6E56CF', '#0E9F8F', '#8A8F98', '#2F81F7', '#C2298A', '#E5484D', '#12A594', '#F76B15', '#D6A30A', '#8E5BD0', '#7C8790'];

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
  setor: [
    it('trecho', { rotulo: 'Trecho', cor: '#E8A317', campo: true, sistema: true }),
    it('escritorio', { rotulo: 'Escritório', cor: '#6E56CF', campo: false }),
    it('oficina', { rotulo: 'Oficina', cor: '#0E9F8F', campo: false }),
    it('outros', { rotulo: 'Outros', cor: '#8A8F98', campo: false }),
  ],
  motivo_falta: [
    it('falta_justificada', { rotulo: 'Falta justificada', cor: '#D6A30A', conta: true }),
    it('falta_injustificada', { rotulo: 'Falta injustificada', cor: '#F76B15', conta: true }),
    it('atestado_medico', { rotulo: 'Atestado médico', cor: '#E5484D', conta: true, sistema: true }),
    it('licenca', { rotulo: 'Licença', cor: '#8E5BD0', conta: true, sistema: true }),
    it('acidente_trabalho', { rotulo: 'Acidente de trabalho', cor: '#C2298A', conta: true }),
    it('ferias', { rotulo: 'Férias', cor: '#2F81F7', conta: false, sistema: true }),
    it('folga', { rotulo: 'Folga', cor: '#7C8790', conta: false }),
    it('outro', { rotulo: 'Outro', cor: '#12A594', conta: true }),
  ],
  situacao_veiculo: [
    it('Disponível', { comportamento: 'livre', sistema: 'disponivel' }),
    it('Em uso', { comportamento: 'livre', sistema: 'em_uso' }),
    it('Manutenção', { comportamento: 'aviso' }),
    it('Inativo', { comportamento: 'fora', sistema: 'inativo' }),
  ],
  tipo_licenca: [it('Maternidade'), it('Paternidade'), it('Casamento'), it('Falecimento na família'),
    it('Doação de sangue'), it('Serviço militar / Justiça'), it('Outra')],
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

/* ------------------------------------------------------------- setores */
function itemDe(lista, valor) {
  return itensDe(lista, { inativos: true }).find((x) => x.valor === valor) || null;
}

/** [{ valor, rotulo, cor, campo, ativo }] na ordem de Parâmetros. */
export function listaSetores({ inativos = false } = {}) {
  return itensDe('setor', { inativos }).map((x) => ({
    valor: x.valor, rotulo: rotuloItem(x), cor: x.dados?.cor || '#8A8F98',
    campo: Boolean(x.dados?.campo), ativo: x.ativo !== false,
  }));
}
/** O setor "entra na programação" (quadro, equipes, relatórios de campo)?
    Setor fora da lista segue a regra antiga: só o trecho. Espelha
    public.setor_eh_campo (30-setores-motivos-documentos.sql). */
export function setorEhCampo(codigo) {
  const c = codigo || 'trecho';
  const i = itemDe('setor', c);
  return i ? Boolean(i.dados?.campo) : c === 'trecho';
}
export const rotuloDoSetor = (codigo) => {
  const i = itemDe('setor', codigo || 'trecho');
  return i ? rotuloItem(i) : String(codigo || '').replace(/_/g, ' ');
};
export const corDoSetor = (codigo) => itemDe('setor', codigo || 'trecho')?.dados?.cor || '#8A8F98';

/* ------------------------------------------------------ motivos de ausência */
export const itemMotivo = (codigo) => itemDe('motivo_falta', codigo);

/* ---------------------------------------------------- situações do veículo */
const COMPORTAMENTO_ANTIGO = { Inativo: 'fora', 'Manutenção': 'aviso' };
/** 'livre' (usa normal) · 'aviso' (pode usar, com alerta) · 'fora' (não aparece para escalar). */
export function comportamentoVeiculo(status) {
  const i = itemDe('situacao_veiculo', status);
  return i ? i.dados?.comportamento || 'livre' : COMPORTAMENTO_ANTIGO[status] || 'livre';
}
const SITUACAO_ANTIGA = { disponivel: 'Disponível', em_uso: 'Em uso', inativo: 'Inativo' };
/** O nome atual das situações que o app usa sozinho (inativar, reativar, em uso). */
export function situacaoDoSistema(papel) {
  const i = itensDe('situacao_veiculo', { inativos: true }).find((x) => x.dados?.sistema === papel);
  return i ? i.valor : SITUACAO_ANTIGA[papel];
}
export const veiculoFora = (v) => comportamentoVeiculo(v?.status) === 'fora';
