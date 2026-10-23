import { test } from 'vitest';
import { assert } from 'vitest';
import {
  newCharacter,
  validateDoc,
  mergeEvents,
  mergeDoc,
  computeHp,
  lastUndoable,
  missingIds,
  describeEvent,
} from '../public/phase0/sync.js';

const hp = (id, ts, delta, device = 'a') => ({ id, ts, kind: 'hp', delta, device });
const rest = (id, ts, value) => ({ id, ts, kind: 'hp', set: true, value, device: 'a' });
const undo = (id, ts, target) => ({ id, ts, kind: 'undo', target, device: 'a' });

const withEvents = (events, maxHp = 40) => ({ ...newCharacter('Howerd', 'Dan', maxHp), events });

test('new character starts at full HP with no history', () => {
  const doc = newCharacter('Howerd', 'Dan', 32);
  assert.equal(computeHp(doc), 32);
  assert.deepEqual(doc.events, []);
});

test('rejects files that are not test characters', () => {
  assert.throws(() => validateDoc({ name: 'x' }));
  assert.throws(() => validateDoc(null));
});

test('damage from two devices adds up after merging', () => {
  const phone = [hp('p:1', 1000, -7, 'phone')];
  const pc = [hp('c:1', 1100, -5, 'pc')];
  const merged = mergeEvents(phone, pc);
  assert.equal(computeHp(withEvents(merged)), 28);
});

test('merging is order independent and drops duplicates', () => {
  const a = [hp('a:1', 1000, -3), hp('a:2', 3000, -2)];
  const b = [hp('b:1', 2000, -4), hp('a:1', 1000, -3)];
  const ab = mergeEvents(a, b);
  const ba = mergeEvents(b, a);
  assert.deepEqual(ab, ba);
  assert.equal(ab.length, 3);
  assert.deepEqual(ab.map((event) => event.id), ['a:1', 'b:1', 'a:2']);
});

test('same timestamp is ordered by id, so every device agrees', () => {
  const merged = mergeEvents([hp('z:1', 500, -1)], [hp('a:1', 500, -1)]);
  assert.deepEqual(merged.map((event) => event.id), ['a:1', 'z:1']);
});

test('HP never drops below 0 or rises above max', () => {
  assert.equal(computeHp(withEvents([hp('a:1', 1, -100)])), 0);
  assert.equal(computeHp(withEvents([hp('a:1', 1, -10), hp('a:2', 2, 50)])), 40);
});

test('damage then a later long rest ends at full HP', () => {
  const merged = mergeEvents([hp('p:1', 840, -12)], [rest('c:1', 845, 40)]);
  assert.equal(computeHp(withEvents(merged)), 40);
});

test('a long rest then later damage keeps the damage', () => {
  const merged = mergeEvents([rest('c:1', 800, 40)], [hp('p:1', 900, -12)]);
  assert.equal(computeHp(withEvents(merged)), 28);
});

test('undo removes the targeted change only', () => {
  const events = [hp('a:1', 1, -7), hp('a:2', 2, -3), undo('a:3', 3, 'a:1')];
  assert.equal(computeHp(withEvents(events)), 37);
});

test('undo is itself a change that merges like any other', () => {
  const phone = [hp('p:1', 1, -7), undo('p:2', 3, 'p:1')];
  const pc = [hp('p:1', 1, -7), hp('c:1', 2, -5)];
  assert.equal(computeHp(withEvents(mergeEvents(phone, pc))), 35);
});

test('repeated undo steps back through earlier changes', () => {
  let events = [hp('a:1', 1, -7), hp('a:2', 2, -3)];
  const first = lastUndoable(events);
  assert.equal(first.id, 'a:2');
  events = [...events, undo('a:3', 3, first.id)];
  const second = lastUndoable(events);
  assert.equal(second.id, 'a:1');
  events = [...events, undo('a:4', 4, second.id)];
  assert.equal(lastUndoable(events), null);
  assert.equal(computeHp(withEvents(events)), 40);
});

test('missingIds finds changes another device overwrote', () => {
  const server = [hp('a:1', 1, -1), hp('b:1', 2, -1)];
  assert.deepEqual(missingIds(server, ['a:1', 'a:2']), ['a:2']);
  assert.deepEqual(missingIds(server, []), []);
});

test('mergeDoc keeps the file details and adds queued changes', () => {
  const remote = withEvents([hp('b:1', 2, -1)]);
  const merged = mergeDoc(remote, [hp('a:1', 1, -2)]);
  assert.equal(merged.name, 'Howerd');
  assert.equal(merged.events.length, 2);
  assert.equal(remote.events.length, 1, 'original is not changed');
});

test('simulated race: overwritten changes are recovered and nothing is lost', () => {
  // Both devices read the empty file, then both write. The second write
  // overwrites the first. The first device then finds its changes missing,
  // re-queues them and saves again.
  let server = withEvents([]);
  const phoneQueue = [hp('p:1', 10, -1), hp('p:2', 11, -1)];
  const pcQueue = [hp('c:1', 12, -1), hp('c:2', 13, -1)];

  const phoneRead = server;
  const pcRead = server;
  server = mergeDoc(phoneRead, phoneQueue);
  server = mergeDoc(pcRead, pcQueue);

  const lost = missingIds(server.events, phoneQueue.map((event) => event.id));
  assert.deepEqual(lost, ['p:1', 'p:2']);

  server = mergeDoc(server, phoneQueue.filter((event) => lost.includes(event.id)));
  assert.equal(server.events.length, 4);
  assert.equal(computeHp(server), 36);
});

test('history descriptions read naturally', () => {
  const damage = hp('a:1', 1, -7);
  assert.equal(describeEvent(damage), '−7 HP');
  assert.equal(describeEvent(hp('a:2', 2, 5)), '+5 HP');
  assert.equal(describeEvent(rest('a:3', 3, 40)), 'Long rest: HP set to 40');
  assert.equal(describeEvent(undo('a:4', 4, 'a:1'), [damage]), 'Undo (−7 HP)');
});
