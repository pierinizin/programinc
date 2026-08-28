import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Avatar } from './components/Avatar';
import { QuadroDia } from './components/QuadroDia';
import { Documentos } from './components/Documentos';
import { Contratos } from './components/Contratos';
import { contratosVigentes, contratoAutomatico } from './lib/contratos';
import { Apontamentos } from './components/Apontamentos';
import { FichaColaborador } from './components/FichaColaborador';
import { FichaVeiculo } from './components/FichaVeiculo';
import { derivarDia } from './lib/dia';
import { prepararFoto, enviarFoto, assinarFotos, assinarFotosEmCache } from './lib/fotos';

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

const STATUS_OPTIONS = ['EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR'];
const REASON_OPTIONS = ['CHUVA', 'MANUTENÇÃO', 'VIAGEM', 'OUTROS'];
const ROLE_OPTIONS = ['Encarregado', 'Motorista de Veículos Médios', 'Ajudante de produção', 'Operador de máquina de pintura'];
const VEHICLE_TYPES = ['Caminhão', 'Caminhonete', 'Carro', 'Outro'];
const VEHICLE_STATUS = ['Disponível', 'Em uso', 'Manutenção', 'Inativo'];
const MAX_TEAM_MEMBERS = 10;

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

// CÁLCULO DE HORAS (SEPARANDO IN ITINERE E OBRA)
function calculateWorkedHours(saidaBase, inicioObra, saidaAlmoco, retornoAlmoco, fimObra, chegadaBase) {
  // Sem os seis horários não dá para calcular. Devolvemos incompleto = true em vez
  // de "00:00h", que parecia um valor válido e mascarava registro faltando.
  if (!saidaBase || !inicioObra || !saidaAlmoco || !retornoAlmoco || !fimObra || !chegadaBase) {
    return { incompleto: true, obra: '—', inItinere: '—', total: '—' };
  }

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const tSaidaBase = parseTime(saidaBase);
  const tInicioObra = parseTime(inicioObra);
  const tSaidaAlmoco = parseTime(saidaAlmoco);
  const tRetornoAlmoco = parseTime(retornoAlmoco);
  const tFimObra = parseTime(fimObra);
  const tChegadaBase = parseTime(chegadaBase);

  // Evita bugs se a equipe trabalhar além da meia-noite
  const adjustTime = (t1, t2) => t2 < t1 ? t2 + (24 * 60) : t2;
  
  const tInicioObraAdj = adjustTime(tSaidaBase, tInicioObra);
  const tSaidaAlmocoAdj = adjustTime(tInicioObraAdj, tSaidaAlmoco);
  const tRetornoAlmocoAdj = adjustTime(tSaidaAlmocoAdj, tRetornoAlmoco);
  const tFimObraAdj = adjustTime(tRetornoAlmocoAdj, tFimObra);
  const tChegadaBaseAdj = adjustTime(tFimObraAdj, tChegadaBase);

  // Cálculo In Itinere (Deslocamento Ida + Volta)
  const inItinereIda = Math.max(0, tInicioObraAdj - tSaidaBase);
  const inItinereVolta = Math.max(0, tChegadaBaseAdj - tFimObraAdj);
  const totalInItinere = inItinereIda + inItinereVolta;

  // Cálculo Tempo Efetivo de Obra
  const obraManha = Math.max(0, tSaidaAlmocoAdj - tInicioObraAdj);
  const obraTarde = Math.max(0, tFimObraAdj - tRetornoAlmocoAdj);
  const totalObra = obraManha + obraTarde;

  const totalGeral = totalInItinere + totalObra;

  const format = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}h`;

  return {
    incompleto: false,
    obra: format(totalObra),
    inItinere: format(totalInItinere),
    total: format(totalGeral)
  };
}

function normalizeDb(data) {
 return {
   // [...].sort() para não mutar o array recebido
   colaboradores: Array.isArray(data?.colaboradores)
     ? [...data.colaboradores].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
     : [],
   veiculos: Array.isArray(data?.veiculos)
     ? [...data.veiculos].sort((a, b) => String(a.placa || '').localeCompare(String(b.placa || ''), 'pt-BR'))
     : [],
   faltas: Array.isArray(data?.faltas) ? data.faltas : [],
   patio: Array.isArray(data?.patio) ? data.patio : [],
   perfis: Array.isArray(data?.perfis) ? data.perfis : [],
   concessionarias: Array.isArray(data?.concessionarias)
     ? [...data.concessionarias].sort((a, b) => String(a.sigla || '').localeCompare(String(b.sigla || ''), 'pt-BR'))
     : [],
   contratos: Array.isArray(data?.contratos) ? data.contratos : [],
   programacoes: Array.isArray(data?.programacoes)
     ? data.programacoes.map((item) => ({
         ...item,
         tipoEquipe: item.tipoEquipe || '',
         statusExecucao: item.statusExecucao || 'EXECUTANDO',
         motivoNaoExecucao: item.motivoNaoExecucao || '',
         observacoes: item.observacoes || '',
         horarioInicio: item.horarioInicio || '06:30',
         horarioInicioObra: item.horarioInicioObra || '07:30',
         horarioSaidaAlmoco: item.horarioSaidaAlmoco || '11:30',
         horarioRetornoAlmoco: item.horarioRetornoAlmoco || '13:00',
         horarioFimObra: item.horarioFimObra || '17:00',
         horarioSaida: item.horarioSaida || '18:00',
         membroIds: Array.isArray(item.membroIds) ? item.membroIds : [],
         veiculoIds: Array.isArray(item.veiculoIds) ? item.veiculoIds : [],
         apontamentoSeriais: Array.isArray(item.apontamentoSeriais) ? item.apontamentoSeriais : [],
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
    concessionaria_id: null,
    contrato_id: null,
    encarregadoId: null,
    engenheiro: '',
    membroIds: [],
    veiculoIds: [],
    statusExecucao: 'EXECUTANDO',
    motivoNaoExecucao: '',
    observacoes: '',
    horarioInicio: '06:30',
    horarioInicioObra: '07:30',
    horarioSaidaAlmoco: '11:30',
    horarioRetornoAlmoco: '13:00',
    horarioFimObra: '17:00',
    horarioSaida: '18:00',
  };
}

/* Ícone por tipo de veículo — traço fino, mesma família dos demais ícones.
   Emoji 🚚 renderiza diferente em cada sistema e destoava do resto. */
function iconeVeiculo(tipo) {
  const comum = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' };
  if (tipo === 'Caminhão') {
    return (
      <svg viewBox="0 0 40 40" {...comum}>
        <path d="M3 12h20v13H3z" /><path d="M23 17h7l5 5v3h-12z" />
        <circle cx="11" cy="29" r="3.2" /><circle cx="28" cy="29" r="3.2" />
      </svg>
    );
  }
  if (tipo === 'Caminhonete') {
    return (
      <svg viewBox="0 0 40 40" {...comum}>
        <path d="M3 24v-6l4-6h9l3 6h4v12H3z" /><path d="M23 18h14v10H23z" />
        <circle cx="11" cy="29" r="3.2" /><circle cx="30" cy="29" r="3.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" {...comum}>
      <path d="M4 26v-6l4-8h20l4 8v6z" /><path d="M8 12h20" />
      <circle cx="12" cy="28" r="3.2" /><circle cx="28" cy="28" r="3.2" />
    </svg>
  );
}

function statusVeiculoClasse(status) {
  if (status === 'Disponível') return 'st-ok';
  if (status === 'Em uso') return 'st-obra';
  if (status === 'Manutenção') return 'st-aten';
  return '';
}

function tagVeiculo(status) {
  if (status === 'Disponível') return 'success';
  if (status === 'Em uso') return 'obra';
  if (status === 'Manutenção') return 'aten';
  return '';
}

function emptyColaborador() {
  return {
    id: '', nome: '', apelido: '', funcao: 'Ajudante de produção',
    telefone: '', status: 'ativo',
    foto_path: null, fotoUrl: null,
    fotoArquivo: null, fotoPreview: null,
  };
}

function emptyVeiculo() {
  return { id: '', placa: '', modelo: '', ano: new Date().getFullYear(), tipo: 'Caminhão', status: 'Disponível' };
}

function emptyFalta() {
  return { id: '', colaboradorId: null, data: today(), motivo: 'atestado_medico', observacao: '' };
}

// Traduz o erro cru do Postgres/Supabase numa mensagem que faz sentido para
// quem está usando o sistema. O erro completo continua indo para o console.
function reportarErro(contexto, error) {
  if (!error) return;
  console.error(`[${contexto}]`, error);

  const codigo = error.code || '';
  let mensagem;

  if (codigo === '42501' || /row-level security|permission denied/i.test(error.message || '')) {
    mensagem = 'Você não tem permissão para esta ação.';
  } else if (codigo === '23505') {
    mensagem = 'Já existe um registro com esses dados (valor duplicado).';
  } else if (codigo === '23503') {
    mensagem = 'Este registro está sendo usado em outro lugar e não pode ser removido.';
  } else if (codigo === '23514') {
    mensagem = 'Algum campo está com valor inválido.';
  } else if (/fetch|network/i.test(error.message || '')) {
    mensagem = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  } else {
    mensagem = 'Não foi possível concluir. Tente novamente.';
  }

  alert(`${contexto}: ${mensagem}`);
}

// Com RLS ligada, uma operação sem permissão volta com 0 linhas afetadas e
// SEM erro. Sem este aviso o botão parecia simplesmente não funcionar.
function semPermissao(acao) {
  alert(`Você não tem permissão para ${acao}.`);
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
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  
  const [db, setDb] = useState({ colaboradores: [], veiculos: [], programacoes: [], faltas: [], patio: [], perfis: [], concessionarias: [], contratos: [] });
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
  const [colabsSel, setColabsSel] = useState({});
  const [veicsSel, setVeicsSel] = useState({});
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [salvandoFoto, setSalvandoFoto] = useState(false);

  /* Documentos ficam FORA de `db` de propósito: só admin enxerga, a carga é
     mais cara (uma view que cruza pessoa × tipo) e não tem por que entrar no
     caminho crítico da Programação, que é a tela que todo mundo abre. */
  const [docs, setDocs] = useState({ tipos: [], documentos: [], pendencias: [] });
  // quando o usuário entra em Documentos pelo menu da ficha, já cai na pasta
  // daquela pessoa em vez de na fila geral
  const [docPessoa, setDocPessoa] = useState(null);

  const fetchUserRole = async (userId) => {
    const { data } = await supabase.from('perfis').select('cargo').eq('id', userId).single();
    if (data && data.cargo) {
      setUserRole(data.cargo.toLowerCase()); 
    } else {
      setUserRole('pendente'); 
    }
  };

  const fetchDatabase = async () => {
    const [resCols, resVeics, resProgs, resFaltas, resPatio, resPerfis,
           resConcs, resCtrs] = await Promise.all([
      supabase.from('colaboradores').select('*'),
      supabase.from('veiculos').select('*'),
      supabase.from('programacoes').select('*'),
      supabase.from('faltas').select('*'),
      supabase.from('patio').select('*'),
      supabase.from('perfis').select('*'),
      supabase.from('concessionarias').select('*'),
      supabase.from('contratos').select('*')
    ]);

    // Com RLS ligada, uma tabela sem permissão volta com error e data null.
    // Registramos no console em vez de silenciar tudo como lista vazia.
    [resCols, resVeics, resProgs, resFaltas, resPatio, resPerfis,
     resConcs, resCtrs].forEach((res) => {
      if (res?.error) console.error('Erro ao carregar dados:', res.error.message);
    });

    // Bucket privado: a imagem só abre com URL assinada. Assinamos todas de
    // uma vez, senão seria uma requisição por pessoa a cada carregamento.
    const colaboradores = resCols.data || [];
    /* As fotos NÃO seguram a primeira tela.
       Antes, assinar as URLs era um await no meio do caminho: a tela ficava
       vazia esperando uma ida ao Storage que não muda um único número do
       quadro. Agora os dados entram na hora e os rostos chegam logo depois —
       o Avatar já sabe desenhar as iniciais enquanto isso. */
    const mapaAgora = assinarFotosEmCache(colaboradores.map((c) => c.foto_path));
    const colaboradoresComFoto = colaboradores.map((c) => ({
      ...c,
      fotoUrl: c.foto_path ? mapaAgora[c.foto_path] || null : null,
    }));

    setDb(normalizeDb({
      colaboradores: colaboradoresComFoto,
      veiculos: resVeics.data || [],
      programacoes: resProgs.data || [],
      faltas: resFaltas.data || [],
      patio: resPatio?.data || [],
      perfis: resPerfis?.data || [],
      concessionarias: resConcs?.data || [],
      contratos: resCtrs?.data || []
    }));

    // segunda etapa, sem bloquear: assina o que ainda não estava em cache
    const faltando = colaboradores
      .map((c) => c.foto_path)
      .filter((cam) => cam && !mapaAgora[cam]);
    if (faltando.length) {
      assinarFotos(faltando).then((novas) => {
        if (!Object.keys(novas).length) return;
        setDb((atual) => ({
          ...atual,
          colaboradores: atual.colaboradores.map((c) => (
            c.foto_path && novas[c.foto_path] && !c.fotoUrl
              ? { ...c, fotoUrl: novas[c.foto_path] }
              : c
          )),
        }));
      });
    }
  };

  // Mantém sempre a versão mais recente de fetchDatabase acessível de dentro
  // do efeito de realtime, sem precisar recriar a subscription a cada render.
  const fetchDatabaseRef = useRef(fetchDatabase);
  fetchDatabaseRef.current = fetchDatabase;

  /* Carga dos documentos. Roda só para admin — para os outros as policies
     devolveriam três listas vazias, e três requisições para receber nada é o
     tipo de peso que não aparece em nenhum gráfico e atrasa todo mundo.
     Se as tabelas ainda não existem no banco, o erro vira lista vazia e a tela
     explica o que rodar, em vez de quebrar. */
  const fetchDocumentos = async () => {
    const [resTipos, resDocs, resPend] = await Promise.all([
      supabase.from('tipos_documento').select('*'),
      supabase.from('documentos').select('*'),
      supabase.from('painel_prazos').select('*'),
    ]);
    [resTipos, resDocs, resPend].forEach((r) => {
      if (r?.error) console.error('Documentos:', r.error.message);
    });
    setDocs({
      tipos: resTipos?.data || [],
      documentos: resDocs?.data || [],
      pendencias: (resPend?.data || []).slice().sort((a, b) => (
        (a.urgencia - b.urgencia)
        || ((a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999))
        || String(a.colaborador).localeCompare(String(b.colaborador), 'pt-BR')
      )),
    });
  };

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

  /* Um único agendador de recarga.
     Antes, cada mutação chamava fetchDatabase() na hora E o realtime chamava
     outra 300 ms depois, pelo MESMO evento: duas recargas completas (6 selects
     + assinatura de todas as fotos) por arraste, por clique de status, por
     checkbox. Agora todo mundo agenda no mesmo temporizador e os dois pedidos
     viram um. O atraso é imperceptível e as telas que precisam de resposta
     imediata já fazem atualização otimista. */
  const fetchTimerRef = useRef(null);
  const contadorTmpRef = useRef(0);
  function agendarFetch() {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(() => {
      fetchTimerRef.current = null;
      fetchDatabaseRef.current();
    }, 250);
  }
  const agendarFetchRef = useRef(agendarFetch);
  agendarFetchRef.current = agendarFetch;

  // Realtime: antes escutava schema inteiro e refazia as 5 queries a cada evento,
  // o que virava cascata com várias pessoas editando. Agora escuta só as tabelas
  // que interessam e agrupa eventos próximos num único refetch.
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    fetchDatabaseRef.current();

    const canal = supabase.channel('mudancas-incovia');
    ['colaboradores', 'veiculos', 'programacoes', 'faltas', 'patio', 'perfis'].forEach((table) => {
      canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => agendarFetchRef.current());
    });
    canal.subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId]);

  /* Só admin carrega documentos, e só depois que o cargo chegou — antes disso
     a consulta voltaria vazia por policy e a tela mentiria dizendo "tudo em
     dia". Um painel de prazos que erra para menos é pior do que não existir. */
  const ehAdmin = userRole === 'admin';
  const fetchDocumentosRef = useRef(fetchDocumentos);
  fetchDocumentosRef.current = fetchDocumentos;
  useEffect(() => {
    if (!userId || !ehAdmin) return;
    fetchDocumentosRef.current();
  }, [userId, ehAdmin]);

  /* ------------------------------------------------------------------------
     Registrar / apagar um documento na conferência
     ------------------------------------------------------------------------
     Escrita otimista, como no quadro: na Importação em massa o teclado vai mais
     rápido que a rede, e esperar o banco a cada tecla transformaria a tarefa de
     uma tarde numa tarde inteira. Se o banco recusar, a linha volta ao que era
     e a tela avisa — em vez de mostrar um "tem" que não existe.
     ------------------------------------------------------------------------ */
  async function salvarDocumento({ colaborador, tipo, valido_ate, existente }) {
    const antes = docs.documentos;

    if (existente) {
      setDocs((d) => ({ ...d,
        documentos: d.documentos.map((x) => (x.id === existente.id ? { ...x, valido_ate } : x)) }));
      const res = await supabase.from('documentos')
        .update({ valido_ate }).eq('id', existente.id).select();
      if (res.error || !res.data?.length) {
        setDocs((d) => ({ ...d, documentos: antes }));
        console.error('Documentos:', res.error?.message);
        return false;
      }
      agendarFetchDocs();
      return true;
    }

    const tmp = `tmp-${Date.now()}`;
    const linha = {
      colaboradorId: colaborador.id,
      tipo_id: tipo.id,
      categoria: tipo.categoria,
      titulo: tipo.nome,
      valido_ate,
      repetivel: false,
    };
    setDocs((d) => ({ ...d, documentos: [...d.documentos, { ...linha, id: tmp }] }));
    const res = await supabase.from('documentos').insert([linha]).select();
    if (res.error || !res.data?.length) {
      setDocs((d) => ({ ...d, documentos: antes }));
      console.error('Documentos:', res.error?.message);
      return false;
    }
    setDocs((d) => ({ ...d,
      documentos: d.documentos.map((x) => (x.id === tmp ? res.data[0] : x)) }));
    registrarAcesso(res.data[0].id, colaborador.id, 'enviou');
    agendarFetchDocs();
    return true;
  }

  /* ------------------------------------------------------------------------
     Concessionárias e contratos
     ------------------------------------------------------------------------ */
  async function salvarConcessionaria(dados) {
    const payload = {
      sigla: dados.sigla, nome: dados.nome, cnpj: dados.cnpj || null,
      contato_nome: dados.contato_nome || null,
      contato_email: dados.contato_email || null,
      contato_telefone: dados.contato_telefone || null,
      cor: dados.cor || '#FFC72C',
    };
    const res = dados.id
      ? await supabase.from('concessionarias').update(payload).eq('id', dados.id).select()
      : await supabase.from('concessionarias').insert([payload]).select();
    if (res.error || !res.data?.length) {
      console.error('Concessionárias:', res.error?.message);
      return false;
    }
    await fetchDatabase();
    return true;
  }

  async function salvarContrato(dados) {
    const payload = {
      concessionaria_id: dados.concessionaria_id,
      numero: dados.numero, objeto: dados.objeto || null, trecho: dados.trecho || null,
      inicio: dados.inicio, fim: dados.fim, ativo: Boolean(dados.ativo),
    };
    const res = dados.id
      ? await supabase.from('contratos').update(payload).eq('id', dados.id).select()
      : await supabase.from('contratos').insert([payload]).select();
    if (res.error || !res.data?.length) {
      console.error('Contratos:', res.error?.message);
      return false;
    }
    await fetchDatabase();
    return true;
  }

  /* Excluir contrato NÃO apaga obra nenhuma: a chave estrangeira é
     'on delete set null'. Mas a programação perde a referência, então o aviso
     precisa dizer quantas — quem apaga um contrato com 40 obras merece saber
     disso antes, não depois. */
  async function excluirContratos(alvos, obrasPorContrato = {}) {
    if (!alvos?.length) return false;
    const nObras = alvos.reduce((s, k) => s + (obrasPorContrato[k.id] || 0), 0);
    const nomes = alvos.map((k) => k.numero).join(', ');
    const aviso = nObras > 0
      ? `Excluir ${nomes}?\n\n${nObras} programação(ões) vão ficar sem contrato — o nome do contratante continua registrado nelas.`
      : `Excluir ${nomes}?`;
    if (!window.confirm(aviso)) return false;
    const res = await supabase.from('contratos').delete().in('id', alvos.map((k) => k.id)).select();
    if (res.error) { console.error('Contratos:', res.error.message); return false; }
    await fetchDatabase();
    return true;
  }

  /* Excluir contratante é mais perigoso e por isso é mais chato: o banco tem
     'on delete restrict' nos contratos, então uma empresa com contrato não sai
     — e é bom que não saia. O erro do Postgres não diria isso de forma
     legível, então a checagem acontece aqui, com o nome do que está segurando. */
  async function excluirConcessionarias(alvos) {
    if (!alvos?.length) return false;

    const presos = alvos.filter((c) => db.contratos.some((k) => k.concessionaria_id === c.id));
    if (presos.length) {
      window.alert(
        `${presos.map((c) => c.sigla).join(', ')} ainda tem contrato cadastrado.\n\n`
        + 'Apague os contratos antes, ou use "Juntar" para passar tudo para outro contratante.'
      );
      return false;
    }

    const nObras = alvos.reduce(
      (s, c) => s + db.programacoes.filter((p) => p.concessionaria_id === c.id).length, 0
    );
    const aviso = nObras > 0
      ? `Excluir ${alvos.map((c) => c.sigla).join(', ')}?\n\n${nObras} programação(ões) vão ficar sem contratante ligado — o nome continua escrito nelas.`
      : `Excluir ${alvos.map((c) => c.sigla).join(', ')}?`;
    if (!window.confirm(aviso)) return false;

    const res = await supabase.from('concessionarias')
      .delete().in('id', alvos.map((c) => c.id)).select();
    if (res.error) { console.error('Contratantes:', res.error.message); return false; }
    await fetchDatabase();
    return true;
  }

  /* Juntar duas concessionárias que são a mesma empresa escrita de dois jeitos.
     A ordem importa: primeiro as programações e os contratos mudam de dono,
     e só depois a duplicata é apagada. Ao contrário, a FK 'on delete restrict'
     dos contratos barraria — ou, pior, as obras ficariam sem ninguém. */
  /* Juntar N contratantes num só. Vem da seleção: com três grafias da mesma
     empresa, juntar de dois em dois faria a mesma operação duas vezes.

     A ordem importa e é a mesma de antes: primeiro as obras e os contratos
     mudam de dono, e SÓ DEPOIS as duplicatas são apagadas. Ao contrário, o
     'on delete restrict' dos contratos barraria a exclusão — ou, num banco mais
     frouxo, as obras ficariam sem ninguém. */
  async function juntarConcessionarias(origens, destino) {
    const lista = [].concat(origens || []).filter((c) => c && c.id !== destino?.id);
    if (!lista.length || !destino) return false;

    const ids = lista.map((c) => c.id);
    const nObras = db.programacoes.filter((p) => ids.includes(p.concessionaria_id)).length;
    const nCtr = db.contratos.filter((k) => ids.includes(k.concessionaria_id)).length;

    if (!window.confirm(
      `Juntar ${lista.map((c) => c.sigla).join(', ')} em "${destino.sigla}"?\n\n`
      + `${nObras} programação(ões) e ${nCtr} contrato(s) passam para ${destino.sigla}, `
      + `e ${lista.length === 1 ? 'o outro cadastro é apagado' : 'os outros cadastros são apagados'}.`
    )) return false;

    const p1 = await supabase.from('programacoes')
      .update({ concessionaria_id: destino.id, contratante: destino.sigla })
      .in('concessionaria_id', ids);
    const p2 = await supabase.from('contratos')
      .update({ concessionaria_id: destino.id }).in('concessionaria_id', ids);
    if (p1.error || p2.error) {
      console.error('Juntar:', p1.error?.message || p2.error?.message);
      await fetchDatabase();
      return false;
    }

    const del = await supabase.from('concessionarias').delete().in('id', ids);
    if (del.error) console.error('Juntar:', del.error.message);
    await fetchDatabase();
    return true;
  }


  /* Ligar um texto antigo ("Motiva") a uma concessionária, de uma vez em todas
     as programações onde ele aparece. */
  async function vincularTexto(solto, concessionariaId) {
    const conc = db.concessionarias.find((c) => c.id === concessionariaId);
    if (!conc) return false;
    const ids = db.programacoes
      .filter((p) => !p.concessionaria_id
        && String(p.contratante || '').trim().toUpperCase() === solto.chave)
      .map((p) => p.id);
    if (!ids.length) return false;
    const res = await supabase.from('programacoes')
      .update({ concessionaria_id: conc.id, contratante: conc.sigla }).in('id', ids);
    if (res.error) { console.error('Vincular:', res.error.message); return false; }
    await fetchDatabase();
    return true;
  }

  /* Corrigir a data de um documento já registrado. Separado do salvarDocumento
     porque aqui a linha sempre existe: é edição, não conferência. */
  async function salvarValidade(doc, valido_ate) {
    const antes = docs.documentos;
    setDocs((d) => ({ ...d,
      documentos: d.documentos.map((x) => (x.id === doc.id ? { ...x, valido_ate } : x)) }));
    const res = await supabase.from('documentos')
      .update({ valido_ate }).eq('id', doc.id).select();
    if (res.error || !res.data?.length) {
      setDocs((d) => ({ ...d, documentos: antes }));
      console.error('Documentos:', res.error?.message);
      return false;
    }
    agendarFetchDocs();
    return true;
  }

  async function removerDocumento(doc) {
    // Um registro sem arquivo é só uma anotação: apagar é corrigir a
    // conferência. Com PDF anexado é outra coisa, e aí a pessoa confirma.
    if (doc.caminho && !window.confirm(
      'Este documento tem um PDF anexado. Apagar o registro deixa o arquivo sem referência. Continuar?'
    )) return false;

    const antes = docs.documentos;
    setDocs((d) => ({ ...d, documentos: d.documentos.filter((x) => x.id !== doc.id) }));
    const res = await supabase.from('documentos').delete().eq('id', doc.id).select();
    if (res.error || !res.data?.length) {
      setDocs((d) => ({ ...d, documentos: antes }));
      console.error('Documentos:', res.error?.message);
      return false;
    }
    registrarAcesso(null, doc.colaboradorId, 'apagou');
    agendarFetchDocs();
    return true;
  }

  /* O rastro de acesso é obrigação de LGPD, não funcionalidade da tela: se
     falhar, não pode derrubar a marcação que o usuário acabou de fazer. Por
     isso vai solto, com o erro só no console. */
  function registrarAcesso(documentoId, colaboradorId, acao) {
    // 'quem' é obrigatório: a policy do 07 exige quem = auth.uid(), para
    // ninguém escrever rastro em nome de outro. Sem este campo o insert é
    // recusado e o log simplesmente não acontece.
    supabase.from('documentos_acessos')
      .insert([{
        documento_id: documentoId, colaborador_id: colaboradorId, acao,
        quem: session?.user?.id || null,
      }])
      .then((r) => { if (r.error) console.error('Auditoria:', r.error.message); });
  }

  /* A view de pendências só muda de verdade quando a rajada de marcações para.
     Recalcular pessoa × tipo a cada tecla seria pagar caro por um número que
     ninguém está olhando naquele instante. */
  const timerDocsRef = useRef(null);
  function agendarFetchDocs() {
    if (timerDocsRef.current) clearTimeout(timerDocsRef.current);
    timerDocsRef.current = setTimeout(() => {
      timerDocsRef.current = null;
      fetchDocumentosRef.current();
    }, 1200);
  }

  const maps = useMemo(() => ({
      colaboradores: Object.fromEntries(db.colaboradores.map((x) => [x.id, x])),
      veiculos: Object.fromEntries(db.veiculos.map((x) => [x.id, x])),
  }), [db.colaboradores, db.veiculos]);

  const programacoesDoDia = useMemo(() =>
      db.programacoes
        .filter((p) => p.data === selectedDate)
        .sort((a, b) => (a.tipoEquipe || '').localeCompare(b.tipoEquipe || '', 'pt-BR')),
    [db.programacoes, selectedDate]
  );

  /* Mesma conta que o quadro usa, vinda de src/lib/dia.js — a fita e a lista
     não podem discordar sobre quantos estão livres. */
  const resumoDia = useMemo(() => derivarDia(db, selectedDate), [db, selectedDate]);

  /* Só o que já é irregular HOJE conta para o selo do menu e para a faixa da
     Programação. "Vence em 30 dias" é assunto da aba Documentos; se entrasse
     aqui, o aviso ficaria aceso o ano inteiro e viraria paisagem. */
  const pendenciasGraves = useMemo(
    () => docs.pendencias.filter((p) => p.urgencia <= 2).length,
    [docs.pendencias]
  );

  /* Quantas pendências cada pessoa tem — para o menu da ficha e para a faixa
     saber de quem está falando. */
  const pendenciasPorPessoa = useMemo(() => {
    const m = {};
    docs.pendencias.forEach((p) => { m[p.colaborador_id] = (m[p.colaborador_id] || 0) + 1; });
    return m;
  }, [docs.pendencias]);
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

  /* Só conta como selecionado quem ainda está visível na lista filtrada: se a
     busca esconde alguém, agir sobre ele seria agir às cegas. */
  const colabsMarcados = filteredColaboradores.filter((c) => colabsSel[c.id]);
  const colabsAtivosMarcados = colabsMarcados.filter((c) => c.status === 'ativo');


  const filteredVeiculos = veiculosComStats.filter((v) => {
    const t = search.toLowerCase();
    return v.placa.toLowerCase().includes(t) || v.modelo.toLowerCase().includes(t);
  });

  const veicsMarcados = filteredVeiculos.filter((v) => veicsSel[v.id]);
  const veicsAtivosMarcados = veicsMarcados.filter((v) => v.status !== 'Inativo');


  const historyItems = colaboradoresComStats.filter((c) => c.nome.toLowerCase().includes(search.toLowerCase()));

  const calendarDays = useMemo(() => {
    return getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
  }, [calendarMonth]);

  useEffect(() => {
    if (window.innerWidth <= 768 && activeDrawer) {
      setTimeout(() => {
        const drawerEl = document.querySelector('.drawer');
        if (drawerEl) {
          const y = drawerEl.getBoundingClientRect().top + window.scrollY - 20;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [activeDrawer]);

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
    if (nextPage !== 'documentos') setDocPessoa(null);
    setSearch('');
    setActiveDrawer(null);
    setExpandedProgramacaoId(null);

    setTimeout(() => {
      if (window.innerWidth <= 768) {
        const mainEl = document.querySelector('.main-area');
        if (mainEl) {
          const y = mainEl.getBoundingClientRect().top + window.scrollY - 10;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    }, 100);
  }

  /* ------------------------------------------------------------------
     Operações do quadro. Todas fazem update otimista: a interface responde
     na hora e só volta atrás se o servidor recusar.
     ------------------------------------------------------------------ */

  async function gravarCampos(equipe, patch) {
    const anterior = db.programacoes;
    setDb((atual) => ({
      ...atual,
      programacoes: atual.programacoes.map((p) =>
        p.id === equipe.id ? { ...p, ...patch } : p
      ),
    }));

    const res = await supabase
      .from('programacoes')
      .update(patch)
      .eq('id', equipe.id)
      .select();

    if (res.error) {
      setDb((atual) => ({ ...atual, programacoes: anterior }));
      return reportarErro('Erro ao atualizar a equipe', res.error);
    }
    if (!res.data?.length) {
      setDb((atual) => ({ ...atual, programacoes: anterior }));
      return semPermissao('alterar esta equipe');
    }
    agendarFetch();
  }

  function adicionarMembro(equipe, pessoaId) {
    const atuais = Array.isArray(equipe.membroIds) ? equipe.membroIds : [];
    if (atuais.includes(pessoaId)) return;
    gravarCampos(equipe, { membroIds: [...atuais, pessoaId] });
  }

  // A primeira pessoa solta numa equipe sem encarregado vira o encarregado —
  // e entra também na lista de membros, que é de onde saem os relatórios.
  function definirEncarregado(equipe, pessoaId) {
    const atuais = Array.isArray(equipe.membroIds) ? equipe.membroIds : [];
    gravarCampos(equipe, {
      encarregadoId: pessoaId,
      membroIds: atuais.includes(pessoaId) ? atuais : [...atuais, pessoaId],
    });
  }

  function removerMembro(equipe, pessoaId) {
    if (equipe.encarregadoId === pessoaId) {
      alert('Para trocar o encarregado, abra a programação.');
      return;
    }
    gravarCampos(equipe, { membroIds: (equipe.membroIds || []).filter((id) => id !== pessoaId) });
  }

  function adicionarVeiculo(equipe, veiculoId) {
    const atuais = Array.isArray(equipe.veiculoIds) ? equipe.veiculoIds : [];
    if (atuais.includes(veiculoId)) return;
    gravarCampos(equipe, { veiculoIds: [...atuais, veiculoId] });
  }

  function removerVeiculo(equipe, veiculoId) {
    gravarCampos(equipe, { veiculoIds: (equipe.veiculoIds || []).filter((id) => id !== veiculoId) });
  }

  /* Criação direto do quadro: os horários entram no padrão da empresa e o
     resto se ajusta arrastando. Abrir o formulário completo continua sendo
     uma opção, mas deixou de ser obrigatório para começar um dia. */
  async function criarProgramacaoRapida({
    tipoEquipe, cidade, contratante, concessionaria_id, contrato_id, encarregadoId,
  }) {
    const linha = {
      data: selectedDate,
      tipoEquipe,
      cidade,
      contratante,
      concessionaria_id: concessionaria_id || null,
      contrato_id: contrato_id || null,
      engenheiro: '',
      encarregadoId: encarregadoId || null,
      membroIds: encarregadoId ? [encarregadoId] : [],
      veiculoIds: [],
      statusExecucao: 'EXECUTANDO',
      motivoNaoExecucao: null,
      observacoes: '',
      horarioInicio: '06:30',
      horarioInicioObra: '07:30',
      horarioSaidaAlmoco: '11:30',
      horarioRetornoAlmoco: '13:00',
      horarioFimObra: '17:00',
      horarioSaida: '18:00',
    };

    const res = await supabase.from('programacoes').insert([linha]).select();
    if (res.error) return reportarErro('Erro ao criar programação', res.error);
    if (!res.data?.length) return semPermissao('criar programações');
    agendarFetch();
  }

  /**
   * Copia as equipes selecionadas para outra data.
   * A estratégia decide o que fazer com quem está indisponível no destino —
   * indisponível aqui é: já escalado naquele dia, ou com falta lançada nele.
   */
  async function copiarProgramacoes(equipes, dataDestino, estrategia) {
    if (!equipes.length || !dataDestino) return;

    const noDestino = db.programacoes.filter((p) => p.data === dataDestino);
    const ocupadosNoDestino = new Set();
    noDestino.forEach((p) => {
      [p.encarregadoId, ...(p.membroIds || [])].filter(Boolean).forEach((id) =>
        ocupadosNoDestino.add(id)
      );
    });
    const faltosos = new Set(
      db.faltas.filter((f) => f.data === dataDestino).map((f) => f.colaboradorId)
    );

    const indisponivel = (id) =>
      (estrategia !== 'substituir' && ocupadosNoDestino.has(id)) || faltosos.has(id);

    if (estrategia === 'substituir' && noDestino.length) {
      const del = await supabase
        .from('programacoes')
        .delete()
        .eq('data', dataDestino)
        .select();
      if (del.error) return reportarErro('Erro ao limpar o dia de destino', del.error);
      if (!del.data?.length) return semPermissao('apagar programações do dia de destino');
    }

    const novas = [];
    let ignoradas = 0;
    let removidas = 0;

    equipes.forEach((eq) => {
      const membros = (eq.membroIds || []).filter(Boolean);
      const problema = membros.some(indisponivel) || (eq.encarregadoId && indisponivel(eq.encarregadoId));

      if (estrategia === 'pular' && problema) {
        ignoradas += 1;
        return;
      }

      let membrosFinais = membros;
      let encarregadoFinal = eq.encarregadoId;
      if (estrategia === 'fila') {
        membrosFinais = membros.filter((id) => !indisponivel(id));
        removidas += membros.length - membrosFinais.length;
        if (encarregadoFinal && indisponivel(encarregadoFinal)) {
          encarregadoFinal = null;
          removidas += 1;
        }
      }

      novas.push({
        data: dataDestino,
        tipoEquipe: eq.tipoEquipe,
        cidade: eq.cidade,
        contratante: eq.contratante,
        engenheiro: eq.engenheiro || '',
        encarregadoId: encarregadoFinal,
        membroIds: membrosFinais,
        veiculoIds: eq.veiculoIds || [],
        // Execução não se copia: status, motivo, observações e horários
        // realizados pertencem ao dia de origem. Só os horários padrão vão.
        statusExecucao: 'EXECUTANDO',
        motivoNaoExecucao: null,
        observacoes: '',
        horarioInicio: eq.horarioInicio,
        horarioInicioObra: eq.horarioInicioObra,
        horarioSaidaAlmoco: eq.horarioSaidaAlmoco,
        horarioRetornoAlmoco: eq.horarioRetornoAlmoco,
        horarioFimObra: eq.horarioFimObra,
        horarioSaida: eq.horarioSaida,
      });
    });

    if (!novas.length) {
      alert('Nenhuma equipe foi copiada: todas tinham alguém indisponível no dia escolhido.');
      return;
    }

    const res = await supabase.from('programacoes').insert(novas).select();
    if (res.error) return reportarErro('Erro ao copiar programações', res.error);
    if (!res.data?.length) return semPermissao('criar programações');

    const partes = [`${novas.length} ${novas.length === 1 ? 'equipe copiada' : 'equipes copiadas'}`];
    if (removidas) partes.push(`${removidas} ${removidas === 1 ? 'pessoa ficou' : 'pessoas ficaram'} de fora`);
    if (ignoradas) partes.push(`${ignoradas} ${ignoradas === 1 ? 'equipe ignorada' : 'equipes ignoradas'}`);
    alert('✅ ' + partes.join(' · ') + '.');

    setSelectedDate(dataDestino);
    agendarFetch();
  }

  /* ------------------------------------------------------------------
     Conciliação com o Kartado. Guardamos só a marcação — o boletim em si
     não vai para o banco, foi a sua escolha. Quatro colunas dão o que a
     medição precisa: se foi lançado, quais seriais, quando e por quem.
     ------------------------------------------------------------------ */
  async function lancarApontamento(programacao, ap) {
    const atuais = Array.isArray(programacao.apontamentoSeriais)
      ? programacao.apontamentoSeriais : [];
    if (atuais.includes(ap.serial)) return;

    const patch = {
      apontamentoSeriais: [...atuais, ap.serial],
      apontamentoLancado: true,
      apontamentoEm: new Date().toISOString(),
      apontamentoPor: session?.user?.id || null,
    };
    return atualizarOtimista('programacoes', programacao.id, patch, 'lançar apontamentos');
  }

  /* Checkbox de apontamento no quadro do dia.
     A conciliação do Kartado marca sozinha; aqui é a marcação manual, para o
     serviço que foi executado mas não veio no boletim (ou ainda não veio).
     Por isso 'apontamentoLancado' é independente de 'apontamentoSeriais':
     marcado sem serial = lançado na mão. */
  async function alternarApontamento(programacao) {
    const marcar = !programacao.apontamentoLancado;
    const seriais = programacao.apontamentoSeriais || [];

    // Desmarcar uma equipe conciliada desfaz o vínculo com o boletim. Isso some
    // da tela de Apontamentos, então não pode acontecer por clique distraído.
    if (!marcar && seriais.length) {
      const ok = window.confirm(
        `Esta equipe está vinculada ao boletim do Kartado (${seriais.join(', ')}).\n\n`
        + 'Desmarcar desfaz esse vínculo e o apontamento volta para a fila de '
        + 'conciliação. Continuar?'
      );
      if (!ok) return;
    }

    const patch = marcar
      ? {
        apontamentoLancado: true,
        apontamentoEm: new Date().toISOString(),
        apontamentoPor: session?.user?.id || null,
      }
      : {
        apontamentoLancado: false,
        apontamentoSeriais: [],
        apontamentoEm: null,
        apontamentoPor: null,
      };

    return atualizarOtimista('programacoes', programacao.id, patch, 'marcar apontamentos');
  }

  async function desfazerApontamento(programacao, ap) {
    const restantes = (programacao.apontamentoSeriais || [])
      .filter((s) => s !== ap.serial);
    const patch = {
      apontamentoSeriais: restantes,
      apontamentoLancado: restantes.length > 0,
      apontamentoEm: restantes.length ? programacao.apontamentoEm : null,
      apontamentoPor: restantes.length ? programacao.apontamentoPor : null,
    };
    return atualizarOtimista('programacoes', programacao.id, patch, 'desfazer lançamentos');
  }

  /* Troca de status direto no quadro, sem abrir a equipe.
     Status e motivo vão juntos porque 'NÃO FOI POSSÍVEL REALIZAR' sem motivo é
     um estado que o próprio formulário recusa — não dá para gravar pela metade. */
  async function mudarStatusEquipe(programacao, statusExecucao, motivo = null) {
    if (programacao.statusExecucao === statusExecucao
      && (programacao.motivoNaoExecucao || null) === motivo) return;

    const payload = {
      statusExecucao,
      motivoNaoExecucao: statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR' ? motivo : null,
    };

    const anterior = db.programacoes;
    setDb((atual) => ({
      ...atual,
      programacoes: atual.programacoes.map(
        (p) => (p.id === programacao.id ? { ...p, ...payload } : p)
      ),
    }));

    const res = await supabase
      .from('programacoes').update(payload).eq('id', programacao.id).select();

    if (res.error || !res.data?.length) {
      setDb((atual) => ({ ...atual, programacoes: anterior }));
      if (res.error) return reportarErro('Erro ao mudar o status', res.error);
      return semPermissao('mudar o status');
    }
    agendarFetch();
  }

  async function updateProgramacaoField(itemId, field, value) {
    const payload = { [field]: value };
    if (field === 'statusExecucao' && value !== 'NÃO FOI POSSÍVEL REALIZAR') {
      payload.motivoNaoExecucao = null;
    }

    // Update otimista: a interface responde na hora e só volta atrás se o
    // servidor recusar (útil em conexão ruim de campo).
    const anterior = db.programacoes;
    setDb((atual) => ({
      ...atual,
      programacoes: atual.programacoes.map((p) => (p.id === itemId ? { ...p, ...payload } : p)),
    }));

    const res = await supabase.from('programacoes').update(payload).eq('id', itemId);
    if (res.error) {
      setDb((atual) => ({ ...atual, programacoes: anterior }));
      reportarErro('Erro ao atualizar Programação', res.error);
      return;
    }
    agendarFetch();
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
    if (!programacaoForm.tipoEquipe || !programacaoForm.cidade || !programacaoForm.contratante || !programacaoForm.encarregadoId) {
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
    // 'perfis' não é mais injetado em cada programação pelo normalizeDb,
    // então não precisa ser removido aqui.
    delete payload.tipoServico;

    let res;
    if (programacaoForm.id) {
      res = await supabase.from('programacoes').update(payload).eq('id', programacaoForm.id);
    } else {
      res = await supabase.from('programacoes').insert([payload]);
    }

    if (res.error) {
      reportarErro('Erro ao salvar Programação', res.error);
      return;
    }

    agendarFetch();
    setModal(null);
  }

  async function saveColaborador() {
    if (!colaboradorForm.nome || !colaboradorForm.funcao) {
      alert('Preencha nome e função.');
      return;
    }
    
    const payload = {
      nome: colaboradorForm.nome,
      apelido: colaboradorForm.apelido,
      funcao: colaboradorForm.funcao,
      telefone: colaboradorForm.telefone,
      status: colaboradorForm.status,
    };

    setSalvandoFoto(Boolean(colaboradorForm.fotoArquivo));

    // Grava primeiro, envia a foto depois: um colaborador novo só ganha id
    // no insert, e o caminho da foto no bucket é derivado desse id.
    let res;
    if (colaboradorForm.id) {
      res = await supabase.from('colaboradores').update(payload).eq('id', colaboradorForm.id).select();
    } else {
      res = await supabase.from('colaboradores').insert([payload]).select();
    }

    if (res.error) {
      setSalvandoFoto(false);
      reportarErro('Erro ao salvar Colaborador', res.error);
      return;
    }
    if (!res.data?.length) {
      setSalvandoFoto(false);
      return semPermissao('salvar colaboradores');
    }

    const salvo = res.data[0];

    if (colaboradorForm.fotoArquivo) {
      try {
        const caminho = await enviarFoto(salvo.id, colaboradorForm.fotoArquivo);
        const up = await supabase
          .from('colaboradores')
          .update({ foto_path: caminho })
          .eq('id', salvo.id);
        if (up.error) throw up.error;
      } catch (e) {
        // A pessoa já foi salva; só a foto falhou. Dizer isso é mais útil do
        // que um erro genérico que faz parecer que nada foi gravado.
        console.error(e);
        alert('Colaborador salvo, mas a foto não subiu: ' + (e.message || 'erro desconhecido'));
      }
    }

    setSalvandoFoto(false);
    agendarFetch();
    setModal(null);
  }

  // Lê o arquivo escolhido, reduz para 256px e guarda a prévia no formulário.
  async function escolherFoto(arquivo) {
    if (!arquivo) return;
    try {
      const blob = await prepararFoto(arquivo);
      setColaboradorForm((f) => ({
        ...f,
        fotoArquivo: blob,
        fotoPreview: URL.createObjectURL(blob),
      }));
    } catch (e) {
      alert(e.message || 'Não foi possível usar esta imagem.');
    }
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
      reportarErro('Erro ao salvar Veículo', res.error);
      console.error(res.error);
      return;
    }

    agendarFetch();
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
      reportarErro('Erro ao salvar Falta', res.error);
      console.error(res.error);
      return;
    }

    agendarFetch();
    setModal(null);
  }

  async function deleteProgramacao(itemId) {
    if (!confirm('Excluir esta programação?')) return;
    const res = await supabase.from('programacoes').delete().eq('id', itemId).select();
    if (res.error) return reportarErro('Erro ao excluir Programação', res.error);
    if (!res.data?.length) return semPermissao('excluir esta programação');
    agendarFetch();
  }

  /* Exclusão em lote a partir da seleção do quadro (a mesma dos checkboxes que
     já servem para copiar). Some de vez, então o aviso lista o que vai embora
     em vez de perguntar "tem certeza?" sobre um número solto. */
  async function excluirProgramacoes(lista) {
    if (!lista.length) return false;

    const nomes = lista.slice(0, 6)
      .map((e) => `· ${e.tipoEquipe || 'Sem tipo'} — ${e.cidade || 'sem cidade'}`)
      .join('\n');
    const resto = lista.length > 6 ? `\n· e mais ${lista.length - 6}` : '';
    const ok = window.confirm(
      `Excluir ${lista.length} ${lista.length === 1 ? 'programação' : 'programações'}?\n\n`
      + `${nomes}${resto}\n\nEsta ação não pode ser desfeita.`
    );
    if (!ok) return false;

    const ids = lista.map((e) => e.id);
    const res = await supabase.from('programacoes').delete().in('id', ids).select();
    if (res.error) { reportarErro('Erro ao excluir programações', res.error); return false; }

    const apagadas = res.data?.length || 0;
    if (!apagadas) { semPermissao('excluir programações'); return false; }
    // Apagar menos do que foi pedido quase sempre é RLS barrando algumas
    // linhas. Dizer o número evita a impressão de que sumiu tudo.
    if (apagadas < ids.length) {
      reportarErro(
        'Exclusão parcial',
        { message: `${apagadas} de ${ids.length} foram excluídas. `
          + 'As demais podem estar fora da sua permissão.' }
      );
    }
    agendarFetch();
    return true;
  }

  /* ------------------------------------------------------------------
     Pátio e faltas pelo arraste do quadro.
     Pátio = veio trabalhar e não saiu para obra. Falta = não veio. São
     tabelas separadas justamente para não misturar as duas contagens.
     ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
     Escrita otimista em lista.
     A tela aplica a mudança na hora e desfaz se o servidor recusar. Sem isto,
     cada clique custava a ida à rede MAIS a recarga completa — medimos 800ms
     num arraste para o pátio, contra 0ms de percepção agora. Quem monta o dia
     dá dezenas desses cliques seguidos; esperar em cada um é o "peso".
     ------------------------------------------------------------------ */
  /* Update otimista por id, para qualquer tabela. */
  async function atualizarOtimista(tabela, id, patch, oQue) {
    const anterior = db[tabela];
    setDb((atual) => ({
      ...atual,
      [tabela]: atual[tabela].map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

    const res = await supabase.from(tabela).update(patch).eq('id', id).select();
    if (res.error || !res.data?.length) {
      setDb((atual) => ({ ...atual, [tabela]: anterior }));
      if (res.error) return reportarErro(`Erro ao ${oQue}`, res.error);
      return semPermissao(oQue);
    }
    return true;
  }

  async function inserirOtimista(tabela, linha, oQue) {
    const provisorio = { ...linha, id: `tmp-${tabela}-${contadorTmpRef.current += 1}` };
    setDb((atual) => ({ ...atual, [tabela]: [...atual[tabela], provisorio] }));

    const res = await supabase.from(tabela).insert([linha]).select();

    if (res.error || !res.data?.length) {
      // desfaz só a linha provisória — mexer no resto atropelaria o que o
      // usuário fez nos milissegundos seguintes
      setDb((atual) => ({
        ...atual, [tabela]: atual[tabela].filter((r) => r.id !== provisorio.id),
      }));
      if (res.error) return reportarErro(`Erro ao ${oQue}`, res.error);
      return semPermissao(oQue);
    }

    // troca a provisória pela linha real, com o id que veio do banco
    const real = res.data[0];
    setDb((atual) => ({
      ...atual, [tabela]: atual[tabela].map((r) => (r.id === provisorio.id ? real : r)),
    }));
    return true;
  }

  async function removerOtimista(tabela, id, oQue) {
    const anterior = db[tabela];
    setDb((atual) => ({ ...atual, [tabela]: atual[tabela].filter((r) => r.id !== id) }));

    const res = await supabase.from(tabela).delete().eq('id', id).select();
    if (res.error || !res.data?.length) {
      setDb((atual) => ({ ...atual, [tabela]: anterior }));
      if (res.error) return reportarErro(`Erro ao ${oQue}`, res.error);
      return semPermissao(oQue);
    }
    return true;
  }

  async function adicionarAoPatio(colaboradorId) {
    if (db.patio.some((p) => p.data === selectedDate && p.colaboradorId === colaboradorId)) return;
    return inserirOtimista('patio', { colaboradorId, data: selectedDate }, 'registrar pátio');
  }

  async function removerDoPatio(colaboradorId) {
    const reg = db.patio.find(
      (p) => p.data === selectedDate && p.colaboradorId === colaboradorId
    );
    if (!reg) return;
    return removerOtimista('patio', reg.id, 'tirar do pátio');
  }

  // 'motivo' é NOT NULL no banco, então quem chama precisa escolher — a tela
  // pergunta no momento do drop em vez de gravar um motivo inventado.
  async function registrarFalta(colaboradorId, motivo) {
    if (db.faltas.some((f) => f.data === selectedDate && f.colaboradorId === colaboradorId)) return;
    return inserirOtimista(
      'faltas',
      { colaboradorId, data: selectedDate, motivo, observacao: '' },
      'registrar faltas'
    );
  }

  async function removerFalta(colaboradorId) {
    const reg = db.faltas.find(
      (f) => f.data === selectedDate && f.colaboradorId === colaboradorId
    );
    if (!reg) return;
    // Apagar falta é só de admin no security.sql — se voltar vazio, o aviso
    // explica em vez de o botão parecer quebrado.
    return removerOtimista('faltas', reg.id, 'remover faltas');
  }

  /* ------------------------------------------------------------------
     Ativar / inativar colaborador.
     Inativar preserva escalas e faltas; excluir apaga tudo em cascata. Por
     isso inativar é a ação da frente e excluir ficou no fim do menu.
     ------------------------------------------------------------------ */
  async function alternarAtivoColaborador(item) {
    const novo = item.status === 'ativo' ? 'inativo' : 'ativo';
    return atualizarOtimista(
      'colaboradores', item.id, { status: novo }, 'mudar o status do colaborador'
    );
  }

  async function inativarColaboradores(lista) {
    // Quem já está inativo não entra: reenviar o mesmo status só gastaria
    // escrita e ainda mexeria no updated_at de quem não mudou nada.
    const alvos = lista.filter((c) => c.status === 'ativo');
    if (!alvos.length) return false;

    const nomes = alvos.slice(0, 6).map((c) => `· ${c.nome}`).join('\n');
    const resto = alvos.length > 6 ? `\n· e mais ${alvos.length - 6}` : '';
    const jaInativos = lista.length - alvos.length;
    const ok = window.confirm(
      `Inativar ${alvos.length} ${alvos.length === 1 ? 'colaborador' : 'colaboradores'}?\n\n`
      + `${nomes}${resto}\n\n`
      + (jaInativos ? `${jaInativos} da seleção já ${jaInativos === 1 ? 'está inativo' : 'estão inativos'} e não ${jaInativos === 1 ? 'será tocado' : 'serão tocados'}.\n\n` : '')
      + 'Eles somem das listas de escalação, mas o histórico é preservado.'
    );
    if (!ok) return false;

    const res = await supabase.from('colaboradores')
      .update({ status: 'inativo' }).in('id', alvos.map((c) => c.id)).select();
    if (res.error) { reportarErro('Erro ao inativar', res.error); return false; }
    if (!res.data?.length) { semPermissao('inativar colaboradores'); return false; }
    agendarFetch();
    return true;
  }

  async function excluirColaboradores(lista) {
    if (!lista.length) return false;
    const nomes = lista.slice(0, 6).map((c) => `· ${c.nome}`).join('\n');
    const resto = lista.length > 6 ? `\n· e mais ${lista.length - 6}` : '';
    const ok = window.confirm(
      `Excluir ${lista.length} ${lista.length === 1 ? 'colaborador' : 'colaboradores'}?\n\n`
      + `${nomes}${resto}\n\n`
      + 'As faltas atreladas a eles serão apagadas junto. Para apenas tirar '
      + 'das listas sem perder histórico, use Inativar.\n\nEsta ação não pode ser desfeita.'
    );
    if (!ok) return false;

    const ids = lista.map((c) => c.id);
    const res = await supabase.from('colaboradores').delete().in('id', ids).select();
    if (res.error) { reportarErro('Erro ao excluir colaboradores', res.error); return false; }
    const apagados = res.data?.length || 0;
    if (!apagados) { semPermissao('excluir colaboradores'); return false; }
    if (apagados < ids.length) {
      reportarErro('Exclusão parcial', {
        message: `${apagados} de ${ids.length} foram excluídos. `
          + 'Os demais podem estar fora da sua permissão.',
      });
    }
    if (activeDrawer?.type === 'colaborador' && ids.includes(activeDrawer.item.id)) {
      setActiveDrawer(null);
    }
    agendarFetch();
    return true;
  }

  async function deleteColaborador(itemId) {
    if (!confirm('Excluir este colaborador? Todas as faltas atreladas a ele serão apagadas.')) return;
    const res = await supabase.from('colaboradores').delete().eq('id', itemId).select();
    if (res.error) return reportarErro('Erro ao excluir Colaborador', res.error);
    if (!res.data?.length) return semPermissao('excluir este colaborador');
    {
      agendarFetch();
      if (activeDrawer?.type === 'colaborador' && activeDrawer.item.id === itemId) setActiveDrawer(null);
    }
  }

  async function deletePerfil(id) {
    if (!confirm('Tem certeza que deseja excluir este usuário definitivamente do sistema?')) return;
    const { error } = await supabase.rpc('deletar_usuario_completo', { uid: id });

    if (error) {
      reportarErro('Erro ao excluir usuário', error);
    } else {
      alert("✅ Usuário e credenciais excluídos com sucesso!");
      agendarFetch();
    }
  }

  async function enviarEmailReset(email) {
   if (!email) {
     alert('Este usuário não tem e-mail cadastrado.');
     return;
   }
   if (!confirm(`Enviar link de redefinição de senha para ${email}?`)) return;
   const { error } = await supabase.auth.resetPasswordForEmail(email, {
     redirectTo: window.location.origin,
   });
   if (error) reportarErro('Erro ao enviar e-mail', error);
   else alert("✅ E-mail de recuperação enviado com sucesso para " + email);
  }

  /* Veículo não é liga-desliga: são quatro status. Reativar devolve para
     'Disponível' — nunca para 'Em uso', que quem define é a programação. */
  async function alternarAtivoVeiculo(item) {
    const novo = item.status === 'Inativo' ? 'Disponível' : 'Inativo';
    return atualizarOtimista(
      'veiculos', item.id, { status: novo }, 'mudar o status do veículo'
    );
  }

  async function inativarVeiculos(lista) {
    const alvos = lista.filter((v) => v.status !== 'Inativo');
    if (!alvos.length) return false;

    // Tirar de circulação um veículo que está numa equipe hoje é o erro caro
    // aqui: a programação continuaria apontando para ele. Avisamos com nome.
    const emUso = alvos.filter((v) => v.status === 'Em uso');
    const nomes = alvos.slice(0, 6).map((v) => `· ${v.placa} — ${v.modelo}`).join('\n');
    const resto = alvos.length > 6 ? `\n· e mais ${alvos.length - 6}` : '';
    const jaInativos = lista.length - alvos.length;

    const ok = window.confirm(
      `Inativar ${alvos.length} ${alvos.length === 1 ? 'veículo' : 'veículos'}?\n\n`
      + `${nomes}${resto}\n\n`
      + (jaInativos ? `${jaInativos} da seleção já ${jaInativos === 1 ? 'está inativo' : 'estão inativos'} e não ${jaInativos === 1 ? 'será tocado' : 'serão tocados'}.\n\n` : '')
      + (emUso.length ? `ATENÇÃO: ${emUso.length} ${emUso.length === 1 ? 'está' : 'estão'} EM USO (${emUso.map((v) => v.placa).join(', ')}).\n\n` : '')
      + 'Eles somem da lista de veículos disponíveis, mas o histórico é preservado.'
    );
    if (!ok) return false;

    const res = await supabase.from('veiculos')
      .update({ status: 'Inativo' }).in('id', alvos.map((v) => v.id)).select();
    if (res.error) { reportarErro('Erro ao inativar', res.error); return false; }
    if (!res.data?.length) { semPermissao('inativar veículos'); return false; }
    agendarFetch();
    return true;
  }

  async function excluirVeiculos(lista) {
    if (!lista.length) return false;
    const nomes = lista.slice(0, 6).map((v) => `· ${v.placa} — ${v.modelo}`).join('\n');
    const resto = lista.length > 6 ? `\n· e mais ${lista.length - 6}` : '';
    const ok = window.confirm(
      `Excluir ${lista.length} ${lista.length === 1 ? 'veículo' : 'veículos'}?\n\n`
      + `${nomes}${resto}\n\n`
      + 'Para apenas tirar da lista de disponíveis sem perder o cadastro, '
      + 'use Inativar.\n\nEsta ação não pode ser desfeita.'
    );
    if (!ok) return false;

    const ids = lista.map((v) => v.id);
    const res = await supabase.from('veiculos').delete().in('id', ids).select();
    if (res.error) { reportarErro('Erro ao excluir veículos', res.error); return false; }
    const apagados = res.data?.length || 0;
    if (!apagados) { semPermissao('excluir veículos'); return false; }
    if (apagados < ids.length) {
      reportarErro('Exclusão parcial', {
        message: `${apagados} de ${ids.length} foram excluídos. `
          + 'Os demais podem estar fora da sua permissão.',
      });
    }
    if (activeDrawer?.type === 'veiculo' && ids.includes(activeDrawer.item.id)) {
      setActiveDrawer(null);
    }
    agendarFetch();
    return true;
  }

  async function deleteVeiculo(itemId) {
    if (!confirm('Excluir este veículo?')) return;
    const res = await supabase.from('veiculos').delete().eq('id', itemId).select();
    if (res.error) return reportarErro('Erro ao excluir Veículo', res.error);
    if (!res.data?.length) return semPermissao('excluir este veículo');
    {
      agendarFetch();
      if (activeDrawer?.type === 'veiculo' && activeDrawer.item.id === itemId) setActiveDrawer(null);
    }
  }

  async function deleteFalta(itemId) {
    if (!confirm('Excluir este registro de falta?')) return;
    const res = await supabase.from('faltas').delete().eq('id', itemId).select();
    if (res.error) return reportarErro('Erro ao excluir Falta', res.error);
    if (!res.data?.length) return semPermissao('excluir este registro de falta');
    agendarFetch();
  }

  async function aprovarUsuario(id, novoCargo) {
   // Alterar 'cargo' direto na tabela é bloqueado pela RLS de propósito:
   // quem valida se você é admin tem que ser o servidor, não o React.
   const { error } = await supabase.rpc('definir_cargo_usuario', {
     uid: id,
     novo_cargo: novoCargo,
   });
   if (error) reportarErro('Erro ao alterar acesso', error);
   else {
     alert("✅ Acesso atualizado com sucesso!");
     agendarFetch();
   }
  }

  if (isRecovering) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--asfalto)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '40px', textAlign: 'center', borderRadius: '25px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>
          <h2 style={{ marginBottom: '10px' }}>Nova Senha</h2>
          <p style={{ color: 'var(--tinta-media)', marginBottom: '25px', fontSize: '14px' }}>Digite a sua nova senha de acesso abaixo.</p>
          
          <input
            type="password"
            placeholder="Digite a nova senha"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            style={{ width: '100%', marginBottom: '18px', textAlign: 'center', fontSize: '15px' }}
          />
          
          <button
            className="primary-btn full"
            style={{ borderRadius: '50px', padding: '12px', fontWeight: 'bold' }}
            onClick={async () => {
              if (novaSenha.length < 6) return alert("A senha precisa ter pelo menos 6 caracteres!");
              
              const { error } = await supabase.auth.updateUser({ password: novaSenha });
              
              if (error) {
                reportarErro('Erro ao salvar senha', error);
              } else {
                alert("✅ Senha atualizada com sucesso!");
                window.location.hash = ''; 
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

  if (!session) {
    return <Auth />;
  }

  if (userRole === 'pendente') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--asfalto)', padding: '20px' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
          <h2>Aguardando Aprovação</h2>
          <p style={{ color: 'var(--tinta-media)', marginTop: '10px', marginBottom: '30px' }}>
            Sua conta foi criada, mas o acesso ao sistema Incovia precisa ser liberado por um Administrador. Por favor, aguarde.
          </p>
          <button 
            className="ghost-btn" 
            onClick={() => supabase.auth.signOut()}
            style={{ color: 'var(--erro-texto)' }}
          >
            Sair e voltar depois
          </button>
        </div>
      </div>
    );
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

         <NavButton active={page === 'calendario'} onClick={() => changePage('calendario')}>
           Calendários
         </NavButton>

        <div className="section-line" style={{ margin: '10px 0', opacity: 0.3 }} />

         {(userRole === 'admin' || userRole === 'editor') && (
           <div className="menu-group-title">Painel do Administrador</div>
         )}

         {(userRole === 'admin' || userRole === 'editor') && (
           <>
             <NavButton active={page === 'colaboradores'} onClick={() => changePage('colaboradores')}>
               Colaboradores
             </NavButton>
             {userRole === 'admin' && (
               <NavButton active={page === 'documentos'} onClick={() => changePage('documentos')}>
                 Documentos
                 {/* O número no menu é o ponto do desenho: o prazo cobra
                     sozinho, sem depender de alguém lembrar de abrir a aba. */}
                 {pendenciasGraves > 0 && <span className="nav-selo">{pendenciasGraves}</span>}
               </NavButton>
             )}
             {userRole === 'admin' && (
               <NavButton active={page === 'contratos'} onClick={() => changePage('contratos')}>
                 Contratantes
               </NavButton>
             )}
             <NavButton active={page === 'veiculos'} onClick={() => changePage('veiculos')}>
               Veículos
             </NavButton>
             <NavButton active={page === 'apontamentos'} onClick={() => changePage('apontamentos')}>
               Apontamentos
             </NavButton>
             <NavButton active={page === 'historico'} onClick={() => changePage('historico')}>
               Histórico
             </NavButton>
           </>
         )}

         {userRole === 'admin' && (
           <NavButton active={page === 'acessos'} onClick={() => changePage('acessos')}>
              Aprovações
           </NavButton>
         )}
        </nav>

        <div className="sidebar-bottom">
          <button 
            className="ghost-btn logout-btn" onClick={() => supabase.auth.signOut()} title="Sair do sistema"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span className="logout-text">Sair</span>
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
                {userRole !== 'visualizador' && (
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
                  </>
                )}
                
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

            {page === 'apontamentos' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Apontamentos</h2>
                    <p>Importe o boletim do Kartado e concilie com as equipes</p>
                  </div>
                </div>
                <Apontamentos
                  db={db}
                  maps={maps}
                  podeEditar={userRole === 'admin' || userRole === 'editor'}
                  onLancar={lancarApontamento}
                  onDesfazer={desfazerApontamento}
                />
              </>
            )}

            {page === 'contratos' && userRole === 'admin' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Contratantes</h2>
                    <p>As empresas e os contratos que a programação usa</p>
                  </div>
                </div>
                <Contratos
                  concessionarias={db.concessionarias}
                  contratos={db.contratos}
                  programacoes={db.programacoes}
                  podeEditar={userRole === 'admin'}
                  onSalvarConcessionaria={salvarConcessionaria}
                  onSalvarContrato={salvarContrato}
                  onExcluirContratos={excluirContratos}
                  onExcluirConcessionarias={excluirConcessionarias}
                  onJuntarConcessionarias={juntarConcessionarias}
                  onVincularTexto={vincularTexto}
                />
              </>
            )}

            {page === 'documentos' && userRole === 'admin' && (
              <>
                <div className="page-head">
                  <div>
                    <h2>Documentos</h2>
                    <p>Validades, pendências e a conferência da pasta de cada um</p>
                  </div>
                </div>
                <Documentos
                  key={docPessoa || 'fila'}
                  colaboradores={db.colaboradores}
                  tipos={docs.tipos}
                  documentos={docs.documentos}
                  pendencias={docs.pendencias}
                  quem={session?.user?.id || null}
                  pessoaInicial={docPessoa}
                  onSalvarDocumento={salvarDocumento}
                  onRemoverDocumento={removerDocumento}
                  onSalvarValidade={salvarValidade}
                  onRecarregar={fetchDocumentos}
                />
              </>
            )}

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

                <div className="calendar-grid">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dia => (
                    <div key={dia} className="calendar-header">{dia}</div>
                  ))}
                  
                  {calendarDays.map((dateStr, index) => {
                    if (!dateStr) return <div key={`empty-${index}`} />;

                    const dayObj = new Date(`${dateStr}T12:00:00`);
                    const isToday = dateStr === today();
                    const isSelected = activeDrawer?.type === 'resumo-dia' && activeDrawer.date === dateStr;
                    
                    const progsNoDia = db.programacoes.filter(p => p.data === dateStr);
                    const faltasNoDia = db.faltas.filter(f => f.data === dateStr);

                    return (
                      <div 
                        key={dateStr} 
                        className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => setActiveDrawer({ type: 'resumo-dia', date: dateStr })}
                      >
                        <div className="day-number">
                          {dayObj.getDate()}
                        </div>
                        
                        <div className="calendar-tags">
                          {progsNoDia.length > 0 && (
                            <span className="tag success" title={`${progsNoDia.length} equipes`}>
                              {progsNoDia.length} eqp
                            </span>
                          )}
                          {faltasNoDia.length > 0 && (
                            <span className="tag danger-cal" title={`${faltasNoDia.length} faltas`}>
                              {faltasNoDia.length} falt
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
                        border: '1px solid var(--faixa-texto)',
                        backgroundColor: 'var(--faixa-fundo)',
                        color: 'var(--faixa-texto)',
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
                      <button
                        className="ghost-btn full"
                        style={{ borderRadius: '50px' }}
                        onClick={() => enviarEmailReset(perfil.email)}
                      >
                        Enviar link de nova senha
                      </button>

                      {perfil.id !== session?.user?.id && (
                        <button
                          className="ghost-btn full"
                          style={{
                            color: 'var(--erro-texto)',
                            borderColor: 'var(--erro-texto)',
                            backgroundColor: 'var(--erro-fundo)',
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

                {/* Faixa de aviso: só link, nunca formulário. Quem está montando
                    a programação das 6h não vai parar para cadastrar validade —
                    mas precisa saber, antes de escalar, que tem gente com NR
                    vencida. */}
                {userRole === 'admin' && pendenciasGraves > 0 && (
                  <button
                    type="button"
                    className="aviso-faixa clicavel"
                    onClick={() => changePage('documentos')}
                  >
                    <b>{pendenciasGraves}</b>
                    {pendenciasGraves === 1
                      ? ' documento vencido ou nunca entregue'
                      : ' documentos vencidos ou nunca entregues'}
                    <span className="ir">ver em Documentos →</span>
                  </button>
                )}

                {/* Fita do dia: navegação e contadores na mesma linha. Antes
                    eram dois blocos de 198px para mostrar dois números que já
                    apareciam repetidos logo abaixo, no quadro. */}
                <div className="fita-dia">
                  <span className="fd-nav">
                    <button
                      className="icon-btn"
                      aria-label="Dia anterior"
                      onClick={() => { setSelectedDate(shiftDate(selectedDate, -1)); setExpandedProgramacaoId(null); }}
                    >
                      ‹
                    </button>
                    <span className="fd-data">
                      <b className="capitalize">{dateLabel.weekday}</b>
                      <span>{dateLabel.full}</span>
                    </span>
                    <button
                      className="icon-btn"
                      aria-label="Próximo dia"
                      onClick={() => { setSelectedDate(shiftDate(selectedDate, 1)); setExpandedProgramacaoId(null); }}
                    >
                      ›
                    </button>
                  </span>

                  <span className="fd-risco" />

                  <span className="fd-contas">
                    {/* zero fica apagado de propósito: "0 equipes" não pede
                        ação nenhuma e não deve competir com o que pede. */}
                    <Pastilha n={programacoesDoDia.length} rotulo="equipes" />
                    <Pastilha n={resumoDia.pessoasEscaladas} rotulo="escalados" />
                    <Pastilha n={resumoDia.pessoasLivres.length} rotulo="livres" tom="destaque" />
                    <Pastilha n={resumoDia.veiculosLivres.length} rotulo="veíc. parados" />
                    {resumoDia.faltosos.size > 0 && (
                      <Pastilha n={resumoDia.faltosos.size} rotulo="faltas" tom="alerta" />
                    )}
                    {resumoDia.noPatio.size > 0 && (
                      <Pastilha n={resumoDia.noPatio.size} rotulo="no pátio" />
                    )}
                  </span>

                  {selectedDate !== today() && (
                    <button
                      className="fd-hoje"
                      onClick={() => { setSelectedDate(today()); setExpandedProgramacaoId(null); }}
                    >
                      Hoje
                    </button>
                  )}
                </div>

                {/* O quadro substitui a grade de cartões como forma de MONTAR o dia.
                    Os cartões continuam existindo, mas só para a equipe aberta —
                    é ali que se edita status, horários e observações. */}
                <QuadroDia
                  db={db}
                  maps={maps}
                  selectedDate={selectedDate}
                  podeEditar={userRole === 'admin' || userRole === 'editor'}
                  tiposEquipe={TEAM_TYPE_OPTIONS}
                  onAdicionarMembro={adicionarMembro}
                  onDefinirEncarregado={definirEncarregado}
                  onRemoverMembro={removerMembro}
                  onAdicionarVeiculo={adicionarVeiculo}
                  onRemoverVeiculo={removerVeiculo}
                  onCriarRapida={criarProgramacaoRapida}
                  onAbrirEquipe={(eq) =>
                    setExpandedProgramacaoId((atual) => (atual === eq.id ? null : eq.id))
                  }
                  onEditarEquipe={openProgramacaoModal}
                  onNovaEquipe={() => openProgramacaoModal()}
                  onCopiar={copiarProgramacoes}
                  onAlternarApontamento={alternarApontamento}
                  onAoPatio={adicionarAoPatio}
                  onTirarDoPatio={removerDoPatio}
                  onRegistrarFalta={registrarFalta}
                  onRemoverFalta={removerFalta}
                  onMudarStatus={mudarStatusEquipe}
                  podeMudarStatus={userRole === 'admin'}
                  podeExcluir={userRole === 'admin'}
                  onExcluir={excluirProgramacoes}
                />

                {programacoesDoDia.some((p) => p.id === expandedProgramacaoId) && (
                  <div className="cards-grid programacao-cards-grid">
                    {programacoesDoDia.filter((p) => p.id === expandedProgramacaoId).map((item) => {
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
                          className={`card team-card compact-program-card ${isExpanded ? 'expanded' : 'collapsed'} ${
                            item.statusExecucao === 'CONCLUÍDO' ? 'st-ok'
                              : item.statusExecucao === 'EXECUTANDO' ? 'st-campo'
                              : item.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR' ? 'st-parado'
                              : ''
                          }`}
                          onClick={() => setExpandedProgramacaoId(isExpanded ? null : item.id)}
                        >
                          <div className="card-header between start compact-program-head">
                            <div>
                              <h3>{item.tipoEquipe}</h3>
                              <div className="meta-row">📍 {item.cidade.toUpperCase()} · 🏢 {item.contratante}</div>
                            </div>
                            <StatusBadge status={item.statusExecucao} motivo={item.motivoNaoExecucao} />
                          </div>

                          <div className="compact-summary-grid">
                            <div className="compact-summary-block">
                              <span className="section-label">Membros</span>
                              <div className="compact-summary-text">
                                {members.length
                                  ? members.map((person) => (person.apelido && person.apelido.trim() !== '') ? person.apelido : person.nome.split(' ')[0]).join(' · ')
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

                            {item.statusExecucao === 'CONCLUÍDO' && (() => {
                              const hours = calculateWorkedHours(
                                item.horarioInicio, 
                                item.horarioInicioObra, 
                                item.horarioSaidaAlmoco, 
                                item.horarioRetornoAlmoco, 
                                item.horarioFimObra, 
                                item.horarioSaida
                              );
                              return (
                                <div className="compact-summary-block full-row">
                                  <span className="section-label">Registro de Tempos</span>
                                  <div
                                    className="service-line compact-service-line"
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: '15px',
                                      color: hours.incompleto ? 'var(--faixa-texto)' : 'var(--ok-texto)',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    <span>🚗 In Itinere: {hours.inItinere}</span>
                                    <span>🚧 Na Obra: {hours.obra}</span>
                                    <span>⏱ Total: {hours.total}</span>
                                  </div>
                                  {hours.incompleto && (
                                    <div className="small-muted" style={{ color: 'var(--faixa-texto)' }}>
                                      Horários incompletos — preencha os seis registros para calcular.
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="compact-expand-hint">
                            {isExpanded ? 'Clique para recolher' : 'Clique para ver detalhes'}
                          </div>

                          {isExpanded && (
                            <>
                              <div className="section-line" />
                              <div className="section-label">Equipe ({item.membroIds.length}/{MAX_TEAM_MEMBERS})</div>
                              <div className="person-list fixed-ten">
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
                                        <Avatar nome={person.nome} url={person.fotoUrl} tamanho="small" />
                                        <span>{(person.apelido && person.apelido.trim() !== '') ? person.apelido : person.nome}</span>
                                      </div>
                                      <span className="tag">
                                        {memberId === item.encarregadoId ? 'Encarregado' : person.funcao}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              {userRole !== 'visualizador' && (
                                <>
                                  <div className="section-line" />
                                  
                                  <div className="time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                    <FieldPair label="Saída (Base)" value={item.horarioInicio} />
                                    <FieldPair label="Início Obra" value={item.horarioInicioObra} />
                                    <FieldPair label="Saída Almoço" value={item.horarioSaidaAlmoco} />
                                    <FieldPair label="Retorno Almoço" value={item.horarioRetornoAlmoco} />
                                    <FieldPair label="Fim Obra" value={item.horarioFimObra} />
                                    <FieldPair label="Saída (Retorno)" value={item.horarioSaida} />
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
                                </>
                              )}

                              {userRole === 'admin' && (
                                <div className="card-actions right">
                                  <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); duplicateProgramacao(item); }}>Duplicar</button>
                                  <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); openProgramacaoModal(item); }}>Editar</button>
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
                {colabsMarcados.length > 0 && (
                  <div className="barra-sel solta">
                    <span>
                      {colabsMarcados.length}{' '}
                      {colabsMarcados.length === 1 ? 'selecionado' : 'selecionados'}
                      {colabsAtivosMarcados.length !== colabsMarcados.length && (
                        <span className="sel-nota">
                          {' · '}
                          {colabsMarcados.length - colabsAtivosMarcados.length} já inativo(s)
                        </span>
                      )}
                    </span>
                    <div className="chips-row tight">
                      <button className="chip-btn" onClick={() => setColabsSel({})}>Limpar</button>
                      {/* Suspenso quando não há ninguém ativo na seleção: o botão
                          não teria efeito nenhum e o clique só geraria dúvida. */}
                      <button
                        className="chip-btn"
                        disabled={colabsAtivosMarcados.length === 0}
                        title={colabsAtivosMarcados.length === 0
                          ? 'Todos os selecionados já estão inativos'
                          : `Inativar ${colabsAtivosMarcados.length}`}
                        onClick={async () => {
                          const feito = await inativarColaboradores(colabsMarcados);
                          if (feito) setColabsSel({});
                        }}
                      >
                        Inativar
                      </button>
                      <button
                        className="chip-btn perigo"
                        onClick={async () => {
                          const feito = await excluirColaboradores(colabsMarcados);
                          if (feito) setColabsSel({});
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}

                <div className="cards-grid three">
                  {filteredColaboradores.map((item) => (
                    <FichaColaborador
                      key={item.id}
                      item={item}
                      ehAdmin={userRole === 'admin'}
                      selecionado={Boolean(colabsSel[item.id])}
                      onSelecionar={(id) => setColabsSel((s) => ({ ...s, [id]: !s[id] }))}
                      onVer={(c) => setActiveDrawer({ type: 'colaborador', item: c })}
                      pendencias={pendenciasPorPessoa[item.id] || 0}
                      onDocumentos={(c) => { setDocPessoa(c.id); changePage('documentos'); }}
                      onEditar={openColaboradorModal}
                      onAlternarAtivo={alternarAtivoColaborador}
                      onExcluir={(c) => deleteColaborador(c.id)}
                    />
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
                {veicsMarcados.length > 0 && (
                  <div className="barra-sel solta">
                    <span>
                      {veicsMarcados.length}{' '}
                      {veicsMarcados.length === 1 ? 'selecionado' : 'selecionados'}
                      {veicsAtivosMarcados.length !== veicsMarcados.length && (
                        <span className="sel-nota">
                          {' · '}
                          {veicsMarcados.length - veicsAtivosMarcados.length} já inativo(s)
                        </span>
                      )}
                    </span>
                    <div className="chips-row tight">
                      <button className="chip-btn" onClick={() => setVeicsSel({})}>Limpar</button>
                      <button
                        className="chip-btn"
                        disabled={veicsAtivosMarcados.length === 0}
                        title={veicsAtivosMarcados.length === 0
                          ? 'Todos os selecionados já estão inativos'
                          : `Inativar ${veicsAtivosMarcados.length}`}
                        onClick={async () => {
                          const feito = await inativarVeiculos(veicsMarcados);
                          if (feito) setVeicsSel({});
                        }}
                      >
                        Inativar
                      </button>
                      <button
                        className="chip-btn perigo"
                        onClick={async () => {
                          const feito = await excluirVeiculos(veicsMarcados);
                          if (feito) setVeicsSel({});
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}

                <div className="cards-grid three">
                  {filteredVeiculos.map((item) => (
                    <FichaVeiculo
                      key={item.id}
                      item={item}
                      ehAdmin={userRole === 'admin'}
                      selecionado={Boolean(veicsSel[item.id])}
                      onSelecionar={(id) => setVeicsSel((s) => ({ ...s, [id]: !s[id] }))}
                      onVer={(v) => setActiveDrawer({ type: 'veiculo', item: v })}
                      onEditar={openVeiculoModal}
                      onAlternarAtivo={alternarAtivoVeiculo}
                      onExcluir={(v) => deleteVeiculo(v.id)}
                      classeStatus={statusVeiculoClasse(item.status)}
                      classeTag={tagVeiculo(item.status)}
                      icone={iconeVeiculo(item.tipo)}
                    />
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
                        <Avatar nome={item.nome} url={item.fotoUrl} />
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
                <Select
                  label="Contratante"
                  value={programacaoForm.concessionaria_id || ''}
                  onChange={(v) => {
                    const c = db.concessionarias.find((x) => x.id === v);
                    setProgramacaoForm({
                      ...programacaoForm,
                      concessionaria_id: v || null,
                      // o texto acompanha a escolha: é ele que sai nas
                      // exportações e é por ele que o Kartado casa
                      contratante: c ? c.sigla : '',
                      contrato_id: contratoAutomatico(db.contratos, v),
                    });
                  }}
                  placeholder="Selecione"
                  options={db.concessionarias.map((c) => ({ value: c.id, label: c.sigla }))}
                />

                {/* Com um contrato vigente só, ele já entrou sozinho e o campo
                    nem aparece — um seletor de uma opção é uma pergunta que
                    não precisava ser feita. */}
                {contratosVigentes(db.contratos, programacaoForm.concessionaria_id).length > 1 && (
                  <Select
                    label="Contrato"
                    value={programacaoForm.contrato_id || ''}
                    /* Sem esta opção vazia o <select> mostraria o primeiro
                       contrato da lista com o valor ainda em branco: parece
                       escolhido, salva sem contrato. */
                    placeholder="Escolha o contrato"
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, contrato_id: v || null })}
                    options={contratosVigentes(db.contratos, programacaoForm.concessionaria_id)
                      .map((k) => ({ value: k.id, label: k.numero }))}
                  />
                )}
                <Input
                label="Engenheiro Responsável"
                value={programacaoForm.engenheiro}
                onChange={(v) => setProgramacaoForm({ ...programacaoForm, engenheiro: v })}
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

                {/* PAINEL DE EDIÇÃO DOS 6 HORÁRIOS */}
                <div className="full modal-time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <Input
                    label="Saída (Base)"
                    type="time"
                    value={programacaoForm.horarioInicio}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioInicio: v })}
                  />
                  <Input
                    label="Início Obra"
                    type="time"
                    value={programacaoForm.horarioInicioObra}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioInicioObra: v })}
                  />
                  <Input
                    label="Saída Almoço"
                    type="time"
                    value={programacaoForm.horarioSaidaAlmoco}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioSaidaAlmoco: v })}
                  />
                  <Input
                    label="Retorno Almoço"
                    type="time"
                    value={programacaoForm.horarioRetornoAlmoco}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioRetornoAlmoco: v })}
                  />
                  <Input
                    label="Fim Obra"
                    type="time"
                    value={programacaoForm.horarioFimObra}
                    onChange={(v) => setProgramacaoForm({ ...programacaoForm, horarioFimObra: v })}
                  />
                  <Input
                    label="Saída (Retorno)"
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
                label="Apelido (Como aparecerá nos relatórios)" 
                value={colaboradorForm.apelido} 
                onChange={(v) => setColaboradorForm({ ...colaboradorForm, apelido: v })} 
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
                <div className="full-row zona-foto-linha">
                  <Avatar
                    nome={colaboradorForm.nome}
                    url={colaboradorForm.fotoPreview || colaboradorForm.fotoUrl}
                    tamanho="big"
                  />
                  <div className="zona-foto-texto">
                    <strong>Foto</strong>
                    <span className="small-muted">
                      Opcional. Sem foto, aparecem as iniciais. A imagem é recortada
                      no centro e reduzida antes de enviar.
                    </span>
                    <div className="chips-row tight" style={{ marginTop: '8px' }}>
                      <label className="chip-btn" style={{ cursor: 'pointer' }}>
                        {colaboradorForm.fotoPreview || colaboradorForm.fotoUrl ? 'Trocar foto' : 'Escolher foto'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: 'none' }}
                          onChange={(e) => escolherFoto(e.target.files?.[0])}
                        />
                      </label>
                      {colaboradorForm.fotoPreview && (
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() =>
                            setColaboradorForm((f) => ({ ...f, fotoArquivo: null, fotoPreview: null }))
                          }
                        >
                          Desfazer
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="modal-actions full">
                  <button className="ghost-btn" onClick={() => setModal(null)} disabled={salvandoFoto}>Cancelar</button>
                  <button className="primary-btn" onClick={saveColaborador} disabled={salvandoFoto}>
                    {salvandoFoto ? 'Enviando foto...' : 'Salvar'}
                  </button>
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

/* Contador compacto da fita do dia. O zero fica apagado: uma tela cheia de
   números fortes iguais não ajuda ninguém a achar o que importa. */
function Pastilha({ n, rotulo, tom }) {
  const cor = n === 0 ? 'zero' : (tom || '');
  return (
    <span className={`pastilha ${cor}`} title={`${n} ${rotulo}`}>
      <b>{n}</b>
      <span>{rotulo}</span>
    </span>
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

// ETÍQUETA DE STATUS CORRIGIDA
function StatusBadge({ status, motivo }) {
  const cls = status === 'CONCLUÍDO' ? 'green' : status === 'EXECUTANDO' ? 'yellow' : 'red';
  
  const textoExibido = (status === 'NÃO FOI POSSÍVEL REALIZAR' && motivo) 
    ? motivo.toUpperCase() 
    : status;

  return <span className={`status-badge ${cls}`}>{textoExibido}</span>;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span className="input-label" style={{ margin: 0, fontWeight: 'bold' }}>{label}</span>
        
        <input 
          type="text" 
          placeholder="🔍 Buscar..." 
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ 
            padding: '8px 15px', 
            borderRadius: '50px', 
            border: '1px solid var(--borda)', 
            fontSize: '13px', 
            width: '180px', 
            outline: 'none',
            backgroundColor: 'var(--superficie-2)'
          }}
        />
      </div>
      
      <div className="multi-box" style={{ maxHeight: '250px', overflowY: 'auto' }}>
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
        {filtrados.length === 0 && (
          <div style={{ padding: '15px', textAlign: 'center', color: 'var(--tinta-media)' }}>
            Nenhum resultado para &quot;{busca}&quot;
          </div>
        )}
      </div>
    </div>
  );
}

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
              <div key={f.id} className="mini-card" style={{ borderLeft: '3px solid var(--erro)' }}>
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
          programacoes.map((p) => {
            const encarregado = maps.colaboradores[p.encarregadoId];
            const nomeEncarregado = encarregado ? encarregado.nome.split(' ')[0] : 'Sem Líder';

            return (
              <div key={p.id} className="mini-card" style={{ borderLeft: '3px solid var(--faixa)' }}>
                <strong>{p.tipoEquipe}</strong>
                <div className="meta-row">📍 {p.cidade.toUpperCase()} · Líder: {nomeEncarregado} · {p.membroIds.length} pessoas</div>
                <StatusBadge status={p.statusExecucao} motivo={p.motivoNaoExecucao} />
              </div>
            );
          })
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
        <Avatar nome={item.nome} url={item.fotoUrl} tamanho="big" />
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
                {new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')} · {e.cidade.toUpperCase()} · {e.contratante}
              </div>
              <StatusBadge status={e.statusExecucao} motivo={e.motivoNaoExecucao} />
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
              <div className="meta-row">{new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')} · {e.cidade.toUpperCase()}</div>
              <div className="meta-row">
                Horários: {e.horarioInicio} às {e.horarioSaida} (Obra: {e.horarioInicioObra} - {e.horarioFimObra})
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;