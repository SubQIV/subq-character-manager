import { CONFIG } from './config.js';
import { makeDrive, FOLDER_TYPE } from './drive.js';
import * as S from './sync.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Storage. Browser storage can be missing or throw (private windows, cleared
// site data), so every access is guarded and falls back to memory.
// ---------------------------------------------------------------------------
const memory = new Map();
const store = {
  get(key, fallback) {
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = localStorage.getItem(`subq.p0.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try {
      localStorage.setItem(`subq.p0.${key}`, JSON.stringify(value));
    } catch {
      // Memory copy still works for this visit.
    }
  },
};

// ---------------------------------------------------------------------------
// Device identity and event ids
// ---------------------------------------------------------------------------
const device = (() => {
  const saved = store.get('device', null);
  if (saved && saved.id) return saved;
  const fresh = { id: Math.random().toString(36).slice(2, 8), label: '', counter: 0 };
  store.set('device', fresh);
  return fresh;
})();

function nextEventId() {
  device.counter += 1;
  store.set('device', device);
  return `${device.id}:${device.counter}`;
}

const deviceName = () => device.label || `device ${device.id}`;

// ---------------------------------------------------------------------------
// Log and counters, kept across reloads so the report survives the offline test
// ---------------------------------------------------------------------------
let logLines = store.get('log', []);
let opStats = store.get('ops', {});
let syncStats = store.get('syncStats', { ok: 0, races: 0, recovered: 0, gaveUp: 0 });

function log(level, message) {
  logLines.push({ t: Date.now(), level, message });
  if (logLines.length > 300) logLines = logLines.slice(-300);
  store.set('log', logLines);
  renderLog();
}

function recordOp(op, ok, detail = '') {
  const stat = opStats[op] || (opStats[op] = { ok: 0, failed: 0, lastError: '' });
  if (ok) stat.ok += 1;
  else {
    stat.failed += 1;
    stat.lastError = detail;
  }
  store.set('ops', opStats);
}

function saveStats() {
  store.set('syncStats', syncStats);
}

class OfflineError extends Error {}

function report(error) {
  if (error instanceof OfflineError) log('warn', `${error.message}. Changes stay queued.`);
  else log('error', error.message || String(error));
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const state = {
  mode: store.get('mode', 'file'),
  token: null,
  grantedScope: '',
  account: null,
  tableFolderId: store.get('tableFolderId', null),
  tableName: store.get('tableName', ''),
  picked: store.get('picked', []),
  tree: null,
  open: null,
  syncing: false,
  syncAgain: false,
  gisReady: false,
  pickerReady: false,
  pickerRequested: false,
};

// ---------------------------------------------------------------------------
// Drive access
// ---------------------------------------------------------------------------
async function api(op, url, options = {}) {
  if (!state.token) throw new Error('Sign in first');
  let res;
  try {
    res = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: { ...(options.headers || {}), Authorization: `Bearer ${state.token}` },
    });
  } catch {
    recordOp(op, false, 'no connection');
    throw new OfflineError(`${op}: no connection`);
  }
  if (!res.ok) {
    let detail = String(res.status);
    try {
      const body = await res.json();
      if (body && body.error && body.error.message) detail += ` ${body.error.message}`;
    } catch {
      // Body was not JSON.
    }
    recordOp(op, false, detail);
    if (res.status === 401) {
      state.token = null;
      renderAuth();
      log('error', 'Google sign-in expired. Tap Sign in to continue; queued changes are kept.');
    }
    const error = new Error(`${op} failed: ${detail}`);
    error.status = res.status;
    throw error;
  }
  recordOp(op, true);
  return res;
}

const drive = makeDrive(api);

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------
function signIn() {
  if (!state.gisReady) {
    log('error', 'Google sign-in has not loaded yet. Check the connection and reload the page.');
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: CONFIG.scopes[state.mode],
    include_granted_scopes: false,
    callback: onToken,
    error_callback: (err) => log('error', `Sign-in did not finish: ${err.type || err.message || 'unknown reason'}`),
  });
  client.requestAccessToken({ prompt: 'select_account' });
}

async function onToken(response) {
  if (response.error) {
    log('error', `Sign-in refused: ${response.error} ${response.error_description || ''}`.trim());
    return;
  }
  state.token = response.access_token;
  state.grantedScope = response.scope || '';
  const granted = state.grantedScope.split(' ');
  const wanted = CONFIG.scopes[state.mode];
  const other = state.mode === 'file' ? CONFIG.scopes.full : CONFIG.scopes.file;
  log(granted.includes(wanted) ? 'ok' : 'error', `Signed in. Google granted: ${state.grantedScope || '(nothing reported)'}`);
  if (granted.includes(other)) {
    log('warn', 'This sign-in also carries the other Drive permission, so the round is not a clean test. Tap Revoke access and sign in again.');
  }
  try {
    state.account = await drive.about();
    log('ok', `Account: ${state.account.emailAddress}`);
  } catch (error) {
    report(error);
  }
  renderAuth();
  if (state.tableFolderId) await scanTable();
  if (state.open) refreshOpen('sign-in');
}

function signOut(revoke) {
  const token = state.token;
  state.token = null;
  state.account = null;
  state.grantedScope = '';
  if (revoke && token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => log('info', 'Access revoked. The next sign-in starts clean.'));
  } else if (revoke) {
    log('info', 'Sign in first, then revoke. Nothing to revoke on this page yet.');
  } else {
    log('info', 'Signed out on this page.');
  }
  renderAuth();
}

// ---------------------------------------------------------------------------
// Table folder: create, share, pick, scan
// ---------------------------------------------------------------------------
function setTable(id, name) {
  state.tableFolderId = id;
  state.tableName = name;
  store.set('tableFolderId', id);
  store.set('tableName', name);
  renderTable();
}

async function createTable() {
  try {
    const table = await drive.createFolder(CONFIG.tableFolderName);
    const dan = await drive.createFolder('Dan', table.id);
    await drive.createJson('Howerd.json', dan.id, S.newCharacter('Howerd', 'Dan'));
    setTable(table.id, table.name);
    log('ok', `Created "${table.name}" containing Dan/Howerd.json.`);
    await scanTable();
  } catch (error) {
    report(error);
  }
}

async function shareTable() {
  const email = $('shareEmail').value.trim();
  if (!state.tableFolderId) return log('error', 'Create or pick a table folder first.');
  if (!email.includes('@')) return log('error', "Enter the second account's email address.");
  try {
    await drive.share(state.tableFolderId, email);
    log('ok', `Shared the table folder with ${email} as Editor.`);
  } catch (error) {
    report(error);
    log('info', 'Fallback: share the folder from Google Drive instead (Share, add the email, Editor).');
  }
}

function openPicker() {
  if (!state.token) return log('error', 'Sign in first.');
  if (!state.pickerReady) return log('error', 'Google Picker has not loaded yet. Check the connection and reload the page.');
  const P = google.picker;
  const shared = new P.DocsView(P.ViewId.DOCS)
    .setOwnedByMe(false)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMode(P.DocsViewMode.LIST);
  const mine = new P.DocsView(P.ViewId.DOCS)
    .setOwnedByMe(true)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMode(P.DocsViewMode.LIST);
  const picker = new P.PickerBuilder()
    .addView(shared)
    .addView(mine)
    .enableFeature(P.Feature.MULTISELECT_ENABLED)
    .setOAuthToken(state.token)
    .setDeveloperKey(CONFIG.apiKey)
    .setAppId(CONFIG.appId)
    .setTitle('Pick the table folder, or character files')
    .setCallback(onPicked)
    .build();
  picker.setVisible(true);
}

async function onPicked(data) {
  const P = google.picker;
  const action = data[P.Response.ACTION];
  if (action === P.Action.CANCEL) return log('info', 'Picker closed without picking anything.');
  if (action !== P.Action.PICKED) return;
  const items = (data[P.Response.DOCUMENTS] || []).map((doc) => ({
    id: doc[P.Document.ID],
    name: doc[P.Document.NAME],
    mimeType: doc[P.Document.MIME_TYPE],
  }));
  recordOp('pick', true);
  log('ok', `Picked ${items.length}: ${items.map((item) => item.name).join(', ')}`);
  const folder = items.find((item) => item.mimeType === FOLDER_TYPE);
  const files = items.filter((item) => item.mimeType !== FOLDER_TYPE);
  if (files.length) {
    const byId = new Map(state.picked.map((item) => [item.id, item]));
    for (const file of files) byId.set(file.id, file);
    state.picked = [...byId.values()];
    store.set('picked', state.picked);
  }
  if (folder) {
    setTable(folder.id, folder.name);
    await scanTable();
  }
  renderTable();
}

async function scanTable() {
  if (!state.tableFolderId) return log('error', 'Create or pick a table folder first.');
  try {
    const info = await drive.meta(state.tableFolderId);
    const owner = info.owners && info.owners[0] ? info.owners[0].emailAddress : 'unknown';
    log('info', `Table folder "${info.name}": owner ${owner}, this account can edit: ${info.capabilities && info.capabilities.canEdit ? 'yes' : 'no'}.`);
    const top = await drive.list(state.tableFolderId);
    const tree = [
      {
        folder: { id: state.tableFolderId, name: info.name || state.tableName || 'Table' },
        root: true,
        items: top.filter((item) => item.mimeType !== FOLDER_TYPE),
      },
    ];
    for (const sub of top.filter((item) => item.mimeType === FOLDER_TYPE)) {
      tree.push({ folder: sub, root: false, items: await drive.list(sub.id) });
    }
    state.tree = tree;
    const fileCount = tree.reduce((total, group) => total + group.items.length, 0);
    log(fileCount ? 'ok' : 'warn', `Scan found ${tree.length - 1} player folder(s) and ${fileCount} file(s).`);
    if (!fileCount && state.mode === 'file') {
      log('info', 'Seeing nothing may mean picking a folder does not grant access to what is inside it. Try Pick from Drive and pick Howerd.json itself.');
    }
  } catch (error) {
    report(error);
  }
  renderTable();
}

async function addTestCharacter(folderId) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const name = `${deviceName()} test ${time}`;
  try {
    const file = await drive.createJson(`${name}.json`, folderId, S.newCharacter(name, deviceName()));
    log('ok', `Created ${file.name}.`);
    await scanTable();
  } catch (error) {
    report(error);
  }
}

// ---------------------------------------------------------------------------
// Character: local queue, sync and recovery
// ---------------------------------------------------------------------------
const pendingKey = (fileId) => `pending.${fileId}`;
const mineKey = (fileId) => `mine.${fileId}`;
const docKey = (fileId) => `doc.${fileId}`;

const getPending = (fileId) => store.get(pendingKey(fileId), []);
const setPending = (fileId, events) => store.set(pendingKey(fileId), events);

function clearConfirmed(fileId, ids) {
  const done = new Set(ids);
  setPending(fileId, getPending(fileId).filter((event) => !done.has(event.id)));
}

function currentEvents() {
  if (!state.open || !state.open.doc) return [];
  return S.mergeEvents(state.open.doc.events, getPending(state.open.fileId));
}

function acceptRemote(fileId, doc) {
  store.set(docKey(fileId), doc);
  if (state.open && state.open.fileId === fileId) state.open.doc = doc;
}

// If another device overwrote the file without this device's changes, the
// changes are still in this device's own copy, so they are queued again.
function recoverLost(fileId, remote) {
  const queued = new Set(getPending(fileId).map((event) => event.id));
  const onServer = new Set(remote.events.map((event) => event.id));
  const lost = store.get(mineKey(fileId), []).filter((event) => !onServer.has(event.id) && !queued.has(event.id));
  if (lost.length) {
    setPending(fileId, [...getPending(fileId), ...lost]);
    syncStats.recovered += lost.length;
    saveStats();
    log('warn', `Recovered ${lost.length} change(s) from this device that another device overwrote. Re-sending.`);
  }
  return lost.length;
}

async function openCharacter(file) {
  const cached = store.get(docKey(file.id), null);
  state.open = { fileId: file.id, name: file.name, doc: cached };
  store.set('openFile', { id: file.id, name: file.name });
  renderCharacter();
  if (!state.token || !navigator.onLine) {
    if (!cached) log('error', 'Sign in and connect to open this character for the first time.');
    return;
  }
  try {
    const remote = S.validateDoc(await drive.readJson(file.id));
    acceptRemote(file.id, remote);
    log('ok', `Opened ${remote.name}: HP ${S.computeHp(remote)}/${remote.maxHp}, ${remote.events.length} history entries.`);
    recoverLost(file.id, remote);
    renderCharacter();
    if (getPending(file.id).length) await syncOpen('open');
  } catch (error) {
    report(error);
  }
}

async function refreshOpen(reason) {
  const open = state.open;
  if (!open || !state.token || !navigator.onLine || state.syncing) return;
  try {
    const before = open.doc ? open.doc.events.length : 0;
    const remote = S.validateDoc(await drive.readJson(open.fileId));
    const recovered = recoverLost(open.fileId, remote);
    acceptRemote(open.fileId, remote);
    if (open.doc && remote.events.length > before && reason === 'auto') {
      log('info', `Pulled ${remote.events.length - before} new change(s) from another device.`);
    }
    renderCharacter();
    if (recovered || getPending(open.fileId).length) await syncOpen(reason);
  } catch (error) {
    report(error);
  }
}

async function syncOpen(reason) {
  const open = state.open;
  if (!open) return;
  if (state.syncing) {
    state.syncAgain = true;
    return;
  }
  if (!state.token || !navigator.onLine) {
    renderCharacter();
    return;
  }
  const fileId = open.fileId;
  state.syncing = true;
  renderCharacter();
  try {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const remote = S.validateDoc(await drive.readJson(fileId));
      recoverLost(fileId, remote);
      const pending = getPending(fileId);
      const ids = pending.map((event) => event.id);
      if (S.missingIds(remote.events, ids).length === 0) {
        clearConfirmed(fileId, ids);
        acceptRemote(fileId, remote);
        break;
      }
      const merged = S.mergeDoc(remote, pending);
      merged.lastEdited = {
        device: deviceName(),
        account: state.account ? state.account.emailAddress : '',
        ts: Date.now(),
      };
      await drive.writeJson(fileId, merged);
      const check = S.validateDoc(await drive.readJson(fileId));
      const lost = S.missingIds(check.events, ids);
      if (lost.length === 0) {
        clearConfirmed(fileId, ids);
        acceptRemote(fileId, check);
        syncStats.ok += 1;
        saveStats();
        log('ok', `Saved ${ids.length} change(s)${attempt > 1 ? ` on attempt ${attempt}` : ''} (${reason}).`);
        break;
      }
      syncStats.races += 1;
      saveStats();
      if (attempt === 4) {
        syncStats.gaveUp += 1;
        saveStats();
        log('error', 'Gave up after 4 attempts. The changes stay queued; tap Sync now to try again.');
        break;
      }
      log('warn', `Another device saved at the same moment and ${lost.length} change(s) were overwritten. Retrying (attempt ${attempt + 1}).`);
      await sleep(400 + Math.random() * 900);
    }
  } catch (error) {
    report(error);
  } finally {
    state.syncing = false;
    renderCharacter();
    if (state.syncAgain) {
      state.syncAgain = false;
      syncOpen('follow-up');
    }
  }
}

let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncOpen('edit'), 1200);
}

function addEvent(fields, { sync = true } = {}) {
  if (!state.open || !state.open.doc) {
    log('error', 'Open a character first.');
    return null;
  }
  const event = { id: nextEventId(), device: deviceName(), ts: Date.now(), ...fields };
  const fileId = state.open.fileId;
  setPending(fileId, [...getPending(fileId), event]);
  store.set(mineKey(fileId), [...store.get(mineKey(fileId), []), event]);
  renderCharacter();
  if (sync) scheduleSync();
  return event;
}

function undo() {
  const target = S.lastUndoable(currentEvents());
  if (!target) return log('info', 'Nothing to undo.');
  addEvent({ kind: 'undo', target: target.id });
}

async function raceTest() {
  if (!state.open || !state.open.doc) return log('error', 'Open a character first.');
  for (let i = 0; i < 5; i += 1) addEvent({ kind: 'hp', delta: -1 }, { sync: false });
  clearTimeout(syncTimer);
  log('info', 'Race test: 5 changes of −1 HP, saving immediately.');
  await syncOpen('race test');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function timeAgo(ts) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString();
}

function renderNet() {
  const online = navigator.onLine;
  $('net').textContent = online ? 'Online' : 'Offline';
  $('net').className = `chip ${online ? 'good' : 'bad'}`;
}

function renderAuth() {
  for (const input of document.querySelectorAll('input[name="mode"]')) input.checked = input.value === state.mode;
  const signedIn = Boolean(state.token);
  $('who').textContent = signedIn && state.account ? state.account.emailAddress : signedIn ? 'Signed in' : 'Not signed in';
  $('who').className = `chip ${signedIn ? 'good' : ''}`;
  $('authStatus').textContent = signedIn
    ? `Signed in${state.account ? ` as ${state.account.emailAddress}` : ''} · ${CONFIG.modeLabels[state.mode]}`
    : `Not signed in · will test ${CONFIG.modeLabels[state.mode]}`;
  $('signIn').disabled = !state.gisReady;
  $('signIn').textContent = state.gisReady ? 'Sign in with Google' : 'Loading Google sign-in…';
}

function renderTable() {
  $('tableStatus').textContent = state.tableFolderId
    ? `Table: ${state.tableName || 'unnamed folder'}`
    : 'No table folder yet. Create one (device A) or pick the shared one (device B).';
  const tree = $('tree');
  tree.replaceChildren();
  if (state.tree) {
    for (const group of state.tree) {
      const heading = el(
        'div',
        { class: 'group-head' },
        el('strong', {}, group.root ? `${group.folder.name} (table)` : group.folder.name),
        el('button', { type: 'button', class: 'small', onclick: () => addTestCharacter(group.folder.id) }, 'Add test character'),
      );
      const list = el('ul', { class: 'files' });
      if (!group.items.length) list.append(el('li', { class: 'muted' }, 'No files visible'));
      for (const item of group.items) list.append(fileRow(item));
      tree.append(el('div', { class: 'group' }, heading, list));
    }
  }
  if (state.picked.length) {
    const list = el('ul', { class: 'files' });
    for (const item of state.picked) list.append(fileRow(item));
    tree.append(el('div', { class: 'group' }, el('div', { class: 'group-head' }, el('strong', {}, 'Picked files')), list));
  }
}

function fileRow(item) {
  const owner = item.owners && item.owners[0] ? item.owners[0].emailAddress : '';
  const canEdit = item.capabilities ? (item.capabilities.canEdit ? 'can edit' : 'read only') : '';
  const meta = [owner, canEdit].filter(Boolean).join(' · ');
  const isJson = item.mimeType === 'application/json' || /\.json$/i.test(item.name);
  return el(
    'li',
    {},
    el('span', { class: 'file-name' }, item.name, meta ? el('small', {}, meta) : null),
    isJson ? el('button', { type: 'button', class: 'small', onclick: () => openCharacter(item) }, 'Open') : null,
  );
}

function renderCharacter() {
  const section = $('character');
  const open = state.open;
  section.hidden = !open;
  if (!open) return;
  if (!open.doc) {
    $('charName').textContent = open.name;
    $('hp').textContent = '…';
    $('hpMax').textContent = '';
    $('syncStatus').textContent = 'Loading…';
    $('history').replaceChildren();
    return;
  }
  const events = currentEvents();
  const view = { ...open.doc, events };
  const pending = getPending(open.fileId);
  const queued = new Set(pending.map((event) => event.id));
  const undone = S.undoneIds(events);
  $('charName').textContent = `${open.doc.name} · ${open.doc.player}`;
  $('hp').textContent = S.computeHp(view);
  $('hpMax').textContent = `/ ${open.doc.maxHp} HP`;
  const last = open.doc.lastEdited;
  $('lastEdited').textContent = last
    ? `Last saved on ${last.device}${last.account ? ` (${last.account})` : ''}, ${timeAgo(last.ts)}`
    : 'Not edited yet';
  let status;
  if (state.syncing) status = 'Saving…';
  else if (pending.length && !navigator.onLine) status = `Offline: ${pending.length} change(s) queued`;
  else if (pending.length && !state.token) status = `${pending.length} change(s) queued until you sign in`;
  else if (pending.length) status = `${pending.length} change(s) waiting to save`;
  else status = 'All changes saved';
  $('syncStatus').textContent = status;
  const history = $('history');
  history.replaceChildren();
  for (const event of [...events].reverse().slice(0, 30)) {
    const classes = [undone.has(event.id) ? 'undone' : '', queued.has(event.id) ? 'queued' : ''].join(' ').trim();
    history.append(
      el(
        'li',
        { class: classes },
        el('span', {}, S.describeEvent(event, events)),
        el('small', {}, `${event.device} · ${fmtTime(event.ts)}${queued.has(event.id) ? ' · queued' : ''}`),
      ),
    );
  }
  if (!events.length) history.append(el('li', { class: 'muted' }, 'No changes yet'));
}

function renderLog() {
  const list = $('log');
  if (!list) return;
  list.replaceChildren();
  for (const line of logLines.slice(-120).reverse()) {
    list.append(el('li', { class: line.level }, el('time', {}, fmtTime(line.t)), el('span', {}, line.message)));
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function buildReport() {
  const lines = [
    'SubQ phase 0 report',
    `Page: ${CONFIG.pageVersion}`,
    `When: ${new Date().toISOString()}`,
    `Device: ${deviceName()} [${device.id}]`,
    `Browser: ${navigator.userAgent}`,
    `Mode: ${CONFIG.modeLabels[state.mode]}`,
    `Granted: ${state.grantedScope || '(not signed in)'}`,
    `Account: ${state.account ? state.account.emailAddress : '(not signed in)'}`,
    `Table: ${state.tableName || '(none)'} ${state.tableFolderId || ''}`.trim(),
  ];
  if (state.open && state.open.doc) {
    const events = currentEvents();
    lines.push(
      `Open: ${state.open.doc.name}, HP ${S.computeHp({ ...state.open.doc, events })}/${state.open.doc.maxHp}, ` +
        `${events.length} history entries, ${getPending(state.open.fileId).length} queued`,
    );
  }
  lines.push(
    `Sync: saved ${syncStats.ok}, races ${syncStats.races}, recovered ${syncStats.recovered}, gave up ${syncStats.gaveUp}`,
    'Operations:',
  );
  for (const [op, stat] of Object.entries(opStats)) {
    lines.push(`  ${op}: ${stat.ok} ok, ${stat.failed} failed${stat.lastError ? ` (last error: ${stat.lastError})` : ''}`);
  }
  lines.push('Log:');
  for (const line of logLines.slice(-80)) lines.push(`  ${fmtTime(line.t)} ${line.level.toUpperCase()} ${line.message}`);
  return lines.join('\n');
}

async function copyReport() {
  const text = buildReport();
  const box = $('reportOut');
  try {
    await navigator.clipboard.writeText(text);
    box.hidden = true;
    log('ok', 'Report copied. Paste it into the chat.');
  } catch {
    box.hidden = false;
    box.value = text;
    box.focus();
    box.select();
    log('info', 'Could not copy automatically. The report is selected in the box above; copy it from there.');
  }
}

function clearLog() {
  logLines = [];
  opStats = {};
  syncStats = { ok: 0, races: 0, recovered: 0, gaveUp: 0 };
  store.set('log', logLines);
  store.set('ops', opStats);
  saveStats();
  $('reportOut').hidden = true;
  renderLog();
  log('info', `Log and counts cleared. Mode: ${CONFIG.modeLabels[state.mode]}.`);
}

// ---------------------------------------------------------------------------
// Google script loading
// ---------------------------------------------------------------------------
function checkGis() {
  if (window.google && google.accounts && google.accounts.oauth2) {
    state.gisReady = true;
    renderAuth();
  }
}

function checkGapi() {
  if (window.gapi && !state.pickerRequested) {
    state.pickerRequested = true;
    gapi.load('picker', () => {
      state.pickerReady = true;
    });
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function wire() {
  $('deviceLabel').value = device.label;
  $('deviceLabel').addEventListener('change', (event) => {
    device.label = event.target.value.trim();
    store.set('device', device);
    log('info', `This device is now called "${deviceName()}".`);
  });

  for (const input of document.querySelectorAll('input[name="mode"]')) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.mode = input.value;
      store.set('mode', state.mode);
      if (state.token) {
        signOut(false);
        log('info', `Switched to ${CONFIG.modeLabels[state.mode]}. Sign in again to use it.`);
      }
      renderAuth();
    });
  }

  $('signIn').addEventListener('click', signIn);
  $('signOut').addEventListener('click', () => signOut(false));
  $('revoke').addEventListener('click', () => signOut(true));
  $('createTable').addEventListener('click', createTable);
  $('share').addEventListener('click', shareTable);
  $('pick').addEventListener('click', openPicker);
  $('scan').addEventListener('click', scanTable);
  for (const button of document.querySelectorAll('[data-delta]')) {
    button.addEventListener('click', () => addEvent({ kind: 'hp', delta: Number(button.dataset.delta) }));
  }
  $('longRest').addEventListener('click', () => {
    if (state.open && state.open.doc) addEvent({ kind: 'hp', set: true, value: state.open.doc.maxHp });
  });
  $('undo').addEventListener('click', undo);
  $('race').addEventListener('click', raceTest);
  $('syncNow').addEventListener('click', () => {
    clearTimeout(syncTimer);
    syncOpen('sync now');
  });
  $('copyReport').addEventListener('click', copyReport);
  $('clearLog').addEventListener('click', clearLog);

  window.addEventListener('online', () => {
    renderNet();
    log('info', 'Back online.');
    if (state.open && getPending(state.open.fileId).length) syncOpen('reconnect');
    else renderCharacter();
  });
  window.addEventListener('offline', () => {
    renderNet();
    log('warn', 'Offline. Changes will queue on this device.');
    renderCharacter();
  });
  window.addEventListener('gis-loaded', checkGis);
  window.addEventListener('gapi-loaded', checkGapi);

  setInterval(() => {
    if (document.visibilityState === 'visible' && state.open && !state.syncing) refreshOpen('auto');
    if (state.open) renderCharacter();
  }, 15000);
}

function start() {
  wire();
  const last = store.get('openFile', null);
  if (last) {
    const cached = store.get(docKey(last.id), null);
    if (cached) state.open = { fileId: last.id, name: last.name, doc: cached };
  }
  renderNet();
  renderAuth();
  renderTable();
  renderCharacter();
  renderLog();
  checkGis();
  checkGapi();
}

start();
