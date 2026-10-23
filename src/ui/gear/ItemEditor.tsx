import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as A from '../../model/actions';
import { blankArmor, blankCharges, blankMagic, blankWeapon, uid } from '../../model/factory';
import type { ArmorInfo, Charges, Edition, Item, MagicInfo, ModTarget, Modifier, WeaponInfo } from '../../model/types';
import { toInt, type TabProps } from '../common';
import { TARGET_GROUPS } from '../stats/Bonuses';

/** A whole number from a text box, or the fallback when blank or not a number. */
const num = (text: string, fallback: number) => toInt(text) ?? fallback;
/** A decimal (weights like 0.5 lb). */
const dec = (text: string, fallback: number) => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) ? value : fallback;
};

function Section({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <fieldset className="stack-tight" style={{ border: 0, borderTop: '1px solid var(--rule)', padding: 'var(--space-3) 0 0', margin: 0 }}>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(event) => onToggle(event.target.checked)} />
        <strong>{label}</strong>
      </label>
      {on && children}
    </fieldset>
  );
}

export function ItemEditor({ item, edition, act, onDone }: { item: Item | null; edition: Edition; act: TabProps['act']; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [weight, setWeight] = useState(item?.weight ? String(item.weight) : '');
  const [value, setValue] = useState(item?.value ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [isContainer, setIsContainer] = useState(item?.isContainer ?? false);
  const [ignoreContents, setIgnoreContents] = useState(item?.ignoreContentsWeight ?? false);
  const [weapon, setWeapon] = useState<WeaponInfo | null>(item?.weapon ?? null);
  const [armor, setArmor] = useState<ArmorInfo | null>(item?.armor ?? null);
  const [magic, setMagic] = useState<MagicInfo | null>(item?.magic ?? null);
  const [charges, setCharges] = useState<Charges | null>(item?.charges ?? null);
  const [mods, setMods] = useState<Modifier[]>(item?.modifiers ?? []);
  const [text, setText] = useState<Record<string, string>>({
    armorBase: String(item?.armor?.base ?? 11),
    armorCap: item?.armor?.dexCap === null || item?.armor?.dexCap === undefined ? '' : String(item.armor.dexCap),
    armorStr: item?.armor?.strengthRequired ? String(item.armor.strengthRequired) : '',
    magicBonus: String(item?.weapon?.magicBonus ?? 0),
    chargesMax: String(item?.charges?.max ?? 3),
    chargesNow: String(item?.charges?.current ?? 3),
  });
  const field = (key: string) => ({ value: text[key], onChange: (event: ChangeEvent<HTMLInputElement>) => setText({ ...text, [key]: event.target.value }) });

  const valid = name.trim() !== '' && toInt(quantity) !== null && toInt(quantity)! >= 0;

  const save = () => {
    if (!valid) return;
    const fields: Omit<Item, 'id' | 'equipped' | 'containerId' | 'packRef'> = {
      name: name.trim(),
      quantity: num(quantity, 1),
      weight: Math.max(0, dec(weight, 0)),
      value: value.trim(),
      description: description.trim(),
      isContainer,
      ignoreContentsWeight: isContainer && ignoreContents,
      weapon: weapon ? { ...weapon, magicBonus: num(text.magicBonus, 0) } : null,
      armor: armor
        ? {
            ...armor,
            base: num(text.armorBase, armor.kind === 'shield' ? 2 : 11),
            dexCap: armor.kind === 'medium' ? (text.armorCap.trim() === '' ? 2 : num(text.armorCap, 2)) : armor.kind === 'light' ? null : 0,
            strengthRequired: text.armorStr.trim() === '' ? null : num(text.armorStr, 0) || null,
          }
        : null,
      magic,
      charges: charges
        ? { ...charges, max: Math.max(1, num(text.chargesMax, 1)), current: Math.min(Math.max(1, num(text.chargesMax, 1)), Math.max(0, num(text.chargesNow, 0))) }
        : null,
      modifiers: mods.filter((mod) => mod.value !== 0 || mod.mode === 'atLeast'),
    };
    if (item) {
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([key, v]) => JSON.stringify(item[key as keyof Item]) !== JSON.stringify(v)),
      ) as Partial<Item>;
      if (Object.keys(changed).length) act(A.updateItem(item, changed));
    } else {
      act(A.addItem(fields));
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
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus={!item} placeholder="e.g. Longsword" />
      </label>
      <div className="grid-3">
        <label className="field">
          <span>Quantity</span>
          <input className="input input-number" type="number" inputMode="numeric" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="field">
          <span>Weight, lb each</span>
          <input className="input input-number" type="number" inputMode="decimal" min={0} step="any" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="0" />
        </label>
        <label className="field">
          <span>Value</span>
          <input className="input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. 15 gp" />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} style={{ minHeight: 80 }} />
      </label>

      <Section label="It holds other items" on={isContainer} onToggle={setIsContainer}>
        <label className="check">
          <input type="checkbox" checked={ignoreContents} onChange={(event) => setIgnoreContents(event.target.checked)} />
          What's inside doesn't count toward carried weight, like a bag of holding
        </label>
      </Section>

      <Section label="Weapon" on={weapon !== null} onToggle={(on) => setWeapon(on ? item?.weapon ?? blankWeapon() : null)}>
        {weapon && (
          <>
            <div className="grid-3">
              <label className="field">
                <span>Damage</span>
                <input className="input" value={weapon.damage} onChange={(event) => setWeapon({ ...weapon, damage: event.target.value })} placeholder="1d8" />
              </label>
              <label className="field">
                <span>Damage type</span>
                <input className="input" value={weapon.damageType} onChange={(event) => setWeapon({ ...weapon, damageType: event.target.value })} placeholder="slashing" />
              </label>
              <label className="field">
                <span>Two-handed</span>
                <input className="input" value={weapon.versatile} onChange={(event) => setWeapon({ ...weapon, versatile: event.target.value })} placeholder="If versatile" />
              </label>
            </div>
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={weapon.proficient} onChange={(event) => setWeapon({ ...weapon, proficient: event.target.checked })} /> Proficient
              </label>
              <label className="check">
                <input type="checkbox" checked={weapon.finesse} onChange={(event) => setWeapon({ ...weapon, finesse: event.target.checked })} /> Finesse
              </label>
              <label className="check">
                <input type="checkbox" checked={weapon.ranged} onChange={(event) => setWeapon({ ...weapon, ranged: event.target.checked })} /> Ranged
              </label>
            </div>
            <div className="grid-3">
              <label className="field">
                <span>Magic bonus</span>
                <input className="input input-number" type="number" inputMode="numeric" {...field('magicBonus')} />
              </label>
              <label className="field">
                <span>Range</span>
                <input className="input" value={weapon.range} onChange={(event) => setWeapon({ ...weapon, range: event.target.value })} placeholder="80/320" />
              </label>
              <label className="field">
                <span>{edition === '2024' ? 'Mastery' : 'Mastery (2024)'}</span>
                <input className="input" value={weapon.mastery} onChange={(event) => setWeapon({ ...weapon, mastery: event.target.value })} placeholder="e.g. Sap" />
              </label>
            </div>
            <label className="field">
              <span>Other properties</span>
              <input className="input" value={weapon.properties} onChange={(event) => setWeapon({ ...weapon, properties: event.target.value })} placeholder="e.g. Light, Thrown" />
            </label>
          </>
        )}
      </Section>

      <Section label="Armor or shield" on={armor !== null} onToggle={(on) => setArmor(on ? item?.armor ?? blankArmor() : null)}>
        {armor && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>Kind</span>
                <select
                  className="select"
                  value={armor.kind}
                  onChange={(event) => {
                    const kind = event.target.value as ArmorInfo['kind'];
                    setArmor({ ...armor, kind });
                    if (kind === 'shield' && text.armorBase === '11') setText({ ...text, armorBase: '2' });
                  }}
                >
                  <option value="light">Light armor</option>
                  <option value="medium">Medium armor</option>
                  <option value="heavy">Heavy armor</option>
                  <option value="shield">Shield</option>
                </select>
              </label>
              <label className="field">
                <span>{armor.kind === 'shield' ? 'AC bonus' : 'Base AC'}</span>
                <input className="input input-number" type="number" inputMode="numeric" {...field('armorBase')} />
              </label>
            </div>
            {armor.kind === 'medium' && (
              <label className="field">
                <span>Dexterity cap</span>
                <input className="input input-number" type="number" inputMode="numeric" placeholder="2" {...field('armorCap')} />
              </label>
            )}
            {armor.kind === 'heavy' && (
              <label className="field">
                <span>Strength needed</span>
                <input className="input input-number" type="number" inputMode="numeric" placeholder="None" {...field('armorStr')} />
              </label>
            )}
            {armor.kind !== 'shield' && (
              <label className="check">
                <input type="checkbox" checked={armor.stealthDisadvantage} onChange={(event) => setArmor({ ...armor, stealthDisadvantage: event.target.checked })} />
                Disadvantage on Stealth
              </label>
            )}
            <p className="small muted" style={{ margin: 0 }}>
              While equipped, this replaces unarmored AC.
            </p>
          </>
        )}
      </Section>

      <Section label="Magic item" on={magic !== null} onToggle={(on) => setMagic(on ? item?.magic ?? blankMagic() : null)}>
        {magic && (
          <>
            <label className="field">
              <span>Rarity</span>
              <select className="select" value={magic.rarity} onChange={(event) => setMagic({ ...magic, rarity: event.target.value })}>
                <option value="">Not set</option>
                {['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'].map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity[0].toUpperCase() + rarity.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={magic.requiresAttunement} onChange={(event) => setMagic({ ...magic, requiresAttunement: event.target.checked, attuned: event.target.checked && magic.attuned })} />
              Requires attunement
            </label>
            <label className="check">
              <input type="checkbox" checked={!magic.identified} onChange={(event) => setMagic({ ...magic, identified: !event.target.checked })} />
              Not identified yet
            </label>
            {!magic.identified && (
              <>
                <label className="field">
                  <span>What it looks like until identified</span>
                  <input className="input" value={magic.unidentifiedName} onChange={(event) => setMagic({ ...magic, unidentifiedName: event.target.value })} placeholder="e.g. Strange silver ring" />
                </label>
                <label className="field">
                  <span>Description until identified</span>
                  <textarea className="textarea" style={{ minHeight: 60 }} value={magic.unidentifiedDescription} onChange={(event) => setMagic({ ...magic, unidentifiedDescription: event.target.value })} />
                </label>
              </>
            )}
          </>
        )}
      </Section>

      <Section label="Has charges" on={charges !== null} onToggle={(on) => setCharges(on ? item?.charges ?? blankCharges() : null)}>
        {charges && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>Maximum</span>
                <input className="input input-number" type="number" inputMode="numeric" min={1} {...field('chargesMax')} />
              </label>
              <label className="field">
                <span>Current</span>
                <input className="input input-number" type="number" inputMode="numeric" min={0} {...field('chargesNow')} />
              </label>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Recharges</span>
                <select className="select" value={charges.recharge} onChange={(event) => setCharges({ ...charges, recharge: event.target.value as Charges['recharge'] })}>
                  <option value="dawn">At dawn</option>
                  <option value="short">On a short or long rest</option>
                  <option value="long">On a long rest</option>
                  <option value="none">Never</option>
                </select>
              </label>
              <label className="field">
                <span>How many come back</span>
                <input className="input" value={charges.rechargeAmount} onChange={(event) => setCharges({ ...charges, rechargeAmount: event.target.value })} placeholder="All" disabled={charges.recharge === 'none'} />
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Leave blank to refill completely, enter a number, or a roll like 1d6+1. Rolls are entered when the recharge happens.
            </p>
          </>
        )}
      </Section>

      <fieldset className="stack-tight" style={{ border: 0, borderTop: '1px solid var(--rule)', padding: 'var(--space-3) 0 0', margin: 0 }}>
        <strong>Bonuses while {magic?.requiresAttunement ? 'equipped and attuned' : 'equipped'}</strong>
        {mods.map((mod, index) => (
          <div key={mod.id} className="grid-3" style={{ alignItems: 'end' }}>
            <label className="field" style={{ gridColumn: '1 / span 2' }}>
              <span>Applies to</span>
              <select className="select" value={mod.target} onChange={(event) => setMods(mods.map((m, i) => (i === index ? { ...m, target: event.target.value as ModTarget } : m)))}>
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
            <label className="field">
              <span>Amount</span>
              <input
                className="input input-number"
                type="number"
                inputMode="numeric"
                value={String(mod.value)}
                onChange={(event) => setMods(mods.map((m, i) => (i === index ? { ...m, value: toInt(event.target.value) ?? 0 } : m)))}
              />
            </label>
            <label className="field" style={{ gridColumn: '1 / span 2' }}>
              <span>Doesn't stack with (optional)</span>
              <input className="input" value={mod.stack} onChange={(event) => setMods(mods.map((m, i) => (i === index ? { ...m, stack: event.target.value.trim().toLowerCase() } : m)))} />
            </label>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setMods(mods.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small"
          style={{ justifySelf: 'start' }}
          onClick={() => setMods([...mods, { id: uid(), source: '', target: 'ac', mode: 'add', value: 1, stack: '', enabled: true }])}
        >
          Add a bonus
        </button>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={!valid}>
        {item ? 'Save changes' : 'Add item'}
      </button>
    </form>
  );
}
