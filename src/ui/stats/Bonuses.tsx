import { useState } from 'react';
import * as A from '../../model/actions';
import { signed } from '../../model/derive';
import { ABILITIES, ABILITY_NAMES, SKILLS, type ModTarget, type Modifier } from '../../model/types';
import { ConfirmButton, Sheet, toInt, type TabProps } from '../common';

export const TARGET_GROUPS: { label: string; options: { value: ModTarget; label: string }[] }[] = [
  {
    label: 'Combat',
    options: [
      { value: 'ac', label: 'Armor Class' },
      { value: 'initiative', label: 'Initiative' },
      { value: 'speed', label: 'Speed' },
      { value: 'hpMax', label: 'Hit point maximum' },
      { value: 'spellDC', label: 'Spell save DC' },
      { value: 'spellAttack', label: 'Spell attack bonus' },
      { value: 'attunementSlots', label: 'Attunement slots' },
    ],
  },
  {
    label: 'Saving throws',
    options: [
      { value: 'save:all', label: 'All saving throws' },
      ...ABILITIES.map((a) => ({ value: `save:${a}` as ModTarget, label: `${ABILITY_NAMES[a]} saves` })),
    ],
  },
  {
    label: 'Ability checks',
    options: [
      { value: 'check:all', label: 'All ability checks' },
      ...ABILITIES.map((a) => ({ value: `check:${a}` as ModTarget, label: `${ABILITY_NAMES[a]} checks` })),
    ],
  },
  { label: 'Ability scores', options: ABILITIES.map((a) => ({ value: `ability:${a}` as ModTarget, label: `${ABILITY_NAMES[a]} score` })) },
  { label: 'Skills', options: SKILLS.map((s) => ({ value: `skill:${s.id}` as ModTarget, label: s.name })) },
  { label: 'Passive scores', options: SKILLS.map((s) => ({ value: `passive:${s.id}` as ModTarget, label: `Passive ${s.name}` })) },
];

export function targetLabel(target: ModTarget): string {
  for (const group of TARGET_GROUPS) {
    const found = group.options.find((option) => option.value === target);
    if (found) return found.label;
  }
  return target;
}

export function Bonuses({ view, act }: TabProps) {
  const [editing, setEditing] = useState<Modifier | 'new' | null>(null);
  const mods = view.state.modifiers;
  return (
    <section className="section" aria-labelledby="bonuses-heading">
      <div className="section-head">
        <h2 id="bonuses-heading" className="section-title">
          Bonuses
        </h2>
        <button type="button" className="btn btn-small" onClick={() => setEditing('new')}>
          Add bonus
        </button>
      </div>
      {mods.length === 0 ? (
        <p className="empty">
          Bonuses from features, spells or items not in your inventory, like +1 AC from a fighting style. They show in the calculations.
        </p>
      ) : (
        <ul className="list">
          {mods.map((mod) => (
            <li key={mod.id} className="line">
              <input
                type="checkbox"
                aria-label={`${mod.source} on`}
                checked={mod.enabled}
                onChange={() => act(A.updateModifier(mod, { enabled: !mod.enabled }))}
                style={{ width: 20, height: 20, accentColor: 'var(--ink)' }}
              />
              <button type="button" className="tracker-name line-main" onClick={() => setEditing(mod)}>
                {mod.source}
                <small>
                  {mod.mode === 'atLeast' ? `Sets ${targetLabel(mod.target)} to at least ${mod.value}` : `${signed(mod.value)} to ${targetLabel(mod.target)}`}
                  {mod.stack ? `, doesn't stack with other ${mod.stack} bonuses` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={editing !== null} title={editing === 'new' ? 'Add a bonus' : 'Edit bonus'} onClose={() => setEditing(null)}>
        {editing !== null && <BonusEditor mod={editing === 'new' ? null : editing} act={act} onDone={() => setEditing(null)} />}
      </Sheet>
    </section>
  );
}

function BonusEditor({ mod, act, onDone }: { mod: Modifier | null; act: TabProps['act']; onDone: () => void }) {
  const [source, setSource] = useState(mod?.source ?? '');
  const [target, setTarget] = useState<ModTarget>(mod?.target ?? 'ac');
  const [mode, setMode] = useState<Modifier['mode']>(mod?.mode ?? 'add');
  const [value, setValue] = useState(mod ? String(mod.value) : '1');
  const [stack, setStack] = useState(mod?.stack ?? '');
  const number = toInt(value);
  const valid = source.trim() !== '' && number !== null;
  return (
    <form
      className="stack-tight"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || number === null) return;
        const fields = { source: source.trim(), target, mode, value: number, stack: stack.trim().toLowerCase(), enabled: mod?.enabled ?? true };
        if (mod) {
          const changed = Object.fromEntries(Object.entries(fields).filter(([key, v]) => mod[key as keyof Modifier] !== v));
          if (Object.keys(changed).length) act(A.updateModifier(mod, changed));
        } else {
          act(A.addModifier(fields));
        }
        onDone();
      }}
    >
      <label className="field">
        <span>Where it comes from</span>
        <input className="input" value={source} onChange={(event) => setSource(event.target.value)} placeholder="e.g. Defense fighting style" autoFocus={!mod} />
      </label>
      <label className="field">
        <span>Applies to</span>
        <select className="select" value={target} onChange={(event) => setTarget(event.target.value as ModTarget)}>
          {TARGET_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Effect</span>
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value as Modifier['mode'])}>
            <option value="add">Adds</option>
            <option value="atLeast">Sets it to at least</option>
          </select>
        </label>
        <label className="field">
          <span>Amount</span>
          <input className="input input-number" type="number" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Doesn't stack with (optional)</span>
        <input
          className="input"
          value={stack}
          onChange={(event) => setStack(event.target.value)}
          placeholder="e.g. protection, for Cloak and Ring of Protection"
        />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Bonuses sharing this name don't stack: only the highest one counts.
      </p>
      <button type="submit" className="btn btn-primary" disabled={!valid}>
        {mod ? 'Save changes' : 'Add bonus'}
      </button>
      {mod && (
        <ConfirmButton
          label="Delete bonus"
          confirmLabel="Tap again to delete"
          onConfirm={() => {
            act(A.removeModifier(mod));
            onDone();
          }}
        />
      )}
    </form>
  );
}
