import React from 'react';

export function NavButton({ active, children, onClick }) {
  return (
    <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      className="search-box"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function StatCard({ number, label, subtle = false, danger = false }) {
  return (
    <div className={`stat-card ${subtle ? 'subtle' : ''} ${danger ? 'danger' : ''}`}>
      <strong>{number}</strong>
      <span>{label}</span>
    </div>
  );
}

export function StatusBadge({ status }) {
  const cssClass = status === 'CONCLUÍDO' ? 'green' : status === 'EXECUTANDO' ? 'yellow' : 'red';
  return <span className={`status-badge ${cssClass}`}>{status}</span>;
}

export function FieldPair({ label, value }) {
  return (
    <div className="field-pair">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

export function Input({ label, value, onChange, type = 'text', full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = '',
  disabled = false,
  full = false,
}) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {placeholder !== '' && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({ label, value, onChange, full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      <textarea rows="4" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function MultiSelect({
  label,
  items,
  selectedIds,
  labelKey,
  subtitleKey,
  subtitleBuilder,
  onToggle,
  full = false,
}) {
  return (
    <div className={full ? 'full' : ''}>
      <span className="input-label">{label}</span>
      <div className="multi-box">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`multi-row ${selectedIds.includes(item.id) ? 'selected' : ''}`}
            onClick={() => onToggle(item.id)}
          >
            <div>
              <strong>{item[labelKey]}</strong>
              <small>{subtitleBuilder ? subtitleBuilder(item) : item[subtitleKey]}</small>
            </div>
            <span>{selectedIds.includes(item.id) ? '✓' : '+'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
