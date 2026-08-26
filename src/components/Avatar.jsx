import { useState } from 'react';

/* Cores de fallback. Todas claras o bastante para carregar texto quase preto
   por cima — o mesmo princípio da placa: preenchimento colorido, letra escura.
   A escolha é determinística pelo id, então a mesma pessoa tem sempre a mesma
   cor, o que já ajuda a reconhecer antes mesmo de ler o nome. */
const CORES = [
  '#FFC72C', '#FF9E4A', '#8FD3A8', '#9CC7F0',
  '#E8A0A3', '#C9B6E4', '#9FD8D3', '#F0C48A',
];

function corDe(chave) {
  const s = String(chave || '');
  let soma = 0;
  for (let i = 0; i < s.length; i += 1) soma = (soma + s.charCodeAt(i)) % 997;
  return CORES[soma % CORES.length];
}

export function iniciais(nome) {
  return String(nome || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

/**
 * Avatar com foto e queda para iniciais.
 *
 * Nunca renderiza um círculo vazio: sem foto, sem nome, ou com a URL assinada
 * expirada, sempre sobra alguma coisa legível no lugar.
 *
 * tamanho: 'small' (26px) | 'normal' (34px) | 'big' (52px)
 */
export function Avatar({ nome, url, tamanho = 'normal', titulo }) {
  const [falhou, setFalhou] = useState(false);
  const classe = `avatar${tamanho === 'small' ? ' small' : tamanho === 'big' ? ' big' : ''}`;
  const letras = iniciais(nome) || '?';
  const legenda = titulo || nome || '';

  if (url && !falhou) {
    return (
      <span className={classe} title={legenda}>
        <img src={url} alt={legenda} onError={() => setFalhou(true)} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={classe} title={legenda} style={{ background: corDe(nome) }}>
      {letras}
    </span>
  );
}
