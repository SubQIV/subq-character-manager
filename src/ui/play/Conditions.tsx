import { useState } from 'react';
import * as A from '../../model/actions';
import { conditionsFor, exhaustionRules, findCondition, type Condition } from '../../packs/registry';
import { Sheet, type TabProps } from '../common';

export function Conditions({ view, act }: TabProps) {
  const { state } = view;
  const [picking, setPicking] = useState(false);
  const [showing, setShowing] = useState<{ id: string; condition: Condition } | null>(null);
  const [exhaustionOpen, setExhaustionOpen] = useState(false);
  const active = state.conditions
    .map((entry) => ({ id: entry.id, condition: findCondition(entry.conditionId) }))
    .filter((entry): entry is { id: string; condition: Condition } => Boolean(entry.condition));
  const activeKeys = new Set(active.map((entry) => entry.condition.key));
  const available = conditionsFor(state.edition).filter((c) => c.id !== 'exhaustion' && !activeKeys.has(c.key));
  const exhaustion = exhaustionRules(state.edition);
  const currentLevel = exhaustion?.levels?.find((level) => level.level === state.exhaustion);
  const inspirationName = state.edition === '2024' ? 'Heroic Inspiration' : 'Inspiration';

  return (
    <section className="section" aria-labelledby="conditions-heading">
      <div className="section-head">
        <h2 id="conditions-heading" className="section-title">
          Conditions
        </h2>
        <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>
          Add condition
        </button>
      </div>

      <div className="row">
        <button
          type="button"
          className={`chip ${state.inspiration ? 'is-on' : ''}`}
          aria-pressed={state.inspiration}
          onClick={() => act(A.toggleInspiration(state))}
        >
          {inspirationName}
        </button>
        {active.map((entry) => (
          <button key={entry.id} type="button" className="chip chip-condition" onClick={() => setShowing(entry)}>
            {entry.condition.name}
          </button>
        ))}
      </div>

      <div className="spread">
        <button type="button" className="tracker-name" onClick={() => setExhaustionOpen(true)}>
          Exhaustion {state.exhaustion}
          <small>{state.exhaustion === 0 ? 'None. Tap to read the rules.' : currentLevel?.effect}</small>
        </button>
        <div className="tracker-controls">
          <button
            type="button"
            className="icon-btn"
            aria-label="Reduce exhaustion"
            disabled={state.exhaustion === 0}
            onClick={() => act(A.changeExhaustion(state, -1))}
          >
            −
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Increase exhaustion"
            disabled={state.exhaustion === 6}
            onClick={() => act(A.changeExhaustion(state, 1))}
          >
            +
          </button>
        </div>
      </div>

      <Sheet open={picking} title="Add a condition" onClose={() => setPicking(false)}>
        <p className="small muted" style={{ margin: 0 }}>
          {state.edition} rules, from {state.edition === '2014' ? 'SRD 5.1' : 'SRD 5.2'}.
        </p>
        <ul className="list">
          {available.map((condition) => (
            <li key={condition.key}>
              <button
                type="button"
                className="line"
                style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  act(A.addCondition(condition.key, condition.name));
                  setPicking(false);
                }}
              >
                <span className="line-main">
                  <strong>{condition.name}</strong>
                  <br />
                  <span className="small muted">{condition.summary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={Boolean(showing)} title={showing?.condition.name ?? ''} onClose={() => setShowing(null)}>
        {showing && (
          <>
            <ul className="rules">
              {showing.condition.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="small muted" style={{ margin: 0 }}>
              From {showing.condition.packName}.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                act(A.removeCondition(showing.id, showing.condition.name));
                setShowing(null);
              }}
            >
              Remove {showing.condition.name}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={exhaustionOpen} title={`Exhaustion, ${state.edition} rules`} onClose={() => setExhaustionOpen(false)}>
        {exhaustion && (
          <>
            <ul className="rules">
              {exhaustion.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <dl className="parts">
              {exhaustion.levels?.map((level) => (
                <div key={level.level} style={level.level === state.exhaustion ? { background: 'var(--highlight-soft)' } : undefined}>
                  <dt>Level {level.level}</dt>
                  <dd>{level.effect}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Sheet>
    </section>
  );
}
