import { useEffect, useState } from 'react';
import type { Action } from '../model/actions';
import { store, useStore } from '../store/characters';
import { BackLink, EditionBadge, type TabProps } from './common';
import { LogTab } from './log/LogTab';
import { Conditions } from './play/Conditions';
import { DeathSaves, HpBlock } from './play/Hp';
import { Rests } from './play/Rests';
import { SpellSlots } from './play/Slots';
import { Currencies, Resources } from './play/Trackers';
import { StatsTab } from './stats/StatsTab';

const TABS = [
  { id: 'play', label: 'Play' },
  { id: 'stats', label: 'Stats' },
  { id: 'log', label: 'History' },
];

export function CharacterSheet({ id, tab }: { id: string; tab: string }) {
  const s = useStore();
  const view = s.view(id);
  if (!view) {
    return (
      <main className="page stack">
        <p className="notice">This character isn't on this device.</p>
        <a className="btn" href="#/">
          Back to characters
        </a>
      </main>
    );
  }
  const act = (action: Action) => store.commit(id, action);
  const props: TabProps = { id, view, act };
  const { state, derived } = view;
  const classLine = state.classes.length
    ? state.classes.map((c) => `${c.name} ${c.level}`).join(', ')
    : 'No class yet';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <BackLink />
          <div className="topbar-title">
            <h1 className="title">{state.name}</h1>
            <div className="topbar-sub">
              <span>
                {classLine}
                {state.species ? `, ${state.species}` : ''}
              </span>
              <EditionBadge edition={state.edition} />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-small"
            disabled={!s.canUndo(id)}
            onClick={() => store.undo(id)}
            aria-label="Undo the last change"
          >
            Undo
          </button>
        </div>
      </header>

      <main className="page stack">
        {derived.warnings.map((warning) => (
          <p key={warning} className="notice notice-danger" style={{ margin: 0 }}>
            {warning}
          </p>
        ))}
        {tab === 'stats' ? (
          <StatsTab {...props} />
        ) : tab === 'log' ? (
          <LogTab {...props} />
        ) : (
          <>
            <HpBlock {...props} />
            <DeathSaves {...props} />
            <Conditions {...props} />
            <Resources {...props} />
            <SpellSlots {...props} />
            <Rests {...props} />
            <Currencies {...props} />
          </>
        )}
      </main>

      <UndoBar id={id} />

      <nav className="tabbar" aria-label="Sheet sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#/c/${id}/${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

/** After each change, a few seconds to undo it with one tap. */
function UndoBar({ id }: { id: string }) {
  const s = useStore();
  const last = s.lastAction;
  const [, tick] = useState(0);
  const visible = last && last.characterId === id && Date.now() - last.at < 6000;
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => tick((n) => n + 1), 6000 - (Date.now() - last.at) + 50);
    return () => clearTimeout(timer);
  }, [visible, last]);
  if (!visible) return null;
  return (
    <div className="undo-bar" role="status">
      <p>{last.label}</p>
      {!last.isUndo && (
        <button type="button" className="btn btn-small" onClick={() => store.undo(id, last.entryId)}>
          Undo
        </button>
      )}
      <button type="button" className="btn btn-small" aria-label="Dismiss" onClick={() => store.dismissLastAction()}>
        ✕
      </button>
    </div>
  );
}
