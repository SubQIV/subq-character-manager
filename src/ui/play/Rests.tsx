import { useState } from 'react';
import * as A from '../../model/actions';
import { abilityMod, signed } from '../../model/derive';
import type { CharacterState, Charges, HitDie } from '../../model/types';
import { Sheet, toInt, type TabProps } from '../common';

/** Boxes for items whose recharge is a roll, e.g. a wand that regains 1d6+1 at dawn. */
function useRechargeRolls(state: CharacterState, rules: Charges['recharge'][]) {
  const items = A.rechargeRollsNeeded(state, rules);
  const [text, setText] = useState<Record<string, string>>({});
  const rolls: A.RechargeRolls = {};
  let valid = true;
  for (const item of items) {
    const value = toInt(text[item.id] ?? '');
    if (value === null || value < 0) valid = false;
    else rolls[item.id] = value;
  }
  const inputs = items.map((item) => (
    <label key={item.id} className="field">
      <span>
        {A.itemName(item)} regains {item.charges!.rechargeAmount}. What did you roll?
      </span>
      <input
        className="input input-number"
        type="number"
        inputMode="numeric"
        min={0}
        value={text[item.id] ?? ''}
        onChange={(event) => setText({ ...text, [item.id]: event.target.value })}
      />
    </label>
  ));
  return { rolls, valid, inputs };
}

function Effects({ label, prefix, empty }: { label: string; prefix: string; empty: string }) {
  const effects = label.replace(new RegExp(`^${prefix}:? ?`), '').split('; ').filter(Boolean);
  if (!effects.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  return (
    <ul className="rules">
      {effects.map((effect) => (
        <li key={effect}>{effect[0].toUpperCase() + effect.slice(1)}</li>
      ))}
    </ul>
  );
}

export function Rests({ view, act }: TabProps) {
  const { derived } = view;
  const [open, setOpen] = useState<'short' | 'long' | 'dawn' | null>(null);
  const pools = derived.hitDice;
  return (
    <section className="section" aria-labelledby="rest-heading">
      <div className="section-head">
        <h2 id="rest-heading" className="section-title">
          Rest
        </h2>
        {pools.length > 0 && (
          <span className="small muted">
            Hit dice: {pools.map((pool) => `${Math.max(0, pool.total - pool.spent)}/${pool.total} d${pool.die}`).join(', ')}
          </span>
        )}
      </div>
      <div className="grid-3">
        <button type="button" className="btn" onClick={() => setOpen('short')}>
          Short rest
        </button>
        <button type="button" className="btn" onClick={() => setOpen('long')}>
          Long rest
        </button>
        <button type="button" className="btn" onClick={() => setOpen('dawn')}>
          Dawn
        </button>
      </div>
      <Sheet open={open === 'short'} title="Short rest" onClose={() => setOpen(null)}>
        <ShortRest view={view} act={act} onDone={() => setOpen(null)} />
      </Sheet>
      <Sheet open={open === 'long'} title="Long rest" onClose={() => setOpen(null)}>
        <LongRest view={view} act={act} onDone={() => setOpen(null)} />
      </Sheet>
      <Sheet open={open === 'dawn'} title="Dawn" onClose={() => setOpen(null)}>
        <Dawn view={view} act={act} onDone={() => setOpen(null)} />
      </Sheet>
    </section>
  );
}

function ShortRest({ view, act, onDone }: Omit<TabProps, 'id'> & { onDone: () => void }) {
  const { state, derived } = view;
  const [rolls, setRolls] = useState<{ die: HitDie; text: string }[]>([]);
  const con = abilityMod(derived.abilities.con.score.value);
  const remaining = (die: HitDie) => {
    const pool = derived.hitDice.find((p) => p.die === die);
    return pool ? pool.total - pool.spent - rolls.filter((r) => r.die === die).length : 0;
  };
  const parsed = rolls.map((roll) => ({ die: roll.die, rolled: toInt(roll.text) }));
  const valid = parsed.every((roll) => roll.rolled !== null && roll.rolled >= 1 && roll.rolled <= roll.die);
  const healing = parsed.reduce((total, roll) => total + Math.max(0, (roll.rolled ?? 0) + con), 0);
  const recharge = useRechargeRolls(state, ['short']);
  const preview = A.shortRest(state, [], recharge.rolls);

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Spend hit dice to heal: roll each one and enter the number. Your Constitution modifier ({signed(con)}) is added for you.
      </p>
      <div className="row">
        {derived.hitDice.map((pool) => (
          <button
            key={pool.die}
            type="button"
            className="btn btn-small"
            disabled={remaining(pool.die) <= 0}
            onClick={() => setRolls([...rolls, { die: pool.die, text: '' }])}
          >
            Spend a d{pool.die} ({remaining(pool.die)} left)
          </button>
        ))}
        {derived.hitDice.length === 0 && <span className="small muted">Add a class on the Stats tab to get hit dice.</span>}
      </div>
      {rolls.map((roll, index) => (
        <div key={index} className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>d{roll.die} roll</span>
            <input
              className="input input-number"
              type="number"
              inputMode="numeric"
              min={1}
              max={roll.die}
              value={roll.text}
              autoFocus
              onChange={(event) => setRolls(rolls.map((r, i) => (i === index ? { ...r, text: event.target.value } : r)))}
            />
          </label>
          <button type="button" className="btn btn-quiet btn-small" style={{ alignSelf: 'end' }} onClick={() => setRolls(rolls.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      {rolls.length > 0 && <p style={{ margin: 0 }}>Heals {healing} HP.</p>}
      {recharge.inputs}
      {preview.label !== 'Short rest' && <p className="small muted" style={{ margin: 0 }}>Also: {preview.label.replace('Short rest: ', '')}.</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!valid || !recharge.valid}
        onClick={() => {
          act(A.shortRest(state, parsed.map((roll) => ({ die: roll.die, rolled: roll.rolled ?? 0 })), recharge.rolls));
          onDone();
        }}
      >
        Finish short rest
      </button>
    </>
  );
}

function LongRest({ view, act, onDone }: Omit<TabProps, 'id'> & { onDone: () => void }) {
  const { state, derived } = view;
  const recharge = useRechargeRolls(state, ['short', 'long']);
  const action = A.longRest(state, derived, recharge.rolls);
  return (
    <>
      {recharge.inputs}
      <Effects label={action.label} prefix="Long rest" empty="You're already fully rested." />
      {state.edition === '2014' && state.exhaustion > 0 && (
        <p className="small muted" style={{ margin: 0 }}>2014 rules: exhaustion only drops if you had food and drink. Undo it if you didn't.</p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!recharge.valid}
        onClick={() => {
          act(action);
          onDone();
        }}
      >
        Finish long rest
      </button>
    </>
  );
}

function Dawn({ view, act, onDone }: Omit<TabProps, 'id'> & { onDone: () => void }) {
  const { state } = view;
  const recharge = useRechargeRolls(state, ['dawn']);
  const action = A.dawn(state, recharge.rolls);
  return (
    <>
      {recharge.inputs}
      <Effects label={action.label} prefix="Dawn" empty="Nothing on this sheet resets at dawn right now." />
      <button
        type="button"
        className="btn btn-primary"
        disabled={!recharge.valid}
        onClick={() => {
          act(action);
          onDone();
        }}
      >
        Apply dawn
      </button>
    </>
  );
}
