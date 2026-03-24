import React from 'react';
import {
  FALTA_OPTIONS,
  MAX_TEAM_MEMBERS,
  REASON_OPTIONS,
  ROLE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  TEAM_TYPE_OPTIONS,
  VEHICLE_STATUS,
  VEHICLE_TYPES,
} from '../lib/constants';
import { Input, MultiSelect, Select, TextArea } from './common';

export function AppModal({
  modal,
  closeModal,
  db,
  programacaoForm,
  setProgramacaoForm,
  colaboradorForm,
  setColaboradorForm,
  veiculoForm,
  setVeiculoForm,
  faltaForm,
  setFaltaForm,
  saveProgramacao,
  saveColaborador,
  saveVeiculo,
  saveFalta,
  onToggleMember,
  onToggleVehicle,
}) {
  if (!modal) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head between">
          <strong>
            {modal === 'programacao' && (programacaoForm.id ? 'Editar Programação' : 'Nova Programação')}
            {modal === 'colaborador' && (colaboradorForm.id ? 'Editar Colaborador' : 'Novo Colaborador')}
            {modal === 'veiculo' && (veiculoForm.id ? 'Editar Veículo' : 'Novo Veículo')}
            {modal === 'falta' && (faltaForm.id ? 'Editar Falta' : 'Registrar Falta')}
          </strong>
          <button className="icon-btn" onClick={closeModal}>×</button>
        </div>

        {modal === 'programacao' && (
          <div className="form-grid two">
            <Select
              label="Tipo de equipe"
              value={programacaoForm.tipoEquipe}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, tipoEquipe: value })}
              options={TEAM_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))}
              placeholder="Selecione"
            />
            <Input
              label="Data"
              type="date"
              value={programacaoForm.data}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, data: value })}
            />
            <Input
              label="Cidade"
              value={programacaoForm.cidade}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, cidade: value })}
            />
            <Input
              label="Contratante"
              value={programacaoForm.contratante}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, contratante: value })}
            />
            <Select
              label="Tipo de serviço"
              value={programacaoForm.tipoServico}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, tipoServico: value })}
              options={SERVICE_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))}
              placeholder="Selecione"
              full
            />
            <Select
              label="Encarregado"
              value={programacaoForm.encarregadoId}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, encarregadoId: value })}
              options={db.colaboradores
                .filter((item) => item.funcao === 'Encarregado')
                .map((item) => ({ value: item.id, label: item.nome }))}
              placeholder="Selecione"
            />
            <Select
              label="Status"
              value={programacaoForm.statusExecucao}
              onChange={(value) =>
                setProgramacaoForm({
                  ...programacaoForm,
                  statusExecucao: value,
                  motivoNaoExecucao:
                    value === 'NÃO FOI POSSÍVEL REALIZAR' ? programacaoForm.motivoNaoExecucao : '',
                })
              }
              options={STATUS_OPTIONS.map((item) => ({ value: item, label: item }))}
            />

            <div className="full modal-time-grid">
              <Input
                label="Início"
                type="time"
                value={programacaoForm.horarioInicio}
                onChange={(value) => setProgramacaoForm({ ...programacaoForm, horarioInicio: value })}
              />
              <Input
                label="Saída almoço"
                type="time"
                value={programacaoForm.horarioSaidaAlmoco}
                onChange={(value) => setProgramacaoForm({ ...programacaoForm, horarioSaidaAlmoco: value })}
              />
              <Input
                label="Retorno almoço"
                type="time"
                value={programacaoForm.horarioRetornoAlmoco}
                onChange={(value) => setProgramacaoForm({ ...programacaoForm, horarioRetornoAlmoco: value })}
              />
              <Input
                label="Saída"
                type="time"
                value={programacaoForm.horarioSaida}
                onChange={(value) => setProgramacaoForm({ ...programacaoForm, horarioSaida: value })}
              />
            </div>

            <Select
              label="Motivo"
              value={programacaoForm.motivoNaoExecucao}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, motivoNaoExecucao: value })}
              options={REASON_OPTIONS.map((item) => ({ value: item, label: item }))}
              placeholder="Selecione"
              disabled={programacaoForm.statusExecucao !== 'NÃO FOI POSSÍVEL REALIZAR'}
              full
            />

            <MultiSelect
              label={`Membros da equipe (máx. ${MAX_TEAM_MEMBERS})`}
              items={db.colaboradores}
              selectedIds={programacaoForm.membroIds}
              labelKey="nome"
              subtitleKey="funcao"
              onToggle={onToggleMember}
              full
            />

            <MultiSelect
              label="Veículos"
              items={db.veiculos}
              selectedIds={programacaoForm.veiculoIds}
              labelKey="placa"
              subtitleBuilder={(item) => `${item.modelo} · ${item.ano}`}
              onToggle={onToggleVehicle}
              full
            />

            <TextArea
              label="Observações"
              value={programacaoForm.observacoes}
              onChange={(value) => setProgramacaoForm({ ...programacaoForm, observacoes: value })}
              full
            />

            <div className="modal-actions full">
              <button className="ghost-btn" onClick={closeModal}>Cancelar</button>
              <button className="primary-btn" onClick={saveProgramacao}>Salvar</button>
            </div>
          </div>
        )}

        {modal === 'colaborador' && (
          <div className="form-grid two">
            <Input label="Nome" value={colaboradorForm.nome} onChange={(value) => setColaboradorForm({ ...colaboradorForm, nome: value })} />
            <Select
              label="Função"
              value={colaboradorForm.funcao}
              onChange={(value) => setColaboradorForm({ ...colaboradorForm, funcao: value })}
              options={ROLE_OPTIONS.map((item) => ({ value: item, label: item }))}
            />
            <Input label="Telefone" value={colaboradorForm.telefone} onChange={(value) => setColaboradorForm({ ...colaboradorForm, telefone: value })} />
            <Select
              label="Status"
              value={colaboradorForm.status}
              onChange={(value) => setColaboradorForm({ ...colaboradorForm, status: value })}
              options={[
                { value: 'ativo', label: 'ativo' },
                { value: 'inativo', label: 'inativo' },
              ]}
            />
            <div className="modal-actions full">
              <button className="ghost-btn" onClick={closeModal}>Cancelar</button>
              <button className="primary-btn" onClick={saveColaborador}>Salvar</button>
            </div>
          </div>
        )}

        {modal === 'veiculo' && (
          <div className="form-grid two">
            <Input
              label="Placa"
              value={veiculoForm.placa}
              onChange={(value) => setVeiculoForm({ ...veiculoForm, placa: value.toUpperCase() })}
            />
            <Input label="Modelo" value={veiculoForm.modelo} onChange={(value) => setVeiculoForm({ ...veiculoForm, modelo: value })} />
            <Input
              label="Ano"
              type="number"
              value={veiculoForm.ano}
              onChange={(value) => setVeiculoForm({ ...veiculoForm, ano: Number(value) })}
            />
            <Select
              label="Tipo"
              value={veiculoForm.tipo}
              onChange={(value) => setVeiculoForm({ ...veiculoForm, tipo: value })}
              options={VEHICLE_TYPES.map((item) => ({ value: item, label: item }))}
            />
            <Select
              label="Status"
              value={veiculoForm.status}
              onChange={(value) => setVeiculoForm({ ...veiculoForm, status: value })}
              options={VEHICLE_STATUS.map((item) => ({ value: item, label: item }))}
            />
            <div className="modal-actions full">
              <button className="ghost-btn" onClick={closeModal}>Cancelar</button>
              <button className="primary-btn" onClick={saveVeiculo}>Salvar</button>
            </div>
          </div>
        )}

        {modal === 'falta' && (
          <div className="form-grid two">
            <Select
              label="Colaborador"
              value={faltaForm.colaboradorId}
              onChange={(value) => setFaltaForm({ ...faltaForm, colaboradorId: value })}
              options={db.colaboradores.map((item) => ({ value: item.id, label: item.nome }))}
              placeholder="Selecione"
            />
            <Input
              label="Data"
              type="date"
              value={faltaForm.data}
              onChange={(value) => setFaltaForm({ ...faltaForm, data: value })}
            />
            <Select
              label="Motivo"
              value={faltaForm.motivo}
              onChange={(value) => setFaltaForm({ ...faltaForm, motivo: value })}
              options={FALTA_OPTIONS}
            />
            <TextArea
              label="Observação"
              value={faltaForm.observacao}
              onChange={(value) => setFaltaForm({ ...faltaForm, observacao: value })}
              full
            />
            <div className="modal-actions full">
              <button className="ghost-btn" onClick={closeModal}>Cancelar</button>
              <button className="primary-btn" onClick={saveFalta}>Salvar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
