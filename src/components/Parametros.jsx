import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmar, notificar } from '../lib/dialogos';
import {
  LISTAS, REGRAS, PADRAO_REGRAS, itensDe, regra, rotuloItem, slug, CORES_PARAMETRO, listaSetores,
} from '../lib/parametros';

/* =============================================================================
   Parâmetros — Sistema → Parâmetros (só admin)
   -----------------------------------------------------------------------------
   À esquerda, o que dá para mudar; à direita, a edição. Listas (setores,
   funções, motivos de ausência, tipos de serviço, situações do veículo…),
   o catálogo de documentos exigidos e as regras com número (horário padrão,
   máximo por equipe, dias do aviso de "falta dar baixa").

   Item em uso não se apaga — desativa (some das escolhas novas, quem já tem
   continua com ele). Renomear passa pelo banco (renomear_parametro), que muda
   junto em quem já usa. Setor e motivo de ausência têm código fixo: renomear é
   só trocar o nome que aparece. Tudo grava na hora e recarrega.
   ============================================================================= */

const SETOR_ROT = { trecho: 'Trecho', fora: 'Fora do trecho' };
/* Listas que só existem depois do 30-setores-motivos-documentos.sql. */
const DO_30 = ['setor', 'motivo_falta', 'situacao_veiculo'];
/* O que o RH edita (31-rh-acesso.sql): só a parte de pessoal. */
const DO_RH = ['documentos', 'tipo_licenca', 'motivo_falta'];

const CATEGORIAS = [['identificacao', 'Identificação'], ['contrato', 'Contrato'], ['ctps', 'CTPS'],
  ['saude', 'Saúde'], ['treinamento', 'Treinamentos'], ['outro', 'Outros']];
const ROT_CATEGORIA = Object.fromEntries(CATEGORIAS);
const APLICA = [['todos', 'Todo mundo do setor'], ['motorista', 'Só quem dirige'],
  ['encarregado', 'Só encarregado'], ['motorista_encarregado', 'Quem dirige ou é encarregado']];
const ROT_APLICA = Object.fromEntries(APLICA);
const COMPORTAMENTOS = [
  ['livre', 'Pode escalar', 'aparece normal na programação'],
  ['aviso', 'Pode escalar, com aviso', 'aparece com alerta, como Manutenção'],
  ['fora', 'Fora de uso', 'não aparece para escalar, como Inativo'],
];
const ROT_COMPORTAMENTO = Object.fromEntries(COMPORTAMENTOS.map(([v, r]) => [v, r]));
/* Tipos de documento que o app usa sozinho: atestado e licença geram falta. */
const DOC_SISTEMA = ['atestado', 'licenca'];
const NOTA_MOTIVO = {
  atestado_medico: 'Lançado pela janela de atestado (com o arquivo) — o app gera as ausências.',
  licenca: 'Lançado pela janela de licença (com o arquivo) — o app gera as ausências.',
  ferias: 'Gravado quando alguém de férias vai para Ausências no quadro.',
};

/** Quantos usam cada valor, por lista. */
function usos(db, documentos) {
  const conta = (lista, campo, padrao) => {
    const m = {};
    (lista || []).forEach((x) => { const v = x[campo] || padrao; if (v) m[v] = (m[v] || 0) + 1; });
    return m;
  };
  return {
    setor: conta(db.colaboradores, 'setor', 'trecho'),
    funcao: conta(db.colaboradores, 'funcao'),
    motivo_falta: conta(db.faltas, 'motivo'),
    tipo_servico: conta(db.programacoes, 'tipoEquipe'),
    motivo_nao_realizado: conta(db.programacoes, 'motivoNaoExecucao'),
    tipo_veiculo: conta(db.veiculos, 'tipo'),
    situacao_veiculo: conta(db.veiculos, 'status'),
    tipo_licenca: conta(documentos, 'subtipo'),
    documentos: conta(documentos, 'tipo_id'),
  };
}

/** Os setores que entregam este tipo. Sem a lista gravada (antes do 30),
    a regra antiga: vale_trecho para quem vai a campo, vale_fora_trecho para
    os outros. */
function setoresDoTipo(t, setores) {
  if (Array.isArray(t.setores)) return t.setores;
  return setores.filter((s) => (s.campo ? t.vale_trecho !== false : t.vale_fora_trecho === true)).map((s) => s.valor);
}

/** Código novo que não colide com nenhum da lista ('almoxarifado', 'almoxarifado_2'…). */
function codigoLivre(nome, usados) {
  const base = slug(nome) || 'item';
  let c = base; let k = 2;
  while (usados.includes(c)) { c = `${base}_${k}`; k += 1; }
  return c;
}

function erroOuNada(res, titulo) {
  if (res.error) {
    const semPermissao = /row-level security|42501|permission/i.test(`${res.error.code} ${res.error.message}`);
    notificar({
      titulo,
      mensagem: semPermissao
        ? 'O banco recusou por permissão. Se você é do RH, falta rodar o arquivo supabase/31-rh-acesso.sql no SQL Editor do Supabase.'
        : res.error.message || 'Não deu certo. Tente de novo.',
      variante: 'erro',
    });
    return true;
  }
  return false;
}

/* ------------------------------------------------------ ordem (arrastar) */
/* Leva o item da posição `de` para `para` e renumera a lista visível
   (10, 20, 30…), gravando só quem mudou — a ordem nunca empata. A nova ordem
   aparece na hora (prévia) e o banco confirma em seguida.
   Arrastar é com o ponteiro (mouse e toque — o arrastar nativo do navegador
   não funciona no celular). Enquanto arrasta, uma linha amarela mostra onde o
   item vai cair. Serve para parametros_itens e para tipos_documento. */
