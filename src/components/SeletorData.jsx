import { useEffect, useMemo, useRef, useState } from 'react';

/* =============================================================================
   Seletor de data da Programação
   -----------------------------------------------------------------------------
   Três jeitos de chegar num dia, no mesmo lugar da faixa:
     • setas ‹ ›          — um dia por vez (como sempre foi)
     • clicar no nome do dia — abre o calendário do mês, com bolinha verde nos
                              dias que têm programação e amarela nos que estão
                              sem baixa; atalhos Ontem / Hoje / Amanhã embaixo
     • campo de data       — digita "15/09", "15/09/26", "150926" ou "15092026"
                              e Enter. Sem ano, usa o ano do dia que está aberto.
   ============================================================================= */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
const hojeIso = () => { const d = new Date(); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const somaDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n);
  return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const paraBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Entende o que foi digitado. Devolve 'aaaa-mm-dd' ou null se não for uma data real. */
export function lerDataDigitada(texto, anoPadrao) {
  const t = String(texto || '').trim();
  let d; let m; let a;
  const comBarra = t.match(/^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2}|\d{4}))?$/);
  const soNumeros = t.match(/^(\d{2})(\d{2})(\d{2}|\d{4})?$/);
  const g = comBarra || soNumeros;
  if (!g) return null;
  d = Number(g[1]); m = Number(g[2]); a = g[3] ? Number(g[3]) : anoPadrao;
  if (a < 100) a += 2000;
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return isoDe(a, m, d);
}

export function SeletorData({ data, onMudar, diasComProgramacao, diasSemBaixa }) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(data.slice(0, 7));            // mês mostrado no calendário
  const [texto, setTexto] = useState(paraBR(data));
  const [erro, setErro] = useState(false);
  const caixaRef = useRef(null);
  const hoje = hojeIso();

  // Trocou o dia por fora (setas, atalho, outra tela): o campo e o calendário acompanham.
  useEffect(() => { setTexto(paraBR(data)); setErro(false); setMes(data.slice(0, 7)); }, [data]);

  // Fecha clicando fora ou com Esc.
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const ir = (iso) => { onMudar(iso); setAberto(false); };

  const celulas = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    const primeiro = new Date(a, m - 1, 1).getDay();
    const nDias = new Date(a, m, 0).getDate();
    const out = [];
    for (let i = primeiro; i > 0; i -= 1) out.push({ iso: somaDias(isoDe(a, m, 1), -i), fora: true });
    for (let d = 1; d <= nDias; d += 1) out.push({ iso: isoDe(a, m, d), fora: false });
    while (out.length % 7) out.push({ iso: somaDias(out[out.length - 1].iso, 1), fora: true });
    return out;
  }, [mes]);

  const mudarMes = (n) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(a, m - 1 + n, 1);
    setMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  function aplicarTexto() {
    const iso = lerDataDigitada(texto, Number(data.slice(0, 4)));
    if (!iso) { setErro(true); return false; }
    setErro(false);
    if (iso !== data) onMudar(iso);
    else setTexto(paraBR(data));
    return true;
  }

  const rotulo = new Date(`${data}T12:00:00`);
  const diaSemana = rotulo.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataLonga = rotulo.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <span className="sd" ref={caixaRef}>
      <button className="icon-btn" aria-label="Dia anterior" onClick={() => onMudar(somaDias(data, -1))}>‹</button>

      <button
        type="button"
        className={`sd-data${aberto ? ' on' : ''}`}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Escolher o dia no calendário"
      >
        <b>{diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}<i aria-hidden="true">▾</i></b>
        <span>{dataLonga}</span>
      </button>

      <button className="icon-btn" aria-label="Próximo dia" onClick={() => onMudar(somaDias(data, 1))}>›</button>

      <label className={`sd-campo${erro ? ' erro' : ''}`} title="Digite a data e aperte Enter (ex.: 15/09)">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12M5 1.8v2.6M11 1.8v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          value={texto}
          inputMode="numeric"
          aria-label="Digitar a data"
          aria-invalid={erro}
          onChange={(e) => { setTexto(e.target.value); setErro(false); }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            // Data inválida: fica no campo, em vermelho, pra corrigir.
            if (e.key === 'Enter' && aplicarTexto()) e.currentTarget.blur();
            if (e.key === 'Escape') { setTexto(paraBR(data)); setErro(false); e.currentTarget.blur(); }
          }}
          onBlur={() => { if (!erro) setTexto(paraBR(data)); }}
        />
      </label>

      {aberto && (
        <div className="sd-pop" role="dialog" aria-label="Calendário">
          <div className="sd-pop-cab">
            <button className="icon-btn" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>‹</button>
            <b>{MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</b>
            <button className="icon-btn" aria-label="Próximo mês" onClick={() => mudarMes(1)}>›</button>
          </div>
          <div className="sd-grade">
            {SEMANA.map((s, i) => <span key={`h${i}`} className="sd-h">{s}</span>)}
            {celulas.map(({ iso, fora }) => {
              const cls = ['sd-d'];
              if (fora) cls.push('fora');
              if (iso === hoje) cls.push('hj');
              if (iso === data) cls.push('on');
              if (diasSemBaixa?.has(iso)) cls.push('pend');
              else if (diasComProgramacao?.has(iso)) cls.push('tem');
              return (
                <button type="button" key={iso} className={cls.join(' ')} onClick={() => ir(iso)}
                  title={diasSemBaixa?.has(iso) ? 'Tem equipe sem baixa' : diasComProgramacao?.has(iso) ? 'Tem programação' : undefined}>
                  {Number(iso.slice(8, 10))}
                </button>
              );
            })}
          </div>
          <div className="sd-leg">
            <span><i className="tem" />tem programação</span>
            <span><i className="pend" />sem baixa</span>
          </div>
          <div className="sd-pe">
            <button type="button" className={`chip-btn${data === somaDias(hoje, -1) ? ' ativo' : ''}`} onClick={() => ir(somaDias(hoje, -1))}>Ontem</button>
            <button type="button" className={`chip-btn${data === hoje ? ' ativo' : ''}`} onClick={() => ir(hoje)}>Hoje</button>
            <button type="button" className={`chip-btn${data === somaDias(hoje, 1) ? ' ativo' : ''}`} onClick={() => ir(somaDias(hoje, 1))}>Amanhã</button>
          </div>
        </div>
      )}
    </span>
  );
}
