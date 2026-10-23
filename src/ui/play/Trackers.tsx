import { useState } from 'react';
import * as A from '../../model/actions';
import type { ResetRule, Tracker } from '../../model/types';
import { ConfirmButton, Sheet, toInt, type TabProps } from '../common';

const RESET_TEXT: Record<ResetRule, string> = {
  short: 'Resets on a short or long rest',
  long: 'Resets on a long rest',
  dawn: 'Resets at dawn',
  never: "Doesn't reset",
  manual: "Doesn't reset",
};

function Meter({ tracker }: { tracker: Tracker }) {
  if (tracker.kind !== 'meter' || tracker.max === null) return null;
  const span = tracker.max - tracker.min;
  if (span <= 0) return null;
  const filled = tracker.value - tracker.min;
  if (span <= 20) {
    return (
      <div className="meter" aria-hidden="true">
        {Array.from({ length: span }, (_, index) => (
          <span key={index} className={index < filled ? 'is-filled' : ''} />
        ))}
      </div>
    );
  }
  return (
    <div className="meter-continuous" aria-hidden="true">
      <span style={{ width: `${Math.round((filled / span) * 100)}%` }} />
    </div>
  );
}

function TrackerRow({ tracker, act, onEdit }: { tracker: Tracker; act: TabProps['act']; onEdit: () => void }) {
  return (
    <div className="tracker" data-testid={`tracker-${tracker.name}`}>
      <button type="button" className="tracker-name" onClick={onEdit}>
        {tracker.name}
        <small>{tracker.note || RESET_TEXT[tracker.reset]}</small>
      </button>
      <div className="tracker-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label={`${tracker.name} minus one`}
          disabled={tracker.value <= tracker.min}
          onClick={() => act(A.adjustTracker(tracker, -1))}
        >
          −
        </button>
        <span className="tracker-value" aria-label={`${tracker.name} value`}>
          {tracker.value}
          {tracker.max !== null && <span className="small muted">/{tracker.max}</span>}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${tracker.name} plus one`}
          disabled={tracker.max !== null && tracker.value >= tracker.max}
          onClick={() => act(A.adjustTracker(tracker, 1))}
        >
          +
        </button>
      </div>
      <Meter tracker={tracker} />
    </div>
  );
}

export function Resources({ view, act }: TabProps) {
  const trackers = view.state.trackers.filter((tracker) => tracker.kind !== 'currency');
  const [editing, setEditing] = useState<Tracker | 'new' | null>(null);
  return (
    <section className="section" aria-labelledby="resources-heading">
      <div className="section-head">
        <h2 id="resources-heading" className="section-title">
          Resources
        </h2>
        <button type="button" className="btn btn-small" onClick={() => setEditing('new')}>
          New tracker
        </button>
      </div>
      {trackers.length === 0 ? (
        <p className="empty">
          Track anything that goes up and down: Ki, Superiority Dice, a Corruption meter. Tap New tracker to add one.
        </p>
      ) : (
        <div>
          {trackers.map((tracker) => (
            <TrackerRow key={tracker.id} tracker={tracker} act={act} onEdit={() => setEditing(tracker)} />
          ))}
        </div>
      )}
      <Sheet open={editing !== null} title={editing === 'new' ? 'New tracker' : `Edit ${editing?.name ?? ''}`} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TrackerEditor
            tracker={editing === 'new' ? null : editing}
            defaultKind="counter"
            act={act}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

export function Currencies({ view, act }: TabProps) {
  const coins = view.state.trackers.filter((tracker) => tracker.id.startsWith('coin:'));
  const custom = view.state.trackers.filter((tracker) => tracker.kind === 'currency' && !tracker.id.startsWith('coin:'));
  const [open, setOpen] = useState<Tracker | null>(null);
  const [editing, setEditing] = useState<Tracker | 'new' | null>(null);
  const live = open ? view.state.trackers.find((tracker) => tracker.id === open.id) ?? null : null;
  return (
    <section className="section" aria-labelledby="money-heading">
      <div className="section-head">
        <h2 id="money-heading" className="section-title">
          Coins and currencies
        </h2>
        <button type="button" className="btn btn-small" onClick={() => setEditing('new')}>
          New currency
        </button>
      </div>
      <div className="coins">
        {coins.map((coin) => (
          <button key={coin.id} type="button" className="box" onClick={() => setOpen(coin)} aria-label={`${coin.name}: ${coin.value}. Add or spend`}>
            <span className="box-label">{coin.id.slice(5)}</span>
            <span className="box-value" style={{ fontSize: '1.25rem' }}>
              {coin.value}
            </span>
          </button>
        ))}
      </div>
      {custom.length > 0 && (
        <ul className="list">
          {custom.map((currency) => (
            <li key={currency.id} className="line">
              <button type="button" className="tracker-name line-main" onClick={() => setEditing(currency)}>
                {currency.name}
                {currency.note && <small>{currency.note}</small>}
              </button>
              <button type="button" className="line-value" onClick={() => setOpen(currency)} aria-label={`${currency.name}: ${currency.value}. Add or spend`}>
                {currency.value}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={live !== null} title={live?.name ?? ''} onClose={() => setOpen(null)}>
        {live && <MoneySheet tracker={live} act={act} onDone={() => setOpen(null)} />}
      </Sheet>
      <Sheet open={editing !== null} title={editing === 'new' ? 'New currency' : `Edit ${editing?.name ?? ''}`} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TrackerEditor tracker={editing === 'new' ? null : editing} defaultKind="currency" act={act} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </section>
  );
}

function MoneySheet({ tracker, act, onDone }: { tracker: Tracker; act: TabProps['act']; onDone: () => void }) {
  const [text, setText] = useState('');
  const amount = toInt(text);
  const valid = amount !== null && amount > 0;
  return (
    <>
      <p className="box-value" style={{ margin: 0, textAlign: 'center', fontSize: '2.5rem' }}>
        {tracker.value}
      </p>
      <label className="field">
        <span>Amount</span>
        <input
          className="input input-number"
          type="number"
          inputMode="numeric"
          min={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoFocus
        />
      </label>
      <div className="grid-3">
        <button
          type="button"
          className="btn"
          disabled={!valid || tracker.value - (amount ?? 0) < tracker.min}
          onClick={() => {
            act(A.adjustTracker(tracker, -(amount ?? 0)));
            onDone();
          }}
        >
          Spend
        </button>
        <button
          type="button"
          className="btn"
          disabled={amount === null || amount < tracker.min}
          onClick={() => {
            act(A.setTrackerValue(tracker, amount ?? 0));
            onDone();
          }}
        >
          Set to
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            act(A.adjustTracker(tracker, amount ?? 0));
            onDone();
          }}
        >
          Add
        </button>
      </div>
    </>
  );
}

function TrackerEditor({
  tracker,
  defaultKind,
  act,
  onDone,
}: {
  tracker: Tracker | null;
  defaultKind: Tracker['kind'];
  act: TabProps['act'];
  onDone: () => void;
}) {
  const [name, setName] = useState(tracker?.name ?? '');
  const [kind, setKind] = useState<Tracker['kind']>(tracker?.kind ?? defaultKind);
  const [min, setMin] = useState(String(tracker?.min ?? 0));
  const [max, setMax] = useState(tracker?.max === null || tracker?.max === undefined ? '' : String(tracker.max));
  const [value, setValue] = useState(String(tracker?.value ?? (defaultKind === 'currency' ? 0 : '')));
  const [reset, setReset] = useState<ResetRule>(tracker?.reset ?? (defaultKind === 'currency' ? 'never' : 'long'));
  const [resetTo, setResetTo] = useState<Tracker['resetTo']>(tracker?.resetTo ?? 'max');
  const [note, setNote] = useState(tracker?.note ?? '');
  const isCoin = Boolean(tracker?.id.startsWith('coin:'));

  const minValue = toInt(min) ?? 0;
  const maxValue = max.trim() === '' ? null : toInt(max);
  const maxInvalid = max.trim() !== '' && (maxValue === null || maxValue < minValue);
  const startValue = value.trim() === '' ? (maxValue ?? minValue) : toInt(value);
  const problem = !name.trim()
    ? 'Give it a name.'
    : maxInvalid
      ? 'The maximum must be a number at least as big as the minimum.'
      : kind === 'meter' && maxValue === null
        ? 'A meter needs a maximum.'
        : startValue === null
          ? 'The current value must be a whole number.'
          : null;

  const save = () => {
    if (problem || startValue === null) return;
    const clamped = Math.min(maxValue ?? Infinity, Math.max(minValue, startValue));
    const fields = { name: name.trim(), kind, min: minValue, max: maxValue, value: clamped, reset, resetTo, note: note.trim() };
    if (tracker) {
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([key, v]) => tracker[key as keyof Tracker] !== v),
      ) as Partial<Tracker>;
      if (Object.keys(changed).length) act(A.updateTracker(tracker, changed));
    } else {
      act(A.addTracker(fields));
    }
    onDone();
  };

  return (
    <form
      className="stack-tight"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus={!tracker} disabled={isCoin} />
      </label>
      {!isCoin && (
        <label className="field">
          <span>Type</span>
          <select className="select" value={kind} onChange={(event) => setKind(event.target.value as Tracker['kind'])}>
            <option value="counter">Counter: a number, like Ki points</option>
            <option value="meter">Meter: a bar between two limits, like Corruption</option>
            <option value="currency">Currency: money, listed with your coins</option>
          </select>
        </label>
      )}
      <div className="grid-3">
        <label className="field">
          <span>Minimum</span>
          <input className="input input-number" type="number" inputMode="numeric" value={min} onChange={(event) => setMin(event.target.value)} />
        </label>
        <label className="field">
          <span>Maximum</span>
          <input
            className="input input-number"
            type="number"
            inputMode="numeric"
            placeholder="None"
            value={max}
            onChange={(event) => setMax(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Current</span>
          <input
            className="input input-number"
            type="number"
            inputMode="numeric"
            placeholder={maxValue === null ? String(minValue) : String(maxValue)}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      </div>
      {kind !== 'currency' && (
        <div className="grid-2">
          <label className="field">
            <span>Resets</span>
            <select className="select" value={reset === 'manual' ? 'never' : reset} onChange={(event) => setReset(event.target.value as ResetRule)}>
              <option value="short">On a short or long rest</option>
              <option value="long">On a long rest</option>
              <option value="dawn">At dawn</option>
              <option value="never">Never</option>
            </select>
          </label>
          <label className="field">
            <span>Resets to</span>
            <select
              className="select"
              value={resetTo}
              disabled={reset === 'never' || reset === 'manual'}
              onChange={(event) => setResetTo(event.target.value as Tracker['resetTo'])}
            >
              <option value="max">Maximum</option>
              <option value="min">Minimum</option>
            </select>
          </label>
        </div>
      )}
      <label className="field">
        <span>Note</span>
        <input className="input" value={note} placeholder="Optional, shown under the name" onChange={(event) => setNote(event.target.value)} />
      </label>
      {problem && name.trim() && <p className="notice notice-danger">{problem}</p>}
      <button type="submit" className="btn btn-primary" disabled={Boolean(problem)}>
        {tracker ? 'Save changes' : kind === 'currency' ? 'Add currency' : 'Add tracker'}
      </button>
      {tracker && !isCoin && (
        <ConfirmButton
          label={`Delete ${tracker.name}`}
          confirmLabel="Tap again to delete"
          onConfirm={() => {
            act(A.removeTracker(tracker));
            onDone();
          }}
        />
      )}
    </form>
  );
}
