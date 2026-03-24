
import React, { useEffect, useMemo, useState } from 'react';
import {
  exportProgramacaoModeloAntigo,
  exportProgramacaoXlsx,
  exportPessoasXlsx,
  exportVeiculosXlsx,
  exportHistoricoXlsx,
} from './exportProgramacaoXlsx';
import { exportProgramacaoPdfModelo03 } from './exportProgramacaoPdf';

const STORAGE_KEY = 'incovia-v3';

const TEAM_TYPE_OPTIONS = [
  'Pintura - Mecânica',
  'Pintura - Manual',
  'Pintura - Mecânica e Manual',
  'Implantação de Tachas',
  'Implantação de Defensa',
];

const SERVICE_TYPE_OPTIONS = [...TEAM_TYPE_OPTIONS];
const STATUS_OPTIONS = ['EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR'];
const REASON_OPTIONS = ['CHUVA', 'MANUTENÇÃO', 'OUTROS'];
const ROLE_OPTIONS = ['Encarregado', 'Motorista', 'Eletricista', 'Ajudante', 'Técnico'];
const VEHICLE_TYPES = ['Caminhão', 'Caminhonete', 'Cesto', 'Munck'];
const VEHICLE_STATUS = ['Disponível', 'Em uso', 'Manutenção', 'Inativo'];
const MAX_TEAM_MEMBERS = 7;

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function pad(v) {
  return String(v).padStart(2, '0');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
    full: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
  };
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

const seed = (() => {
  const colaboradores = [
    { id: id(), nome: 'André Souza', funcao: 'Eletricista', telefone: '(11) 93210-9876', status: 'ativo' },
    { id: id(), nome: 'Carlos Silva', funcao: 'Eletricista', telefone: '(11) 97654-3210', status: 'ativo' },
    { id: id(), nome: 'Fernando Gomes', funcao: 'Ajudante', telefone: '(11) 90987-6543', status: 'ativo' },
    { id: id(), nome: 'Lucas Ferreira', funcao: 'Motorista', telefone: '(11) 94321-0987', status: 'ativo' },
    { id: id(), nome: 'Mário Santos', funcao: 'Encarregado', telefone: '(11) 99876-5432', status: 'ativo' },
    { id: id(), nome: 'Roberto Lima', funcao: 'Encarregado', telefone: '(11) 98765-4321', status: 'ativo' },
  ];

  const veiculos = [
    { id: id(), placa: 'ABC-1234', modelo: 'VW Delivery 11.180', ano: 2022, tipo: 'Caminhão', status: 'Disponível' },
    { id: id(), placa: 'DEF-5678', modelo: 'Ford Cargo 816', ano: 2021, tipo: 'Caminhão', status: 'Disponível' },
    { id: id(), placa: 'GHI-9012', modelo: 'Toyota Hilux', ano: 2023, tipo: 'Caminhonete', status: 'Disponível' },
  ];

  const programacoes = [
    {
      id: id(),
      data: '2026-03-20',
      tipoEquipe: 'Pintura - Mecânica',
      cidade: 'ARAPONGAS',
      contratante: 'MOTIVA',
      tipoServico: 'Pintura - Mecânica',
      encarregadoId: colaboradores.find((x) => x.nome === 'Roberto Lima').id,
      membroIds: [
        colaboradores.find((x) => x.nome === 'Roberto Lima').id,
        colaboradores.find((x) => x.nome === 'André Souza').id,
        colaboradores.find((x) => x.nome === 'Fernando Gomes').id,
        colaboradores.find((x) => x.nome === 'Lucas Ferreira').id,
      ],
      veiculoIds: [veiculos.find((x) => x.placa === 'DEF-5678').id],
      statusExecucao: 'CONCLUÍDO',
      motivoNaoExecucao: '',
      observacoes: 'Trecho finalizado conforme programação.',
      horarioInicio: '07:30',
      horarioSaidaAlmoco: '11:30',
      horarioRetornoAlmoco: '13:00',
      horarioSaida: '17:48',
    },
    {
      id: id(),
      data: '2026-03-20',
      tipoEquipe: 'Implantação de Tachas',
      cidade: 'CASCAVEL',
      contratante: 'MLC',
      tipoServico: 'Implantação de Tachas',
      encarregadoId: colaboradores.find((x) => x.nome === 'Mário Santos').id,
      membroIds: [
        colaboradores.find((x) => x.nome === 'Mário Santos').id,
        colaboradores.find((x) => x.nome === 'Fernando Gomes').id,
        colaboradores.find((x) => x.nome === 'Lucas Ferreira').id,
      ],
      veiculoIds: [veiculos.find((x) => x.placa === 'GHI-9012').id],
      statusExecucao: 'EXECUTANDO',
      motivoNaoExecucao: '',
      observacoes: 'Equipe em campo.',
      horarioInicio: '07:30',
      horarioSaidaAlmoco: '11:30',
      horarioRetornoAlmoco: '13:00',
      horarioSaida: '17:48',
    },
  ];

  const faltas = [
    {
      id: id(),
      colaboradorId: colaboradores.find((x) => x.nome === 'André Souza').id,
      data: '2026-03-19',
      motivo: 'atestado_medico',
      observacao: 'Repouso de 1 dia.',
    },
  ];

  return { colaboradores, veiculos, programacoes, faltas };
})();

