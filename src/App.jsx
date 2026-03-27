import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';

import {
  exportProgramacaoModeloAntigo,
  exportProgramacaoXlsx,
  exportPessoasXlsx,
  exportVeiculosXlsx,
  exportHistoricoXlsx,
} from './exportProgramacaoXlsx';
import { exportProgramacaoPdfModelo03 } from './exportProgramacaoPdf';

const TEAM_TYPE_OPTIONS = [
  'Pintura - Mecânica e Manual',
  'Implantação de Tachas',
  'Implantação de Defensa',
];

const SERVICE_TYPE_OPTIONS = [...TEAM_TYPE_OPTIONS];
const STATUS_OPTIONS = ['EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR'];
const REASON_OPTIONS = ['CHUVA', 'MANUTENÇÃO', 'OUTROS'];
const ROLE_OPTIONS = ['Encarregado', 'Motorista de Veículos Médios', 'Ajudante de produção', 'Operadador de máquina de pintura'];
const VEHICLE_TYPES = ['Caminhão', 'Caminhonete', 'Carro', 'Outro'];
const VEHICLE_STATUS = ['Disponível', 'Em uso', 'Manutenção', 'Inativo'];
const MAX_TEAM_MEMBERS = 7;

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

function normalizeDb(data) {
 return {
   colaboradores: Array.isArray(data?.colaboradores) ? data.colaboradores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : [],
   veiculos: Array.isArray(data?.veiculos) ? data.veiculos.sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR')) : [],
   faltas: Array.isArray(data?.faltas) ? data.faltas : [],
   perfis: Array.isArray(data?.perfis) ? data.perfis : [],
   programacoes: Array.isArray(data?.programacoes)
     ? data.programacoes.map((item) => ({
         ...item,
         tipoEquipe: item.tipoEquipe || '',
         tipoServico: item.tipoServico || '',
         statusExecucao: item.statusExecucao || 'EXECUTANDO',
         motivoNaoExecucao: item.motivoNaoExecucao || '',
         observacoes: item.observacoes || '',
         horarioInicio: item.horarioInicio || '07:30',
         horarioSaidaAlmoco: item.horarioSaidaAlmoco || '11:30',
         horarioRetornoAlmoco: item.horarioRetornoAlmoco || '13:00',
         horarioSaida: item.horarioSaida || '17:48',
         membroIds: Array.isArray(item.membroIds) ? item.membroIds : [],
         veiculoIds: Array.isArray(item.veiculoIds) ? item.veiculoIds : [],
         perfis: Array.isArray(data?.perfis) ? data.perfis : [],
       }))
     : [],
 };
}

