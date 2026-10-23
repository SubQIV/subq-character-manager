import { useState, type JSX } from 'react';
import * as A from '../../model/actions';
import { itemIsActive } from '../../model/derive';
import type { Item } from '../../model/types';
import { ConfirmButton, Sheet, type TabProps } from '../common';
import { Currencies } from '../play/Trackers';
import { CalcSheet } from '../stats/CalcSheet';
import { ItemEditor } from './ItemEditor';

function itemMeta(item: Item): string {
  const bits: string[] = [];
  if (item.quantity !== 1) bits.push(`×${item.quantity}`);
  if (item.weight) bits.push(`${item.weight} lb${item.quantity !== 1 ? ' each' : ''}`);
  if (item.armor) bits.push(item.armor.kind === 'shield' ? `shield +${item.armor.base}` : `${item.armor.kind} armor, AC ${item.armor.base}`);
  if (item.weapon) bits.push(`${item.weapon.damage} ${item.weapon.damageType}`.trim());
  if (item.magic?.requiresAttunement) bits.push(item.magic.attuned ? 'attuned' : 'needs attunement');
  if (item.charges) bits.push(`${item.charges.current}/${item.charges.max} charges`);
  if (item.magic && !item.magic.identified) bits.push('unidentified');
  return bits.join(', ');
}

