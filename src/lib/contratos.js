/* =============================================================================
   Concessionárias e contratos — as regras que as três telas compartilham
   -----------------------------------------------------------------------------
   O formulário completo, a criação rápida do quadro e a tela de cadastro
   precisam concordar sobre duas coisas: quais contratos valem para uma
   concessionária, e o que acontece quando só existe um. Se cada tela decidir
   por si, uma vai preencher sozinha e a outra vai deixar vazio — no mesmo dia,
   na mesma obra.
   ============================================================================= */

/** Contratos de uma concessionária, vigentes primeiro, mais novo no topo. */
export function contratosDe(contratos, concessionariaId) {
  return (contratos || [])
    .filter((k) => k.concessionaria_id === concessionariaId)
    .sort((a, b) => (
      (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0)
      || String(b.inicio || '').localeCompare(String(a.inicio || ''))
      || String(a.numero).localeCompare(String(b.numero), 'pt-BR')
    ));
}

/** Só os que ainda valem — é a lista que a programação oferece. */
export function contratosVigentes(contratos, concessionariaId) {
  return contratosDe(contratos, concessionariaId).filter((k) => k.ativo);
}

/**
 * O contrato que a programação deve assumir sozinha.
 * Com um vigente só, ele entra sem perguntar — é o caso da maioria das
 * concessionárias, e um campo com uma opção só é um campo que não devia existir.
 * Com dois ou mais, devolve null: aí a escolha é de quem está montando a equipe,
 * e chutar seria pior do que perguntar.
 */
export function contratoAutomatico(contratos, concessionariaId) {
  const vig = contratosVigentes(contratos, concessionariaId);
  return vig.length === 1 ? vig[0].id : null;
}

export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd', ou '' se a data não existir no calendário. */
export function dataISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  if (!m) return '';
  const [, d, mes, a] = m;
  const dt = new Date(`${a}-${mes}-${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return '';
  if (dt.getDate() !== Number(d) || dt.getMonth() + 1 !== Number(mes)) return '';
  return `${a}-${mes}-${d}`;
}

/**
 * O que ainda está escrito à mão e não aponta para ninguém.
 * Agrupa por texto, ignorando caixa e espaço — é como o SQL da migração
 * agrupou, e as duas contas precisam bater.
 */
export function textosSoltos(programacoes) {
  const m = {};
  (programacoes || []).forEach((p) => {
    if (p.concessionaria_id) return;
    const txt = String(p.contratante || '').trim();
    if (!txt) return;
    const chave = txt.toUpperCase();
    (m[chave] ||= { texto: txt, chave, n: 0 }).n += 1;
  });
  return Object.values(m).sort((a, b) => b.n - a.n);
}
