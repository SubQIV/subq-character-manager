import { useState } from 'react';
import { abilityMod } from '../model/derive';
import { newCharacter } from '../model/factory';
import { ABILITIES, ABILITY_NAMES, HIT_DICE, type Ability, type Edition, type HitDie } from '../model/types';
import { store } from '../store/characters';
import { BackLink, toInt } from './common';
import { go } from './router';

/** Average hit points: full die at level 1, then the rounded-up average each level, plus Con each level. */
function averageHp(hitDie: HitDie, level: number, con: number): number {
  let total = Math.max(1, hitDie + con);
  for (let i = 2; i <= level; i += 1) total += Math.max(1, hitDie / 2 + 1 + con);
  return total;
}

export function NewCharacter() {
  const [edition, setEdition] = useState<Edition>('2024');
  const [name, setName] = useState('');
  const [player, setPlayer] = useState('');
  const [className, setClassName] = useState('');
  const [subclass, setSubclass] = useState('');
  const [level, setLevel] = useState('1');
  const [hitDie, setHitDie] = useState<HitDie>(8);
  const [species, setSpecies] = useState('');
  const [background, setBackground] = useState('');
  const [scores, setScores] = useState<Record<Ability, string>>({ str: '10', dex: '10', con: '10', int: '10', wis: '10', cha: '10' });
  const [maxHp, setMaxHp] = useState('');
  const [speed, setSpeed] = useState('30');

  const levelValue = toInt(level);
  const parsedScores = Object.fromEntries(ABILITIES.map((a) => [a, toInt(scores[a])])) as Record<Ability, number | null>;
  const scoresValid = ABILITIES.every((a) => parsedScores[a] !== null && parsedScores[a]! >= 1 && parsedScores[a]! <= 30);
  const suggested = averageHp(hitDie, Math.min(20, Math.max(1, levelValue ?? 1)), abilityMod(parsedScores.con ?? 10));
  const hpValue = maxHp.trim() === '' ? suggested : toInt(maxHp);
  const speedValue = toInt(speed);

  const problems: string[] = [];
  if (!name.trim()) problems.push('Give your character a name.');
  if (className.trim() && (levelValue === null || levelValue < 1 || levelValue > 20)) problems.push('Level must be between 1 and 20.');
  if (!scoresValid) problems.push('Ability scores must be whole numbers from 1 to 30.');
  if (hpValue === null || hpValue < 1) problems.push('Hit point maximum must be at least 1.');
  if (speedValue === null || speedValue < 0) problems.push('Speed must be a whole number of feet.');

  const create = () => {
    if (problems.length) return;
    const id = store.create(
      newCharacter({
        name,
        player,
        edition,
        species,
        background,
        className,
        subclass,
        level: levelValue ?? 1,
        hitDie,
        abilities: parsedScores as Record<Ability, number>,
        maxHp: hpValue ?? suggested,
        speed: speedValue ?? 30,
      }),
    );
    go(`/c/${id}/play`);
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <BackLink />
          <div className="topbar-title">
            <h1 className="title">New character</h1>
          </div>
        </div>
      </header>
      <main className="page">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <fieldset className="section" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
              Rules
            </legend>
            <div className="edition-choice">
              <label>
                <input type="radio" name="edition" value="2024" checked={edition === '2024'} onChange={() => setEdition('2024')} />
                <strong>2024 rules</strong>
                <span className="small muted">From SRD 5.2. Species, and backgrounds that raise ability scores.</span>
              </label>
              <label>
                <input type="radio" name="edition" value="2014" checked={edition === '2014'} onChange={() => setEdition('2014')} />
                <strong>2014 rules</strong>
                <span className="small muted">From SRD 5.1. Races raise ability scores; backgrounds don't.</span>
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              This sets the character's home rules for conditions, rests and exhaustion. It can't be changed later.
            </p>
          </fieldset>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Who</h2>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Character name</span>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>Player</span>
                <input className="input" value={player} onChange={(event) => setPlayer(event.target.value)} />
              </label>
              <label className="field">
                <span>{edition === '2014' ? 'Race' : 'Species'}</span>
                <input className="input" value={species} onChange={(event) => setSpecies(event.target.value)} />
              </label>
              <label className="field">
                <span>Background</span>
                <input className="input" value={background} onChange={(event) => setBackground(event.target.value)} />
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Class</h2>
              <span className="small muted">Add more classes later on the Stats tab</span>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Class</span>
                <input className="input" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="e.g. Fighter" />
              </label>
              <label className="field">
                <span>Subclass</span>
                <input className="input" value={subclass} onChange={(event) => setSubclass(event.target.value)} placeholder="Optional" />
              </label>
              <label className="field">
                <span>Level</span>
                <input className="input input-number" type="number" inputMode="numeric" min={1} max={20} value={level} onChange={(event) => setLevel(event.target.value)} />
              </label>
              <label className="field">
                <span>Hit die</span>
                <select className="select" value={hitDie} onChange={(event) => setHitDie(Number(event.target.value) as HitDie)}>
                  {HIT_DICE.map((die) => (
                    <option key={die} value={die}>
                      d{die}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Ability scores</h2>
              <span className="small muted">Final scores, with all bonuses applied</span>
            </div>
            <div className="grid-3">
              {ABILITIES.map((ability) => (
                <label key={ability} className="field">
                  <span>{ABILITY_NAMES[ability]}</span>
                  <input
                    className="input input-number"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={scores[ability]}
                    onChange={(event) => setScores({ ...scores, [ability]: event.target.value })}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Hit points and speed</h2>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Hit point maximum</span>
                <input
                  className="input input-number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder={String(suggested)}
                  value={maxHp}
                  onChange={(event) => setMaxHp(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Speed in feet</span>
                <input className="input input-number" type="number" inputMode="numeric" min={0} value={speed} onChange={(event) => setSpeed(event.target.value)} />
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Leave the maximum blank to use the average for your hit die, level and Constitution: {suggested}.
            </p>
          </section>

          {problems.length > 0 && name.trim() !== '' && (
            <ul className="notice notice-danger" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <button type="submit" className="btn btn-primary btn-wide" disabled={problems.length > 0}>
            Create character
          </button>
        </form>
      </main>
    </>
  );
}
