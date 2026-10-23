import { useState, type ReactNode } from 'react';
import * as A from '../../model/actions';
import { signed, type Calc } from '../../model/derive';
import { ABILITY_NAMES, ABILITIES, type Ability } from '../../model/types';
import { NumberInput, Sheet, toInt, type TabProps } from '../common';

/** Shows how a number was worked out, with an override and any extra editing. */
export function CalcSheet({
  calc,
  open,
  onClose,
  act,
  signedValues = true,
  children,
}: {
  calc: Calc | null;
  open: boolean;
  onClose: () => void;
  act: TabProps['act'];
  signedValues?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open && Boolean(calc)} title={calc?.label ?? ''} onClose={onClose}>
      {calc && (
        <>
          <dl className="parts" aria-label="How it's worked out">
            {calc.parts.map((part, index) => (
              <div key={`${part.label}-${index}`}>
                <dt>{part.label}</dt>
                <dd>{index === 0 && !signedValues ? part.value : signed(part.value)}</dd>
              </div>
            ))}
            <div className="parts-total">
              <dt>{calc.overridden ? 'Calculated' : 'Total'}</dt>
              <dd>{signedValues ? signed(calc.calculated) : calc.calculated}</dd>
            </div>
          </dl>
          {calc.notes.map((note) => (
            <p key={note} className="notice" style={{ margin: 0 }}>
              {note}
            </p>
          ))}
          {children}
          <Override calc={calc} act={act} signedValues={signedValues} />
        </>
      )}
    </Sheet>
  );
}

function Override({ calc, act, signedValues }: { calc: Calc; act: TabProps['act']; signedValues: boolean }) {
  const [text, setText] = useState('');
  const value = toInt(text);
  if (calc.overridden) {
    return (
      <div className="notice">
        <p style={{ marginTop: 0 }}>
          Overridden by you: {signedValues ? signed(calc.value) : calc.value}. Without the override it would be{' '}
          {signedValues ? signed(calc.calculated) : calc.calculated}.
        </p>
        <button type="button" className="btn btn-small" onClick={() => act(A.setOverride(calc.key, calc.label, null, calc.value))}>
          Clear override
        </button>
      </div>
    );
  }
  return (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        if (value === null) return;
        act(A.setOverride(calc.key, calc.label, value, undefined));
        setText('');
      }}
    >
      <label className="field" style={{ flex: 1 }}>
        <span>Override with your own number</span>
        <input className="input input-number" type="number" inputMode="numeric" value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="submit" className="btn" style={{ alignSelf: 'end' }} disabled={value === null}>
        Override
      </button>
    </form>
  );
}

export function AbilityEditor({ view, act, ability }: TabProps & { ability: Ability }) {
  return (
    <label className="field">
      <span>{ABILITY_NAMES[ability]} score, before bonuses</span>
      <NumberInput
        label={`${ABILITY_NAMES[ability]} score`}
        value={view.state.abilities[ability]}
        min={1}
        max={30}
        onCommit={(score) => act(A.setAbility(view.state, ability, score ?? 10))}
      />
    </label>
  );
}

const AC_PRESETS = [
  { label: 'Mage Armor', base: 13, addDex: true, dexCap: null, extraAbility: null },
  { label: 'Unarmored Defense (Barbarian)', base: 10, addDex: true, dexCap: null, extraAbility: 'con' as const },
  { label: 'Unarmored Defense (Monk)', base: 10, addDex: true, dexCap: null, extraAbility: 'wis' as const },
  { label: 'Draconic Resilience', base: 13, addDex: true, dexCap: null, extraAbility: null },
];

export function AcEditor({ view, act }: TabProps) {
  const { state, derived } = view;
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [base, setBase] = useState('10');
  const [addDex, setAddDex] = useState(true);
  const [cap, setCap] = useState('');
  const [extra, setExtra] = useState<Ability | ''>('');
  const baseValue = toInt(base);
  const capValue = cap.trim() === '' ? null : toInt(cap);
  const armorWorn = derived.ac.candidates.some((c) => c.id.startsWith('item:'));

  return (
    <div className="stack-tight">
      <ul className="list">
        {derived.ac.candidates.map((candidate) => {
          const custom = state.acFormulas.find((formula) => formula.id === candidate.id);
          const isChosen = derived.ac.chosen === candidate.id;
          return (
            <li key={candidate.id} className="line">
              <span className="line-main">
                {candidate.label} <span className="muted">{candidate.value}</span>
                {isChosen && <span className="small muted">, in use{derived.ac.pinned ? ' (pinned)' : ''}</span>}
              </span>
              {!isChosen && (
                <button type="button" className="btn btn-small" onClick={() => act(A.pinAc(candidate.id, candidate.label))}>
                  Use this
                </button>
              )}
              {custom && (
                <button type="button" className="btn btn-quiet btn-small" onClick={() => act(A.removeAcFormula(custom, state))}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {derived.ac.pinned && (
        <button type="button" className="btn btn-small" onClick={() => act(A.pinAc(null, ''))}>
          Use the best formula automatically
        </button>
      )}
      {armorWorn && <p className="small muted" style={{ margin: 0 }}>Wearing armor, so unarmored formulas don't apply.</p>}
      {!adding ? (
        <div className="row">
          {AC_PRESETS.filter((preset) => !state.acFormulas.some((f) => f.label === preset.label)).map((preset) => (
            <button key={preset.label} type="button" className="btn btn-small" onClick={() => act(A.addAcFormula(preset))}>
              Add {preset.label}
            </button>
          ))}
          <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
            Add your own formula
          </button>
        </div>
      ) : (
        <form
          className="stack-tight"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim() || baseValue === null) return;
            act(A.addAcFormula({ label: label.trim(), base: baseValue, addDex, dexCap: addDex ? capValue : null, extraAbility: extra || null }));
            setAdding(false);
            setLabel('');
          }}
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Natural armor" autoFocus />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Base AC</span>
              <input className="input input-number" type="number" inputMode="numeric" value={base} onChange={(event) => setBase(event.target.value)} />
            </label>
            <label className="field">
              <span>Also add</span>
              <select className="select" value={extra} onChange={(event) => setExtra(event.target.value as Ability | '')}>
                <option value="">Nothing else</option>
                {ABILITIES.filter((a) => a !== 'dex').map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]} modifier
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={addDex} onChange={(event) => setAddDex(event.target.checked)} /> Add Dexterity modifier
          </label>
          {addDex && (
            <label className="field">
              <span>Dexterity cap</span>
              <input className="input input-number" type="number" inputMode="numeric" placeholder="No cap" value={cap} onChange={(event) => setCap(event.target.value)} />
            </label>
          )}
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!label.trim() || baseValue === null}>
              Add formula
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function SpeedEditor({ view, act }: TabProps) {
  return (
    <label className="field">
      <span>Base speed in feet, before bonuses</span>
      <NumberInput label="Base speed" value={view.state.speed} min={0} max={500} onCommit={(speed) => act(A.setSpeed(view.state, speed ?? 30))} />
    </label>
  );
}