function emptyProgramacao(date = today()) {
  return {
    id: '',
    data: date,
    tipoEquipe: '',
    cidade: '',
    contratante: '',
    tipoServico: '',
    encarregadoId: null,
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
  return { id: '', nome: '', funcao: 'Ajudante de produção', telefone: '', status: 'ativo' };
}

function emptyVeiculo() {
  return { id: '', placa: '', modelo: '', ano: new Date().getFullYear(), tipo: 'Caminhão', status: 'Disponível' };
}

function emptyFalta() {
  return { id: '', colaboradorId: null, data: today(), motivo: 'atestado_medico', observacao: '' };
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function toggleLimited(list, value, encarregadoId) {
  if (list.includes(value)) return list.filter((x) => x !== value);
  const ids = [encarregadoId, ...list, value].filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length >= MAX_TEAM_MEMBERS) return list;
  return [...list, value];
}

function App() {
  // 1. TODOS OS ESTADOS NO TOPO
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  
  const [db, setDb] = useState({ colaboradores: [], veiculos: [], programacoes: [], faltas: [], perfis: [] });
  const [page, setPage] = useState('programacao'); 
  const [selectedDate, setSelectedDate] = useState(today());
  const [search, setSearch] = useState('');
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [modal, setModal] = useState(null);
  const [programacaoForm, setProgramacaoForm] = useState(emptyProgramacao(today()));
  const [colaboradorForm, setColaboradorForm] = useState(emptyColaborador());
  const [veiculoForm, setVeiculoForm] = useState(emptyVeiculo());
  const [faltaForm, setFaltaForm] = useState(emptyFalta());
  const [expandedProgramacaoId, setExpandedProgramacaoId] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // 2. TODAS AS FUNÇÕES DE DADOS NO MEIO
  const fetchUserRole = async (userId) => {
    const { data } = await supabase.from('perfis').select('cargo').eq('id', userId).single();
    if (data && data.cargo) {
      setUserRole(data.cargo.toLowerCase()); 
    } else {
      setUserRole('pendente'); 
    }
  };

  const fetchDatabase = async () => {
    const [resCols, resVeics, resProgs, resFaltas, resPerfis] = await Promise.all([
      supabase.from('colaboradores').select('*'),
      supabase.from('veiculos').select('*'),
      supabase.from('programacoes').select('*'),
      supabase.from('faltas').select('*'),
      supabase.from('perfis').select('*')
    ]);

    setDb(normalizeDb({
      colaboradores: resCols.data || [],
      veiculos: resVeics.data || [],
      programacoes: resProgs.data || [],
      faltas: resFaltas.data || [],
      perfis: resPerfis?.data || []
    }));
  };

  // 3. TODOS OS USE_EFFECTS
  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovering(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id); 
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id); 
      } else {
        setUserRole(null); 
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchDatabase(); 

    const canal = supabase
      .channel('mudancas-incovia')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        fetchDatabase(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [session]);

  // 4. TODOS OS USE_MEMOS
  const maps = useMemo(() => ({
      colaboradores: Object.fromEntries(db.colaboradores.map((x) => [x.id, x])),
      veiculos: Object.fromEntries(db.veiculos.map((x) => [x.id, x])),
  }), [db]);

  const programacoesDoDia = useMemo(() =>
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

  const calendarDays = useMemo(() => {
    return getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
  }, [calendarMonth]);

  // 5. FUNÇÕES DE SUPORTE
  function getDaysInMonth(year, month) {
    const numDays = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null); 
    for (let i = 1; i <= numDays; i++) {
      days.push(`${year}-${pad(month + 1)}-${pad(i)}`);
    }
    return days;
  }

  function nextMonth() {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  }

  function prevMonth() {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setSearch('');
    setActiveDrawer(null);
    setExpandedProgramacaoId(null);
  }

  async function updateProgramacaoField(itemId, field, value) {
    const payload = { [field]: value };
    if (field === 'statusExecucao' && value !== 'NÃO FOI POSSÍVEL REALIZAR') {
      payload.motivoNaoExecucao = null;
    }
    await supabase.from('programacoes').update(payload).eq('id', itemId);
    fetchDatabase(); 
  }

  function openProgramacaoModal(item = null) {
    setProgramacaoForm(item ? { ...item } : emptyProgramacao(selectedDate));
    setModal('programacao');
  }
  function duplicateProgramacao(item) {
   setProgramacaoForm({ ...item, id: '' });
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

  async function saveProgramacao() {
    if (!programacaoForm.tipoEquipe || !programacaoForm.cidade || !programacaoForm.contratante || !programacaoForm.tipoServico || !programacaoForm.encarregadoId) {
      alert('Preencha os campos principais da programação.');
      return;
    }
    if (programacaoForm.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR' && !programacaoForm.motivoNaoExecucao) {
      alert('Selecione o motivo quando não for possível realizar.');
      return;
    }

    const mergedMemberIds = Array.from(new Set([programacaoForm.encarregadoId, ...programacaoForm.membroIds])).filter(Boolean);
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

    if (!payload.id) delete payload.id; 
    delete payload.perfis;

    let res;
    if (programacaoForm.id) {
      res = await supabase.from('programacoes').update(payload).eq('id', programacaoForm.id);
    } else {
      res = await supabase.from('programacoes').insert([payload]);
    }

    if (res.error) {
      alert("Erro ao salvar Programação: " + res.error.message);
      console.error(res.error);
      return;
    }

    fetchDatabase();
    setModal(null);
  }

  async function saveColaborador() {
    if (!colaboradorForm.nome || !colaboradorForm.funcao) {
      alert('Preencha nome e função.');
      return;
    }
    
    const payload = {
      nome: colaboradorForm.nome,
      funcao: colaboradorForm.funcao,
      telefone: colaboradorForm.telefone,
      status: colaboradorForm.status
    };

    let res;
    if (colaboradorForm.id) {
      res = await supabase.from('colaboradores').update(payload).eq('id', colaboradorForm.id);
    } else {
      res = await supabase.from('colaboradores').insert([payload]);
    }

    if (res.error) {
      alert("Erro ao salvar Colaborador: " + res.error.message);
      console.error(res.error);
      return;
    }

    fetchDatabase();
    setModal(null);
  }

  async function saveVeiculo() {
    if (!veiculoForm.placa || !veiculoForm.modelo) {
      alert('Preencha placa e modelo.');
      return;
    }

    const payload = {
      placa: veiculoForm.placa,
      modelo: veiculoForm.modelo,
      ano: veiculoForm.ano,
      tipo: veiculoForm.tipo,
      status: veiculoForm.status
    };

    let res;
    if (veiculoForm.id) {
      res = await supabase.from('veiculos').update(payload).eq('id', veiculoForm.id);
    } else {
      res = await supabase.from('veiculos').insert([payload]);
    }

    if (res.error) {
      alert("Erro ao salvar Veículo: " + res.error.message);
      console.error(res.error);
      return;
    }

    fetchDatabase();
    setModal(null);
  }

  async function saveFalta() {
    if (!faltaForm.colaboradorId || !faltaForm.data || !faltaForm.motivo) {
      alert('Preencha colaborador, data e motivo.');
      return;
    }

    const payload = { ...faltaForm };
    if (!payload.id) delete payload.id;

    let res;
    if (faltaForm.id) {
      res = await supabase.from('faltas').update(payload).eq('id', faltaForm.id);
    } else {
      res = await supabase.from('faltas').insert([payload]);
    }

    if (res.error) {
      alert("Erro ao salvar Falta: " + res.error.message);
      console.error(res.error);
      return;
    }

    fetchDatabase();
    setModal(null);
  }

  async function deleteProgramacao(itemId) {
    if (!confirm('Excluir esta programação?')) return;
    const res = await supabase.from('programacoes').delete().eq('id', itemId);
    if (res.error) alert("Erro ao excluir Programação: " + res.error.message);
    else fetchDatabase();
  }

  async function deleteColaborador(itemId) {
    if (!confirm('Excluir este colaborador? Todas as faltas atreladas a ele serão apagadas.')) return;
    const res = await supabase.from('colaboradores').delete().eq('id', itemId);
    if (res.error) alert("Erro ao excluir Colaborador: " + res.error.message);
    else {
      fetchDatabase();
      if (activeDrawer?.type === 'colaborador' && activeDrawer.item.id === itemId) setActiveDrawer(null);
    }
  }

  async function deletePerfil(id) {
   if (!confirm('Tem certeza que deseja excluir este usuário definitivamente?')) return;
   const res = await supabase.from('perfis').delete().eq('id', id);
   if (res.error) alert("Erro ao excluir usuário: " + res.error.message);
   else fetchDatabase();
  }

  async function enviarEmailReset(email) {
   if (!confirm(`Enviar link de redefinição de senha para ${email}?`)) return;
   const { error } = await supabase.auth.resetPasswordForEmail(email);
   if (error) alert("Erro ao enviar e-mail: " + error.message);
   else alert("✅ E-mail de recuperação enviado com sucesso para " + email);
  }

  async function deleteVeiculo(itemId) {
    if (!confirm('Excluir este veículo?')) return;
    const res = await supabase.from('veiculos').delete().eq('id', itemId);
    if (res.error) alert("Erro ao excluir Veículo: " + res.error.message);
    else {
      fetchDatabase();
      if (activeDrawer?.type === 'veiculo' && activeDrawer.item.id === itemId) setActiveDrawer(null);
    }
  }

  async function deleteFalta(itemId) {
    if (!confirm('Excluir este registro de falta?')) return;
    const res = await supabase.from('faltas').delete().eq('id', itemId);
    if (res.error) alert("Erro ao excluir Falta: " + res.error.message);
    else fetchDatabase();
  }

  async function aprovarUsuario(id, novoCargo) {
   const res = await supabase.from('perfis').update({ cargo: novoCargo }).eq('id', id);
   if (res.error) alert("Erro ao aprovar: " + res.error.message);
   else {
     alert("✅ Acesso liberado com sucesso!");
     fetchDatabase(); 
   }
  }

  // ==========================================================
  // 6. AS TELAS - A ORDEM AQUI IMPORTA DEMAIS PRO REACT!
  // ==========================================================

  // TELA 1: Recuperação de Senha (vem primeiro)
  if (isRecovering) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '40px', textAlign: 'center', borderRadius: '25px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>
          <h2 style={{ marginBottom: '10px' }}>Nova Senha</h2>
          <p style={{ color: '#64748b', marginBottom: '25px', fontSize: '14px' }}>Digite a sua nova senha de acesso abaixo.</p>
          
          <input
            type="password"
            placeholder="Digite a nova senha"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            style={{ width: '100%', padding: '15px', borderRadius: '50px', border: '1px solid #cbd5e1', marginBottom: '20px', outline: 'none', textAlign: 'center', fontSize: '16px' }}
          />
          
          <button
            className="primary-btn full"
            style={{ borderRadius: '50px', padding: '12px', fontWeight: 'bold' }}
            onClick={async () => {
              if (novaSenha.length < 6) return alert("A senha precisa ter pelo menos 6 caracteres!");
              
              const { error } = await supabase.auth.updateUser({ password: novaSenha });
              
              if (error) {
                alert("Erro ao salvar senha: " + error.message);
              } else {
                alert("✅ Senha atualizada com sucesso!");
                window.location.hash = ''; // Limpa a URL do navegador
                setIsRecovering(false); 
              }
            }}
          >
            Salvar Senha e Entrar
          </button>
        </div>
      </div>
    );
  }

  // TELA 2: Auth / Login
  if (!session) {
    return <Auth />;
  }

  // TELA 3: Usuário aguardando aprovação
  if (userRole === 'pendente') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
          <h2>Aguardando Aprovação</h2>
          <p style={{ color: '#64748b', marginTop: '10px', marginBottom: '30px' }}>
            Sua conta foi criada, mas o acesso ao sistema Incovia precisa ser liberado por um Administrador. Por favor, aguarde.
          </p>
          <button 
            className="ghost-btn" 
            onClick={() => supabase.auth.signOut()}
            style={{ color: '#dc2626' }}
          >
            Sair e voltar depois
          </button>
        </div>
      </div>
    );
  }

  // TELA 4: Aplicativo Principal (O App.jsx normal)
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
 {/* 1. PROGRAMAÇÃO NO TOPO */}
 <NavButton 
   active={page === 'programacao'} 
   onClick={() => changePage('programacao')}
 >
   Programação
 </NavButton>

 {/* 2. CALENDÁRIO LOGO ABAIXO */}
 <NavButton 
   active={page === 'calendario'} 
   onClick={() => changePage('calendario')}
 >
   Calendários
 </NavButton>

 {/* DIVISOR (OPCIONAL) */}
 <div className="section-line" style={{ margin: '10px 0', opacity: 0.3 }} />

 {/* 3. BOTÕES PARA ADMIN/EDITOR */}
 {(userRole === 'admin' || userRole === 'editor') && (
   <>
     <NavButton active={page === 'colaboradores'} onClick={() => changePage('colaboradores')}>
       Colaboradores
     </NavButton>
     <NavButton active={page === 'veiculos'} onClick={() => changePage('veiculos')}>
       Veículos
     </NavButton>
     <NavButton active={page === 'historico'} onClick={() => changePage('historico')}>
       Histórico
     </NavButton>
   </>
 )}

 {/* 4. APROVAÇÕES SÓ PRO ADMIN NO FINAL */}
 {userRole === 'admin' && (
   <NavButton active={page === 'acessos'} onClick={() => changePage('acessos')}>
      Aprovações
   </NavButton>
 )}