function normalizeDb(data) {
  const source = data || seed;
  return {
    colaboradores: Array.isArray(source.colaboradores) ? source.colaboradores : [],
    veiculos: Array.isArray(source.veiculos) ? source.veiculos : [],
    faltas: Array.isArray(source.faltas) ? source.faltas : [],
    programacoes: Array.isArray(source.programacoes)
      ? source.programacoes.map((item) => ({
          ...item,
          tipoEquipe: item.tipoEquipe || item.nomeEquipe || '',
          tipoServico: item.tipoServico || '',
          statusExecucao: item.statusExecucao === 'FAZENDO' ? 'EXECUTANDO' : (item.statusExecucao || 'EXECUTANDO'),
          motivoNaoExecucao: item.motivoNaoExecucao || '',
          observacoes: item.observacoes || '',
          horarioInicio: item.horarioInicio || '07:30',
          horarioSaidaAlmoco: item.horarioSaidaAlmoco || '11:30',
          horarioRetornoAlmoco: item.horarioRetornoAlmoco || '13:00',
          horarioSaida: item.horarioSaida || '17:48',
          membroIds: Array.isArray(item.membroIds) ? item.membroIds : [],
          veiculoIds: Array.isArray(item.veiculoIds) ? item.veiculoIds : [],
        }))
      : [],
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeDb(raw ? JSON.parse(raw) : seed);
  } catch {
    return normalizeDb(seed);
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function emptyProgramacao(date = today()) {
  return {
    id: '',
    data: date,
    tipoEquipe: '',
    cidade: '',
    contratante: '',
    tipoServico: '',
    encarregadoId: '',
    membroIds: [],
    veiculoIds: [],
    statusExecucao: 'EXECUTANDO',
    motivoNaoExecucao: '',
    observacoes: '',
    horarioInicio: '07:30',
    horarioSaidaAlmoco: '11:30',
    horarioRetornoAlmoco: '13:00',
    horarioSaida: '17:48',
  };
}

function emptyColaborador() {
  return { id: '', nome: '', funcao: 'Ajudante', telefone: '', status: 'ativo' };
}

function emptyVeiculo() {
  return { id: '', placa: '', modelo: '', ano: new Date().getFullYear(), tipo: 'Caminhão', status: 'Disponível' };
}

function emptyFalta() {
  return { id: '', colaboradorId: '', data: today(), motivo: 'atestado_medico', observacao: '' };
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function toggleLimited(list, value, encarregadoId) {
  if (list.includes(value)) return list.filter((x) => x !== value);
  const ids = [encarregadoId, ...list, value].filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length > MAX_TEAM_MEMBERS) return list;
  return [...list, value];
}

function App() {
  const [db, setDb] = useState(loadData);
  const [page, setPage] = useState('programacao');
  const [selectedDate, setSelectedDate] = useState('2026-03-20');
  const [search, setSearch] = useState('');
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [modal, setModal] = useState(null);
  const [programacaoForm, setProgramacaoForm] = useState(emptyProgramacao('2026-03-20'));
  const [colaboradorForm, setColaboradorForm] = useState(emptyColaborador());
  const [veiculoForm, setVeiculoForm] = useState(emptyVeiculo());
  const [faltaForm, setFaltaForm] = useState(emptyFalta());
  const [expandedProgramacaoId, setExpandedProgramacaoId] = useState(null);

  useEffect(() => {
    saveData(db);
  }, [db]);

  const maps = useMemo(
    () => ({
      colaboradores: Object.fromEntries(db.colaboradores.map((x) => [x.id, x])),
      veiculos: Object.fromEntries(db.veiculos.map((x) => [x.id, x])),
    }),
    [db]
  );

  const programacoesDoDia = useMemo(
    () =>
      db.programacoes
        .filter((p) => p.data === selectedDate)
        .sort((a, b) => (a.tipoEquipe || '').localeCompare(b.tipoEquipe || '', 'pt-BR')),
    [db.programacoes, selectedDate]
  );

  const totalPessoasDia = programacoesDoDia.reduce((acc, p) => acc + p.membroIds.length, 0);
  const dateLabel = formatDateLabel(selectedDate);

  const colaboradoresComStats = useMemo(() => {
    return db.colaboradores.map((c) => {
      const escalas = db.programacoes.filter((p) => p.membroIds.includes(c.id));
      const faltas = db.faltas.filter((f) => f.colaboradorId === c.id);
      return {
        ...c,
        escalas: escalas.length,
        faltas: faltas.length,
        cidades: new Set(escalas.map((x) => x.cidade)).size,
        ultimaEscala: [...escalas].sort((a, b) => b.data.localeCompare(a.data))[0] || null,
      };
    });
  }, [db.colaboradores, db.programacoes, db.faltas]);

  const veiculosComStats = useMemo(() => {
    return db.veiculos.map((v) => {
      const usos = db.programacoes.filter((p) => p.veiculoIds.includes(v.id));
      return {
        ...v,
        usos: usos.length,
        cidades: new Set(usos.map((x) => x.cidade)).size,
        historico: usos,
      };
    });
  }, [db.veiculos, db.programacoes]);

  const filteredColaboradores = colaboradoresComStats.filter((c) => {
    const t = search.toLowerCase();
    return c.nome.toLowerCase().includes(t) || c.funcao.toLowerCase().includes(t);
  });

  const filteredVeiculos = veiculosComStats.filter((v) => {
    const t = search.toLowerCase();
    return v.placa.toLowerCase().includes(t) || v.modelo.toLowerCase().includes(t);
  });

  const historyItems = colaboradoresComStats.filter((c) => c.nome.toLowerCase().includes(search.toLowerCase()));

  function updateDb(partial) {
    setDb((prev) => normalizeDb({ ...prev, ...partial }));
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setSearch('');
    setActiveDrawer(null);
    setExpandedProgramacaoId(null);
  }

  function updateProgramacaoField(itemId, field, value) {
    updateDb({
      programacoes: db.programacoes.map((p) => {
        if (p.id !== itemId) return p;
        if (field === 'statusExecucao') {
          return {
            ...p,
            statusExecucao: value,
            motivoNaoExecucao: value === 'NÃO FOI POSSÍVEL REALIZAR' ? p.motivoNaoExecucao : '',
          };
        }
        return { ...p, [field]: value };
      }),
    });
  }

  function openProgramacaoModal(item = null) {
    setProgramacaoForm(item ? { ...item } : emptyProgramacao(selectedDate));
    setModal('programacao');
  }

  function openColaboradorModal(item = null) {
    setColaboradorForm(item ? { ...item } : emptyColaborador());
    setModal('colaborador');
  }

  function openVeiculoModal(item = null) {
    setVeiculoForm(item ? { ...item } : emptyVeiculo());
    setModal('veiculo');
  }

  function openFaltaModal(item = null) {
    setFaltaForm(item ? { ...item } : emptyFalta());
    setModal('falta');
  }

  function saveProgramacao() {
    if (
      !programacaoForm.tipoEquipe ||
      !programacaoForm.cidade ||
      !programacaoForm.contratante ||
      !programacaoForm.tipoServico ||
      !programacaoForm.encarregadoId
    ) {
      alert('Preencha os campos principais da programação.');
      return;
    }
    if (
      programacaoForm.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR' &&
      !programacaoForm.motivoNaoExecucao
    ) {
      alert('Selecione o motivo quando não for possível realizar.');
      return;
    }

    const mergedMemberIds = Array.from(
      new Set([programacaoForm.encarregadoId, ...programacaoForm.membroIds])
    );

    if (mergedMemberIds.length > MAX_TEAM_MEMBERS) {
      alert(`Cada equipe pode ter no máximo ${MAX_TEAM_MEMBERS} pessoas.`);
      return;
    }

    const payload = {
      ...programacaoForm,
      membroIds: mergedMemberIds,
      cidade: programacaoForm.cidade.toUpperCase(),
      contratante: programacaoForm.contratante.toUpperCase(),
    };

    if (payload.id) {
      updateDb({
        programacoes: db.programacoes.map((x) => (x.id === payload.id ? payload : x)),
      });
    } else {
      updateDb({ programacoes: [{ ...payload, id: id() }, ...db.programacoes] });
    }
    setModal(null);
  }

  function saveColaborador() {
    if (!colaboradorForm.nome || !colaboradorForm.funcao) {
      alert('Preencha nome e função.');
      return;
    }
    if (colaboradorForm.id) {
      updateDb({
        colaboradores: db.colaboradores.map((x) =>
          x.id === colaboradorForm.id ? colaboradorForm : x
        ),
      });
    } else {
      updateDb({ colaboradores: [{ ...colaboradorForm, id: id() }, ...db.colaboradores] });
    }
    setModal(null);
  }

  function saveVeiculo() {
    if (!veiculoForm.placa || !veiculoForm.modelo) {
      alert('Preencha placa e modelo.');
      return;
    }
    if (veiculoForm.id) {
      updateDb({
        veiculos: db.veiculos.map((x) => (x.id === veiculoForm.id ? veiculoForm : x)),
      });
    } else {
      updateDb({ veiculos: [{ ...veiculoForm, id: id() }, ...db.veiculos] });
    }
    setModal(null);
  }

  function saveFalta() {
    if (!faltaForm.colaboradorId || !faltaForm.data || !faltaForm.motivo) {
      alert('Preencha colaborador, data e motivo.');
      return;
    }
    if (faltaForm.id) {
      updateDb({
        faltas: db.faltas.map((x) => (x.id === faltaForm.id ? faltaForm : x)),
      });
    } else {
      updateDb({ faltas: [{ ...faltaForm, id: id() }, ...db.faltas] });
    }
    setModal(null);
  }

  function deleteProgramacao(itemId) {
    if (!confirm('Excluir esta programação?')) return;
    updateDb({ programacoes: db.programacoes.filter((x) => x.id !== itemId) });
  }

  function deleteColaborador(itemId) {
    if (!confirm('Excluir este colaborador?')) return;
    updateDb({
      colaboradores: db.colaboradores.filter((x) => x.id !== itemId),
      faltas: db.faltas.filter((x) => x.colaboradorId !== itemId),
      programacoes: db.programacoes.map((p) => ({
        ...p,
        membroIds: p.membroIds.filter((m) => m !== itemId),
        encarregadoId: p.encarregadoId === itemId ? '' : p.encarregadoId,
      })),
    });
    if (activeDrawer?.type === 'colaborador' && activeDrawer.item.id === itemId) {
      setActiveDrawer(null);
    }
  }

  function deleteVeiculo(itemId) {
    if (!confirm('Excluir este veículo?')) return;
    updateDb({
      veiculos: db.veiculos.filter((x) => x.id !== itemId),
      programacoes: db.programacoes.map((p) => ({
        ...p,
        veiculoIds: p.veiculoIds.filter((v) => v !== itemId),
      })),
    });
    if (activeDrawer?.type === 'veiculo' && activeDrawer.item.id === itemId) {
      setActiveDrawer(null);
    }
  }

  function deleteFalta(itemId) {
    if (!confirm('Excluir este registro de falta?')) return;
    updateDb({ faltas: db.faltas.filter((x) => x.id !== itemId) });
  }

  function resetDemo() {
    if (!confirm('Resetar todos os dados locais para o modelo inicial?')) return;
    setDb(normalizeDb(seed));
    setActiveDrawer(null);
    setSearch('');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">I</div>
          <div>
            <h1>Incovia</h1>
            <p>Gestão de Equipes</p>
          </div>
        </div>

        <nav className="menu">
          <NavButton active={page === 'programacao'} onClick={() => changePage('programacao')}>
            Programação
          </NavButton>
          <NavButton active={page === 'colaboradores'} onClick={() => changePage('colaboradores')}>
            Colaboradores
          </NavButton>
          <NavButton active={page === 'veiculos'} onClick={() => changePage('veiculos')}>
            Veículos
          </NavButton>
          <NavButton active={page === 'historico'} onClick={() => changePage('historico')}>
            Histórico
          </NavButton>
        </nav>

        <div className="sidebar-bottom">
          <button className="ghost-btn full" onClick={resetDemo}>Resetar dados locais</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">Painel Operacional</span>
            <strong>Incovia</strong>
          </div>

          <div className="topbar-actions">
            {page === 'programacao' && (
              <>
                <button className="ghost-btn" onClick={() => exportProgramacaoXlsx(db, selectedDate)}>
                  Exportar Modelo 01
                </button>
                <button className="ghost-btn" onClick={() => exportProgramacaoModeloAntigo(db, selectedDate)}>
                  Exportar Modelo 02
                </button>
                <button className="ghost-btn" onClick={() => exportProgramacaoPdfModelo03(db, selectedDate)}>
                  Exportar Modelo 03
                </button>
                <button className="primary-btn" onClick={() => openProgramacaoModal()}>
                  + Nova Programação
                </button>
              </>
            )}

            {page === 'colaboradores' && (
              <>
                <button className="ghost-btn" onClick={() => exportPessoasXlsx(db)}>
                  Exportar Colaboradores
                </button>
                <button className="ghost-btn" onClick={() => openFaltaModal()}>
                  Registrar Falta
                </button>
                <button className="primary-btn" onClick={() => openColaboradorModal()}>
                  + Novo
                </button>
              </>
            )}

            {page === 'veiculos' && (
              <>
                <button className="ghost-btn" onClick={() => exportVeiculosXlsx(db)}>
                  Exportar Veículos
                </button>
                <button className="primary-btn" onClick={() => openVeiculoModal()}>
                  + Novo Veículo
                </button>
              </>
            )}

            {page === 'historico' && (
              <button className="ghost-btn" onClick={() => exportHistoricoXlsx(db)}>
                Exportar Histórico
              </button>
            )}
          </div>
        </header>

        <div className={`content-grid ${activeDrawer ? 'with-drawer' : ''}`}>
          <section className="content-column">
            {page === 'programacao' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Programação Diária</h2>
                    <p>Monte e gerencie as equipes de campo</p>
                  </div>
                </div>

                <div className="date-card">
                  <button className="icon-btn" onClick={() => { setSelectedDate(shiftDate(selectedDate, -1)); setExpandedProgramacaoId(null); }}>‹</button>
                  <div>
                    <h3 className="capitalize">{dateLabel.weekday}</h3>
                    <span>{dateLabel.full}</span>
                  </div>
                  <button className="icon-btn" onClick={() => { setSelectedDate(shiftDate(selectedDate, 1)); setExpandedProgramacaoId(null); }}>›</button>
                </div>

                <div className="stats-grid">
                  <StatCard number={programacoesDoDia.length} label="Equipes" />
                  <StatCard number={totalPessoasDia} label="Pessoas" subtle />
                </div>

                {programacoesDoDia.length === 0 ? (
                  <div className="empty-card">
                    <p>Nenhuma equipe programada para este dia.</p>
                    <button className="ghost-btn" onClick={() => openProgramacaoModal()}>
                      Criar Programação
                    </button>
                  </div>
                ) : (
                  <div className="cards-grid programacao-cards-grid">
                    {programacoesDoDia.map((item) => {
                      const isExpanded = expandedProgramacaoId === item.id;
                      const members = item.membroIds
                        .map((memberId) => maps.colaboradores[memberId])
                        .filter(Boolean);
                      const vehicles = item.veiculoIds
                        .map((vehicleId) => maps.veiculos[vehicleId])
                        .filter(Boolean);

                      return (
                        <div
                          key={item.id}
                          className={`card team-card compact-program-card ${isExpanded ? 'expanded' : 'collapsed'}`}
                          onClick={() => setExpandedProgramacaoId(isExpanded ? null : item.id)}
                        >
                          <div className="card-header between start compact-program-head">
                            <div>
                              <h3>{item.tipoEquipe}</h3>
                              <div className="meta-row">📍 {item.cidade.toLowerCase()} · 🏢 {item.contratante}</div>
                            </div>
                            <StatusBadge status={item.statusExecucao} />
                          </div>

                          <div className="compact-summary-grid">
                            <div className="compact-summary-block">
                              <span className="section-label">Membros</span>
                              <div className="compact-summary-text">
                                {members.length
                                  ? members.map((person) => person.nome.split(' ')[0]).join(' · ')
                                  : 'Sem equipe'}
                              </div>
                            </div>

                            <div className="compact-summary-block">
                              <span className="section-label">Veículos</span>
                              <div className="chips-row compact-chips-row">
                                {vehicles.length ? (
                                  vehicles.map((vehicle) => (
                                    <button
                                      key={vehicle.id}
                                      className="chip-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDrawer({ type: 'veiculo', item: vehicle });
                                      }}
                                    >
                                      {vehicle.placa}
                                    </button>
                                  ))
                                ) : (
                                  <span className="small-muted">Sem veículo</span>
                                )}
                              </div>
                            </div>

                            <div className="compact-summary-block full-row">
                              <span className="section-label">Tipo de serviço</span>
                              <div className="service-line compact-service-line">Tipo de serviço: {item.tipoServico}</div>
                            </div>
                          </div>

                          <div className="compact-expand-hint">
                            {isExpanded ? 'Clique para recolher' : 'Clique para ver detalhes'}
                          </div>

                          {isExpanded && (
                            <>
                              <div className="section-line" />
                              <div className="section-label">Equipe ({item.membroIds.length}/{MAX_TEAM_MEMBERS})</div>
                              <div className="person-list fixed-seven">
                                {Array.from({ length: MAX_TEAM_MEMBERS }).map((_, idx) => {
                                  const memberId = item.membroIds[idx];
                                  const person = memberId ? maps.colaboradores[memberId] : null;
                                  if (!person) {
                                    return (
                                      <div key={`slot-${item.id}-${idx}`} className="list-row empty-slot" aria-hidden="true">
                                        <div className="list-row-main">
                                          <span className="avatar small placeholder-avatar">•</span>
                                          <span className="placeholder-text">Vaga disponível</span>
                                        </div>
                                        <span className="tag placeholder-tag">—</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <button
                                      key={memberId}
                                      className={`list-row ${memberId === item.encarregadoId ? 'highlight' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDrawer({ type: 'colaborador', item: maps.colaboradores[memberId] });
                                      }}
                                    >
                                      <div className="list-row-main">
                                        <span className="avatar small">{initials(person.nome).slice(0, 1)}</span>
                                        <span>{person.nome}</span>
                                      </div>
                                      <span className="tag">
                                        {memberId === item.encarregadoId ? 'Encarregado' : person.funcao}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="section-line" />
                              <div className="time-grid">
                                <FieldPair label="Início" value={item.horarioInicio} />
                                <FieldPair label="Saída almoço" value={item.horarioSaidaAlmoco} />
                                <FieldPair label="Retorno almoço" value={item.horarioRetornoAlmoco} />
                                <FieldPair label="Saída" value={item.horarioSaida} />
                              </div>

                              <div className="section-line" />
                              <div className="programacao-edit-grid">
                                <label>
                                  <span>Status</span>
                                  <select
                                    value={item.statusExecucao}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateProgramacaoField(item.id, 'statusExecucao', e.target.value)}
                                  >
                                    {STATUS_OPTIONS.map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="full-row">
                                  <span>Motivo</span>
                                  <select
                                    disabled={item.statusExecucao !== 'NÃO FOI POSSÍVEL REALIZAR'}
                                    value={item.motivoNaoExecucao}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateProgramacaoField(item.id, 'motivoNaoExecucao', e.target.value)}
                                  >
                                    <option value="">Selecione</option>
                                    {REASON_OPTIONS.map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="full-row">
                                  <span>Observações</span>
                                  <textarea
                                    rows="3"
                                    value={item.observacoes}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateProgramacaoField(item.id, 'observacoes', e.target.value)}
                                  />
                                </label>
                              </div>

                              <div className="card-actions right">
                                <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); openProgramacaoModal(item); }}>Editar</button>
                                <button className="danger-btn" onClick={(e) => { e.stopPropagation(); deleteProgramacao(item.id); }}>Excluir</button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {page === 'colaboradores' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Colaboradores</h2>
                    <p>{db.colaboradores.length} cadastrados</p>
                  </div>
                </div>
                <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nome ou função..." />
                <div className="cards-grid three">
                  {filteredColaboradores.map((item) => (
                    <div key={item.id} className="card">
                      <div className="card-header">
                        <div className="title-row">
                          <span className="avatar">{initials(item.nome).slice(0, 1)}</span>
                          <div>
                            <h3>{item.nome}</h3>
                            <div className="chips-row tight">
                              <span className="tag">{item.funcao}</span>
                              <span className="tag success">{item.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="section-line" />
                      <div className="meta-row">{item.escalas} escalas · {item.faltas} faltas · ☎ {item.telefone || '-'}</div>
                      <div className="card-actions">
                        <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'colaborador', item })}>Ver</button>
                        <button className="ghost-btn" onClick={() => openColaboradorModal(item)}>Editar</button>
                        <button className="danger-btn" onClick={() => deleteColaborador(item.id)}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {page === 'veiculos' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Veículos</h2>
                    <p>{db.veiculos.length} cadastrados</p>
                  </div>
                </div>
                <SearchBox value={search} onChange={setSearch} placeholder="Buscar por placa ou modelo..." />
                <div className="cards-grid three">
                  {filteredVeiculos.map((item) => (
                    <div key={item.id} className="card">
                      <div className="card-header">
                        <div className="title-row">
                          <span className="avatar">🚚</span>
                          <div>
                            <h3>{item.placa}</h3>
                            <div className="meta-row">{item.modelo} · {item.ano}</div>
                          </div>
                        </div>
                      </div>
                      <div className="section-line" />
                      <div className="between">
                        <div className="chips-row tight">
                          <span className="tag success">{item.status}</span>
                          <span className="tag">{item.tipo}</span>
                        </div>
                        <span className="small-muted">{item.usos} usos</span>
                      </div>
                      <div className="card-actions">
                        <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'veiculo', item })}>Ver</button>
                        <button className="ghost-btn" onClick={() => openVeiculoModal(item)}>Editar</button>
                        <button className="danger-btn" onClick={() => deleteVeiculo(item.id)}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {page === 'historico' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Histórico</h2>
                    <p>Acompanhe escalas e faltas</p>
                  </div>
                </div>
                <div className="stats-grid three">
                  <StatCard number={db.colaboradores.length} label="Colaboradores" />
                  <StatCard number={db.programacoes.length} label="Total Escalas" subtle />
                  <StatCard number={db.faltas.length} label="Total Faltas" danger />
                </div>
                <SearchBox value={search} onChange={setSearch} placeholder="Buscar colaborador..." />
                <div className="history-list">
                  {historyItems.map((item) => (
                    <div key={item.id} className="history-row">
                      <div className="title-row">
                        <span className="avatar">{initials(item.nome).slice(0, 1)}</span>
                        <div>
                          <strong>{item.nome}</strong>
                          <div className="meta-row">
                            {item.escalas} escalas · {item.faltas} faltas · {item.ultimaEscala?.cidade || 'sem cidade'}
                          </div>
                        </div>
                      </div>
                      <div className="history-actions">
                        <span className="small-muted">
                          Última escala {item.ultimaEscala?.data ? new Date(`${item.ultimaEscala.data}T12:00:00`).toLocaleDateString('pt-BR') : '-'}
                        </span>
                        <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'colaborador', item })}>Abrir</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {activeDrawer && (
            <aside className="drawer">
              <div className="drawer-head between">
                <strong>
                  {activeDrawer.type === 'colaborador'
                    ? activeDrawer.item.nome
                    : activeDrawer.type === 'veiculo'
                    ? activeDrawer.item.placa
                    : activeDrawer.item.tipoEquipe}
                </strong>
                <button className="icon-btn" onClick={() => setActiveDrawer(null)}>×</button>
              </div>

              {activeDrawer.type === 'colaborador' && (
                <ColaboradorDrawer
                  item={activeDrawer.item}
                  db={db}
                  openEdit={() => openColaboradorModal(activeDrawer.item)}
                  openFalta={() => openFaltaModal()}
                  deleteFalta={deleteFalta}
                />
              )}

              {activeDrawer.type === 'veiculo' && (
                <VeiculoDrawer
                  item={activeDrawer.item}
                  db={db}
                  openEdit={() => openVeiculoModal(activeDrawer.item)}
                />
              )}
            </aside>
          )}
        </div>
      </main>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head between">
              <strong>
                {modal === 'programacao' && (programacaoForm.id ? 'Editar Programação' : 'Nova Programação')}
                {modal === 'colaborador' && (colaboradorForm.id ? 'Editar Colaborador' : 'Novo Colaborador')}
                {modal === 'veiculo' && (veiculoForm.id ? 'Editar Veículo' : 'Novo Veículo')}
                {modal === 'falta' && (faltaForm.id ? 'Editar Falta' : 'Registrar Falta')}
              </strong>
              <button className="icon-btn" onClick={() => setModal(null)}>×</button>
            </div>

            {modal === 'programacao' && (
              <div className="form-grid two">
                <Select
                  label="Tipo de equipe"
                  value={programacaoForm.tipoEquipe}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, tipoEquipe: v })}
                  options={TEAM_TYPE_OPTIONS.map((x) => ({ value: x, label: x }))}
                  placeholder="Selecione"
                />
                <Input
                  label="Data"
                  type="date"
                  value={programacaoForm.data}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, data: v })}
                />
                <Input
                  label="Cidade"
                  value={programacaoForm.cidade}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, cidade: v })}
                />
                <Input
                  label="Contratante"
                  value={programacaoForm.contratante}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, contratante: v })}
                />
                <Select
                  label="Tipo de serviço"
                  value={programacaoForm.tipoServico}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, tipoServico: v })}
                  options={SERVICE_TYPE_OPTIONS.map((x) => ({ value: x, label: x }))}
                  placeholder="Selecione"
                  full
                />
                <Select
                  label="Encarregado"
                  value={programacaoForm.encarregadoId}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, encarregadoId: v })}
                  options={db.colaboradores
                    .filter((x) => x.funcao === 'Encarregado')
                    .map((x) => ({ value: x.id, label: x.nome }))}
                  placeholder="Selecione"
                />
                <Select
                  label="Status"
                  value={programacaoForm.statusExecucao}
                  onChange={(v) =>
                    setProgramacaoForm({
                      ...programacaoForm,
                      statusExecucao: v,
                      motivoNaoExecucao: v === 'NÃO FOI POSSÍVEL REALIZAR' ? programacaoForm.motivoNaoExecucao : '',
                    })
                  }
                  options={STATUS_OPTIONS.map((x) => ({ value: x, label: x }))}
                />

                <div className="full modal-time-grid">
                  <Input
                    label="Início"
                    type="time"
                    value={programacaoForm.horarioInicio}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioInicio: v })}
                  />
                  <Input
                    label="Saída almoço"
                    type="time"
                    value={programacaoForm.horarioSaidaAlmoco}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioSaidaAlmoco: v })}
                  />
                  <Input
                    label="Retorno almoço"
                    type="time"
                    value={programacaoForm.horarioRetornoAlmoco}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioRetornoAlmoco: v })}
                  />
                  <Input
                    label="Saída"
                    type="time"
                    value={programacaoForm.horarioSaida}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioSaida: v })}
                  />
                </div>

                <Select
                  label="Motivo"
                  value={programacaoForm.motivoNaoExecucao}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, motivoNaoExecucao: v })}
                  options={REASON_OPTIONS.map((x) => ({ value: x, label: x }))}
                  placeholder="Selecione"
                  disabled={programacaoForm.statusExecucao !== 'NÃO FOI POSSÍVEL REALIZAR'}
                  full
                />

                <MultiSelect
                  label={`Membros da equipe (máx. ${MAX_TEAM_MEMBERS})`}
                  items={db.colaboradores}
                  selectedIds={programacaoForm.membroIds}
                  labelKey="nome"
                  subtitleKey="funcao"
                  onToggle={(itemId) =>
                    setProgramacaoForm({
                      ...programacaoForm,
                      membroIds: toggleLimited(programacaoForm.membroIds, itemId, programacaoForm.encarregadoId),
                    })
                  }
                  full
                />

                <MultiSelect
                  label="Veículos"
                  items={db.veiculos}
                  selectedIds={programacaoForm.veiculoIds}
                  labelKey="placa"
                  subtitleBuilder={(item) => `${item.modelo} · ${item.ano}`}
                  onToggle={(itemId) =>
                    setProgramacaoForm({
                      ...programacaoForm,
                      veiculoIds: toggle(programacaoForm.veiculoIds, itemId),
                    })
                  }
                  full
                />

                <TextArea
                  label="Observações"
                  value={programacaoForm.observacoes}
                  onChange={(v) => setProgramacaoForm({ ...programacaoForm, observacoes: v })}
                  full
                />

                <div className="modal-actions full">
                  <button className="ghost-btn" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="primary-btn" onClick={saveProgramacao}>Salvar</button>
                </div>
              </div>
            )}

            {modal === 'colaborador' && (
              <div className="form-grid two">
                <Input label="Nome" value={colaboradorForm.nome} onChange={(v) => setColaboradorForm({ ...colaboradorForm, nome: v })} />
                <Select
                  label="Função"
                  value={colaboradorForm.funcao}
                  onChange={(v) => setColaboradorForm({ ...colaboradorForm, funcao: v })}
                  options={ROLE_OPTIONS.map((x) => ({ value: x, label: x }))}
                />
                <Input
                  label="Telefone"
                  value={colaboradorForm.telefone}
                  onChange={(v) => setColaboradorForm({ ...colaboradorForm, telefone: v })}
                />
                <Select
                  label="Status"
                  value={colaboradorForm.status}
                  onChange={(v) => setColaboradorForm({ ...colaboradorForm, status: v })}
                  options={[
                    { value: 'ativo', label: 'ativo' },
                    { value: 'inativo', label: 'inativo' },
                  ]}
                />
                <div className="modal-actions full">
                  <button className="ghost-btn" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="primary-btn" onClick={saveColaborador}>Salvar</button>
                </div>
              </div>
            )}

            {modal === 'veiculo' && (
              <div className="form-grid two">
                <Input
                  label="Placa"
                  value={veiculoForm.placa}
                  onChange={(v) => setVeiculoForm({ ...veiculoForm, placa: v.toUpperCase() })}
                />
                <Input
                  label="Modelo"
                  value={veiculoForm.modelo}
                  onChange={(v) => setVeiculoForm({ ...veiculoForm, modelo: v })}
                />
                <Input
                  label="Ano"
                  type="number"
                  value={veiculoForm.ano}
                  onChange={(v) => setVeiculoForm({ ...veiculoForm, ano: Number(v) })}
                />
                <Select
                  label="Tipo"
                  value={veiculoForm.tipo}
                  onChange={(v) => setVeiculoForm({ ...veiculoForm, tipo: v })}
                  options={VEHICLE_TYPES.map((x) => ({ value: x, label: x }))}
                />
                <Select
                  label="Status"
                  value={veiculoForm.status}
                  onChange={(v) => setVeiculoForm({ ...veiculoForm, status: v })}
                  options={VEHICLE_STATUS.map((x) => ({ value: x, label: x }))}
                />
                <div className="modal-actions full">
                  <button className="ghost-btn" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="primary-btn" onClick={saveVeiculo}>Salvar</button>
                </div>
              </div>
            )}

            {modal === 'falta' && (
              <div className="form-grid two">
                <Select
                  label="Colaborador"
                  value={faltaForm.colaboradorId}
                  onChange={(v) => setFaltaForm({ ...faltaForm, colaboradorId: v })}
                  options={db.colaboradores.map((x) => ({ value: x.id, label: x.nome }))}
                  placeholder="Selecione"
                />
                <Input
                  label="Data"
                  type="date"
                  value={faltaForm.data}
                  onChange={(v) => setFaltaForm({ ...faltaForm, data: v })}
                />
                <Select
                  label="Motivo"
                  value={faltaForm.motivo}
                  onChange={(v) => setFaltaForm({ ...faltaForm, motivo: v })}
                  options={[
                    { value: 'atestado_medico', label: 'atestado_medico' },
                    { value: 'falta_justificada', label: 'falta_justificada' },
                    { value: 'falta_injustificada', label: 'falta_injustificada' },
                    { value: 'licenca', label: 'licenca' },
                    { value: 'acidente_trabalho', label: 'acidente_trabalho' },
                    { value: 'outro', label: 'outro' },
                  ]}
                />
                <TextArea
                  label="Observação"
                  value={faltaForm.observacao}
                  onChange={(v) => setFaltaForm({ ...faltaForm, observacao: v })}
                  full
                />
                <div className="modal-actions full">
                  <button className="ghost-btn" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="primary-btn" onClick={saveFalta}>Salvar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, children, onClick }) {
  return (
    <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      className="search-box"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function StatCard({ number, label, subtle = false, danger = false }) {
  return (
    <div className={`stat-card ${subtle ? 'subtle' : ''} ${danger ? 'danger' : ''}`}>
      <strong>{number}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'CONCLUÍDO' ? 'green' : status === 'EXECUTANDO' ? 'yellow' : 'red';
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

function FieldPair({ label, value }) {
  return (
    <div className="field-pair">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder = '', disabled = false, full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {placeholder !== '' && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <textarea rows="4" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function MultiSelect({ label, items, selectedIds, labelKey, subtitleKey, subtitleBuilder, onToggle, full = false }) {
  return (
    <div className={full ? 'full' : ''}>
      <span className="input-label">{label}</span>
      <div className="multi-box">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`multi-row ${selectedIds.includes(item.id) ? 'selected' : ''}`}
            onClick={() => onToggle(item.id)}
          >
            <div>
              <strong>{item[labelKey]}</strong>
              <small>{subtitleBuilder ? subtitleBuilder(item) : item[subtitleKey]}</small>
            </div>
            <span>{selectedIds.includes(item.id) ? '✓' : '+'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ColaboradorDrawer({ item, db, openEdit, openFalta, deleteFalta }) {
  const escalas = db.programacoes
    .filter((p) => p.membroIds.includes(item.id))
    .sort((a, b) => b.data.localeCompare(a.data));
  const faltas = db.faltas
    .filter((f) => f.colaboradorId === item.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="drawer-body">
      <div className="hero-block">
        <div className="avatar big">{initials(item.nome).slice(0, 1)}</div>
        <div>
          <h3>{item.nome}</h3>
          <div className="chips-row tight">
            <span className="tag">{item.funcao}</span>
            <span className="tag success">{item.status}</span>
          </div>
          <div className="meta-row">☎ {item.telefone || '-'}</div>
        </div>
      </div>

      <div className="stats-grid three compact">
        <StatCard number={escalas.length} label="Escalas" />
        <StatCard number={faltas.length} label="Faltas" danger />
        <StatCard number={new Set(escalas.map((x) => x.cidade)).size} label="Cidades" subtle />
      </div>

      <div className="card-actions">
        <button className="ghost-btn" onClick={openEdit}>Editar</button>
        <button className="ghost-btn" onClick={openFalta}>Nova falta</button>
      </div>

      <div className="drawer-section">
        <strong>Histórico de Escalas</strong>
        {escalas.length === 0 ? (
          <p className="small-muted">Nenhuma escala registrada.</p>
        ) : (
          escalas.map((e) => (
            <div key={e.id} className="mini-card">
              <strong>{e.tipoEquipe}</strong>
              <div className="meta-row">
                {new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')} · {e.cidade} · {e.contratante}
              </div>
              <StatusBadge status={e.statusExecucao} />
            </div>
          ))
        )}
      </div>

      <div className="drawer-section">
        <strong>Registro de Faltas</strong>
        {faltas.length === 0 ? (
          <p className="small-muted">Nenhuma falta registrada.</p>
        ) : (
          faltas.map((f) => (
            <div key={f.id} className="mini-card">
              <div className="between">
                <strong>{f.motivo}</strong>
                <button className="mini-danger" onClick={() => deleteFalta(f.id)}>Excluir</button>
              </div>
              <div className="meta-row">{new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR')}</div>
              <p>{f.observacao || 'Sem observação'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function VeiculoDrawer({ item, db, openEdit }) {
  const historico = db.programacoes
    .filter((p) => p.veiculoIds.includes(item.id))
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="drawer-body">
      <div className="hero-block">
        <div className="avatar big">🚚</div>
        <div>
          <h3>{item.placa}</h3>
          <div className="meta-row">{item.modelo} · {item.ano}</div>
          <div className="chips-row tight">
            <span className="tag success">{item.status}</span>
            <span className="tag">{item.tipo}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid two compact">
        <StatCard number={historico.length} label="Utilizações" />
        <StatCard number={new Set(historico.map((x) => x.cidade)).size} label="Cidades" subtle />
      </div>

      <div className="card-actions">
        <button className="ghost-btn" onClick={openEdit}>Editar</button>
      </div>

      <div className="drawer-section">
        <strong>Histórico de Uso</strong>
        {historico.length === 0 ? (
          <p className="small-muted">Nenhum uso registrado.</p>
        ) : (
          historico.map((e) => (
            <div key={e.id} className="mini-card">
              <strong>{e.tipoEquipe}</strong>
              <div className="meta-row">{new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')} · {e.cidade}</div>
              <div className="meta-row">
                Horários: {e.horarioInicio} / {e.horarioSaidaAlmoco} / {e.horarioRetornoAlmoco} / {e.horarioSaida}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
