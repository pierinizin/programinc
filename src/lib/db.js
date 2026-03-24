import { STORAGE_KEY } from './constants';
import { createId, today } from './helpers';

function buildSeed() {
  const colaboradores = [
    { id: createId(), nome: 'André Souza', funcao: 'Eletricista', telefone: '(11) 93210-9876', status: 'ativo' },
    { id: createId(), nome: 'Carlos Silva', funcao: 'Eletricista', telefone: '(11) 97654-3210', status: 'ativo' },
    { id: createId(), nome: 'Fernando Gomes', funcao: 'Ajudante', telefone: '(11) 90987-6543', status: 'ativo' },
    { id: createId(), nome: 'Lucas Ferreira', funcao: 'Motorista', telefone: '(11) 94321-0987', status: 'ativo' },
    { id: createId(), nome: 'Mário Santos', funcao: 'Encarregado', telefone: '(11) 99876-5432', status: 'ativo' },
    { id: createId(), nome: 'Roberto Lima', funcao: 'Encarregado', telefone: '(11) 98765-4321', status: 'ativo' },
  ];

  const veiculos = [
    { id: createId(), placa: 'ABC-1234', modelo: 'VW Delivery 11.180', ano: 2022, tipo: 'Caminhão', status: 'Disponível' },
    { id: createId(), placa: 'DEF-5678', modelo: 'Ford Cargo 816', ano: 2021, tipo: 'Caminhão', status: 'Disponível' },
    { id: createId(), placa: 'GHI-9012', modelo: 'Toyota Hilux', ano: 2023, tipo: 'Caminhonete', status: 'Disponível' },
  ];

  const findColaborador = (nome) => colaboradores.find((item) => item.nome === nome)?.id;
  const findVeiculo = (placa) => veiculos.find((item) => item.placa === placa)?.id;

  const programacoes = [
    {
      id: createId(),
      data: '2026-03-20',
      tipoEquipe: 'Pintura - Mecânica',
      cidade: 'ARAPONGAS',
      contratante: 'MOTIVA',
      tipoServico: 'Pintura - Mecânica',
      encarregadoId: findColaborador('Roberto Lima'),
      membroIds: [
        findColaborador('Roberto Lima'),
        findColaborador('André Souza'),
        findColaborador('Fernando Gomes'),
        findColaborador('Lucas Ferreira'),
      ],
      veiculoIds: [findVeiculo('DEF-5678')],
      statusExecucao: 'CONCLUÍDO',
      motivoNaoExecucao: '',
      observacoes: 'Trecho finalizado conforme programação.',
      horarioInicio: '07:30',
      horarioSaidaAlmoco: '11:30',
      horarioRetornoAlmoco: '13:00',
      horarioSaida: '17:48',
    },
    {
      id: createId(),
      data: '2026-03-20',
      tipoEquipe: 'Implantação de Tachas',
      cidade: 'CASCAVEL',
      contratante: 'MLC',
      tipoServico: 'Implantação de Tachas',
      encarregadoId: findColaborador('Mário Santos'),
      membroIds: [
        findColaborador('Mário Santos'),
        findColaborador('Fernando Gomes'),
        findColaborador('Lucas Ferreira'),
      ],
      veiculoIds: [findVeiculo('GHI-9012')],
      statusExecucao: 'EXECUTANDO',
      motivoNaoExecucao: '',
      observacoes: 'Equipe em campo.',
      horarioInicio: '07:30',
      horarioSaidaAlmoco: '11:30',
      horarioRetornoAlmoco: '13:00',
      horarioSaida: '17:48',
    },
  ];

  const faltas = [
    {
      id: createId(),
      colaboradorId: findColaborador('André Souza'),
      data: '2026-03-19',
      motivo: 'atestado_medico',
      observacao: 'Repouso de 1 dia.',
    },
  ];

  return { colaboradores, veiculos, programacoes, faltas };
}

export const seed = buildSeed();

export function normalizeDb(data) {
  const source = data || seed;
  return {
    colaboradores: Array.isArray(source.colaboradores) ? source.colaboradores : [],
    veiculos: Array.isArray(source.veiculos) ? source.veiculos : [],
    faltas: Array.isArray(source.faltas) ? source.faltas : [],
    programacoes: Array.isArray(source.programacoes)
      ? source.programacoes.map((item) => ({
          ...item,
          tipoEquipe: item.tipoEquipe || item.nomeEquipe || '',
          tipoServico: item.tipoServico || '',
          statusExecucao:
            item.statusExecucao === 'FAZENDO' ? 'EXECUTANDO' : item.statusExecucao || 'EXECUTANDO',
          motivoNaoExecucao: item.motivoNaoExecucao || '',
          observacoes: item.observacoes || '',
          horarioInicio: item.horarioInicio || '07:30',
          horarioSaidaAlmoco: item.horarioSaidaAlmoco || '11:30',
          horarioRetornoAlmoco: item.horarioRetornoAlmoco || '13:00',
          horarioSaida: item.horarioSaida || '17:48',
          membroIds: Array.isArray(item.membroIds) ? item.membroIds : [],
          veiculoIds: Array.isArray(item.veiculoIds) ? item.veiculoIds : [],
        }))
      : [],
  };
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeDb(raw ? JSON.parse(raw) : seed);
  } catch {
    return normalizeDb(seed);
  }
}

export function persistDb(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createEmptyProgramacao(date = today()) {
  return {
    id: '',
    data: date,
    tipoEquipe: '',
    cidade: '',
    contratante: '',
    tipoServico: '',
    encarregadoId: '',
    membroIds: [],
    veiculoIds: [],
    statusExecucao: 'EXECUTANDO',
    motivoNaoExecucao: '',
    observacoes: '',
    horarioInicio: '07:30',
    horarioSaidaAlmoco: '11:30',
    horarioRetornoAlmoco: '13:00',
    horarioSaida: '17:48',
  };
}

export function createEmptyColaborador() {
  return { id: '', nome: '', funcao: 'Ajudante', telefone: '', status: 'ativo' };
}

export function createEmptyVeiculo() {
  return {
    id: '',
    placa: '',
    modelo: '',
    ano: new Date().getFullYear(),
    tipo: 'Caminhão',
    status: 'Disponível',
  };
}

export function createEmptyFalta() {
  return { id: '', colaboradorId: '', data: today(), motivo: 'atestado_medico', observacao: '' };
}
