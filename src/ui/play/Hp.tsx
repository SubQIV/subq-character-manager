import { useState } from 'react';
import * as A from '../../model/actions';
import { NumberInput, Sheet, toInt, type TabProps } from '../common';

export function HpBlock({ view, act }: TabProps) {
  const { state, derived } = view;
  const [amount, setAmount] = useState('');
  const [tempOpen, setTempOpen] = useState(false);
  const value = toInt(amount);
  const valid = value !== null && value > 0;
  const max = derived.hpMax.value;
  const percent = max > 0 ? Math.min(100, Math.round((state.hp.current / max) * 100)) : 0;

  const apply = (kind: 'damage' | 'heal') => {
    if (!valid) return;
    act(kind === 'damage' ? A.damage(state, value) : A.heal(state, value));
    setAmount('');
  };

  return (
    <section className="hp graph" aria-labelledby="hp-heading">
      <div className="spread">
        <h2 id="hp-heading" className="section-title">
          Hit points
        </h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setTempOpen(true)}>
          Temporary HP
        </button>
      </div>
      <div className="hp-numbers">
        <span className="hp-now" data-testid="hp-current">
          {state.hp.current}
        </span>
        <span className="hp-max">/ {max}</span>
        {state.hp.temp > 0 && <span className="hp-temp">+{state.hp.temp} temporary</span>}
      </div>
      <div className="hp-line" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <form
        className="hp-entry"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          className="input input-number"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="Amount"
          aria-label="Damage or healing amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button type="button" className="btn btn-damage" disabled={!valid} onClick={() => apply('damage')}>
          Damage
        </button>
        <button type="button" className="btn btn-heal" disabled={!valid} onClick={() => apply('heal')}>
          Heal
        </button>
      </form>

      <Sheet open={tempOpen} title="Temporary hit points" onClose={() => setTempOpen(false)}>
        <TempHp
          current={state.hp.temp}
          onSet={(temp) => {
            act(A.setTempHp(state, temp));
            setTempOpen(false);
          }}
        />
      </Sheet>
    </section>
  );
}

function TempHp({ current, onSet }: { current: number; onSet: (value: number) => void }) {
  const [text, setText] = useState(current ? String(current) : '');
  const value = toInt(text);
  return (
    <>
      <p className="muted">
        Damage comes off temporary hit points first. They don't stack: a new amount replaces the old one, so keep
        whichever is higher.
      </p>
      <label className="field">
        <span>Temporary hit points</span>
        <input
          className="input input-number"
          type="number"
          inputMode="numeric"
          min={0}
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoFocus
        />
      </label>
      <div className="grid-2">
        <button type="button" className="btn" onClick={() => onSet(0)} disabled={current === 0}>
          Clear
        </button>
        <button type="button" className="btn btn-primary" disabled={value === null || value < 0} onClick={() => onSet(value ?? 0)}>
          Set to {value ?? 0}
        </button>
      </div>
    </>
  );
}

export function DeathSaves({ view, act }: TabProps) {
  const { state } = view;
  if (state.hp.current > 0) return null;
  const row = (kind: 'successes' | 'failures', label: string) => {
    const count = state.deathSaves[kind];
    return (
      <div className="spread">
        <span>{label}</span>
        <span className="pips" role="group" aria-label={`${label}: ${count} of 3`}>
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              className={`pip ${index < count ? 'is-filled' : ''}`}
              aria-label={`${label} ${index + 1}`}
              aria-pressed={index < count}
              onClick={() => act(A.deathSave(state, kind, (index < count ? index : index + 1) - count))}
            />
          ))}
        </span>
      </div>
    );
  };
  return (
    <section className="death-saves" aria-label="Death saves">
      <h2 className="section-title">Death saves</h2>
      {row('successes', 'Successes')}
      {row('failures', 'Failures')}
      <p className="small muted" style={{ margin: 0 }}>
        Three successes and you're stable; three failures and you die. Healing brings you back and clears these.
      </p>
    </section>
  );
}

export function MaxHpEditor({ view, act }: TabProps) {
  return (
    <label className="field">
      <span>Hit point maximum, before bonuses</span>
      <NumberInput label="Hit point maximum" value={view.state.hp.max} min={1} onCommit={(max) => act(A.setMaxHp(view.state, max ?? 1))} />
    </label>
  );
}