</nav>

        <div className="sidebar-bottom">
          <button 
            className="ghost-btn full" 
            style={{ marginTop: '10px', color: '#dc2626', borderColor: '#fca5a5', backgroundColor: '#fef2f2' }} 
            onClick={() => supabase.auth.signOut()}
          >
            Sair
          </button>
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
            {(userRole === 'admin' || userRole === 'editor') && (
              <button className="primary-btn" onClick={() => openProgramacaoModal()}>
                + Nova Programação
              </button>
            )}
          </>
          )}

            {page === 'colaboradores' && (
          <>
            <button className="ghost-btn" onClick={() => exportPessoasXlsx(db)}>
              Exportar Colaboradores
            </button>
            {(userRole === 'admin' || userRole === 'editor') && (
              <>
                <button className="ghost-btn" onClick={() => openFaltaModal()}>
                  Registrar Falta
                </button>
                <button className="primary-btn" onClick={() => openColaboradorModal()}>
                  + Novo
                </button>
              </>
            )}
          </>
          )}

            {page === 'veiculos' && (
              <>
                <button className="ghost-btn" onClick={() => exportVeiculosXlsx(db)}>
                  Exportar Veículos
                </button>
                {(userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'editor') && (
                <button className="primary-btn" onClick={() => openVeiculoModal()}>
                  + Novo Veículo
                </button>
                )}
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

            {page === 'calendario' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Visão Geral</h2>
                    <p>Resumo mensal de programações e faltas</p>
                  </div>
                </div>

                <div className="date-card" style={{ marginBottom: '20px' }}>
                  <button className="icon-btn" onClick={prevMonth}>‹</button>
                  <div>
                    <h3 className="capitalize">
                      {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h3>
                  </div>
                  <button className="icon-btn" onClick={nextMonth}>›</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dia => (
                    <div key={dia} style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{dia}</div>
                  ))}
                  
                  {calendarDays.map((dateStr, index) => {
                    if (!dateStr) return <div key={`empty-${index}`} />;

                    const dayObj = new Date(`${dateStr}T12:00:00`);
                    const isToday = dateStr === today();
                    
                    const progsNoDia = db.programacoes.filter(p => p.data === dateStr);
                    const faltasNoDia = db.faltas.filter(f => f.data === dateStr);

                    return (
                      <div 
                        key={dateStr} 
                        className="card"
                        style={{ 
                          minHeight: '100px', 
                          padding: '10px', 
                          cursor: 'pointer',
                          border: isToday ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          backgroundColor: isToday ? '#eff6ff' : '#fff'
                        }}
                        onClick={() => setActiveDrawer({ type: 'resumo-dia', date: dateStr })}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px' }}>
                          {dayObj.getDate()}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {progsNoDia.length > 0 && (
                            <span className="tag success" style={{ width: 'fit-content' }}>
                              {progsNoDia.length} equipe{progsNoDia.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {faltasNoDia.length > 0 && (
                            <span className="tag" style={{ width: 'fit-content', backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                              {faltasNoDia.length} falta{faltasNoDia.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
              {page === 'acessos' && userRole === 'admin' && (
              <>
              <div className="page-head" style={{ marginTop: '40px' }}>
              <div>
                <h2>Usuários Ativos</h2>
                <p>Gerencie o nível de acesso de cada colaborador</p>
              </div>
              </div>

              <div className="cards-grid three">
              {db.perfis.map((perfil) => (
                <div key={perfil.id} className="card">
                  <div className="card-header between">
                    <div>
                      <strong>{perfil.nome || 'Sem Nome'}</strong>
                      <div className="meta-row">{perfil.email}</div>
                    </div>
                    <span className={`tag ${
                      perfil.cargo === 'admin' ? 'danger' : 
                      perfil.cargo === 'editor' ? 'primary' : 
                      perfil.cargo === 'pendente' ? 'warning' : 'success'
                    }`}>
                      {perfil.cargo || 'pendente'}
                    </span>
                  </div>

                  <div className="section-line" />

                  <div className="card-actions full" style={{ padding: '10px' }}>
                    <select 
                      value={perfil.cargo || 'pendente'} 
                       style={{ 
                        width: '100%', 
                        padding: '10px 15px', 
                        borderRadius: '50px',
                        border: '2px solid #ffc107',
                        backgroundColor: '#fffdeb',
                        color: '#b45309',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        outline: 'none',
                        textAlign: 'center'
                      }}
                      onChange={(e) => aprovarUsuario(perfil.id, e.target.value)}
                      disabled={perfil.id === session?.user?.id}
                    >
                      <option value="pendente">Pendente (Aguardando)</option>
                      <option value="visualizador">Visualizador</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                      {perfil.id !== session?.user?.id && (
                        <button 
                          className="ghost-btn full" 
                          style={{ 
                            color: '#dc2626', 
                            borderColor: '#fca5a5', 
                            backgroundColor: '#fef2f2',
                            borderRadius: '50px' 
                          }} 
                          onClick={() => deletePerfil(perfil.id)}
                        >
                          Excluir Usuário
                        </button>
                      )}
                  </div>
                </div>
              ))}
              </div>
              </>
              )}

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
                    {userRole === 'admin' || userRole === 'editor' && (
                      <button className="ghost-btn" onClick={() => openProgramacaoModal()}>
                        Criar Programação
                      </button>
                    )}
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
                                    disabled={userRole !== 'admin'}
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
                                    disabled={userRole !== 'admin' || item.statusExecucao !== 'NÃO FOI POSSÍVEL REALIZAR'}
                                    value={item.motivoNaoExecucao || ''}
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
                                    disabled={userRole !== 'admin'}
                                    rows="3"
                                    defaultValue={item.observacoes}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      if (e.target.value !== item.observacoes) {
                                        updateProgramacaoField(item.id, 'observacoes', e.target.value);
                                      }
                                    }}
                                  />
                                </label>
                              </div>

                              {userRole === 'admin' && (
                                <div className="card-actions right">
                                  <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); openProgramacaoModal(item); }}>Editar</button>
                                  <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); duplicateProgramacao(item); }}>Duplicar</button>
                                  <button className="danger-btn" onClick={(e) => { e.stopPropagation(); deleteProgramacao(item.id); }}>Excluir</button>
                                </div>
                              )}
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
                        {userRole === 'admin' && (
                          <>
                            <button className="ghost-btn" onClick={() => openColaboradorModal(item)}>Editar</button>
                            <button className="danger-btn" onClick={() => deleteColaborador(item.id)}>Excluir</button>
                          </>
                        )}
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
                        {userRole === 'admin' && (
                          <>
                            <button className="ghost-btn" onClick={() => openVeiculoModal(item)}>Editar</button>
                            <button className="danger-btn" onClick={() => deleteVeiculo(item.id)}>Excluir</button>
                          </>
                        )}
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
                    : activeDrawer.type === 'resumo-dia'
                    ? formatDateLabel(activeDrawer.date).full
                    : activeDrawer.item.tipoEquipe}
                </strong>
                <button className="icon-btn" onClick={() => setActiveDrawer(null)}>×</button>
              </div>

              {activeDrawer.type === 'resumo-dia' && (
                <ResumoDiaDrawer
                  date={activeDrawer.date}
                  db={db}
                  maps={maps}
                  onGoToDate={() => {
                    setSelectedDate(activeDrawer.date);
                    changePage('programacao');
                  }}
                />
              )}

              {activeDrawer.type === 'colaborador' && (
                <ColaboradorDrawer
                  item={activeDrawer.item}
                  db={db}
                  userRole={userRole}
                  openEdit={() => openColaboradorModal(activeDrawer.item)}
                  openFalta={() => openFaltaModal()}
                  deleteFalta={deleteFalta}
                />
              )}

              {activeDrawer.type === 'veiculo' && (
                <VeiculoDrawer
                  item={activeDrawer.item}
                  db={db}
                  userRole={userRole}
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
                  label="Local de Obra"
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
                  value={programacaoForm.encarregadoId || ''}
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
                  value={programacaoForm.motivoNaoExecucao || ''}
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
                  value={faltaForm.colaboradorId || ''}
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

function TextArea({ label, value, onChange, full = false, disabled = false, defaultValue, onBlur, onClick }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      {defaultValue !== undefined ? (
        <textarea rows="3" disabled={disabled} defaultValue={defaultValue} onBlur={onBlur} onClick={onClick} />
      ) : (
        <textarea rows="3" disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function MultiSelect({ label, items, selectedIds, labelKey, subtitleKey, subtitleBuilder, onToggle, full = false }) {
 const [busca, setBusca] = useState('');
 
 const filtrados = items.filter(item => {
   const texto = `${item[labelKey]} ${subtitleBuilder ? subtitleBuilder(item) : item[subtitleKey]}`.toLowerCase();
   return texto.includes(busca.toLowerCase());
 });

 return (
   <div className={full ? 'full' : ''}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
       <span className="input-label" style={{ margin: 0 }}>{label}</span>
       
       {items.length > 5 && (
         <input 
           type="text" 
           placeholder="🔍 Buscar..." 
           value={busca}
           onChange={(e) => setBusca(e.target.value)}
           style={{ padding: '5px 10px', borderRadius: '50px', border: '1px solid #cbd5e1', fontSize: '12px', width: '130px', outline: 'none' }}
         />
       )}
     </div>
     
     <div className="multi-box">
       {filtrados.map((item) => (
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
       {filtrados.length === 0 && <span style={{ padding: '10px', fontSize: '12px', color: '#64748b' }}>Nenhum encontrado.</span>}
     </div>
   </div>
 );
}

// --- GAVETA NOVA: RESUMÃO DO DIA ---
function ResumoDiaDrawer({ date, db, maps, onGoToDate }) {
  const programacoes = db.programacoes.filter(p => p.data === date);
  const faltas = db.faltas.filter(f => f.data === date);
  const totalPessoas = programacoes.reduce((acc, p) => acc + p.membroIds.length, 0);

  return (
    <div className="drawer-body">
      <div className="stats-grid three compact">
        <StatCard number={programacoes.length} label="Equipes" />
        <StatCard number={totalPessoas} label="Pessoas" subtle />
        <StatCard number={faltas.length} label="Faltas" danger />
      </div>

      <div className="card-actions full">
        <button className="primary-btn full" onClick={onGoToDate}>
          Ir para Programação Diária
        </button>
      </div>

      <div className="drawer-section">
        <strong>Faltas Registradas</strong>
        {faltas.length === 0 ? (
          <p className="small-muted">Nenhuma falta neste dia.</p>
        ) : (
          faltas.map((f) => {
            const pessoa = maps.colaboradores[f.colaboradorId];
            return (
              <div key={f.id} className="mini-card" style={{ borderLeft: '4px solid #dc2626' }}>
                <strong>{pessoa ? pessoa.nome : 'Colaborador excluído'}</strong>
                <div className="meta-row">{f.motivo}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="drawer-section">
        <strong>Equipes em Campo</strong>
        {programacoes.length === 0 ? (
          <p className="small-muted">Nenhuma equipe escalada.</p>
        ) : (
          programacoes.map((p) => (
            <div key={p.id} className="mini-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <strong>{p.tipoEquipe}</strong>
              <div className="meta-row">📍 {p.cidade} · {p.membroIds.length} pessoas</div>
              <StatusBadge status={p.statusExecucao} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ColaboradorDrawer({ item, db, userRole, openEdit, openFalta, deleteFalta }) {
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

      {userRole === 'admin' && (
        <div className="card-actions">
          <button className="ghost-btn" onClick={openEdit}>Editar</button>
          <button className="ghost-btn" onClick={openFalta}>Nova falta</button>
        </div>
      )}

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
                {userRole === 'admin' && (
                  <button className="mini-danger" onClick={() => deleteFalta(f.id)}>Excluir</button>
                )}
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

function VeiculoDrawer({ item, db, userRole, openEdit }) {
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

      {userRole === 'admin' && (
        <div className="card-actions">
          <button className="ghost-btn" onClick={openEdit}>Editar</button>
        </div>
      )}

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