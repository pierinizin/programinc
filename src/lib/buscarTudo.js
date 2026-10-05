/* =============================================================================
   Buscar a tabela INTEIRA, não só as primeiras 1000 linhas
   -----------------------------------------------------------------------------
   O Supabase (PostgREST) devolve no máximo 1000 linhas por select — é o
   "Max rows" padrão do projeto. Um select('*') simples numa tabela com 1500
   linhas volta com 1000 e NÃO avisa erro nenhum: o resto simplesmente some.
   Foi isso que deixou os Relatórios com "1000 dias em campo" cravado.

   Aqui a busca vem em páginas de 1000, ordenadas pelo id (pra uma página não
   repetir nem pular linha da outra). A primeira página já pergunta quantas
   linhas a tabela tem; com isso as páginas seguintes saem TODAS AO MESMO
   TEMPO em vez de uma esperando a outra — com 5000 programações são 2 idas
   ao servidor em vez de 5. Se o servidor não informar o total, cai no jeito
   antigo (uma página depois da outra).

   Devolve no mesmo formato do supabase ({ data, error }).
   ============================================================================= */

const PAGINA = 1000;   // igual ao "Max rows" do Supabase

function consulta(supabase, tabela, ordem, de, comTotal) {
  let q = supabase.from(tabela).select('*', comTotal ? { count: 'exact' } : undefined);
  if (ordem) q = q.order(ordem, { ascending: true });
  return q.range(de, de + PAGINA - 1);
}

export async function buscarTudo(supabase, tabela, { ordem = 'id' } = {}) {
  const primeira = await consulta(supabase, tabela, ordem, 0, true);
  if (primeira.error) return { data: null, error: primeira.error };
  const linhas = [...(primeira.data || [])];
  if (linhas.length < PAGINA) return { data: linhas, error: null };

  const total = typeof primeira.count === 'number' ? primeira.count : null;

  if (total != null) {
    // Sabemos o tamanho: pede o resto em paralelo.
    const inicios = [];
    for (let de = PAGINA; de < total; de += PAGINA) inicios.push(de);
    const paginas = await Promise.all(inicios.map((de) => consulta(supabase, tabela, ordem, de, false)));
    for (const p of paginas) {
      if (p.error) return { data: linhas, error: p.error };
      linhas.push(...(p.data || []));
    }
  } else {
    // Sem total: uma página depois da outra até vir uma incompleta.
    for (let de = PAGINA; ; de += PAGINA) {
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
