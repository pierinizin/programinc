/* =============================================================================
   Buscar a tabela INTEIRA, não só as primeiras 1000 linhas
   -----------------------------------------------------------------------------
   O Supabase (PostgREST) devolve no máximo 1000 linhas por select — é o
   "Max rows" padrão do projeto. Um select('*') simples numa tabela com 1500
   linhas volta com 1000 e NÃO avisa erro nenhum: o resto simplesmente some.
   Foi isso que deixou os Relatórios com "1000 dias em campo" cravado.

   Aqui a busca vem em páginas de 1000, ordenadas pelo id (pra uma página não
   repetir nem pular linha da outra).

   Todas as páginas saem AO MESMO TEMPO. Antes, a primeira página tinha que
   voltar (com o total de linhas) para só então as outras saírem — com 1.231
   programações, a segunda página esperava a primeira inteira. Agora o app
   lembra quantas linhas cada tabela tinha da última vez e já pede todas as
   páginas de uma vez. A primeira continua trazendo o total: se a tabela
   cresceu além do que se imaginava, as páginas que faltaram saem em seguida;
   se diminuiu, as páginas a mais voltam vazias e não atrapalham.

   Devolve no mesmo formato do supabase ({ data, error }).
   ============================================================================= */

const PAGINA = 1000;   // igual ao "Max rows" do Supabase
const CHAVE_MEMORIA = 'incovia:linhas:';
const totais = new Map();   // nesta aba; o localStorage guarda entre visitas

function totalLembrado(tabela) {
  if (totais.has(tabela)) return totais.get(tabela);
  try {
    const v = Number(localStorage.getItem(CHAVE_MEMORIA + tabela));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;   // navegador sem localStorage: só perde o atalho
  }
}

function lembrarTotal(tabela, total) {
  totais.set(tabela, total);
  try { localStorage.setItem(CHAVE_MEMORIA + tabela, String(total)); } catch { /* sem problema */ }
}

function consulta(supabase, tabela, ordem, de, comTotal) {
  let q = supabase.from(tabela).select('*', comTotal ? { count: 'exact' } : undefined);
  if (ordem) q = q.order(ordem, { ascending: true });
  return q.range(de, de + PAGINA - 1);
}

export async function buscarTudo(supabase, tabela, { ordem = 'id' } = {}) {
  // Quantas páginas pedir já de saída, pelo tamanho da última vez. (Views sem
  // ordem — painel_prazos — vão uma página primeiro, como sempre foram.)
  const previstas = ordem ? Math.max(1, Math.ceil(totalLembrado(tabela) / PAGINA)) : 1;
  const primeiras = await Promise.all(
    Array.from({ length: previstas }, (_, i) => consulta(supabase, tabela, ordem, i * PAGINA, i === 0))
  );

  const erro = primeiras.find((p) => p.error);
  if (erro) return { data: primeiras[0].data || null, error: erro.error };

  const linhas = primeiras.flatMap((p) => p.data || []);
  const total = typeof primeiras[0].count === 'number' ? primeiras[0].count : null;

  if (total != null) {
    // Cresceu além do previsto: pede só as páginas que faltaram, juntas.
    const faltam = [];
    for (let de = previstas * PAGINA; de < total; de += PAGINA) faltam.push(de);
    if (faltam.length) {
      const resto = await Promise.all(faltam.map((de) => consulta(supabase, tabela, ordem, de, false)));
      const erroResto = resto.find((p) => p.error);
      if (erroResto) return { data: linhas, error: erroResto.error };
      resto.forEach((p) => linhas.push(...(p.data || [])));
    }
    if (ordem) lembrarTotal(tabela, total);
  } else if ((primeiras[primeiras.length - 1].data || []).length === PAGINA) {
    // Servidor não informou o total e a última página veio cheia: uma depois da outra.
    for (let de = previstas * PAGINA; ; de += PAGINA) {
      const p = await consulta(supabase, tabela, ordem, de, false);
      if (p.error) return { data: linhas, error: p.error };
      linhas.push(...(p.data || []));
      if ((p.data || []).length < PAGINA) break;
    }
  }

  // Alguém pode ter gravado uma linha entre uma página e outra: sem repetir.
  if (ordem === 'id') {
    const vistos = new Set();
    return { data: linhas.filter((l) => (vistos.has(l.id) ? false : vistos.add(l.id))), error: null };
  }
  return { data: linhas, error: null };
}
