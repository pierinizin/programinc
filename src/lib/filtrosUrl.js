/* =============================================================================
   Filtros do /administrativo guardados no endereço
   -----------------------------------------------------------------------------
   Aba, setor e filtros vão para o "?…" da URL. Atualizou a página, voltou
   pelo navegador ou mandou o link para alguém: abre do mesmo jeito.
   Só entra no endereço o que foge do padrão, para o link ficar curto.
   ============================================================================= */

// chave → tipo. Listas viram "a,b,c" no endereço.
const CAMPOS = {
  aba: 'texto',      // pessoas | documentos | ausencias
  setor: 'texto',    // vazio = todos
  q: 'texto',        // busca da aba Pessoas
  st: 'texto',       // ativos (padrão) | inativos | todos
  sit: 'lista',      // situação da pasta
  fun: 'lista',      // função
  aus: 'sim',        // ausente hoje
  dq: 'texto',       // busca da aba Documentos
  tipo: 'lista',     // tipo de documento
  dsit: 'lista',     // situação do documento
  pes: 'lista',      // pessoas (Documentos)
  aq: 'texto',       // busca da aba Ausências
  per: 'texto',      // período
  atipo: 'lista',    // tipo de ausência
  asit: 'lista',     // situação da ausência
  apes: 'lista',     // pessoas (Ausências)
};

export const FILTROS_PADRAO = {
  aba: 'pessoas', setor: '', q: '', st: 'ativos', sit: [], fun: [], aus: false,
  dq: '', tipo: [], dsit: [], pes: [], aq: '', per: 'padrao', atipo: [], asit: [], apes: [],
};

const ABAS = ['pessoas', 'documentos', 'ausencias'];

export function lerFiltros(search = typeof window !== 'undefined' ? window.location.search : '') {
  const u = new URLSearchParams(search);
  const f = { ...FILTROS_PADRAO };
  Object.entries(CAMPOS).forEach(([k, tipo]) => {
    const v = u.get(k);
    if (v == null || v === '') return;
    if (tipo === 'lista') f[k] = v.split(',').map((x) => x.trim()).filter(Boolean);
    else if (tipo === 'sim') f[k] = v === '1';
    else f[k] = v;
  });
  if (!ABAS.includes(f.aba)) f.aba = 'pessoas';
  if (!['ativos', 'inativos', 'todos'].includes(f.st)) f.st = 'ativos';
  return f;
}

export function escreverFiltros(f) {
  const u = new URLSearchParams();
  Object.entries(CAMPOS).forEach(([k, tipo]) => {
    const v = f[k];
    const padrao = FILTROS_PADRAO[k];
    if (tipo === 'lista') { if (v?.length) u.set(k, v.join(',')); return; }
    if (tipo === 'sim') { if (v) u.set(k, '1'); return; }
    if (v && v !== padrao) u.set(k, v);
  });
  const s = u.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