function useOrdem(tabela, com, aoTerminar) {
  const [previa, setPrevia] = useState(null);   // { g, ids }
  const [arrasto, setArrasto] = useState(null); // { g, de, alvo }
  const grupoRefs = useRef({});

  async function mover(g, lista, de, para) {
    if (de === para || !lista[de] || para < 0 || para >= lista.length) return;
    const nova = lista.slice();
    const [x] = nova.splice(de, 1);
    nova.splice(para, 0, x);
    setPrevia({ g, ids: nova.map((i) => i.id) });
    const base = Math.min(...lista.map((i) => i.ordem ?? 0));
    const mudar = nova.map((i, k) => ({ i, ordem: base + (k + 1) * 10 })).filter(({ i, ordem }) => i.ordem !== ordem);
    await com(async () => {
      const res = await Promise.all(mudar.map(({ i, ordem }) => supabase.from(tabela).update({ ordem }).eq('id', i.id)));
      if (!res.some((r) => erroOuNada(r, 'Ordem'))) await aoTerminar();
    });
    setPrevia(null);
  }

  function pegar(e, g, lista, de) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const linhasEl = [...(grupoRefs.current[g]?.querySelectorAll('.par-row') || [])];
    const meios = linhasEl.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    let alvo = de;
    setArrasto({ g, de, alvo });
    const andar = (ev) => {
      let p = meios.findIndex((m) => ev.clientY < m);
      if (p === -1) p = meios.length;
      if (p !== alvo) { alvo = p; setArrasto({ g, de, alvo: p }); }
    };
    const soltar = () => {
      window.removeEventListener('pointermove', andar);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('par-arrastando');
      setArrasto(null);
      // alvo = posição de inserção (0…n); tirando o item, quem estava depois sobe um.
      const para = alvo > de ? alvo - 1 : alvo;
      mover(g, lista, de, para);
    };
    document.body.classList.add('par-arrastando');
    window.addEventListener('pointermove', andar);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  const classeDe = (g, i, n) => {
    if (!arrasto || arrasto.g !== g) return '';
    let c = i === arrasto.de ? ' arrastado' : '';
    const vazio = arrasto.alvo === arrasto.de || arrasto.alvo === arrasto.de + 1;
    if (!vazio && arrasto.alvo === i) c += ' alvo-antes';
    if (!vazio && arrasto.alvo === n && i === n - 1) c += ' alvo-depois';
    return c;
  };
  /* Põe a lista (ou o grupo) em ordem alfabética de uma vez, com a mesma
     renumeração do arrastar. Pergunta antes: a ordem feita à mão se perde. */
  async function ordenarAZ(g, lista, nomeDe, titulo) {
    if (lista.length < 2) return;
    const nova = lista.slice().sort((a, b) => String(nomeDe(a)).localeCompare(String(nomeDe(b)), 'pt-BR', { sensitivity: 'base' }));
    if (nova.every((x, k) => x.id === lista[k].id)) {
      notificar({ mensagem: 'Já está em ordem alfabética.', variante: 'sucesso' });
      return;
    }
    if (!(await confirmar({
      titulo: `Colocar ${titulo} em ordem alfabética?`,
      mensagem: 'A ordem que você arrumou à mão nesta lista é trocada pela de A a Z. Depois dá para arrastar de novo.',
      textoConfirmar: 'Ordenar A→Z',
    }))) return;
    setPrevia({ g, ids: nova.map((i) => i.id) });
    const base = Math.min(...lista.map((i) => i.ordem ?? 0));
    const mudar = nova.map((i, k) => ({ i, ordem: base + (k + 1) * 10 })).filter(({ i, ordem }) => i.ordem !== ordem);
    await com(async () => {
      const res = await Promise.all(mudar.map(({ i, ordem }) => supabase.from(tabela).update({ ordem }).eq('id', i.id)));
      if (!res.some((r) => erroOuNada(r, 'Ordem'))) await aoTerminar();
    });
    setPrevia(null);
  }
  const ordenada = (g, base) => (previa?.g === g
    ? previa.ids.map((id) => base.find((x) => x.id === id)).filter(Boolean)
    : base);
  const props = (g, lista, i) => ({
    primeiro: i === 0,
    ultimo: i === lista.length - 1,
    onSubir: () => mover(g, lista, i, i - 1),
    onDescer: () => mover(g, lista, i, i + 1),
    onPegar: (e) => pegar(e, g, lista, i),
    classeArrasto: classeDe(g, i, lista.length),
  });
  return { grupoRefs, ordenada, props, ordenarAZ };
}

/* ------------------------------------------------------ pedaços da linha */
function Alca({ bloqueado, primeiro, ultimo, onSubir, onDescer, onPegar }) {
  return (
    <span className="par-ordem">
      {/* Arrastar pela alça (mouse ou dedo). As setas continuam para o
          ajuste fino e para quem usa o teclado. */}
      <span className={`par-alca${bloqueado ? ' off' : ''}`} onPointerDown={bloqueado ? undefined : onPegar}
        title="Arraste para mudar a ordem" aria-hidden="true">⋮⋮</span>
      <span className="par-setas">
        <button type="button" disabled={primeiro || bloqueado} onClick={onSubir} aria-label="Subir">▲</button>
        <button type="button" disabled={ultimo || bloqueado} onClick={onDescer} aria-label="Descer">▼</button>
      </span>
    </span>
  );
}

function Cores({ valor, onMudar }) {
  return (
    <div className="par-cores" role="radiogroup" aria-label="Cor">
      {CORES_PARAMETRO.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={valor === c} aria-label={c}
          className={valor === c ? 'on' : ''} style={{ background: c }} onClick={() => onMudar(c)} />
      ))}
    </div>
  );
}

