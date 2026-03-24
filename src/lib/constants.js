export const STORAGE_KEY = 'incovia-v3';

export const PAGE_OPTIONS = [
  { id: 'programacao', label: 'Programação' },
  { id: 'colaboradores', label: 'Colaboradores' },
  { id: 'veiculos', label: 'Veículos' },
  { id: 'historico', label: 'Histórico' },
];

export const TEAM_TYPE_OPTIONS = [
  'Pintura - Mecânica',
  'Pintura - Manual',
  'Pintura - Mecânica e Manual',
  'Implantação de Tachas',
  'Implantação de Defensa',
];

export const SERVICE_TYPE_OPTIONS = [...TEAM_TYPE_OPTIONS];
export const STATUS_OPTIONS = ['EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR'];
export const REASON_OPTIONS = ['CHUVA', 'MANUTENÇÃO', 'OUTROS'];
export const ROLE_OPTIONS = ['Encarregado', 'Motorista', 'Eletricista', 'Ajudante', 'Técnico'];
export const VEHICLE_TYPES = ['Caminhão', 'Caminhonete', 'Cesto', 'Munck'];
export const VEHICLE_STATUS = ['Disponível', 'Em uso', 'Manutenção', 'Inativo'];
export const MAX_TEAM_MEMBERS = 7;

export const FALTA_OPTIONS = [
  { value: 'atestado_medico', label: 'atestado_medico' },
  { value: 'falta_justificada', label: 'falta_justificada' },
  { value: 'falta_injustificada', label: 'falta_injustificada' },
  { value: 'licenca', label: 'licenca' },
  { value: 'acidente_trabalho', label: 'acidente_trabalho' },
  { value: 'outro', label: 'outro' },
];
