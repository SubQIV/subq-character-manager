import { useState } from 'react';
import * as A from '../../model/actions';
import { HIT_DICE, type ClassLevel, type HitDie } from '../../model/types';
import { ConfirmButton, Sheet, toInt, type TabProps } from '../common';

export function Classes({ view, act }: TabProps) {
  const [editing, setEditing] = useState<ClassLevel | 'new' | null>(null);
  const { state, derived } = view;
  return (
    <section className="section" aria-labelledby="classes-heading">
      <div className="section-head">
        <h2 id="classes-heading" className="section-title">
          Classes
        </h2>
        <span className="small muted">Level {Math.max(1, derived.level)}</span>
      </div>
      <ul className="list">
        {state.classes.map((entry) => (
          <li key={entry.id} className="line">
            <button type="button" className="tracker-name line-main" onClick={() => setEditing(entry)}>
              {entry.name} {entry.level}
              <small>
                {entry.subclass ? `${entry.subclass}, ` : ''}d{entry.hitDie} hit dice
              </small>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-small" style={{ justifySelf: 'start' }} onClick={() => setEditing('new')}>
        {state.classes.length ? 'Add another class' : 'Add a class'}
      </button>
      <Sheet open={editing !== null} title={editing === 'new' ? 'Add a class' : `Edit ${editing?.name ?? ''}`} onClose={() => setEditing(null)}>
        {editing !== null && <ClassEditor entry={editing === 'new' ? null : editing} act={act} onDone={() => setEditing(null)} />}
      </Sheet>
    </section>
  );
}

function ClassEditor({ entry, act, onDone }: { entry: ClassLevel | null; act: TabProps['act']; onDone: () => void }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [subclass, setSubclass] = useState(entry?.subclass ?? '');
  const [level, setLevel] = useState(String(entry?.level ?? 1));
  const [hitDie, setHitDie] = useState<HitDie>(entry?.hitDie ?? 8);
  const levelValue = toInt(level);
  const valid = name.trim() !== '' && levelValue !== null && levelValue >= 1 && levelValue <= 20;
  return (
    <form
      className="stack-tight"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || levelValue === null) return;
        const fields = { name: name.trim(), subclass: subclass.trim(), level: levelValue, hitDie };
        if (entry) {
          const changed = Object.fromEntries(Object.entries(fields).filter(([key, v]) => entry[key as keyof ClassLevel] !== v));
          if (Object.keys(changed).length) act(A.updateClass(entry, changed));
        } else {
          act(A.addClass(fields));
        }
        onDone();
      }}
    >
      <label className="field">
        <span>Class</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fighter" autoFocus={!entry} />
      </label>
      <label className="field">
        <span>Subclass</span>
        <input className="input" value={subclass} onChange={(event) => setSubclass(event.target.value)} placeholder="Optional" />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Level</span>
          <input className="input input-number" type="number" inputMode="numeric" min={1} max={20} value={level} onChange={(event) => setLevel(event.target.value)} />
        </label>
        <label className="field">
          <span>Hit die</span>
          <select className="select" value={hitDie} onChange={(event) => setHitDie(Number(event.target.value) as HitDie)}>
            {HIT_DICE.map((die) => (
              <option key={die} value={die}>
                d{die}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Level changes are kept in the milestone log. Raise your hit point maximum on the Stats tab too; the level-up helper arrives with the builder.
      </p>
      <button type="submit" className="btn btn-primary" disabled={!valid}>
        {entry ? 'Save changes' : 'Add class'}
      </button>
      {entry && (
        <ConfirmButton
          label={`Remove ${entry.name}`}
          confirmLabel="Tap again to remove"
          onConfirm={() => {
            act(A.removeClass(entry));
            onDone();
          }}
        />
      )}
    </form>
  );
}
