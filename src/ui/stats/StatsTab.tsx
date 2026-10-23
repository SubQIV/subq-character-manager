import { useState } from 'react';
import * as A from '../../model/actions';
import { signed, type Calc } from '../../model/derive';
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type Proficiency, type SkillId } from '../../model/types';
import { NumberInput, TextInput, type TabProps } from '../common';
import { MaxHpEditor } from '../play/Hp';
import { Bonuses } from './Bonuses';
import { AbilityEditor, AcEditor, CalcSheet, SpeedEditor } from './CalcSheet';
import { Classes } from './Classes';

const NEXT_PROF: Record<Proficiency, Proficiency> = { 0: 1, 1: 2, 2: 0.5, 0.5: 0 };
const PROF_LABEL: Record<Proficiency, string> = { 0: 'not proficient', 0.5: 'half proficiency', 1: 'proficient', 2: 'expertise' };
const SHORT: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export function StatsTab(props: TabProps) {
  const { view, act } = props;
  const { state, derived } = view;
  const [open, setOpen] = useState<string | null>(null);

  const calcFor = (key: string): { calc: Calc | null; signedValues: boolean } => {
    if (key.startsWith('ability:')) return { calc: derived.abilities[key.slice(8) as Ability].score, signedValues: false };
    if (key.startsWith('save:')) return { calc: derived.saves[key.slice(5) as Ability], signedValues: true };
    if (key.startsWith('skill:')) return { calc: derived.skills[key.slice(6) as SkillId], signedValues: true };
    if (key.startsWith('passive:')) return { calc: derived.passives[key.slice(8) as 'perception'], signedValues: false };
    switch (key) {
      case 'ac':
        return { calc: derived.ac, signedValues: false };
      case 'initiative':
        return { calc: derived.initiative, signedValues: true };
      case 'speed':
        return { calc: derived.speed, signedValues: false };
      case 'proficiency':
        return { calc: derived.proficiency, signedValues: true };
      case 'hpMax':
        return { calc: derived.hpMax, signedValues: false };
      case 'spellDC':
        return { calc: derived.spellDC, signedValues: false };
      case 'spellAttack':
        return { calc: derived.spellAttack, signedValues: true };
      default:
        return { calc: null, signedValues: true };
    }
  };
  const current = open ? calcFor(open) : { calc: null, signedValues: true };

  const box = (key: string, label: string, value: string, sub?: string) => {
    const calc = calcFor(key).calc;
    return (
      <button type="button" className={`box ${calc?.overridden ? 'is-overridden' : ''}`} onClick={() => setOpen(key)} aria-label={`${label}: ${value}. Show the calculation`}>
        <span className="box-label">{label}</span>
        <span className="box-value">{value}</span>
        {sub && <span className="box-sub">{sub}</span>}
      </button>
    );
  };

  return (
    <div className="stack">
      <details className="section">
        <summary className="section-head" style={{ cursor: 'pointer' }}>
          <h2 className="section-title">Details</h2>
          <span className="small muted">Tap to edit</span>
        </summary>
        <div className="grid-2">
          <label className="field">
            <span>Name</span>
            <TextInput label="Name" value={state.name} onCommit={(value) => act(A.setText('name', state.name, value || 'Unnamed'))} />
          </label>
          <label className="field">
            <span>Player</span>
            <TextInput label="Player" value={state.player} onCommit={(value) => act(A.setText('player', state.player, value))} />
          </label>
          <label className="field">
            <span>{state.edition === '2014' ? 'Race' : 'Species'}</span>
            <TextInput label="Species" value={state.species} onCommit={(value) => act(A.setText('species', state.species, value))} />
          </label>
          <label className="field">
            <span>Background</span>
            <TextInput label="Background" value={state.background} onCommit={(value) => act(A.setText('background', state.background, value))} />
          </label>
          <label className="field">
            <span>Alignment</span>
            <TextInput label="Alignment" value={state.alignment} onCommit={(value) => act(A.setText('alignment', state.alignment, value))} />
          </label>
        </div>
      </details>

      <Classes {...props} />

      <section className="section" aria-labelledby="abilities-heading">
        <div className="section-head">
          <h2 id="abilities-heading" className="section-title">
            Ability scores
          </h2>
          <span className="small muted">Tap any number to see how it's worked out</span>
        </div>
        <div className="grid-3" style={{ rowGap: 'var(--space-4)' }}>
          {ABILITIES.map((ability) =>
            box(`ability:${ability}`, ABILITY_NAMES[ability], signed(derived.abilities[ability].mod), String(derived.abilities[ability].score.value)),
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="combat-heading">
        <div className="section-head">
          <h2 id="combat-heading" className="section-title">
            Combat
          </h2>
        </div>
        <div className="grid-3" style={{ rowGap: 'var(--space-4)' }}>
          {box('ac', 'Armor Class', String(derived.ac.value))}
          {box('initiative', 'Initiative', signed(derived.initiative.value))}
          {box('speed', 'Speed', `${derived.speed.value} ft`)}
          {box('proficiency', 'Proficiency', signed(derived.proficiency.value))}
          {box('hpMax', 'Max HP', String(derived.hpMax.value))}
          {box('passive:perception', 'Perception', String(derived.passives.perception.value), 'passive')}
        </div>
      </section>

      <section className="section" aria-labelledby="saves-heading">
        <div className="section-head">
          <h2 id="saves-heading" className="section-title">
            Saving throws
          </h2>
        </div>
        <ul className="list">
          {ABILITIES.map((ability) => {
            const calc = derived.saves[ability];
            const proficient = state.saveProficiency[ability];
            return (
              <li key={ability} className="line">
                <button
                  type="button"
                  className="prof"
                  data-level={proficient ? 1 : 0}
                  aria-label={`${ABILITY_NAMES[ability]} save: ${proficient ? 'proficient' : 'not proficient'}. Tap to change`}
                  onClick={() => act(A.toggleSave(state, ability))}
                >
                  <i />
                </button>
                <span className="line-main">{ABILITY_NAMES[ability]}</span>
                <button type="button" className={`line-value ${calc.overridden ? 'is-overridden' : ''}`} onClick={() => setOpen(`save:${ability}`)}>
                  {signed(calc.value)}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section" aria-labelledby="skills-heading">
        <div className="section-head">
          <h2 id="skills-heading" className="section-title">
            Skills
          </h2>
          <span className="small muted">Circle: proficient, ringed: expertise, half: half proficiency</span>
        </div>
        <ul className="list">
          {SKILLS.map((skill) => {
            const calc = derived.skills[skill.id];
            const prof = state.skillProficiency[skill.id];
            return (
              <li key={skill.id} className="line">
                <button
                  type="button"
                  className="prof"
                  data-level={prof}
                  aria-label={`${skill.name}: ${PROF_LABEL[prof]}. Tap to change`}
                  onClick={() => act(A.setSkill(skill.id, prof, NEXT_PROF[prof]))}
                >
                  <i />
                </button>
                <span className="line-main">
                  {skill.name} <span className="small muted">{SHORT[skill.ability]}</span>
                </span>
                <button type="button" className={`line-value ${calc.overridden ? 'is-overridden' : ''}`} onClick={() => setOpen(`skill:${skill.id}`)}>
                  {signed(calc.value)}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="small muted" style={{ margin: 0 }}>
          Passive scores
        </p>
        <div className="grid-3">
          {box('passive:perception', 'Perception', String(derived.passives.perception.value))}
          {box('passive:insight', 'Insight', String(derived.passives.insight.value))}
          {box('passive:investigation', 'Investigation', String(derived.passives.investigation.value))}
        </div>
      </section>

      <Spellcasting {...props} onOpen={setOpen} />

      <Bonuses {...props} />

      <CalcSheet calc={current.calc} open={open !== null} onClose={() => setOpen(null)} act={act} signedValues={current.signedValues}>
        {open?.startsWith('ability:') && <AbilityEditor {...props} ability={open.slice(8) as Ability} />}
        {open === 'ac' && <AcEditor {...props} />}
        {open === 'speed' && <SpeedEditor {...props} />}
        {open === 'hpMax' && <MaxHpEditor {...props} />}
      </CalcSheet>
    </div>
  );
}

function Spellcasting({ view, act, onOpen }: TabProps & { onOpen: (key: string) => void }) {
  const { state, derived } = view;
  const [editingSlots, setEditingSlots] = useState(false);
  return (
    <section className="section" aria-labelledby="spells-heading">
      <div className="section-head">
        <h2 id="spells-heading" className="section-title">
          Spellcasting
        </h2>
      </div>
      <label className="field">
        <span>Spellcasting ability</span>
        <select
          className="select"
          value={state.spellcastingAbility ?? ''}
          onChange={(event) => act(A.setSpellcasting((event.target.value || null) as Ability | null))}
        >
          <option value="">None</option>
          {(['int', 'wis', 'cha'] as Ability[]).map((ability) => (
            <option key={ability} value={ability}>
              {ABILITY_NAMES[ability]}
            </option>
          ))}
        </select>
      </label>
      {derived.spellDC && derived.spellAttack && (
        <div className="grid-2">
          <button type="button" className={`box ${derived.spellDC.overridden ? 'is-overridden' : ''}`} onClick={() => onOpen('spellDC')}>
            <span className="box-label">Spell save DC</span>
            <span className="box-value">{derived.spellDC.value}</span>
          </button>
          <button type="button" className={`box ${derived.spellAttack.overridden ? 'is-overridden' : ''}`} onClick={() => onOpen('spellAttack')}>
            <span className="box-label">Spell attack</span>
            <span className="box-value">{signed(derived.spellAttack.value)}</span>
          </button>
        </div>
      )}
      <button type="button" className="btn btn-small" style={{ justifySelf: 'start' }} onClick={() => setEditingSlots(!editingSlots)} aria-expanded={editingSlots}>
        {editingSlots ? 'Done setting up slots' : 'Set up spell slots'}
      </button>
      {editingSlots && (
        <div className="stack-tight">
          <p className="small muted" style={{ margin: 0 }}>
            How many slots of each level you have. The builder will fill these in from your classes later.
          </p>
          <div className="grid-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
              <label key={level} className="field">
                <span>Level {level}</span>
                <NumberInput label={`Level ${level} slots`} value={state.spellSlots[level].max} min={0} max={9} onCommit={(max) => act(A.setSlotMax(state, level, max ?? 0))} />
              </label>
            ))}
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Pact magic slots</span>
              <NumberInput label="Pact slots" value={state.pact.max} min={0} max={9} onCommit={(max) => act(A.setPact(state, max ?? 0, state.pact.level || 1))} />
            </label>
            <label className="field">
              <span>Pact slot level</span>
              <NumberInput label="Pact slot level" value={state.pact.level} min={0} max={5} onCommit={(level) => act(A.setPact(state, state.pact.max, level ?? 1))} />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
