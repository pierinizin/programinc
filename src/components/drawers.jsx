import React from 'react';
import { initials } from '../lib/helpers';
import { StatCard, StatusBadge } from './common';

export function ColaboradorDrawer({ item, db, openEdit, openFalta, deleteFalta }) {
  const escalas = db.programacoes
    .filter((programacao) => programacao.membroIds.includes(item.id))
    .sort((a, b) => b.data.localeCompare(a.data));

  const faltas = db.faltas
    .filter((falta) => falta.colaboradorId === item.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="drawer-body">
      <div className="hero-block">
        <div className="avatar big">{initials(item.nome).slice(0, 1)}</div>
        <div>
          <h3>{item.nome}</h3>
          <div className="chips-row tight">
            <span className="tag">{item.funcao}</span>
            <span className="tag success">{item.status}</span>
          </div>
          <div className="meta-row">☎ {item.telefone || '-'}</div>
        </div>
      </div>

      <div className="stats-grid three compact">
        <StatCard number={escalas.length} label="Escalas" />
        <StatCard number={faltas.length} label="Faltas" danger />
        <StatCard number={new Set(escalas.map((escala) => escala.cidade)).size} label="Cidades" subtle />
      </div>

      <div className="card-actions">
        <button className="ghost-btn" onClick={openEdit}>Editar</button>
        <button className="ghost-btn" onClick={openFalta}>Nova falta</button>
      </div>

      <div className="drawer-section">
        <strong>Histórico de Escalas</strong>
        {escalas.length === 0 ? (
          <p className="small-muted">Nenhuma escala registrada.</p>
        ) : (
          escalas.map((escala) => (
            <div key={escala.id} className="mini-card">
              <strong>{escala.tipoEquipe}</strong>
              <div className="meta-row">
                {new Date(`${escala.data}T12:00:00`).toLocaleDateString('pt-BR')} · {escala.cidade} · {escala.contratante}
              </div>
              <StatusBadge status={escala.statusExecucao} />
            </div>
          ))
        )}
      </div>

      <div className="drawer-section">
        <strong>Registro de Faltas</strong>
        {faltas.length === 0 ? (
          <p className="small-muted">Nenhuma falta registrada.</p>
        ) : (
          faltas.map((falta) => (
            <div key={falta.id} className="mini-card">
              <div className="between">
                <strong>{falta.motivo}</strong>
                <button className="mini-danger" onClick={() => deleteFalta(falta.id)}>Excluir</button>
              </div>
              <div className="meta-row">{new Date(`${falta.data}T12:00:00`).toLocaleDateString('pt-BR')}</div>
              <p>{falta.observacao || 'Sem observação'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function VeiculoDrawer({ item, db, openEdit }) {
  const historico = db.programacoes
    .filter((programacao) => programacao.veiculoIds.includes(item.id))
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="drawer-body">
      <div className="hero-block">
        <div className="avatar big">🚚</div>
        <div>
          <h3>{item.placa}</h3>
          <div className="meta-row">{item.modelo} · {item.ano}</div>
          <div className="chips-row tight">
            <span className="tag success">{item.status}</span>
            <span className="tag">{item.tipo}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid two compact">
        <StatCard number={historico.length} label="Utilizações" />
        <StatCard number={new Set(historico.map((registro) => registro.cidade)).size} label="Cidades" subtle />
      </div>

      <div className="card-actions">
        <button className="ghost-btn" onClick={openEdit}>Editar</button>
      </div>

      <div className="drawer-section">
        <strong>Histórico de Uso</strong>
        {historico.length === 0 ? (
          <p className="small-muted">Nenhum uso registrado.</p>
        ) : (
          historico.map((registro) => (
            <div key={registro.id} className="mini-card">
              <strong>{registro.tipoEquipe}</strong>
              <div className="meta-row">
                {new Date(`${registro.data}T12:00:00`).toLocaleDateString('pt-BR')} · {registro.cidade}
              </div>
              <div className="meta-row">
                Horários: {registro.horarioInicio} / {registro.horarioSaidaAlmoco} / {registro.horarioRetornoAlmoco} / {registro.horarioSaida}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
