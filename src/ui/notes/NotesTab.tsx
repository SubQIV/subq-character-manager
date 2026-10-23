import { useEffect, useState } from 'react';
import * as A from '../../model/actions';
import type { Note } from '../../model/types';
import { ConfirmButton, Sheet, type TabProps } from '../common';
import { PortraitEditor } from './Portrait';

/** A text area that saves when you leave it, so typing doesn't flood the history. */
function LongText({ label, value, onCommit, rows = 4, placeholder }: { label: string; value: string; onCommit: (value: string) => void; rows?: number; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="textarea"
        rows={rows}
        value={text}
        placeholder={placeholder}
        style={{ minHeight: rows * 24 }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text);
        }}
      />
    </label>
  );
}

const PERSONALITY: { field: A.PersonalityField; label: string }[] = [
  { field: 'traits', label: 'Personality traits' },
  { field: 'ideals', label: 'Ideals' },
  { field: 'bonds', label: 'Bonds' },
  { field: 'flaws', label: 'Flaws' },
  { field: 'appearance', label: 'Appearance' },
  { field: 'allies', label: 'Allies and organizations' },
];

export function NotesTab(props: TabProps) {
  const { view, act } = props;
  const { state } = view;
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  return (
    <div className="stack">
      <PortraitEditor {...props} />

      <section className="section" aria-labelledby="notes-heading">
        <div className="section-head">
          <h2 id="notes-heading" className="section-title">
            Notes
          </h2>
          <button type="button" className="btn btn-small" onClick={() => setEditing('new')}>
            New note
          </button>
        </div>
        {state.notes.length === 0 ? (
          <p className="empty">Session notes, NPCs, quests, anything you want to remember.</p>
        ) : (
          <ul className="list">
            {state.notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className="line"
                  style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setEditing(note)}
                >
                  <span className="line-main">
                    <strong style={{ fontWeight: 650 }}>{note.title}</strong>
                    {note.body && (
                      <>
                        <br />
                        <span className="small muted">{note.body.length > 90 ? `${note.body.slice(0, 90)}…` : note.body}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="backstory-heading">
        <div className="section-head">
          <h2 id="backstory-heading" className="section-title">
            Backstory
          </h2>
          <span className="small muted">Saves when you tap away</span>
        </div>
        <LongText label="Backstory" value={state.backstory} rows={10} onCommit={(value) => act(A.setBackstory(value))} />
      </section>

      <section className="section" aria-labelledby="personality-heading">
        <div className="section-head">
          <h2 id="personality-heading" className="section-title">
            Personality
          </h2>
        </div>
        {PERSONALITY.map(({ field, label }) => (
          <LongText key={field} label={label} value={state.personality[field]} rows={3} onCommit={(value) => act(A.setPersonality(field, value))} />
        ))}
      </section>

      <Sheet open={editing !== null} title={editing === 'new' ? 'New note' : 'Edit note'} onClose={() => setEditing(null)}>
        {editing !== null && <NoteEditor note={editing === 'new' ? null : editing} act={act} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function NoteEditor({ note, act, onDone }: { note: Note | null; act: TabProps['act']; onDone: () => void }) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  return (
    <form
      className="stack-tight"
      onSubmit={(event) => {
        event.preventDefault();
        if (note) {
          const fields: Partial<Note> = {};
          if (title.trim() !== note.title) fields.title = title.trim() || 'Untitled note';
          if (body !== note.body) fields.body = body;
          if (Object.keys(fields).length) act(A.updateNote(note, fields));
        } else if (title.trim() || body.trim()) {
          act(A.addNote(title, body));
        }
        onDone();
      }}
    >
      <label className="field">
        <span>Title</span>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus={!note} placeholder="e.g. Session 12" />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea className="textarea" rows={10} value={body} onChange={(event) => setBody(event.target.value)} style={{ minHeight: 220 }} />
      </label>
      <button type="submit" className="btn btn-primary">
        {note ? 'Save note' : 'Add note'}
      </button>
      {note && (
        <ConfirmButton
          label="Delete note"
          confirmLabel="Tap again to delete"
          onConfirm={() => {
            act(A.removeNote(note));
            onDone();
          }}
        />
      )}
    </form>
  );
}
