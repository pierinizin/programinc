/* =============================================================================
   Buscar a tabela INTEIRA, não só as primeiras 1000 linhas
   -----------------------------------------------------------------------------
   O Supabase (PostgREST) devolve no máximo 1000 linhas por select — é o
   "Max rows" padrão do projeto. Um select('*') simples numa tabela com 1500
   linhas volta com 1000 e NÃO avisa erro nenhum: o resto simplesmente some.
   Foi isso que deixou os Relatórios com "1000 dias em campo" cravado: a
   tabela de programações passou de 1000 linhas e o app só enxergava parte.

   Aqui a busca vem em páginas de 1000 (ordenadas pelo id, pra uma página não
   repetir nem pular linha da outra) até a última página vir incompleta.
   Devolve no mesmo formato do supabase ({ data, error }), então quem usa não
   muda nada.
   ============================================================================= */

const PAGINA = 1000;   // igual ao "Max rows" do Supabase

export async function buscarTudo(supabase, tabela, { ordem = 'id' } = {}) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from(tabela).select('*');
    if (ordem) q = q.order(ordem, { ascending: true });
    const res = await q.range(de, de + PAGINA - 1);
    if (res.error) return { data: linhas.length ? linhas : null, error: res.error };
    const pagina = res.data || [];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return { data: linhas, error: null };
  }
}
