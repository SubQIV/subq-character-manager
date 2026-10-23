import { useState } from 'react';
import * as A from '../../model/actions';
import { signed } from '../../model/derive';
import { CalcSheet } from '../stats/CalcSheet';
import type { TabProps } from '../common';

/** Equipped weapons with their attack bonus and damage. */
export function Attacks({ view, act }: TabProps) {
  const { derived } = view;
  const [open, setOpen] = useState<string | null>(null);
  const attack = derived.attacks.find((a) => a.itemId === open) ?? null;
  if (derived.attacks.length === 0) return null;
  return (
    <section className="section" aria-labelledby="attacks-heading">
      <div className="section-head">
        <h2 id="attacks-heading" className="section-title">
          Attacks
        </h2>
        <span className="small muted">Equipped weapons</span>
      </div>
      <ul className="list">
        {derived.attacks.map((a) => (
          <li key={a.itemId} className="line">
            <span className="line-main">
              <strong style={{ fontWeight: 650 }}>{a.name}</strong>
              <br />
              <span className="small">
                {a.damage}
                {a.versatile ? `, ${a.versatile} two-handed` : ''}
              </span>
              {(a.range || a.properties || a.mastery) && (
                <>
                  <br />
                  <span className="small muted">
                    {[a.range && `range ${a.range}`, a.properties, a.mastery && `mastery: ${a.mastery}`].filter(Boolean).join(', ')}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              className={`line-value ${a.toHit.overridden ? 'is-overridden' : ''}`}
              onClick={() => setOpen(a.itemId)}
              aria-label={`${a.name} attack bonus ${signed(a.toHit.value)}. Show the calculation`}
            >
              {signed(a.toHit.value)}
            </button>
          </li>
        ))}
      </ul>
      <CalcSheet calc={attack?.toHit ?? null} open={attack !== null} onClose={() => setOpen(null)} act={act}>
        {attack && (
          <dl className="parts" aria-label="Damage">
            {attack.damageParts.map((part) => (
              <div key={part.label}>
                <dt>Damage: {part.label}</dt>
                <dd>{signed(part.value)}</dd>
              </div>
            ))}
            <div className="parts-total">
              <dt>Damage</dt>
              <dd>{attack.damage}</dd>
            </div>
          </dl>
        )}
      </CalcSheet>
    </section>
  );
}

/** Magic items with charges, for spending them quickly at the table. */
export function ItemCharges({ view, act }: TabProps) {
  const items = view.state.inventory.filter((item) => item.charges);
  if (items.length === 0) return null;
  return (
    <section className="section" aria-labelledby="charges-heading">
      <div className="section-head">
        <h2 id="charges-heading" className="section-title">
          Item charges
        </h2>
      </div>
      <div>
        {items.map((item) => {
          const charges = item.charges!;
          return (
            <div key={item.id} className="tracker">
              <span className="tracker-name" style={{ cursor: 'default' }}>
                {A.itemName(item)}
                <small>
                  {charges.recharge === 'none'
                    ? "Doesn't recharge"
                    : `Recharges ${charges.rechargeAmount || 'fully'} ${charges.recharge === 'dawn' ? 'at dawn' : charges.recharge === 'short' ? 'on a short or long rest' : 'on a long rest'}`}
                </small>
              </span>
              <div className="tracker-controls">
                <button type="button" className="icon-btn" aria-label={`Use a charge of ${A.itemName(item)}`} disabled={charges.current <= 0} onClick={() => act(A.useCharges(item, -1))}>
                  −
                </button>
                <span className="tracker-value">
                  {charges.current}
                  <span className="small muted">/{charges.max}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Regain a charge of ${A.itemName(item)}`}
                  disabled={charges.current >= charges.max}
                  onClick={() => act(A.useCharges(item, 1))}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
