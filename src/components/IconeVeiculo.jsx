/* Ícone por tipo de veículo — traço fino, mesma família dos demais ícones.
   Emoji 🚚 renderiza diferente em cada sistema e destoava do resto.
   Compartilhado entre a ficha de veículos e a lista de arrasto da
   Programação — um veículo tem que parecer o mesmo veículo nas duas telas. */
export function iconeVeiculo(tipo) {
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
