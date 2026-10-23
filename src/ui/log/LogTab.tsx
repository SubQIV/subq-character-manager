import { useState } from 'react';
import { RETENTION, sortedEntries, undoneIds, type Entry } from '../../model/changes';
import { store } from '../../store/characters';
import { timeLabel, type TabProps } from '../common';

const FILTERS: { id: string; label: string; match: (entry: Entry) => boolean }[] = [
  { id: 'all', label: 'Everything', match: () => true },
  { id: 'hp', label: 'Hit points', match: (e) => e.scope.includes('hp') },
  { id: 'resources', label: 'Resources', match: (e) => e.scope.some((s) => s.startsWith('tracker:')) && !e.scope.includes('rest') },
  { id: 'conditions', label: 'Conditions', match: (e) => e.scope.includes('conditions') || e.scope.includes('exhaustion') || e.scope.includes('inspiration') },
  { id: 'slots', label: 'Spell slots', match: (e) => e.scope.includes('slots') },
  { id: 'rest', label: 'Rests', match: (e) => e.scope.includes('rest') },
  { id: 'stats', label: 'Stats and details', match: (e) => e.scope.some((s) => ['stats', 'identity', 'classes', 'modifiers', 'ac'].includes(s)) },
];

export function LogTab({ id, view }: TabProps) {
  const [filter, setFilter] = useState('all');
  const { doc } = view;
  const undone = undoneIds(doc.entries);
  const match = FILTERS.find((f) => f.id === filter)!.match;
  const entries = sortedEntries(doc.entries).reverse().filter(match);

  return (
    <div className="stack">
      {doc.milestones.length > 0 && (
        <section className="section" aria-labelledby="milestones-heading">
          <div className="section-head">
            <h2 id="milestones-heading" className="section-title">
              Milestones
            </h2>
            <span className="small muted">Kept forever</span>
          </div>
          <ul className="list">
            {[...doc.milestones].reverse().map((milestone) => (
              <li key={`${milestone.ts}-${milestone.label}`} className="line">
                <span className="line-main">{milestone.label}</span>
                <span className="small muted">{timeLabel(milestone.ts)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="history-heading">
        <div className="section-head">
          <h2 id="history-heading" className="section-title">
            History
          </h2>
          <span className="small muted">{doc.entries.length} changes</span>
        </div>
        <div className="row" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip ${filter === f.id ? 'is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {entries.length === 0 ? (
          <p className="empty">{doc.entries.length === 0 ? 'Nothing has changed yet. Every change you make shows up here, and any of them can be undone.' : 'No changes of this kind yet.'}</p>
        ) : (
          <ul className="list">
            {entries.map((entry) => {
              const isUndone = undone.has(entry.id);
              const isUndo = Boolean(entry.undo);
              return (
                <li key={entry.id} className={`history-entry ${isUndone ? 'is-undone' : ''} ${isUndo ? 'is-undo' : ''}`}>
                  <span className="history-label">{entry.label}</span>
                  <span className="history-meta">
                    {timeLabel(entry.ts)}, {entry.device}
                    {isUndone ? ', undone' : ''}
                  </span>
                  {!isUndone && !isUndo && (
                    <button type="button" className="btn btn-small" onClick={() => store.undo(id, entry.id)} aria-label={`Undo ${entry.label}`}>
                      Undo
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Full detail is kept for the last {RETENTION.entries} changes or {RETENTION.days} days, whichever keeps more. Older changes are folded into the sheet.
        </p>
      </section>
    </div>
  );
}
