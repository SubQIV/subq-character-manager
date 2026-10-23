import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../model/actions';
import type { Edition } from '../model/types';
import type { View } from '../store/characters';

export interface TabProps {
  id: string;
  view: View;
  act: (action: Action) => void;
}

/** A bottom sheet built on the native dialog element, so focus and Escape work. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

export function BackLink({ href = '#/', label = 'Back to characters' }: { href?: string; label?: string }) {
  return (
    <a className="icon-btn" href={href} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </a>
  );
}

export function EditionBadge({ edition }: { edition: Edition }) {
  return <span className={`edition edition-${edition}`}>{edition} rules</span>;
}

/** Parse what someone typed into a whole number, or null if it isn't one. */
export function toInt(text: string): number | null {
  if (!/^-?\d+$/.test(text.trim())) return null;
  return parseInt(text, 10);
}

/** A number box that commits when you leave it, so typing doesn't flood the history. */
export function NumberInput({
  value,
  onCommit,
  label,
  min,
  max,
  allowBlank = false,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  min?: number;
  max?: number;
  allowBlank?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (allowBlank && text.trim() === '') {
      if (value !== null) onCommit(null);
      return;
    }
    const parsed = toInt(text);
    if (parsed === null) {
      setText(value === null ? '' : String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <input
      className="input input-number"
      type="number"
      inputMode="numeric"
      aria-label={label}
      value={text}
      min={min}
      max={max}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** A text box that commits when you leave it. */
export function TextInput({
  value,
  onCommit,
  label,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="input"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text.trim() !== value) onCommit(text.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** A button that needs a second tap to confirm, for deletions. */
export function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn ${armed ? 'btn-damage' : ''}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function timeLabel(ts: number): string {
  const date = new Date(ts);
  const sameDay = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}
