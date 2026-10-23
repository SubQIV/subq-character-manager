// Actions turn what the player does into a change plus a plain-language label
// for the history, e.g. "Damage 7: HP 32 → 25".

import { preview, type Change, type Path } from './changes';
import { abilityMod, derive, signed, type Derived } from './derive';
import { newItem, newTracker, uid } from './factory';
import {
  ABILITY_NAMES,
  HIT_DICE,
  SKILLS,
  type AcFormula,
  type Ability,
  type ActiveCondition,
  type Charges,
  type Item,
  type Note,
  type CharacterState,
  type ClassLevel,
  type HitDie,
  type Modifier,
  type Proficiency,
  type SkillId,
  type StatKey,
  type Tracker,
} from './types';

export interface Action {
  change: Change;
  label: string;
  scope: string[];
  milestone?: boolean;
}

const trackerPath = (id: string, field: keyof Tracker): Path => ['trackers', { id }, field];

function hpText(state: CharacterState): string {
  return state.hp.temp > 0 ? `${state.hp.current} (+${state.hp.temp} temp)` : String(state.hp.current);
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

export function damage(state: CharacterState, amount: number): Action {
  const change: Change = { t: 'damage', amount };
  const after = preview(state, change);
  const extra = after.deathSaves.failures > state.deathSaves.failures ? ', death save failed' : '';
  return { change, label: `Damage ${amount}: HP ${hpText(state)} → ${hpText(after)}${extra}`, scope: ['hp'] };
}

export function heal(state: CharacterState, amount: number): Action {
  const change: Change = { t: 'heal', amount };
  const after = preview(state, change);
  return { change, label: `Healed ${amount}: HP ${state.hp.current} → ${after.hp.current}`, scope: ['hp'] };
}

export function setTempHp(state: CharacterState, amount: number): Action {
  return {
    change: { t: 'set', path: ['hp', 'temp'], value: Math.max(0, amount) },
    label: `Temporary HP ${state.hp.temp} → ${Math.max(0, amount)}`,
    scope: ['hp'],
  };
}

export function setMaxHp(state: CharacterState, max: number): Action {
  return {
    change: { t: 'set', path: ['hp', 'max'], value: Math.max(1, max) },
    label: `Hit point maximum ${state.hp.max} → ${Math.max(1, max)}`,
    scope: ['hp', 'stats'],
  };
}

export function deathSave(state: CharacterState, kind: 'successes' | 'failures', delta: number): Action {
  const now = state.deathSaves[kind];
  const next = Math.min(3, Math.max(0, now + delta));
  const word = kind === 'successes' ? 'successes' : 'failures';
  return {
    change: { t: 'add', path: ['deathSaves', kind], delta, min: 0, max: 3 },
    label: `Death save ${word} ${now} → ${next}`,
    scope: ['hp', 'deathSaves'],
  };
}

export function toggleInspiration(state: CharacterState): Action {
  const name = state.edition === '2024' ? 'Heroic Inspiration' : 'Inspiration';
  return {
    change: { t: 'set', path: ['inspiration'], value: !state.inspiration },
    label: state.inspiration ? `${name} used` : `${name} gained`,
    scope: ['inspiration'],
  };
}

// ---------------------------------------------------------------------------
// Trackers, coins and custom resources
// ---------------------------------------------------------------------------

export function adjustTracker(tracker: Tracker, delta: number): Action {
  const next = Math.min(tracker.max ?? Infinity, Math.max(tracker.min, tracker.value + delta));
  return {
    change: { t: 'add', path: trackerPath(tracker.id, 'value'), delta, min: tracker.min, max: trackerPath(tracker.id, 'max') },
    label: `${tracker.name} ${signed(delta)} (${tracker.value} → ${next})`,
    scope: [`tracker:${tracker.id}`],
  };
}

export function setTrackerValue(tracker: Tracker, value: number): Action {
  const next = Math.min(tracker.max ?? Infinity, Math.max(tracker.min, value));
  return {
    change: { t: 'set', path: trackerPath(tracker.id, 'value'), value: next },
    label: `${tracker.name} set to ${next} (was ${tracker.value})`,
    scope: [`tracker:${tracker.id}`],
  };
}

export function addTracker(fields: Partial<Tracker> & Pick<Tracker, 'name'>): Action {
  const tracker = newTracker(fields);
  return {
    change: { t: 'insert', path: ['trackers'], item: tracker },
    label: `Added ${tracker.kind === 'currency' ? 'currency' : 'tracker'} ${tracker.name}`,
    scope: [`tracker:${tracker.id}`, 'trackers'],
  };
}

export function updateTracker(tracker: Tracker, fields: Partial<Omit<Tracker, 'id'>>): Action {
  const changes: Change[] = Object.entries(fields).map(([key, value]) => ({
    t: 'set',
    path: trackerPath(tracker.id, key as keyof Tracker),
    value,
  }));
  return {
    change: { t: 'batch', changes },
    label: `Edited ${fields.name && fields.name !== tracker.name ? `${tracker.name} (now ${fields.name})` : tracker.name}`,
    scope: [`tracker:${tracker.id}`, 'trackers'],
  };
}

export function removeTracker(tracker: Tracker): Action {
  return {
    change: { t: 'remove', path: ['trackers'], id: tracker.id },
    label: `Removed ${tracker.name}`,
    scope: [`tracker:${tracker.id}`, 'trackers'],
  };
}

// ---------------------------------------------------------------------------
// Spell slots
// ---------------------------------------------------------------------------

export function useSlot(state: CharacterState, level: number, delta: number): Action {
  const slot = state.spellSlots[level];
  const used = Math.min(slot.max, Math.max(0, slot.used + delta));
  const left = slot.max - used;
  return {
    change: { t: 'add', path: ['spellSlots', level, 'used'], delta, min: 0, max: ['spellSlots', level, 'max'] },
    label: delta > 0 ? `Used a level ${level} slot (${left} of ${slot.max} left)` : `Regained a level ${level} slot (${left} of ${slot.max} left)`,
    scope: ['slots'],
  };
}

export function setSlotMax(state: CharacterState, level: number, max: number): Action {
  const value = Math.max(0, Math.min(9, max));
  return {
    change: {
      t: 'batch',
      changes: [
        { t: 'set', path: ['spellSlots', level, 'max'], value },
        { t: 'set', path: ['spellSlots', level, 'used'], value: Math.min(state.spellSlots[level].used, value) },
      ],
    },
    label: `Level ${level} slots ${state.spellSlots[level].max} → ${value}`,
    scope: ['slots', 'stats'],
  };
}

export function usePact(state: CharacterState, delta: number): Action {
  const used = Math.min(state.pact.max, Math.max(0, state.pact.used + delta));
  return {
    change: { t: 'add', path: ['pact', 'used'], delta, min: 0, max: ['pact', 'max'] },
    label: `${delta > 0 ? 'Used' : 'Regained'} a pact slot (${state.pact.max - used} of ${state.pact.max} left)`,
    scope: ['slots'],
  };
}

export function setPact(state: CharacterState, max: number, level: number): Action {
  return {
    change: {
      t: 'batch',
      changes: [
        { t: 'set', path: ['pact', 'max'], value: Math.max(0, max) },
        { t: 'set', path: ['pact', 'level'], value: Math.max(0, Math.min(9, level)) },
        { t: 'set', path: ['pact', 'used'], value: Math.min(state.pact.used, Math.max(0, max)) },
      ],
    },
    label: `Pact slots set to ${max} at level ${level}`,
    scope: ['slots', 'stats'],
  };
}

// ---------------------------------------------------------------------------
// Conditions and exhaustion
// ---------------------------------------------------------------------------

export function addCondition(conditionKey: string, name: string): Action {
  const item: ActiveCondition = { id: uid(), conditionId: conditionKey, note: '' };
  return {
    change: { t: 'insert', path: ['conditions'], item },
    label: `${name} applied`,
    scope: ['conditions'],
  };
}

export function removeCondition(id: string, name: string): Action {
  return { change: { t: 'remove', path: ['conditions'], id }, label: `${name} removed`, scope: ['conditions'] };
}

export function changeExhaustion(state: CharacterState, delta: number): Action {
  const next = Math.min(6, Math.max(0, state.exhaustion + delta));
  return {
    change: { t: 'add', path: ['exhaustion'], delta, min: 0, max: 6 },
    label: `Exhaustion ${state.exhaustion} → ${next}`,
    scope: ['exhaustion', 'conditions'],
  };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const itemPath = (id: string, ...rest: (string | number)[]): Path => ['inventory', { id }, ...rest];

/** The name to show: unidentified magic items show their placeholder name. */
export function itemName(item: Item): string {
  if (item.magic && !item.magic.identified) return item.magic.unidentifiedName || 'Unidentified item';
  return item.name;
}

function acChange(state: CharacterState, change: Change): string {
  const before = derive(state).ac.value;
  const after = derive(preview(state, change)).ac.value;
  return before === after ? '' : ` (AC ${before} → ${after})`;
}

export function addItem(fields: Partial<Item> & Pick<Item, 'name'>): Action {
  const item = newItem(fields);
  return {
    change: { t: 'insert', path: ['inventory'], item },
    label: `Added ${itemName(item)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function updateItem(item: Item, fields: Partial<Omit<Item, 'id'>>): Action {
  const changes: Change[] = Object.entries(fields).map(([key, value]) => ({ t: 'set', path: itemPath(item.id, key), value }));
  return {
    change: { t: 'batch', changes },
    label: `Edited ${fields.name && fields.name !== item.name ? `${item.name} (now ${fields.name})` : itemName(item)}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function removeItem(state: CharacterState, item: Item): Action {
  const changes: Change[] = state.inventory
    .filter((other) => other.containerId === item.id)
    .map((other) => ({ t: 'set', path: itemPath(other.id, 'containerId'), value: null }));
  changes.push({ t: 'remove', path: ['inventory'], id: item.id });
  const freed = changes.length - 1;
  return {
    change: { t: 'batch', changes },
    label: `Removed ${itemName(item)}${freed ? ` (its ${freed} item${freed === 1 ? '' : 's'} moved out)` : ''}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function setEquipped(state: CharacterState, item: Item, equipped: boolean): Action {
  const change: Change = { t: 'set', path: itemPath(item.id, 'equipped'), value: equipped };
  return {
    change,
    label: `${equipped ? 'Equipped' : 'Unequipped'} ${itemName(item)}${acChange(state, change)}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function setAttuned(state: CharacterState, item: Item, attuned: boolean): Action {
  const change: Change = { t: 'set', path: itemPath(item.id, 'magic', 'attuned'), value: attuned };
  return {
    change,
    label: `${attuned ? 'Attuned to' : 'Ended attunement to'} ${itemName(item)}${acChange(state, change)}`,
    scope: ['inventory', `item:${item.id}`, 'attunement'],
  };
}

export function adjustQuantity(item: Item, delta: number): Action {
  const next = Math.max(0, item.quantity + delta);
  return {
    change: { t: 'add', path: itemPath(item.id, 'quantity'), delta, min: 0 },
    label: delta < 0 ? `Used ${-delta} ${itemName(item)} (${next} left)` : `${itemName(item)} ×${item.quantity} → ×${next}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function useCharges(item: Item, delta: number): Action {
  const charges = item.charges!;
  const next = Math.min(charges.max, Math.max(0, charges.current + delta));
  return {
    change: { t: 'add', path: itemPath(item.id, 'charges', 'current'), delta, min: 0, max: itemPath(item.id, 'charges', 'max') },
    label: `${itemName(item)}: ${charges.current} → ${next} charges`,
    scope: ['inventory', `item:${item.id}`, 'charges'],
  };
}

export function identifyItem(item: Item): Action {
  return {
    change: { t: 'set', path: itemPath(item.id, 'magic', 'identified'), value: true },
    label: `Identified ${itemName(item)} as ${item.name}`,
    scope: ['inventory', `item:${item.id}`],
  };
}

export function moveItem(item: Item, container: Item | null): Action {
  return {
    change: { t: 'set', path: itemPath(item.id, 'containerId'), value: container?.id ?? null },
    label: container ? `Put ${itemName(item)} in ${itemName(container)}` : `Took ${itemName(item)} out`,
    scope: ['inventory', `item:${item.id}`],
  };
}

/** How a recharge amount is read: blank or "all" refills, a number adds that many, anything else is rolled at the table. */
export function rechargeKind(amount: string): { kind: 'all' } | { kind: 'fixed'; value: number } | { kind: 'roll'; formula: string } {
  const text = amount.trim();
  if (!text || text.toLowerCase() === 'all') return { kind: 'all' };
  if (/^\d+$/.test(text)) return { kind: 'fixed', value: parseInt(text, 10) };
  return { kind: 'roll', formula: text };
}

export function itemsRecharging(state: CharacterState, rules: Charges['recharge'][]): Item[] {
  return state.inventory.filter((item) => item.charges && rules.includes(item.charges.recharge) && item.charges.current < item.charges.max);
}

/** Items that need a roll entered before they can recharge. */
export function rechargeRollsNeeded(state: CharacterState, rules: Charges['recharge'][]): Item[] {
  return itemsRecharging(state, rules).filter((item) => rechargeKind(item.charges!.rechargeAmount).kind === 'roll');
}

function rechargeChanges(state: CharacterState, rules: Charges['recharge'][], rolls: Record<string, number>): { changes: Change[]; names: string[] } {
  const changes: Change[] = [];
  const names: string[] = [];
  for (const item of itemsRecharging(state, rules)) {
    const charges = item.charges!;
    const how = rechargeKind(charges.rechargeAmount);
    const amount = how.kind === 'all' ? charges.max - charges.current : how.kind === 'fixed' ? how.value : rolls[item.id];
    if (amount === undefined || amount <= 0) continue;
    changes.push({ t: 'add', path: itemPath(item.id, 'charges', 'current'), delta: amount, min: 0, max: itemPath(item.id, 'charges', 'max') });
    names.push(`${itemName(item)} +${Math.min(amount, charges.max - charges.current)} charges`);
  }
  return { changes, names };
}

// ---------------------------------------------------------------------------
// Rests
// ---------------------------------------------------------------------------

function resetTrackers(state: CharacterState, rules: Tracker['reset'][]): { changes: Change[]; names: string[] } {
  const changes: Change[] = [];
  const names: string[] = [];
  for (const tracker of state.trackers) {
    if (!rules.includes(tracker.reset)) continue;
    const target = tracker.resetTo === 'max' ? tracker.max : tracker.min;
    if (target === null || target === tracker.value) continue;
    changes.push({ t: 'set', path: trackerPath(tracker.id, 'value'), value: target });
    names.push(tracker.name);
  }
  return { changes, names };
}

export interface HitDieRoll {
  die: HitDie;
  rolled: number;
}

/** Rolled recharge amounts for items whose recharge is a dice formula, by item id. */
export type RechargeRolls = Record<string, number>;

const itemScopes = (state: CharacterState) => state.inventory.filter((item) => item.charges).map((item) => `item:${item.id}`);

export function shortRest(state: CharacterState, rolls: HitDieRoll[], recharges: RechargeRolls = {}): Action {
  const con = abilityMod(derive(state).abilities.con.score.value);
  const changes: Change[] = [];
  const parts: string[] = [];
  let healing = 0;
  for (const roll of rolls) {
    changes.push({ t: 'add', path: ['hitDiceSpent', roll.die], delta: 1 });
    healing += Math.max(0, roll.rolled + con);
  }
  if (healing > 0) changes.push({ t: 'heal', amount: healing });
  if (rolls.length) parts.push(`${rolls.length} hit ${rolls.length === 1 ? 'die' : 'dice'} for ${healing} HP`);
  if (state.pact.used > 0) {
    changes.push({ t: 'set', path: ['pact', 'used'], value: 0 });
    parts.push('pact slots back');
  }
  const reset = resetTrackers(state, ['short']);
  changes.push(...reset.changes);
  if (reset.names.length) parts.push(`reset ${reset.names.join(', ')}`);
  const items = rechargeChanges(state, ['short'], recharges);
  changes.push(...items.changes);
  parts.push(...items.names);
  return {
    change: { t: 'batch', changes },
    label: parts.length ? `Short rest: ${parts.join('; ')}` : 'Short rest',
    scope: ['rest', 'hp', 'slots', ...state.trackers.map((t) => `tracker:${t.id}`), ...itemScopes(state)],
  };
}

export function longRest(state: CharacterState, derived: Derived = derive(state), recharges: RechargeRolls = {}): Action {
  const changes: Change[] = [];
  const parts: string[] = [];
  const max = derived.hpMax.value;
  if (state.hp.current !== max) parts.push(`HP ${state.hp.current} → ${max}`);
  changes.push({ t: 'set', path: ['hp', 'current'], value: max });
  if (state.hp.temp > 0) {
    changes.push({ t: 'set', path: ['hp', 'temp'], value: 0 });
    parts.push('temporary HP cleared');
  }
  changes.push({ t: 'set', path: ['deathSaves'], value: { successes: 0, failures: 0 } });

  // Hit dice: 2024 restores all; 2014 restores up to half your total (at least one), biggest dice first.
  const pools = derived.hitDice;
  const totalDice = pools.reduce((total, pool) => total + pool.total, 0);
  let budget = state.edition === '2024' ? Infinity : Math.max(1, Math.floor(totalDice / 2));
  let regained = 0;
  for (const die of [...HIT_DICE].reverse()) {
    const spent = state.hitDiceSpent[die] ?? 0;
    if (!spent || budget <= 0) continue;
    const back = Math.min(spent, budget);
    budget -= back;
    regained += back;
    changes.push({ t: 'set', path: ['hitDiceSpent', die], value: spent - back });
  }
  if (regained) parts.push(`${regained} hit ${regained === 1 ? 'die' : 'dice'} back`);

  let slotsBack = false;
  state.spellSlots.forEach((slot, level) => {
    if (level > 0 && slot.used > 0) {
      changes.push({ t: 'set', path: ['spellSlots', level, 'used'], value: 0 });
      slotsBack = true;
    }
  });
  if (state.pact.used > 0) {
    changes.push({ t: 'set', path: ['pact', 'used'], value: 0 });
    slotsBack = true;
  }
  if (slotsBack) parts.push('spell slots restored');

  const reset = resetTrackers(state, ['short', 'long']);
  changes.push(...reset.changes);
  if (reset.names.length) parts.push(`reset ${reset.names.join(', ')}`);
  const items = rechargeChanges(state, ['short', 'long'], recharges);
  changes.push(...items.changes);
  parts.push(...items.names);

  if (state.exhaustion > 0) {
    changes.push({ t: 'add', path: ['exhaustion'], delta: -1, min: 0, max: 6 });
    parts.push(`exhaustion ${state.exhaustion} → ${state.exhaustion - 1}`);
  }
  return {
    change: { t: 'batch', changes },
    label: parts.length ? `Long rest: ${parts.join('; ')}` : 'Long rest',
    scope: ['rest', 'hp', 'slots', 'exhaustion', ...state.trackers.map((t) => `tracker:${t.id}`), ...itemScopes(state)],
  };
}

export function dawn(state: CharacterState, recharges: RechargeRolls = {}): Action {
  const reset = resetTrackers(state, ['dawn']);
  const items = rechargeChanges(state, ['dawn'], recharges);
  const parts = [...(reset.names.length ? [`reset ${reset.names.join(', ')}`] : []), ...items.names];
  return {
    change: { t: 'batch', changes: [...reset.changes, ...items.changes] },
    label: parts.length ? `Dawn: ${parts.join('; ')}` : 'Dawn',
    scope: ['rest', ...state.trackers.map((t) => `tracker:${t.id}`), ...itemScopes(state)],
  };
}

// ---------------------------------------------------------------------------
// Stats and details
// ---------------------------------------------------------------------------

export function setText(field: 'name' | 'player' | 'species' | 'background' | 'alignment', before: string, value: string): Action {
  const names = { name: 'Name', player: 'Player', species: 'Species', background: 'Background', alignment: 'Alignment' };
  return {
    change: { t: 'set', path: [field], value },
    label: `${names[field]}: ${before || '(blank)'} → ${value || '(blank)'}`,
    scope: ['identity'],
  };
}

export function setAbility(state: CharacterState, ability: Ability, score: number): Action {
  const value = Math.max(1, Math.min(30, Math.round(score)));
  return {
    change: { t: 'set', path: ['abilities', ability], value },
    label: `${ABILITY_NAMES[ability]} ${state.abilities[ability]} → ${value}`,
    scope: ['stats', `ability:${ability}`],
  };
}

export function toggleSave(state: CharacterState, ability: Ability): Action {
  const now = state.saveProficiency[ability];
  return {
    change: { t: 'set', path: ['saveProficiency', ability], value: !now },
    label: `${ABILITY_NAMES[ability]} save ${now ? 'no longer proficient' : 'proficient'}`,
    scope: ['stats'],
  };
}

const PROF_NAMES: Record<Proficiency, string> = { 0: 'not proficient', 0.5: 'half proficiency', 1: 'proficient', 2: 'expertise' };

export function setSkill(skill: SkillId, before: Proficiency, value: Proficiency): Action {
  const name = SKILLS.find((s) => s.id === skill)?.name ?? skill;
  return {
    change: { t: 'set', path: ['skillProficiency', skill], value },
    label: `${name}: ${PROF_NAMES[before]} → ${PROF_NAMES[value]}`,
    scope: ['stats'],
  };
}

export function setOverride(key: StatKey, label: string, value: number | null, before: number | undefined): Action {
  return {
    change: { t: 'set', path: ['overrides', key], value: value ?? undefined },
    label: value === null ? `${label} override cleared (was ${before})` : `${label} overridden to ${value}`,
    scope: ['stats'],
  };
}

export function setSpeed(state: CharacterState, speed: number): Action {
  return {
    change: { t: 'set', path: ['speed'], value: Math.max(0, speed) },
    label: `Base speed ${state.speed} → ${Math.max(0, speed)} ft`,
    scope: ['stats'],
  };
}

export function setSpellcasting(ability: Ability | null): Action {
  return {
    change: { t: 'set', path: ['spellcastingAbility'], value: ability },
    label: ability ? `Spellcasting ability: ${ABILITY_NAMES[ability]}` : 'Spellcasting ability cleared',
    scope: ['stats'],
  };
}

export function addModifier(fields: Omit<Modifier, 'id'>): Action {
  const mod: Modifier = { id: uid(), ...fields };
  return { change: { t: 'insert', path: ['modifiers'], item: mod }, label: `Added bonus: ${mod.source} ${signed(mod.value)}`, scope: ['modifiers', 'stats'] };
}

export function updateModifier(mod: Modifier, fields: Partial<Omit<Modifier, 'id'>>): Action {
  const changes: Change[] = Object.entries(fields).map(([key, value]) => ({ t: 'set', path: ['modifiers', { id: mod.id }, key], value }));
  const label =
    fields.enabled !== undefined && Object.keys(fields).length === 1
      ? `${fields.enabled ? 'Turned on' : 'Turned off'} bonus: ${mod.source}`
      : `Edited bonus: ${fields.source ?? mod.source}`;
  return { change: { t: 'batch', changes }, label, scope: ['modifiers', 'stats'] };
}

export function removeModifier(mod: Modifier): Action {
  return { change: { t: 'remove', path: ['modifiers'], id: mod.id }, label: `Removed bonus: ${mod.source}`, scope: ['modifiers', 'stats'] };
}

export function addAcFormula(fields: Omit<AcFormula, 'id'>): Action {
  const formula: AcFormula = { id: uid(), ...fields };
  return { change: { t: 'insert', path: ['acFormulas'], item: formula }, label: `Added AC formula: ${formula.label}`, scope: ['ac', 'stats'] };
}

export function removeAcFormula(formula: AcFormula, state: CharacterState): Action {
  const changes: Change[] = [{ t: 'remove', path: ['acFormulas'], id: formula.id }];
  if (state.acPinned === formula.id) changes.push({ t: 'set', path: ['acPinned'], value: null });
  return { change: { t: 'batch', changes }, label: `Removed AC formula: ${formula.label}`, scope: ['ac', 'stats'] };
}

export function pinAc(id: string | null, label: string): Action {
  return {
    change: { t: 'set', path: ['acPinned'], value: id },
    label: id ? `AC pinned to ${label}` : 'AC uses the best formula',
    scope: ['ac', 'stats'],
  };
}

export function addClass(fields: Omit<ClassLevel, 'id'>): Action {
  const entry: ClassLevel = { id: uid(), ...fields };
  return {
    change: { t: 'insert', path: ['classes'], item: entry },
    label: `Added class: ${entry.name} ${entry.level}`,
    scope: ['classes', 'stats'],
    milestone: true,
  };
}

export function updateClass(entry: ClassLevel, fields: Partial<Omit<ClassLevel, 'id'>>): Action {
  const changes: Change[] = Object.entries(fields).map(([key, value]) => ({ t: 'set', path: ['classes', { id: entry.id }, key], value }));
  const levelChanged = fields.level !== undefined && fields.level !== entry.level;
  return {
    change: { t: 'batch', changes },
    label: levelChanged ? `${entry.name} level ${entry.level} → ${fields.level}` : `Edited class: ${fields.name ?? entry.name}`,
    scope: ['classes', 'stats'],
    milestone: levelChanged,
  };
}

export function removeClass(entry: ClassLevel): Action {
  return { change: { t: 'remove', path: ['classes'], id: entry.id }, label: `Removed class: ${entry.name}`, scope: ['classes', 'stats'], milestone: true };
}

export function setHitDiceSpent(die: HitDie, before: number, value: number): Action {
  return {
    change: { t: 'set', path: ['hitDiceSpent', die], value: Math.max(0, value) },
    label: `Spent d${die} hit dice ${before} → ${Math.max(0, value)}`,
    scope: ['hp', 'hitDice'],
  };
}

// ---------------------------------------------------------------------------
// Notes, backstory and portrait
// ---------------------------------------------------------------------------

const PERSONALITY_NAMES = {
  traits: 'Personality traits',
  ideals: 'Ideals',
  bonds: 'Bonds',
  flaws: 'Flaws',
  appearance: 'Appearance',
  allies: 'Allies and organizations',
};

export type PersonalityField = keyof typeof PERSONALITY_NAMES;

const size = (text: string) => `${text.length.toLocaleString()} characters`;

export function setBackstory(value: string): Action {
  return { change: { t: 'set', path: ['backstory'], value }, label: `Backstory edited (${size(value)})`, scope: ['notes'] };
}

export function setPersonality(field: PersonalityField, value: string): Action {
  return {
    change: { t: 'set', path: ['personality', field], value },
    label: `${PERSONALITY_NAMES[field]} edited`,
    scope: ['notes'],
  };
}

export function addNote(title: string, body: string): Action {
  const note: Note = { id: uid(), title: title.trim() || 'Untitled note', body };
  return { change: { t: 'insert', path: ['notes'], item: note }, label: `Added note: ${note.title}`, scope: ['notes'] };
}

export function updateNote(note: Note, fields: Partial<Omit<Note, 'id'>>): Action {
  const changes: Change[] = Object.entries(fields).map(([key, value]) => ({ t: 'set', path: ['notes', { id: note.id }, key], value }));
  return { change: { t: 'batch', changes }, label: `Edited note: ${fields.title ?? note.title}`, scope: ['notes'] };
}

export function removeNote(note: Note): Action {
  return { change: { t: 'remove', path: ['notes'], id: note.id }, label: `Deleted note: ${note.title}`, scope: ['notes'] };
}

export function setPortrait(key: string | null): Action {
  return {
    change: { t: 'set', path: ['portrait'], value: key },
    label: key ? 'Portrait changed' : 'Portrait removed',
    scope: ['notes', 'identity'],
  };
}