export function GearTab(props: TabProps) {
  const { view, act } = props;
  const { state, derived } = view;
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [calc, setCalc] = useState<'carried' | 'capacity' | 'attunement' | null>(null);
  const item = open ? state.inventory.find((i) => i.id === open) ?? null : null;
  const containerIds = new Set(state.inventory.filter((i) => i.isContainer).map((i) => i.id));
  const topLevel = state.inventory.filter((i) => !i.containerId || !containerIds.has(i.containerId));
  const contents = (container: Item) => state.inventory.filter((i) => i.containerId === container.id);
  const over = derived.carry.carried.value > derived.carry.capacity.value;
  const overAttuned = derived.attunement.used > derived.attunement.slots.value;

  const row = (entry: Item, depth = 0) => (
    <li key={entry.id}>
      <button
        type="button"
        className="line"
        style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', paddingLeft: `calc(${depth} * var(--space-5))` }}
        onClick={() => setOpen(entry.id)}
      >
        <span className="line-main">
          <strong style={{ fontWeight: 650 }}>{A.itemName(entry)}</strong>
          {itemMeta(entry) && (
            <>
              <br />
              <span className="small muted">{itemMeta(entry)}</span>
            </>
          )}
        </span>
        {entry.equipped && <span className="chip is-on" style={{ minHeight: 28, cursor: 'inherit' }}>Equipped</span>}
      </button>
    </li>
  );

  /** An item and, for containers, everything inside it, however deep. */
  const rows = (entry: Item, depth: number, seen: Set<string>): JSX.Element[] => {
    if (seen.has(entry.id)) return [];
    seen.add(entry.id);
    const inner = entry.isContainer ? contents(entry).flatMap((child) => rows(child, depth + 1, seen)) : [];
    return [row(entry, depth), ...inner];
  };

  return (
    <div className="stack">
      <Currencies {...props} />

      <section className="section" aria-labelledby="gear-heading">
        <div className="section-head">
          <h2 id="gear-heading" className="section-title">
            Inventory
          </h2>
          <button type="button" className="btn btn-small" onClick={() => setEditing('new')}>
            Add item
          </button>
        </div>
        <div className="grid-3">
          <button type="button" className="box" onClick={() => setCalc('carried')} style={over ? { borderColor: 'var(--blood)' } : undefined}>
            <span className="box-label">Carried</span>
            <span className="box-value" style={{ fontSize: '1.25rem' }}>
              {derived.carry.carried.value} lb
            </span>
          </button>
          <button type="button" className="box" onClick={() => setCalc('capacity')}>
            <span className="box-label">Capacity</span>
            <span className="box-value" style={{ fontSize: '1.25rem' }}>
              {derived.carry.capacity.value} lb
            </span>
          </button>
          <button type="button" className="box" onClick={() => setCalc('attunement')} style={overAttuned ? { borderColor: 'var(--blood)' } : undefined}>
            <span className="box-label">Attunement</span>
            <span className="box-value" style={{ fontSize: '1.25rem' }}>
              {derived.attunement.used}/{derived.attunement.slots.value}
            </span>
          </button>
        </div>
        {topLevel.length === 0 ? (
          <p className="empty">Nothing carried yet. Add weapons, armor, magic items and everything else here.</p>
        ) : (
          <ul className="list">{topLevel.flatMap((entry) => rows(entry, 0, new Set()))}</ul>
        )}
      </section>

      <Sheet open={item !== null} title={item ? A.itemName(item) : ''} onClose={() => setOpen(null)}>
        {item && (
          <ItemDetail
            item={item}
            {...props}
            onEdit={() => {
              setEditing(item);
              setOpen(null);
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </Sheet>
      <Sheet open={editing !== null} title={editing === 'new' ? 'Add an item' : `Edit ${editing ? editing.name : ''}`} onClose={() => setEditing(null)}>
        {editing !== null && <ItemEditor item={editing === 'new' ? null : editing} edition={state.edition} act={act} onDone={() => setEditing(null)} />}
      </Sheet>
      <CalcSheet
        open={calc === 'carried' || calc === 'capacity'}
        calc={calc === 'carried' ? derived.carry.carried : calc === 'capacity' ? derived.carry.capacity : null}
        onClose={() => setCalc(null)}
        act={act}
        signedValues={false}
        allowOverride={calc === 'capacity'}
      />
      <CalcSheet open={calc === 'attunement'} calc={derived.attunement.slots} onClose={() => setCalc(null)} act={act} signedValues={false}>
        <p style={{ margin: 0 }}>
          Attuned to {derived.attunement.used} of {derived.attunement.slots.value}:{' '}
          {state.inventory.filter((i) => i.magic?.attuned).map((i) => A.itemName(i)).join(', ') || 'nothing yet'}.
        </p>
      </CalcSheet>
    </div>
  );
}

function ItemDetail({ item, view, act, onEdit, onClose }: TabProps & { item: Item; onEdit: () => void; onClose: () => void }) {
  const { state } = view;
  const containers = state.inventory.filter((other) => other.isContainer && other.id !== item.id);
  const active = itemIsActive(item);
  const description = item.magic && !item.magic.identified ? item.magic.unidentifiedDescription : item.description;
  return (
    <>
      {description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{description}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        {[itemMeta(item), item.value, item.magic?.rarity].filter(Boolean).join(', ')}
      </p>
      {item.modifiers.length > 0 && (
        <p className="small" style={{ margin: 0 }}>
          {active ? 'Bonuses active.' : item.magic?.requiresAttunement && !item.magic.attuned ? 'Bonuses apply once equipped and attuned.' : 'Bonuses apply once equipped.'}
        </p>
      )}
      <div className="grid-2">
        <button type="button" className={`btn ${item.equipped ? 'btn-primary' : ''}`} aria-pressed={item.equipped} onClick={() => act(A.setEquipped(state, item, !item.equipped))}>
          {item.equipped ? 'Equipped' : 'Equip'}
        </button>
        {item.magic?.requiresAttunement && (
          <button type="button" className={`btn ${item.magic.attuned ? 'btn-primary' : ''}`} aria-pressed={item.magic.attuned} onClick={() => act(A.setAttuned(state, item, !item.magic!.attuned))}>
            {item.magic.attuned ? 'Attuned' : 'Attune'}
          </button>
        )}
        {item.magic && !item.magic.identified && (
          <button type="button" className="btn" onClick={() => act(A.identifyItem(item))}>
            Identify
          </button>
        )}
        {item.quantity > 0 && !item.isContainer && (
          <button type="button" className="btn" onClick={() => act(A.adjustQuantity(item, -1))}>
            Use one ({item.quantity} left)
          </button>
        )}
      </div>
      {item.charges && (
        <div className="spread">
          <span>
            Charges <span className="number">{item.charges.current}</span>
            <span className="muted">/{item.charges.max}</span>
          </span>
          <div className="tracker-controls">
            <button type="button" className="icon-btn" aria-label="Use a charge" disabled={item.charges.current <= 0} onClick={() => act(A.useCharges(item, -1))}>
              −
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Regain a charge"
              disabled={item.charges.current >= item.charges.max}
              onClick={() => act(A.useCharges(item, 1))}
            >
              +
            </button>
          </div>
        </div>
      )}
      {!item.isContainer && containers.length > 0 && (
        <label className="field">
          <span>Kept in</span>
          <select
            className="select"
            value={item.containerId ?? ''}
            onChange={(event) => act(A.moveItem(item, containers.find((c) => c.id === event.target.value) ?? null))}
          >
            <option value="">Carried loose</option>
            {containers.map((container) => (
              <option key={container.id} value={container.id}>
                {A.itemName(container)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid-2">
        <button type="button" className="btn" onClick={onEdit}>
          Edit item
        </button>
        <ConfirmButton
          label="Remove"
          confirmLabel="Tap again to remove"
          onConfirm={() => {
            act(A.removeItem(state, item));
            onClose();
          }}
        />
      </div>
    </>
  );
}