/** Chips liga/desliga (setores de um documento, documentos de um setor). */
function Chips({ itens, marcados, onAlternar, vazio }) {
  if (!itens.length) return <p className="par-nota">{vazio}</p>;
  return (
    <div className="par-chips">
      {itens.map((x) => {
        const on = marcados.includes(x.valor);
        return (
          <button key={x.valor} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => onAlternar(x.valor)}>
            {x.cor && <i style={{ background: x.cor }} />}{on ? '✓ ' : ''}{x.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ uma linha */
function Linha({ item, def, n, ordem, onSalvar, onApagar, onAtivo, bloqueado, tiposDoc = [], setores = [] }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(null);
  const d = item.dados || {};
  const sistema = Boolean(d.sistema);
  const codigo = Boolean(def.codigo);
  const nome = codigo ? rotuloItem(item) : item.valor;
  // Documentos que este setor entrega (só na lista de setores).
  const docsDoSetor = def.chave === 'setor'
    ? tiposDoc.filter((t) => setoresDoTipo(t, setores).includes(item.valor)).map((t) => t.id)
    : [];
  const abrir = () => {
    setF({ valor: item.valor, rotulo: nome, dados: { ...d }, docs: docsDoSetor });
    setEditando(true);
  };
  const nomeNovo = f ? f.rotulo.trim() : '';
  const mudou = f && (nomeNovo !== nome
    || JSON.stringify(f.dados) !== JSON.stringify(d)
    || JSON.stringify([...f.docs].sort()) !== JSON.stringify([...docsDoSetor].sort()));
  const fecharOuAbrir = editando ? () => setEditando(false) : abrir;
  const muda = (patch) => setF((x) => ({ ...x, dados: { ...x.dados, ...patch } }));

  return (
    <div className={`par-row${item.ativo === false ? ' off' : ''}${editando ? ' ed' : ''}${ordem.classeArrasto}`}>
      <Alca bloqueado={bloqueado} {...ordem} />
      <button type="button" className="par-nome" onClick={fecharOuAbrir} disabled={bloqueado}>
        <b>{def.comCor && <i className="par-ponto" style={{ background: d.cor || '#8A8F98' }} />}{nome}</b>
        {item.ativo === false && <small>desativado · some das escolhas novas, quem já tem continua</small>}
      </button>
      <span className="par-flags">
        {def.comSetor && <span className="par-tag">{SETOR_ROT[d.setor || 'trecho']}</span>}
        {def.comMarcas && d.lidera && <span className="par-flag lid">pode ser encarregado</span>}
        {def.comMarcas && d.dirige && <span className="par-flag dir">dirige</span>}
        {def.chave === 'setor' && (d.campo
          ? <span className="par-flag lid">entra na programação</span>
          : <span className="par-tag">só administrativo</span>)}
        {def.chave === 'setor' && <span className="par-tag">{docsDoSetor.length} doc.</span>}
        {def.chave === 'motivo_falta' && d.conta === false && <span className="par-tag">fora do absenteísmo</span>}
        {def.chave === 'situacao_veiculo' && (
          <span className={`par-tag comp-${d.comportamento || 'livre'}`}>{ROT_COMPORTAMENTO[d.comportamento || 'livre']}</span>)}
        {sistema && <span className="par-tag sis" title="O app usa este item sozinho">do sistema</span>}
      </span>
      <span className="par-n" title="Quantos usam hoje">{n || 0}</span>
      <button type="button" className="par-editar" onClick={fecharOuAbrir} disabled={bloqueado}>
        {editando ? 'Fechar' : 'Editar'}
      </button>

      {editando && f && (
        <div className="par-edit">
          <label className={`par-f${def.comCor ? '' : ' par-full'}`}><span>Nome</span>
            <input autoFocus value={f.rotulo} maxLength={80}
              onChange={(e) => {
                const v = def.maiusculo ? e.target.value.toUpperCase() : e.target.value;
                setF((x) => ({ ...x, rotulo: v }));
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditando(false); }} />
          </label>
          {def.comCor && (
            <div className="par-f"><span>Cor</span><Cores valor={f.dados.cor} onMudar={(cor) => muda({ cor })} /></div>
          )}
          {!codigo && nomeNovo !== item.valor && n > 0 && (
            <p className="par-aviso par-full">Muda também em {n} {def.chave === 'funcao' ? (n === 1 ? 'pessoa' : 'pessoas') : (n === 1 ? 'registro' : 'registros')} que já usa{n === 1 ? '' : 'm'} “{item.valor}”.</p>
          )}
          {def.comSetor && (
            <label className="par-f"><span>Setor</span>
              <select value={f.dados.setor || 'trecho'} onChange={(e) => muda({ setor: e.target.value })}>
                <option value="trecho">Trecho (vai a campo)</option>
                <option value="fora">Fora do trecho</option>
              </select>
            </label>
          )}
          {def.comMarcas && (
            <div className="par-marcas">
              <label className="par-ck">
                <input type="checkbox" checked={Boolean(f.dados.lidera)} onChange={(e) => muda({ lidera: e.target.checked })} />
                <span>Pode ser encarregado<small>entra na lista de encarregados ao montar a equipe; a pasta cobra os documentos de encarregado</small></span>
              </label>
              <label className="par-ck">
                <input type="checkbox" checked={Boolean(f.dados.dirige)} onChange={(e) => muda({ dirige: e.target.checked })} />
                <span>Dirige veículo da empresa<small>a pasta passa a cobrar os documentos de motorista (CNH, Direção defensiva…)</small></span>
              </label>
            </div>
          )}

          {def.chave === 'setor' && (
            <>
              <div className="par-caixa par-full">
                <label className="par-ck">
                  <input type="checkbox" checked={Boolean(f.dados.campo)} disabled={sistema}
                    onChange={(e) => muda({ campo: e.target.checked })} />
                  <span><b>Entra na programação</b>
                    <small>{sistema
                      ? 'O Trecho sempre entra: é o setor que o app usa como padrão.'
                      : 'Aparece no quadro do dia, nas equipes, integrações e relatórios de campo — como o Trecho. Desligado: só cadastro, documentos, ausências e férias (como Escritório e Oficina). O RH só cadastra quem é de setor desligado.'}</small>
                  </span>
                </label>
              </div>
              <div className="par-caixa par-full">
                <b className="par-caixa-t">Documentos que este setor precisa entregar</b>
                <Chips
                  itens={tiposDoc.map((t) => ({ valor: t.id, rotulo: t.nome }))}
                  marcados={f.docs}
                  onAlternar={(id) => setF((x) => ({ ...x, docs: x.docs.includes(id) ? x.docs.filter((y) => y !== id) : [...x.docs, id] }))}
                  vazio="Nenhum documento cadastrado. Cadastre em Documentos exigidos."
                />
                {f.dados.campo && <p className="par-nota">Nos setores de campo, documento marcado “só quem dirige” ou “só encarregado” continua valendo só para essas funções.</p>}
              </div>
            </>
          )}

          {def.chave === 'motivo_falta' && (
            <div className="par-caixa par-full">
              <label className="par-ck">
                <input type="checkbox" checked={f.dados.conta !== false} onChange={(e) => muda({ conta: e.target.checked })} />
                <span><b>Conta no absenteísmo</b>
                  <small>Desligado (como Férias e Folga): é combinado com antecedência, não entra na taxa de faltas dos relatórios.</small></span>
              </label>
              {NOTA_MOTIVO[item.valor] && <p className="par-nota">{NOTA_MOTIVO[item.valor]}</p>}
            </div>
          )}

          {def.chave === 'situacao_veiculo' && (
            <div className="par-caixa par-full">
              <b className="par-caixa-t">Na programação</b>
              <div className="par-radios">
                {COMPORTAMENTOS.map(([v, r, t]) => (
                  <label key={v} className={`par-ck${sistema ? ' off' : ''}`}>
                    <input type="radio" name={`comp-${item.id}`} checked={(f.dados.comportamento || 'livre') === v}
                      disabled={sistema} onChange={() => muda({ comportamento: v })} />
                    <span>{r}<small>{t}</small></span>
                  </label>
                ))}
              </div>
              {sistema && <p className="par-nota">O app usa esta situação sozinho (inativar, reativar, em uso): o nome muda, o comportamento não.</p>}
            </div>
          )}

          <div className="par-acoes par-full">
            {sistema
              ? <span className="par-nota">Do sistema: não dá para apagar nem desativar.</span>
              : n === 0
                ? <button type="button" className="ghost-btn par-perigo" onClick={onApagar}>Apagar</button>
                : <button type="button" className="ghost-btn" onClick={() => onAtivo(item.ativo === false)}>{item.ativo === false ? 'Reativar' : 'Desativar'}</button>}
            <span className="par-espaco" />
            <button type="button" className="ghost-btn" onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" className="primary-btn" disabled={!mudou || !nomeNovo}
              onClick={async () => { if (await onSalvar(f, docsDoSetor)) setEditando(false); }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ uma lista */
function EditorLista({ def, linhas, contagem, bloqueado, onRecarregar, onDadosMudaram, tiposDoc, setores, onTiposMudaram }) {
  const [novo, setNovo] = useState('');
  const [setorNovo, setSetorNovo] = useState('trecho');
  const [ocupado, setOcupado] = useState(false);
  const itens = linhas.filter((x) => x.lista === def.chave)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.valor.localeCompare(b.valor, 'pt-BR'));
  // Sem o banco pronto, mostra o padrão (só leitura).
  const mostrar = bloqueado ? itensDe(def.chave, { inativos: true }).map((x, i) => ({ ...x, id: `p${i}` })) : itens;
  const grupos = def.comSetor
    ? [['trecho', mostrar.filter((x) => (x.dados?.setor || 'trecho') === 'trecho')], ['fora', mostrar.filter((x) => x.dados?.setor === 'fora')]]
    : [[null, mostrar]];

  async function com(fn) {
    setOcupado(true);
    try { return await fn(); } finally { setOcupado(false); }
  }
  const ordem = useOrdem('parametros_itens', com, onRecarregar);

  /* Liga/desliga o setor nos documentos (tipos_documento.setores). */
  async function gravarDocsDoSetor(codigo, ligar, desligar) {
    const mudar = tiposDoc.filter((t) => ligar.includes(t.id) || desligar.includes(t.id)).map((t) => {
      const atual = setoresDoTipo(t, setores);
      const setoresNovos = ligar.includes(t.id) ? [...new Set([...atual, codigo])] : atual.filter((x) => x !== codigo);
      return supabase.from('tipos_documento').update({ setores: setoresNovos }).eq('id', t.id);
    });
    if (!mudar.length) return true;
    const res = await Promise.all(mudar);
    if (res.some((r) => erroOuNada(r, 'Documentos do setor'))) return false;
    onTiposMudaram();
    return true;
  }

  async function adicionar() {
    const nome = (def.maiusculo ? novo.toUpperCase() : novo).trim();
    if (!nome) return;
    if (itens.some((x) => rotuloItem(x).toLowerCase() === nome.toLowerCase() || x.valor.toLowerCase() === nome.toLowerCase())) {
      notificar({ mensagem: `“${nome}” já está na lista.`, variante: 'atencao' });
      return;
    }
    await com(async () => {
      const ordemNova = Math.max(0, ...itens.map((x) => x.ordem || 0)) + 10;
      const usadas = itens.map((x) => x.dados?.cor);
      const cor = CORES_PARAMETRO.find((c) => !usadas.includes(c)) || CORES_PARAMETRO[0];
      let valor = nome;
      let dados = {};
      if (def.comSetor) dados = { setor: setorNovo };
      if (def.codigo) valor = codigoLivre(nome, itens.map((x) => x.valor));
      if (def.chave === 'setor') dados = { rotulo: nome, cor, campo: false };
      if (def.chave === 'motivo_falta') dados = { rotulo: nome, cor, conta: true };
      if (def.chave === 'situacao_veiculo') dados = { comportamento: 'livre' };
      const res = await supabase.from('parametros_itens').insert([{ lista: def.chave, valor, ordem: ordemNova, dados }]);
      if (erroOuNada(res, 'Adicionar')) return;
      // Setor novo já nasce cobrando o que se cobra de quem é de fora do
      // trecho (RG, contrato, ASO…). Dá para ajustar em Editar.
      if (def.chave === 'setor') {
        await gravarDocsDoSetor(valor, tiposDoc.filter((t) => t.vale_fora_trecho === true).map((t) => t.id), []);
      }
      setNovo('');
      await onRecarregar();
    });
  }
  async function salvar(item, f, docsAntes) {
    return com(async () => {
      const nome = f.rotulo.trim();
      const dados = def.codigo ? { ...f.dados, rotulo: nome } : f.dados;
      if (!def.codigo && nome !== item.valor) {
        const r = await supabase.rpc('renomear_parametro', { p_id: item.id, p_novo: nome });
        if (erroOuNada(r, 'Renomear')) return false;
      }
      if (JSON.stringify(dados) !== JSON.stringify(item.dados || {})) {
        const r = await supabase.from('parametros_itens').update({ dados, updated_at: new Date().toISOString() }).eq('id', item.id);
        if (erroOuNada(r, 'Salvar')) return false;
      }
      if (def.chave === 'setor') {
        const ligar = f.docs.filter((id) => !docsAntes.includes(id));
        const desligar = docsAntes.filter((id) => !f.docs.includes(id));
        if (!(await gravarDocsDoSetor(item.valor, ligar, desligar))) return false;
      }
      await onRecarregar();
      // Renomear muda registros; marcação de função muda o que a pasta cobra;
      // setor muda quem vai a campo e o que a pasta cobra.
      if ((!def.codigo && nome !== item.valor) || def.chave === 'funcao' || def.chave === 'setor') onDadosMudaram();
      return true;
    });
  }
  async function apagar(item) {
    if (!(await confirmar({ titulo: `Apagar “${rotuloItem(item)}”?`, textoConfirmar: 'Apagar' }))) return;
    await com(async () => {
      if (def.chave === 'setor') await gravarDocsDoSetor(item.valor, [], tiposDoc.map((t) => t.id));
      const r = await supabase.from('parametros_itens').delete().eq('id', item.id);
      if (!erroOuNada(r, 'Apagar')) await onRecarregar();
    });
  }
  async function ativo(item, valor) {
    await com(async () => {
      const r = await supabase.from('parametros_itens').update({ ativo: valor }).eq('id', item.id);
      if (!erroOuNada(r, 'Salvar')) await onRecarregar();
    });
  }

  const colMarcas = { funcao: 'Marcações', setor: 'Comportamento', motivo_falta: 'Marcações', situacao_veiculo: 'Na programação' }[def.chave] || '';
  const colUso = def.chave === 'setor' ? 'Pessoas' : 'Em uso';
  const artigo = ['função', 'situação'].some((p) => def.singular.startsWith(p)) ? 'a' : 'o';
  const exemplo = { setor: ' (ex.: Almoxarifado, Manutenção, Usina)', motivo_falta: ' (ex.: Consulta de filho, Banco de horas)', situacao_veiculo: ' (ex.: Oficina externa, Reserva)' }[def.chave] || '';

  return (
    <div className="par-ed">
      <div className="par-cab"><h3>{def.titulo}</h3><p>{def.texto}</p></div>
      {!bloqueado && (
        <div className="par-add">
          <input value={novo} placeholder={`Nov${artigo} ${def.singular}…${exemplo}`} maxLength={80}
            onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
          {def.comSetor && (
            <select value={setorNovo} onChange={(e) => setSetorNovo(e.target.value)}>
              <option value="trecho">Trecho (vai a campo)</option>
              <option value="fora">Fora do trecho</option>
            </select>
          )}
          <button type="button" className="primary-btn" onClick={adicionar} disabled={ocupado || !novo.trim()}>Adicionar</button>
        </div>
      )}
      {grupos.map(([g0, listaBase]) => {
        const g = g0 || 'todos';
        const lista = ordem.ordenada(g, listaBase);
        return (
          <div key={g} ref={(el) => { ordem.grupoRefs.current[g] = el; }}>
            {g0 && <div className="par-grupo">{g0 === 'trecho' ? 'Trecho (vai a campo)' : 'Fora do trecho — escritório, oficina e os outros'}</div>}
            <div className="par-th"><span /><span>Nome</span><span>{colMarcas}</span><span className="dir">{colUso}</span>
              <span className="dir">{!bloqueado && lista.length > 1 && (
                <button type="button" className="par-az" disabled={ocupado} title="Colocar em ordem alfabética"
                  onClick={() => ordem.ordenarAZ(g, lista, rotuloItem,
                    g0 ? `as funções do ${g0 === 'trecho' ? 'Trecho' : 'fora do trecho'}` : `“${def.titulo}”`)}>A→Z</button>
              )}</span>
            </div>
            {!lista.length && <div className="par-vazio">Nada aqui ainda.</div>}
            {lista.map((item, i) => (
              <Linha
                key={item.id}
                item={item}
                def={def}
                n={contagem[item.valor] || 0}
                ordem={ordem.props(g, lista, i)}
                bloqueado={bloqueado || ocupado}
                onSalvar={(f, docsAntes) => salvar(item, f, docsAntes)}
                onApagar={() => apagar(item)}
                onAtivo={(v) => ativo(item, v)}
                tiposDoc={tiposDoc}
                setores={setores}
              />
            ))}
          </div>
        );
      })}
      <div className="par-rod">Arraste pela alça ⋮⋮ para mudar a ordem em que aparece nos menus, ou use A→Z para pôr em ordem alfabética. Item em uso não se apaga: desativa.</div>
    </div>
  );
}

/* ------------------------------------------------- documentos exigidos */
function LinhaDoc({ t, n, setores, ordem, bloqueado, onSalvar, onApagar, onAtivo }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(null);
  const doTipo = setoresDoTipo(t, setores);
  const campos = (x) => ({
    nome: x.nome || '', categoria: x.categoria || 'outro', obrigatorio: x.obrigatorio !== false,
    vence: Boolean(x.vence), meses_validade: x.meses_validade ?? '', alerta_dias: x.alerta_dias ?? 30,
    aplica_a: x.aplica_a || 'todos',
  });
  const abrir = () => { setF({ ...campos(t), setores: doTipo }); setEditando(true); };
  const mudou = f && (JSON.stringify(campos(f)) !== JSON.stringify(campos(t))
    || JSON.stringify([...f.setores].sort()) !== JSON.stringify([...doTipo].sort()));
  const invalido = f && (!f.nome.trim() || (f.vence && !(Number(f.meses_validade) >= 1)));
  const fecharOuAbrir = editando ? () => setEditando(false) : abrir;
  const nomeSetores = setores.filter((s) => doTipo.includes(s.valor));
  const algumCampo = f && setores.some((s) => s.campo && f.setores.includes(s.valor));

  return (
    <div className={`par-row${t.ativo === false ? ' off' : ''}${editando ? ' ed' : ''}${ordem.classeArrasto}`}>
      <Alca bloqueado={bloqueado} {...ordem} />
      <button type="button" className="par-nome" onClick={fecharOuAbrir} disabled={bloqueado}>
        <b>{t.nome}</b>
        <small>{t.ativo === false
          ? 'desativado · não é cobrado de ninguém, o que já foi entregue continua'
          : `${ROT_CATEGORIA[t.categoria] || 'Outros'} · ${t.vence ? `vence em ${t.meses_validade} ${t.meses_validade === 1 ? 'mês' : 'meses'}` : 'não vence'}`}</small>
      </button>
      <span className="par-flags">
        {nomeSetores.length === setores.length
          ? <span className="par-tag">todos os setores</span>
          : nomeSetores.length
            ? nomeSetores.map((s) => <span key={s.valor} className="par-tag"><i className="par-ponto" style={{ background: s.cor }} />{s.rotulo}</span>)
            : <span className="par-tag sis">nenhum setor</span>}
        {t.aplica_a && t.aplica_a !== 'todos' && setores.some((s) => s.campo && doTipo.includes(s.valor)) && (
          <span className="par-flag dir" title="Nos setores que entram na programação">campo: {ROT_APLICA[t.aplica_a].toLowerCase()}</span>)}
      </span>
      <span className="par-n" title="Pessoas que já entregaram">{n || 0}</span>
      <button type="button" className="par-editar" onClick={fecharOuAbrir} disabled={bloqueado}>{editando ? 'Fechar' : 'Editar'}</button>

      {editando && f && (
        <div className="par-edit">
          <label className="par-f"><span>Nome</span>
            <input autoFocus value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditando(false); }} />
          </label>
          <label className="par-f"><span>Categoria</span>
            <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {CATEGORIAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <div className="par-caixa par-full par-validade">
            <label className="par-ck">
              <input type="checkbox" checked={f.vence} onChange={(e) => setF({ ...f, vence: e.target.checked, meses_validade: e.target.checked ? (f.meses_validade || 12) : '' })} />
              <span><b>Tem validade</b><small>a pasta avisa antes de vencer e marca vencido depois</small></span>
            </label>
            {f.vence && (
              <span className="par-numeros">
                <label>Vale por <input type="number" min={1} max={240} value={f.meses_validade} onChange={(e) => setF({ ...f, meses_validade: e.target.value })} /> meses</label>
                <label>avisar <input type="number" min={1} max={365} value={f.alerta_dias} onChange={(e) => setF({ ...f, alerta_dias: e.target.value })} /> dias antes</label>
              </span>
            )}
          </div>
          <div className="par-caixa par-full">
            <b className="par-caixa-t">Quais setores precisam entregar</b>
            <Chips
              itens={setores}
              marcados={f.setores}
              onAlternar={(v) => setF((x) => ({ ...x, setores: x.setores.includes(v) ? x.setores.filter((y) => y !== v) : [...x.setores, v] }))}
              vazio="Nenhum setor cadastrado."
            />
            {algumCampo && (
              <label className="par-f par-aplica"><span>Nos setores de campo, de quem</span>
                <select value={f.aplica_a} onChange={(e) => setF({ ...f, aplica_a: e.target.value })}>
                  {APLICA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="par-acoes par-full">
            {n === 0
              ? <button type="button" className="ghost-btn par-perigo" onClick={onApagar}>Apagar</button>
              : <button type="button" className="ghost-btn" onClick={() => onAtivo(t.ativo === false)}>{t.ativo === false ? 'Reativar' : 'Desativar'}</button>}
            <span className="par-espaco" />
            <button type="button" className="ghost-btn" onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" className="primary-btn" disabled={!mudou || invalido}
              onClick={async () => { if (await onSalvar(f)) setEditando(false); }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditorDocumentos({ tipos, setores, contagem, bloqueado, onTiposMudaram }) {
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function com(fn) {
    setOcupado(true);
    try { return await fn(); } finally { setOcupado(false); }
  }
  const ordem = useOrdem('tipos_documento', com, async () => onTiposMudaram());
  const lista = tipos.filter((t) => !DOC_SISTEMA.includes(t.codigo))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  async function adicionar() {
    const nome = novo.trim();
    if (!nome) return;
    if (tipos.some((t) => String(t.nome).toLowerCase() === nome.toLowerCase())) {
      notificar({ mensagem: `“${nome}” já está na lista.`, variante: 'atencao' });
      return;
    }
    await com(async () => {
      const r = await supabase.from('tipos_documento').insert([{
        codigo: codigoLivre(nome, tipos.map((t) => t.codigo)), nome, categoria: 'outro', obrigatorio: true,
        aplica_a: 'todos', vence: false, alerta_dias: 30,
        ordem: Math.max(0, ...tipos.map((t) => t.ordem || 0)) + 10,
        // Nasce cobrado de todo mundo; tira os setores em Editar.
        setores: setores.map((s) => s.valor), vale_trecho: true, vale_fora_trecho: true,
      }]);
      if (erroOuNada(r, 'Adicionar')) return;
      setNovo('');
      onTiposMudaram();
    });
  }
  async function salvar(t, f) {
    return com(async () => {
      const r = await supabase.from('tipos_documento').update({
        nome: f.nome.trim(), categoria: f.categoria, obrigatorio: f.obrigatorio, vence: f.vence,
        meses_validade: f.vence ? Number(f.meses_validade) : null,
        alerta_dias: Number(f.alerta_dias) || 30,
        aplica_a: f.aplica_a, setores: f.setores,
      }).eq('id', t.id);
      if (erroOuNada(r, 'Salvar')) return false;
      onTiposMudaram();
      return true;
    });
  }
  async function apagar(t) {
    if (!(await confirmar({ titulo: `Apagar “${t.nome}”?`, mensagem: 'Ninguém entregou este documento ainda.', textoConfirmar: 'Apagar' }))) return;
    await com(async () => {
      const r = await supabase.from('tipos_documento').delete().eq('id', t.id);
      if (!erroOuNada(r, 'Apagar')) onTiposMudaram();
    });
  }
  async function ativo(t, valor) {
    await com(async () => {
      const r = await supabase.from('tipos_documento').update({ ativo: valor }).eq('id', t.id);
      if (!erroOuNada(r, 'Salvar')) onTiposMudaram();
    });
  }

  const vis = ordem.ordenada('docs', lista);
  return (
    <div className="par-ed">
      <div className="par-cab">
        <h3>Documentos exigidos</h3>
        <p>O que a pasta de cada pessoa cobra. Atestado e licença não estão aqui: são lançados pela ausência.</p>
      </div>
      {!bloqueado && (
        <div className="par-add">
          <input value={novo} placeholder="Novo documento… (ex.: NR-11 empilhadeira, Exame toxicológico)" maxLength={80}
            onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
          <button type="button" className="primary-btn" onClick={adicionar} disabled={ocupado || !novo.trim()}>Adicionar</button>
        </div>
      )}
      <div ref={(el) => { ordem.grupoRefs.current.docs = el; }}>
        <div className="par-th"><span /><span>Documento</span><span>Quem entrega</span><span className="dir">Entregues</span>
          <span className="dir">{!bloqueado && vis.length > 1 && (
            <button type="button" className="par-az" disabled={ocupado} title="Colocar em ordem alfabética"
              onClick={() => ordem.ordenarAZ('docs', vis, (t) => t.nome, 'os documentos')}>A→Z</button>
          )}</span>
        </div>
        {!vis.length && <div className="par-vazio">Nenhum documento cadastrado.</div>}
        {vis.map((t, i) => (
          <LinhaDoc
            key={t.id}
            t={t}
            n={contagem[t.id] || 0}
            setores={setores}
            ordem={ordem.props('docs', vis, i)}
            bloqueado={bloqueado || ocupado}
            onSalvar={(f) => salvar(t, f)}
            onApagar={() => apagar(t)}
            onAtivo={(v) => ativo(t, v)}
          />
        ))}
      </div>
      <div className="par-rod">A ordem é a da pasta. Documento que alguém já entregou não se apaga: desativa — sai da cobrança e o arquivo continua na pasta.</div>
    </div>
  );
}

/* ------------------------------------------------------------ regras */
function EditorRegras({ bloqueado, onRecarregar }) {
  const [vals, setVals] = useState(() => Object.fromEntries(REGRAS.map((r) => [r.chave, regra(r.chave)])));
  const [salvando, setSalvando] = useState(null);
  async function salvar(chave) {
    let valor = vals[chave];
    const def = REGRAS.find((r) => r.chave === chave);
    if (chave !== 'horario_padrao') {
      valor = Number(valor);
      if (!Number.isInteger(valor) || valor < def.min || valor > def.max) {
        notificar({ mensagem: `Use um número de ${def.min} a ${def.max}.`, variante: 'atencao' });
        return;
      }
    }
    setSalvando(chave);
    const r = await supabase.from('parametros_regras').upsert({ chave, valor, updated_at: new Date().toISOString() });
    setSalvando(null);
    if (!erroOuNada(r, 'Salvar')) {
      await onRecarregar();
      notificar({ mensagem: 'Salvo.', variante: 'sucesso' });
    }
  }
  const HORAS = [['horarioInicio', 'Saída'], ['horarioInicioObra', 'Obra'], ['horarioSaidaAlmoco', 'Almoço'], ['horarioRetornoAlmoco', 'Volta'], ['horarioFimObra', 'Fim obra'], ['horarioSaida', 'Retorno']];
  const igual = (chave) => JSON.stringify(vals[chave]) === JSON.stringify(regra(chave));
  return (
    <div className="par-ed">
      <div className="par-cab"><h3>Horários e regras da equipe</h3><p>Valores que a programação usa ao criar e conferir uma equipe.</p></div>
      {REGRAS.map((r) => (
        <div key={r.chave} className="par-regra">
          <div className="tx"><b>{r.titulo}</b><small>{r.texto}</small></div>
          <div className="vl">
            {r.chave === 'horario_padrao' ? (
              <span className="par-horas">
                {HORAS.map(([k, rot]) => (
                  <label key={k}><span>{rot}</span>
                    <input type="time" disabled={bloqueado} value={vals.horario_padrao?.[k] || ''}
                      onChange={(e) => setVals((v) => ({ ...v, horario_padrao: { ...v.horario_padrao, [k]: e.target.value } }))} />
                  </label>
                ))}
              </span>
            ) : (
              <>
                <input type="number" disabled={bloqueado} min={r.min} max={r.max} value={vals[r.chave]}
                  onChange={(e) => setVals((v) => ({ ...v, [r.chave]: e.target.value }))} />
                <em>{r.unidade}</em>
              </>
            )}
            {!bloqueado && (
              <button type="button" className="primary-btn" disabled={igual(r.chave) || salvando === r.chave} onClick={() => salvar(r.chave)}>
                {salvando === r.chave ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </div>
          {r.chave !== 'horario_padrao' && String(vals[r.chave]) !== String(PADRAO_REGRAS[r.chave]) && (
            <small className="par-padrao">padrão: {PADRAO_REGRAS[r.chave]} {r.unidade}</small>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ a tela */
export function Parametros({ status, linhas, db, documentos = [], tipos = [], soPessoal = false, onRecarregar, onDadosMudaram, onDocsMudaram }) {
  const [aba, setAba] = useState(soPessoal ? 'documentos' : 'setor');
  const pode = (chave) => !soPessoal || DO_RH.includes(chave);
  const contagem = useMemo(() => usos(db, documentos), [db, documentos]);
  const bloqueado = status !== 'ok';
  // Setores, motivos, situações e documentos por setor precisam do 30.
  const tem30 = !bloqueado && (linhas.itens || []).some((x) => x.lista === 'setor');
  const bloqueadoAqui = bloqueado || ((DO_30.includes(aba) || aba === 'documentos') && !tem30);
  const grupos = [...new Set(LISTAS.filter((l) => pode(l.chave)).map((l) => l.grupo))];
  const nDe = (chave) => (bloqueado || (DO_30.includes(chave) && !tem30)
    ? itensDe(chave)
    : (linhas.itens || []).filter((x) => x.lista === chave && x.ativo !== false)).length;

  /* Os tipos de documento chegam pela carga dos documentos, que demora um
     pouco a recarregar. Para a tela responder na hora, depois de gravar
     busca só a tabela e usa esta cópia até a carga nova chegar. */
  const [tiposAqui, setTiposAqui] = useState(null);
  useEffect(() => { setTiposAqui(null); }, [tipos]);
  const tiposVale = tiposAqui || tipos;
  async function tiposMudaram() {
    const r = await supabase.from('tipos_documento').select('*');
    if (!r.error && r.data) setTiposAqui(r.data);
    onDocsMudaram?.();
  }
  const setores = listaSetores();
  const tiposAtivos = tiposVale.filter((t) => t.ativo !== false && !DOC_SISTEMA.includes(t.codigo))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const nDocs = tiposAtivos.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Parâmetros</h2>
          <p>{soPessoal
            ? 'A parte de pessoal: documentos que a pasta cobra, tipos de licença e motivos de ausência'
            : 'As listas e regras que o app usa — antes fixas no código, agora você muda aqui'}</p>
        </div>
      </div>

      {status === 'sem-tabela' && !soPessoal && (
        <div className="aviso-faixa">
          Falta um passo no banco: rode o arquivo <b>supabase/28-parametros.sql</b> no SQL Editor do Supabase.
          Até lá o app usa os valores de sempre e esta tela fica só para ver.
        </div>
      )}
      {status === 'ok' && !tem30 && (
        <div className="aviso-faixa">
          Setores, motivos de ausência, situações do veículo e documentos exigidos ficam só para ver até você rodar
          o arquivo <b>supabase/30-setores-motivos-documentos.sql</b> no SQL Editor do Supabase.
        </div>
      )}
      {status === 'erro' && (
        <div className="aviso-faixa">Não consegui ler os parâmetros agora. O app segue com os valores de sempre.
          {' '}<button type="button" className="link-btn" onClick={onRecarregar}>Tentar de novo</button></div>
      )}

      <div className="par">
        <nav className="par-lista">
          {grupos.map((g) => (
            <div key={g}>
              <h5>{g}</h5>
              {LISTAS.filter((l) => l.grupo === g && pode(l.chave)).map((l) => (
                <button key={l.chave} type="button" className={`par-it${aba === l.chave ? ' on' : ''}`} onClick={() => setAba(l.chave)}>
                  <b>{l.titulo}</b><i>{nDe(l.chave)}</i>
                </button>
              ))}
              {g === 'Pessoas' && pode('documentos') && (
                <button type="button" className={`par-it${aba === 'documentos' ? ' on' : ''}`} onClick={() => setAba('documentos')}>
                  <b>Documentos exigidos</b><i>{nDocs}</i>
                </button>
              )}
              {g === 'Programação' && !soPessoal && (
                <button type="button" className={`par-it${aba === 'regras' ? ' on' : ''}`} onClick={() => setAba('regras')}>
                  <b>Horários e regras da equipe</b><i />
                </button>
              )}
            </div>
          ))}
        </nav>

        {aba === 'regras' && <EditorRegras key={`r-${status}`} bloqueado={bloqueado} onRecarregar={onRecarregar} />}
        {aba === 'documentos' && (
          <EditorDocumentos
            tipos={tiposVale}
            setores={listaSetores({ inativos: true }).filter((s) => s.ativo)}
            contagem={contagem.documentos}
            bloqueado={bloqueadoAqui}
            onTiposMudaram={tiposMudaram}
          />
        )}
        {aba !== 'regras' && aba !== 'documentos' && (
          <EditorLista
            key={aba}
            def={LISTAS.find((l) => l.chave === aba)}
            linhas={linhas.itens || []}
            contagem={contagem[aba] || {}}
            bloqueado={bloqueadoAqui}
            onRecarregar={onRecarregar}
            onDadosMudaram={onDadosMudaram}
            tiposDoc={tiposAtivos}
            setores={setores}
            onTiposMudaram={tiposMudaram}
          />
        )}
      </div>
    </>
  );
}
