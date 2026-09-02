/* =============================================================================
   Documentos — regras que a tela e o banco precisam concordar
   -----------------------------------------------------------------------------
   A view documentos_pendencias já sabe tudo isto em SQL. Aqui está de novo, em
   JavaScript, por um motivo específico: a Importação em massa monta a lista de
   linhas ANTES de salvar qualquer coisa, e não dá para perguntar ao banco a
   cada tecla. Se as duas versões discordarem, a tela cobra um documento que a
   view não cobra — então as duas ficam com a mesma frase, lado a lado, e quem
   mexer numa lembra da outra.
   ============================================================================= */

/** O tipo se aplica a esta pessoa? Espelha o `where` da view. */
export function seAplica(tipo, colaborador) {
  const f = String(colaborador?.funcao || '').toLowerCase();
  const motorista = f.includes('motorista');
  const encarregado = f.includes('encarregado');
  switch (tipo.aplica_a) {
    case 'motorista': return motorista;
    case 'encarregado': return encarregado;
    case 'motorista_encarregado': return motorista || encarregado;
    default: return true;
  }
}

/** Os tipos que uma pessoa precisa ter, na ordem da agenda. Atestado fora:
    ele é cobrado pela falta, não pela conferência de pasta. */
export function tiposDaPessoa(tipos, colaborador) {
  return (tipos || [])
    .filter((t) => t.codigo !== 'atestado' && seAplica(t, colaborador))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

/* --- datas ---------------------------------------------------------------- */

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd'. Devolve '' se não for uma data de verdade —
    31/02 não passa, porque um alarme com data inventada é pior que sem alarme. */
export function dataISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  if (!m) return '';
  const [, d, mes, a] = m;
  const iso = `${a}-${mes}-${d}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return '';
  if (dt.getDate() !== Number(d) || dt.getMonth() + 1 !== Number(mes)) return '';
  return iso;
}

/** 'aaaa-mm-dd' -> 'dd/mm/aaaa' */
export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Sugestão de vencimento: hoje + a validade do tipo. É palpite, e a tela diz
    que é — mas na conferência de agenda quase todo mundo renovou "ano passado",
    e corrigir um campo preenchido é mais rápido que preencher um vazio. */
export function sugerirValidade(tipo, base = new Date()) {
  if (!tipo?.vence || !tipo?.meses_validade) return '';
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + Number(tipo.meses_validade));
  return d.toLocaleDateString('pt-BR');
}

/* --- situação de UM documento ---------------------------------------------- */

/** A mesma régua que documentos_pendencias usa em SQL, para a pasta de uma
    pessoa (FichaDocumentos) e para a grade de colaboradores (Documentos)
    concordarem sobre o que é "resolvido" sem duas cópias divergindo. */
export function situacaoDoc(tipo, doc, hoje) {
  if (doc?.dispensado) return ['dispensado', 'Não se aplica a esta pessoa'];
  if (!doc) return ['faltando', 'Não entregue'];
  if (tipo.vence && !doc.valido_ate) return ['sem-data', 'Sem data de validade'];
  if (tipo.vence && doc.valido_ate < hoje) return ['vencido', `Venceu em ${dataBR(doc.valido_ate)}`];
  if (tipo.vence) {
    const dias = Math.round((new Date(doc.valido_ate) - new Date(hoje)) / 86400000);
    if (dias <= (tipo.alerta_dias || 30)) {
      return ['atencao', `Vence em ${dias} dia${dias === 1 ? '' : 's'}`];
    }
    return [doc.caminho ? 'ok' : 'sem-pdf', `Válido até ${dataBR(doc.valido_ate)}`];
  }
  return [doc.caminho ? 'ok' : 'sem-pdf', doc.caminho ? 'Anexado' : 'Registrado, sem o PDF'];
}

/* --- situação da PASTA inteira (grade de colaboradores) -------------------- */

/** 'finalizado'   = nada pendente (anexado ou dispensado em cada tipo que se aplica)
    'vencido'      = tem pendência, e pelo menos um documento já passou da validade —
                     o mais grave dos três, por isso vem na frente dos outros dois
    'sem-anexos'   = tem pendência, nada vencido, e nenhum arquivo foi anexado ainda
    'em-andamento' = o meio-termo: já tem alguma coisa, falta o resto, nada vencido
    `docsPessoa` é um mapa tipo_id -> documento, do jeito que FichaDocumentos já monta. */
export function statusPasta(tipos, colaborador, docsPessoa) {
  const hoje = new Date().toISOString().slice(0, 10);
  const aplicaveis = tiposDaPessoa(tipos, colaborador);
  if (!aplicaveis.length) return 'finalizado';

  let pendentes = 0;
  let comArquivo = 0;
  let vencido = false;
  aplicaveis.forEach((t) => {
    const doc = docsPessoa[t.id];
    if (doc?.caminho) comArquivo += 1;
    const [classe] = situacaoDoc(t, doc, hoje);
    if (classe !== 'ok' && classe !== 'dispensado') pendentes += 1;
    if (classe === 'vencido') vencido = true;
  });

  if (pendentes === 0) return 'finalizado';
  if (vencido) return 'vencido';
  if (comArquivo === 0) return 'sem-anexos';
  return 'em-andamento';
}

export const ORDEM_STATUS_PASTA = ['vencido', 'sem-anexos', 'em-andamento', 'finalizado'];

export const ROTULO_STATUS_PASTA = {
  finalizado: 'Finalizado',
  vencido: 'Vencidos',
  'em-andamento': 'Em andamento',
  'sem-anexos': 'Sem anexos',
};

/* --- situação ------------------------------------------------------------- */

export const ROTULO_SITUACAO = {
  vencido: 'Vencido',
  faltando: 'Não entregue',
  'vence em breve': 'Vence em breve',
  'sem data de validade': 'Sem data de validade',
  'sem o PDF': 'Sem o PDF anexado',
  'atestado nao anexado': 'Falta abonada sem atestado',
  'falta nao lancada': 'Atestado sem falta lançada',
};

/** Classe de cor por urgência, seguindo a semântica já usada no quadro:
    vermelho = impedimento, amarelo = atenção, cinza = pendência de papelada. */
export function classeUrgencia(urgencia) {
  if (urgencia === 1) return 'u-erro';
  if (urgencia === 2) return 'u-nunca';
  if (urgencia === 3 || urgencia === 4) return 'u-atencao';
  return 'u-leve';
}

/* A ordem dos grupos é a ordem da conversa com o fiscal: primeiro o que já
   está irregular hoje, depois o que vai ficar, depois o que nunca chegou.
   Falta de PDF não entra: são centenas de linhas logo depois da importação, e
   um painel que sempre tem centenas de itens deixa de ser painel. */
export const GRUPOS_PAINEL = [
  { chave: 'estourou', titulo: 'Vencidos', urgencias: [1] },
  { chave: 'proximo', titulo: 'Vence em breve', urgencias: [3, 4] },
  { chave: 'nunca', titulo: 'Pendente', urgencias: [2] },
];
