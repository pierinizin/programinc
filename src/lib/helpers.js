export function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateLabel(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: date.toLocaleDateString('pt-BR', { weekday: 'long' }),
    full: date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
  };
}

export function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function toggleSelection(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function toggleLimitedSelection(list, value, fixedId, limit) {
  if (list.includes(value)) return list.filter((item) => item !== value);
  const uniqueIds = Array.from(new Set([fixedId, ...list, value].filter(Boolean)));
  return uniqueIds.length > limit ? list : [...list, value];
}

export function getTeamLabel(item) {
  return item.tipoEquipe || item.nomeEquipe || '';
}
