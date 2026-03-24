import React from 'react';
import { MAX_TEAM_MEMBERS, REASON_OPTIONS, STATUS_OPTIONS } from '../lib/constants';
import { formatDateLabel, getTeamLabel, initials, shiftDate } from '../lib/helpers';
import { FieldPair, SearchBox, StatCard, StatusBadge } from './common';

export function ProgramacaoPage({
  db,
  maps,
  selectedDate,
  setSelectedDate,
  expandedProgramacaoId,
  setExpandedProgramacaoId,
  activeDrawer,
  setActiveDrawer,
  openProgramacaoModal,
  updateProgramacaoField,
  deleteProgramacao,
}) {
  const programacoesDoDia = db.programacoes
    .filter((item) => item.data === selectedDate)
    .sort((a, b) => getTeamLabel(a).localeCompare(getTeamLabel(b), 'pt-BR'));

  const totalPessoasDia = programacoesDoDia.reduce((acc, item) => acc + item.membroIds.length, 0);
  const dateLabel = formatDateLabel(selectedDate);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Programação Diária</h2>
          <p>Monte e gerencie as equipes de campo</p>
        </div>
      </div>

      <div className="date-card">
        <button className="icon-btn" onClick={() => { setSelectedDate(shiftDate(selectedDate, -1)); setExpandedProgramacaoId(null); }}>‹</button>
        <div>
          <h3 className="capitalize">{dateLabel.weekday}</h3>
          <span>{dateLabel.full}</span>
        </div>
        <button className="icon-btn" onClick={() => { setSelectedDate(shiftDate(selectedDate, 1)); setExpandedProgramacaoId(null); }}>›</button>
      </div>

      <div className="stats-grid">
        <StatCard number={programacoesDoDia.length} label="Equipes" />
        <StatCard number={totalPessoasDia} label="Pessoas" subtle />
      </div>

      {programacoesDoDia.length === 0 ? (
        <div className="empty-card">
          <p>Nenhuma equipe programada para este dia.</p>
          <button className="ghost-btn" onClick={() => openProgramacaoModal()}>Criar Programação</button>
        </div>
      ) : (
        <div className="cards-grid programacao-cards-grid">
          {programacoesDoDia.map((item) => {
            const isExpanded = expandedProgramacaoId === item.id;
            const members = item.membroIds.map((id) => maps.colaboradores[id]).filter(Boolean);
            const vehicles = item.veiculoIds.map((id) => maps.veiculos[id]).filter(Boolean);

            return (
              <ProgramacaoCard
                key={item.id}
                item={item}
                isExpanded={isExpanded}
                members={members}
                vehicles={vehicles}
                maps={maps}
                onToggle={() => setExpandedProgramacaoId(isExpanded ? null : item.id)}
                setActiveDrawer={setActiveDrawer}
                updateProgramacaoField={updateProgramacaoField}
                openProgramacaoModal={openProgramacaoModal}
                deleteProgramacao={deleteProgramacao}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

function ProgramacaoCard({
  item,
  isExpanded,
  members,
  vehicles,
  maps,
  onToggle,
  setActiveDrawer,
  updateProgramacaoField,
  openProgramacaoModal,
  deleteProgramacao,
}) {
  return (
    <div className={`card team-card compact-program-card ${isExpanded ? 'expanded' : 'collapsed'}`} onClick={onToggle}>
      <div className="card-header between start compact-program-head">
        <div>
          <h3>{item.tipoEquipe}</h3>
          <div className="meta-row">📍 {item.cidade.toLowerCase()} · 🏢 {item.contratante}</div>
        </div>
        <StatusBadge status={item.statusExecucao} />
      </div>

      <div className="compact-summary-grid">
        <div className="compact-summary-block">
          <span className="section-label">Membros</span>
          <div className="compact-summary-text">
            {members.length ? members.map((person) => person.nome.split(' ')[0]).join(' · ') : 'Sem equipe'}
          </div>
        </div>

        <div className="compact-summary-block">
          <span className="section-label">Veículos</span>
          <div className="chips-row compact-chips-row">
            {vehicles.length ? (
              vehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  className="chip-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveDrawer({ type: 'veiculo', item: vehicle });
                  }}
                >
                  {vehicle.placa}
                </button>
              ))
            ) : (
              <span className="small-muted">Sem veículo</span>
            )}
          </div>
        </div>

        <div className="compact-summary-block full-row">
          <span className="section-label">Tipo de serviço</span>
          <div className="service-line compact-service-line">Tipo de serviço: {item.tipoServico}</div>
        </div>
      </div>

      <div className="compact-expand-hint">{isExpanded ? 'Clique para recolher' : 'Clique para ver detalhes'}</div>

      {isExpanded && (
        <>
          <div className="section-line" />
          <div className="section-label">Equipe ({item.membroIds.length}/{MAX_TEAM_MEMBERS})</div>
          <div className="person-list fixed-seven">
            {Array.from({ length: MAX_TEAM_MEMBERS }).map((_, idx) => {
              const memberId = item.membroIds[idx];
              const person = memberId ? maps.colaboradores[memberId] : null;

              if (!person) {
                return (
                  <div key={`slot-${item.id}-${idx}`} className="list-row empty-slot" aria-hidden="true">
                    <div className="list-row-main">
                      <span className="avatar small placeholder-avatar">•</span>
                      <span className="placeholder-text">Vaga disponível</span>
                    </div>
                    <span className="tag placeholder-tag">—</span>
                  </div>
                );
              }

              return (
                <button
                  key={memberId}
                  className={`list-row ${memberId === item.encarregadoId ? 'highlight' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveDrawer({ type: 'colaborador', item: maps.colaboradores[memberId] });
                  }}
                >
                  <div className="list-row-main">
                    <span className="avatar small">{initials(person.nome).slice(0, 1)}</span>
                    <span>{person.nome}</span>
                  </div>
                  <span className="tag">{memberId === item.encarregadoId ? 'Encarregado' : person.funcao}</span>
                </button>
              );
            })}
          </div>

          <div className="section-line" />
          <div className="time-grid">
            <FieldPair label="Início" value={item.horarioInicio} />
            <FieldPair label="Saída almoço" value={item.horarioSaidaAlmoco} />
            <FieldPair label="Retorno almoço" value={item.horarioRetornoAlmoco} />
            <FieldPair label="Saída" value={item.horarioSaida} />
          </div>

          <div className="section-line" />
          <div className="programacao-edit-grid">
            <label>
              <span>Status</span>
              <select
                value={item.statusExecucao}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateProgramacaoField(item.id, 'statusExecucao', event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="full-row">
              <span>Motivo</span>
              <select
                disabled={item.statusExecucao !== 'NÃO FOI POSSÍVEL REALIZAR'}
                value={item.motivoNaoExecucao}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateProgramacaoField(item.id, 'motivoNaoExecucao', event.target.value)}
              >
                <option value="">Selecione</option>
                {REASON_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="full-row">
              <span>Observações</span>
              <textarea
                rows="3"
                value={item.observacoes}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateProgramacaoField(item.id, 'observacoes', event.target.value)}
              />
            </label>
          </div>

          <div className="card-actions right">
            <button className="ghost-btn" onClick={(event) => { event.stopPropagation(); openProgramacaoModal(item); }}>Editar</button>
            <button className="danger-btn" onClick={(event) => { event.stopPropagation(); deleteProgramacao(item.id); }}>Excluir</button>
          </div>
        </>
      )}
    </div>
  );
}

export function ColaboradoresPage({ db, items, search, setSearch, setActiveDrawer, openColaboradorModal, deleteColaborador }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Colaboradores</h2>
          <p>{db.colaboradores.length} cadastrados</p>
        </div>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nome ou função..." />
      <div className="cards-grid three">
        {items.map((item) => (
          <div key={item.id} className="card">
            <div className="card-header">
              <div className="title-row">
                <span className="avatar">{initials(item.nome).slice(0, 1)}</span>
                <div>
                  <h3>{item.nome}</h3>
                  <div className="chips-row tight">
                    <span className="tag">{item.funcao}</span>
                    <span className="tag success">{item.status}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="section-line" />
            <div className="meta-row">{item.escalas} escalas · {item.faltas} faltas · ☎ {item.telefone || '-'}</div>
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'colaborador', item })}>Ver</button>
              <button className="ghost-btn" onClick={() => openColaboradorModal(item)}>Editar</button>
              <button className="danger-btn" onClick={() => deleteColaborador(item.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function VeiculosPage({ db, items, search, setSearch, setActiveDrawer, openVeiculoModal, deleteVeiculo }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Veículos</h2>
          <p>{db.veiculos.length} cadastrados</p>
        </div>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Buscar por placa ou modelo..." />
      <div className="cards-grid three">
        {items.map((item) => (
          <div key={item.id} className="card">
            <div className="card-header">
              <div className="title-row">
                <span className="avatar">🚚</span>
                <div>
                  <h3>{item.placa}</h3>
                  <div className="meta-row">{item.modelo} · {item.ano}</div>
                </div>
              </div>
            </div>
            <div className="section-line" />
            <div className="between">
              <div className="chips-row tight">
                <span className="tag success">{item.status}</span>
                <span className="tag">{item.tipo}</span>
              </div>
              <span className="small-muted">{item.usos} usos</span>
            </div>
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'veiculo', item })}>Ver</button>
              <button className="ghost-btn" onClick={() => openVeiculoModal(item)}>Editar</button>
              <button className="danger-btn" onClick={() => deleteVeiculo(item.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function HistoricoPage({ db, items, search, setSearch, setActiveDrawer }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Histórico</h2>
          <p>Acompanhe escalas e faltas</p>
        </div>
      </div>
      <div className="stats-grid three">
        <StatCard number={db.colaboradores.length} label="Colaboradores" />
        <StatCard number={db.programacoes.length} label="Total Escalas" subtle />
        <StatCard number={db.faltas.length} label="Total Faltas" danger />
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Buscar colaborador..." />
      <div className="history-list">
        {items.map((item) => (
          <div key={item.id} className="history-row">
            <div className="title-row">
              <span className="avatar">{initials(item.nome).slice(0, 1)}</span>
              <div>
                <strong>{item.nome}</strong>
                <div className="meta-row">
                  {item.escalas} escalas · {item.faltas} faltas · {item.ultimaEscala?.cidade || 'sem cidade'}
                </div>
              </div>
            </div>
            <div className="history-actions">
              <span className="small-muted">
                Última escala {item.ultimaEscala?.data ? new Date(`${item.ultimaEscala.data}T12:00:00`).toLocaleDateString('pt-BR') : '-'}
              </span>
              <button className="ghost-btn" onClick={() => setActiveDrawer({ type: 'colaborador', item })}>Abrir</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
