import { useState } from 'react';
import { builtinPacks } from '../packs/registry';
import { useStore } from '../store/characters';
import { device, renameDevice } from '../store/device';
import { BackLink } from './common';

export function About() {
  const s = useStore();
  const [name, setName] = useState(device().name);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <BackLink />
          <div className="topbar-title">
            <h1 className="title">This device</h1>
          </div>
        </div>
      </header>
      <main className="page stack">
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Device name</h2>
          </div>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              renameDevice(name);
              setSaved(true);
            }}
          >
            <input className="input" style={{ flex: 1 }} aria-label="Device name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} />
            <button type="submit" className="btn">
              {saved ? 'Saved' : 'Save name'}
            </button>
          </form>
          <p className="small muted" style={{ margin: 0 }}>
            Shown beside every change in a character's history, such as "Dan's phone".
          </p>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Storage</h2>
          </div>
          <p style={{ margin: 0 }}>
            {s.status === 'memory-only'
              ? "This browser isn't letting the app save, so characters only last until you close it."
              : `Characters are saved on this device only. ${s.list().length} saved. Sharing through Google Drive arrives in a later phase.`}
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Clearing this site's data in your browser settings deletes them.
          </p>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Content</h2>
          </div>
          {builtinPacks.map((pack) => (
            <div key={pack.pack.id} className="stack-tight">
              <p style={{ margin: 0 }}>
                <strong>{pack.pack.name}</strong> <span className="small muted">version {pack.pack.version}</span>
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                {pack.pack.attribution}
              </p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
