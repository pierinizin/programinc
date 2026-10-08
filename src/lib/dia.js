/**
 * Um colaborador está disponível na data D se o HISTÓRICO tem, para ele, um
 * período com status 'ativo' cobrindo essa data — nunca só o status de agora.
 * Sem isto, inativar alguém hoje também apagava ele das programações de dias
 * passados (quando ele realmente estava ativo), e um colaborador novo
 * aparecia como opção em dias anteriores à própria contratação.
 *
 * Sem NENHUM período registrado para a pessoa (base ainda não migrada com
 * 15-colaboradores-historico-status.sql, ou alguma linha que escapou do
 * backfill), cai de volta no status simples de agora — do jeito que sempre
 * funcionou — em vez de fingir que ninguém está disponível.
 *
 * ANTES do primeiro período registrado o histórico não sabe nada: ele só
 * passou a existir em ago/2026, e o primeiro período de quem já trabalhava
 * nasceu na data da migração (25/08), não na contratação. Ali a pergunta
 * vira "a pessoa já trabalhava nessa data?" — e quem responde é a primeira
 * escala, falta ou pátio dela (`primeiraAtividade`, ver primeirasAtividades).
 * Foi assim que o Emerson sumiu do dia 11/08: sem equipe naquele dia e, pro
 * histórico, ainda "não contratado" — e a tela dizia "Todo mundo já está
 * escalado". Quem foi contratado depois continua de fora dos dias antigos,
 * porque a primeira atividade dele é posterior.
 *
 * Comparação em texto funciona porque `data` e os limites do período vêm no
 * mesmo formato 'aaaa-mm-dd' (coluna `date` do Postgres).
 */
export function disponivelEm(historicoStatus, colaborador, data, primeiraAtividade) {
  const periodos = (historicoStatus || []).filter((h) => h.colaboradorId === colaborador.id);
  if (!periodos.length) return colaborador.status !== 'inativo';

  const inicioHistorico = periodos.reduce((min, h) => (h.inicio < min ? h.inicio : min), periodos[0].inicio);
  if (data < inicioHistorico) {
    const primeira = primeiraAtividade?.get(colaborador.id);
    return Boolean(primeira && primeira <= data);
  }

  return periodos.some((h) => (
    h.status === 'ativo' && h.inicio <= data && (h.fim == null || data <= h.fim)
  ));
}

/**
 * colaboradorId -> a data mais antiga em que a pessoa aparece trabalhando:
 * numa equipe (encarregado ou membro), numa falta ou no pátio. É a prova de
 * que ela já era da empresa naquele dia, pros dias que o histórico de status
 * não cobre (ver disponivelEm).
 */
export function primeirasAtividades(db) {
  const primeira = new Map();
  const marca = (id, data) => {
    if (!id || !data) return;
    const atual = primeira.get(id);
    if (!atual || data < atual) primeira.set(id, data);
  };
  (db.programacoes || []).forEach((p) => {
    marca(p.encarregadoId, p.data);
    (p.membroIds || []).forEach((id) => marca(id, p.data));
  });
  (db.faltas || []).forEach((f) => marca(f.colaboradorId, f.data));
  (db.patio || []).forEach((p) => marca(p.colaboradorId, p.data));
  return primeira;
}

/**
 * Tudo que se deriva de "o dia X": quem está escalado, quem sobrou, quem
 * faltou, quem ficou no pátio.
 *
 * Vive aqui porque DOIS lugares precisam disso: a fita do cabeçalho, que
 * mostra os contadores, e o quadro, que mostra as listas. Se cada um fizesse
 * a própria conta, um dia a fita diria "47 livres" e a lista mostraria 45 —
 * e ninguém saberia qual está certa.
 */
