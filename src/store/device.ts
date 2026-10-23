// This device's name, shown in history entries ("Dan's phone").

const KEY = 'subq.device';

interface DeviceInfo {
  id: string;
  name: string;
}

function guessName(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'Phone';
  if (/Android|iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/iPhone/i.test(ua)) return 'Phone';
  return 'Computer';
}

let cached: DeviceInfo | null = null;

export function device(): DeviceInfo {
  if (cached) return cached;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) cached = JSON.parse(saved) as DeviceInfo;
  } catch {
    // Storage unavailable; fall through to a fresh name for this visit.
  }
  if (!cached) {
    cached = { id: Math.random().toString(36).slice(2, 10), name: guessName() };
    persist();
  }
  return cached;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Kept in memory only.
  }
}

export function renameDevice(name: string) {
  device();
  cached = { ...cached!, name: name.trim() || guessName() };
  persist();
}
