import { useEffect, useRef, useState } from 'react';
import * as A from '../../model/actions';
import { uid } from '../../model/factory';
import { loadImage, saveImage } from '../../store/db';
import type { TabProps } from '../common';

/** The portrait as a displayable address, loaded from device storage. */
export function usePortraitUrl(key: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    if (key) {
      loadImage(key)
        .then((blob) => {
          if (alive && blob) {
            made = URL.createObjectURL(blob);
            setUrl(made);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return url;
}

/** Shrink a photo to at most `max` pixels on its long side, as a JPEG. */
async function shrink(file: File, max = 768): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image'))), 'image/jpeg', 0.85));
}

export function Avatar({ name, portrait, size = 52 }: { name: string; portrait: string | null; size?: number }) {
  const url = usePortraitUrl(portrait);
  return (
    <span className="avatar graph" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.45, overflow: 'hidden' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name.trim()[0]?.toUpperCase() ?? '?')}
    </span>
  );
}

export function PortraitEditor({ id, view, act }: TabProps) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = usePortraitUrl(view.state.portrait);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      const blob = await shrink(file);
      const key = `portrait:${id}:${uid()}`;
      await saveImage(key, blob);
      act(A.setPortrait(key));
    } catch {
      setProblem("That image couldn't be used. Try a JPEG or PNG photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section className="section" aria-labelledby="portrait-heading">
      <div className="section-head">
        <h2 id="portrait-heading" className="section-title">
          Portrait
        </h2>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div className="avatar graph" style={{ width: 128, height: 160, borderRadius: 8, overflow: 'hidden', fontSize: '3rem' }}>
          {url ? <img src={url} alt={`Portrait of ${view.state.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : view.state.name.trim()[0]?.toUpperCase()}
        </div>
        <div className="stack-tight" style={{ flex: 1, minWidth: 160 }}>
          <input ref={input} type="file" accept="image/*" hidden onChange={(event) => void choose(event.target.files?.[0])} />
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Saving…' : view.state.portrait ? 'Change portrait' : 'Add portrait'}
          </button>
          {view.state.portrait && (
            <button type="button" className="btn btn-quiet" onClick={() => act(A.setPortrait(null))}>
              Remove portrait
            </button>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Pictures are shrunk on this device before saving.
          </p>
          {problem && <p className="notice notice-danger" style={{ margin: 0 }}>{problem}</p>}
        </div>
      </div>
    </section>
  );
}