export function derivarDia(db, data) {
  const equipes = (db.programacoes || []).filter((p) => p.data === data);

  // `faltosos` continua valendo pra QUALQUER falta do dia, parcial ou não —
  // é o que impede arrastar alguém pra zona de Faltas duas vezes. `parciais`
  // separa as de meio período (ligadas a uma equipe, ver lib/faltaParcial.js):
  // colaboradorId -> a linha da falta. Quem está aí trabalhou parte do dia
  // numa equipe, então aparece nos DOIS lugares — na equipe com anel vermelho
  // e na zona de Faltas, travado.
  const faltosos = new Set();
  const parciais = new Map();
  (db.faltas || []).forEach((f) => {
    if (f.data !== data) return;
    faltosos.add(f.colaboradorId);
    if (f.programacao_id) parciais.set(f.colaboradorId, f);
  });

  const noPatio = new Set();
  (db.patio || []).forEach((p) => {
    if (p.data === data) noPatio.add(p.colaboradorId);
  });

  // Atestado: colaboradorId -> { ate }. Só entra quem tem, NESTE dia, uma
  // falta que nasceu de atestado (origem_documento_id preenchido) — uma
  // falta comum, lançada à mão, não bloqueia, só avisa. O "até" é o último
  // dia de TODO o período do atestado, não só desta falta, então o card
  // mostra a mesma data que o documento cobre, mesmo se uma linha do meio
  // tiver sido corrigida à mão.
  const atestados = new Map();
  {
    const fimPorDocumento = new Map();
    (db.faltas || []).forEach((f) => {
      if (!f.origem_documento_id) return;
      const atual = fimPorDocumento.get(f.origem_documento_id);
      if (!atual || f.data > atual) fimPorDocumento.set(f.origem_documento_id, f.data);
    });
    (db.faltas || []).forEach((f) => {
      if (f.data !== data || !f.origem_documento_id) return;
      const ate = fimPorDocumento.get(f.origem_documento_id);
      if (ate) atestados.set(f.colaboradorId, { ate });
    });
  }

  // Férias: colaboradorId -> { ate }. Ao contrário de atestado, não mexe em
  // falta nenhuma — a pessoa continua livre para ser escalada, só ganha o
  // aviso visual.
  const feriasHoje = new Map();
  (db.ferias || []).forEach((f) => {
    if (f.data_inicio > data || f.data_fim < data) return;
    const atual = feriasHoje.get(f.colaboradorId);
    if (!atual || f.data_fim > atual.ate) feriasHoje.set(f.colaboradorId, { ate: f.data_fim });
  });

  const equipesDaPessoa = {};
  const equipesDoVeiculo = {};
  equipes.forEach((eq) => {
    new Set([eq.encarregadoId, ...(eq.membroIds || [])].filter(Boolean)).forEach((id) => {
      (equipesDaPessoa[id] = equipesDaPessoa[id] || []).push(eq);
    });
    (eq.veiculoIds || []).forEach((id) => {
      (equipesDoVeiculo[id] = equipesDoVeiculo[id] || []).push(eq);
    });
  });

  // Livre = disponível NESTE dia (histórico, não status de agora), sem
  // equipe hoje, sem falta e fora do pátio. Quem está no pátio veio
  // trabalhar, mas já tem destino — não conta como disponível.
  const primeiraAtividade = primeirasAtividades(db);
  const pessoasLivres = (db.colaboradores || []).filter(
    (c) => disponivelEm(db.historicoStatus, c, data, primeiraAtividade)
      && !equipesDaPessoa[c.id]
      && !noPatio.has(c.id)
      && !faltosos.has(c.id)
  );

  const veiculosLivres = (db.veiculos || []).filter(
    (v) => v.status !== 'Inativo' && !equipesDoVeiculo[v.id]
  );

  const pessoasEscaladas = Object.keys(equipesDaPessoa).length;

  return {
    equipes,
    faltosos,
    parciais,
    noPatio,
    atestados,
    feriasHoje,
    equipesDaPessoa,
    equipesDoVeiculo,
    pessoasLivres,
    veiculosLivres,
    pessoasEscaladas,
    primeiraAtividade,
  };
}
