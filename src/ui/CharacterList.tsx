import { useStore } from '../store/characters';
import { EditionBadge } from './common';
import { Avatar } from './notes/Portrait';

export function CharacterList() {
  const s = useStore();
  const views = s.list();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <p className="wordmark" style={{ flex: 1 }}>
            SubQ Character Manager
          </p>
          <a className="btn btn-quiet btn-small" href="#/about">
            This device
          </a>
        </div>
      </header>
      <main className="page stack">
        {s.status === 'memory-only' && (
          <p className="notice notice-danger">This browser isn't letting the app save. Characters will be lost when you close it. Try a normal (not private) window.</p>
        )}
        <div className="spread">
          <h1 className="title">Characters</h1>
          <a className="btn btn-primary" href="#/new">
            New character
          </a>
        </div>
        {views.length === 0 ? (
          <div className="empty graph" style={{ padding: 'var(--space-6) var(--space-4)' }}>
            <p style={{ marginTop: 0 }}>No characters on this device yet.</p>
            <a className="btn btn-primary" href="#/new">
              Create your first character
            </a>
          </div>
        ) : (
          <ul className="list">
            {views.map(({ doc, state, derived }) => (
              <li key={doc.id}>
                <a className="char-row" href={`#/c/${doc.id}/play`}>
                  <Avatar name={state.name} portrait={state.portrait} />
                  <span className="line-main">
                    <span className="char-name">{state.name}</span>
                    <br />
                    <span className="small muted">
                      {state.classes.map((c) => `${c.name} ${c.level}`).join(', ') || 'No class yet'}
                      {state.species ? `, ${state.species}` : ''}
                      {state.player ? `. Played by ${state.player}` : ''}
                    </span>
                  </span>
                  <span style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                    <span className="number">
                      {state.hp.current}
                      <span className="small muted">/{derived.hpMax.value}</span>
                    </span>
                    <EditionBadge edition={state.edition} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
