import * as A from '../../model/actions';
import type { TabProps } from '../common';

/** Diamonds you tap to spend or regain a slot. Filled means available. */
function SlotPips({ max, used, label, onUse, onRegain }: { max: number; used: number; label: string; onUse: () => void; onRegain: () => void }) {
  const left = max - used;
  return (
    <span className="pips" role="group" aria-label={`${label}: ${left} of ${max} left`}>
      {Array.from({ length: max }, (_, index) => {
        const available = index < left;
        return (
          <button
            key={index}
            type="button"
            className={`pip pip-slot ${available ? 'is-filled' : ''}`}
            aria-label={available ? `Use a ${label} slot` : `Regain a ${label} slot`}
            onClick={available ? onUse : onRegain}
          />
        );
      })}
    </span>
  );
}

export function SpellSlots({ view, act }: TabProps) {
  const { state } = view;
  const levels = state.spellSlots.map((slot, level) => ({ ...slot, level })).filter((slot) => slot.level > 0 && slot.max > 0);
  if (!levels.length && state.pact.max === 0) return null;
  return (
    <section className="section" aria-labelledby="slots-heading">
      <div className="section-head">
        <h2 id="slots-heading" className="section-title">
          Spell slots
        </h2>
        <span className="small muted">Tap to spend or regain</span>
      </div>
      <ul className="list">
        {levels.map((slot) => (
          <li key={slot.level} className="line">
            <span className="line-main">Level {slot.level}</span>
            <SlotPips
              max={slot.max}
              used={slot.used}
              label={`level ${slot.level}`}
              onUse={() => act(A.useSlot(state, slot.level, 1))}
              onRegain={() => act(A.useSlot(state, slot.level, -1))}
            />
          </li>
        ))}
        {state.pact.max > 0 && (
          <li className="line">
            <span className="line-main">
              Pact magic <span className="small muted">level {state.pact.level}, short rest</span>
            </span>
            <SlotPips
              max={state.pact.max}
              used={state.pact.used}
              label="pact"
              onUse={() => act(A.usePact(state, 1))}
              onRegain={() => act(A.usePact(state, -1))}
            />
          </li>
        )}
      </ul>
    </section>
  );
}
