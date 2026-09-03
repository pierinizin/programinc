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
 * Comparação em texto funciona porque `data` e os limites do período vêm no
 * mesmo formato 'aaaa-mm-dd' (coluna `date` do Postgres).
 */
export function disponivelEm(historicoStatus, colaborador, data) {
  const periodos = (historicoStatus || []).filter((h) => h.colaboradorId === colaborador.id);
  if (!periodos.length) return colaborador.status !== 'inativo';
  return periodos.some((h) => (
    h.status === 'ativo' && h.inicio <= data && (h.fim == null || data <= h.fim)
  ));
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

  const faltosos = new Set();
  (db.faltas || []).forEach((f) => {
    if (f.data === data) faltosos.add(f.colaboradorId);
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
  const pessoasLivres = (db.colaboradores || []).filter(
    (c) => disponivelEm(db.historicoStatus, c, data)
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
    noPatio,
    atestados,
    feriasHoje,
    equipesDaPessoa,
    equipesDoVeiculo,
    pessoasLivres,
    veiculosLivres,
    pessoasEscaladas,
  };
}
