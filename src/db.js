/**
 * db.js — Local SQLite cache + sync queue
 *
 * SQLite is the source of truth for reads. Every write lands here first
 * (instant, works offline) and is queued for background sync to Supabase.
 * storage.js contains the SM-2 math and public API; this module only knows
 * about rows and queues, not scoring logic.
 *
 * Idempotency: the sync queue stores the *already-computed final row* for
 * progress writes (never "replay this function"), so retrying a flush after
 * a network blip that actually succeeded can never double-apply an SM-2 step.
 * History/streak writes carry a client-generated id used as the upsert key
 * remotely, so retries can't create duplicates either.
 */

import * as SQLite from 'expo-sqlite';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { Q as FALLBACK_Q } from './questions';

const DB_NAME = 'dansk.db';

let _dbPromise = null;
let _readyPromise = null;

const uuid = () => {
  // Not cryptographically strong — only needs to be unique per device, used
  // purely as an idempotency key for sync, not for anything security-sensitive.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

function getDb() {
  if (!_dbPromise) _dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return _dbPromise;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user.id;
}

export async function getAuthState() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user || null;
  return { user, isAnonymous: !user || user.is_anonymous === true };
}

// Fires on sign-in/sign-up/sign-out/token-refresh. Returns an unsubscribe fn.
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user || null;
    callback({ event, user, isAnonymous: !user || user.is_anonymous === true });
  });
  return () => subscription.unsubscribe();
}

export async function signUpEmail(email, password) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.is_anonymous) {
    // Upgrade the existing anonymous identity in place — same UID, so
    // whatever progress this device already made stays attached.
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    return data.user;
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signInEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutUser() {
  await supabase.auth.signOut();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function createTables(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS progress (
      question_id INTEGER PRIMARY KEY,
      n INTEGER NOT NULL,
      ef REAL NOT NULL,
      interval INTEGER NOT NULL,
      due TEXT NOT NULL,
      wrong INTEGER NOT NULL,
      seen INTEGER NOT NULL,
      last_seen TEXT
    );
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      entry TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      cat TEXT NOT NULL,
      type TEXT NOT NULL,
      en TEXT NOT NULL,
      da TEXT NOT NULL
    );
  `);
}

async function getMeta(db, key) {
  const row = await db.getFirstAsync('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMeta(db, key, value) {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

// One-time pull so upgrading users don't see their existing Supabase
// progress/history/streak vanish just because the local cache starts empty.
async function initialHydrate(db) {
  const done = await getMeta(db, 'initial_hydrate_done');
  if (done === '1') return;

  try {
    const userId = await getUserId();

    const [{ data: progressRows }, { data: historyRows }, { data: streakRow }] = await withTimeout(Promise.all([
      supabase.from('progress').select('question_id, n, ef, interval, due, wrong, seen, last_seen').eq('user_id', userId),
      supabase.from('history').select('entry, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('streaks').select('streak, last_study').eq('user_id', userId).single(),
    ]), 15000);

    for (const row of progressRows || []) {
      await db.runAsync(
        `INSERT INTO progress (question_id, n, ef, interval, due, wrong, seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(question_id) DO UPDATE SET n=excluded.n, ef=excluded.ef, interval=excluded.interval,
           due=excluded.due, wrong=excluded.wrong, seen=excluded.seen, last_seen=excluded.last_seen`,
        [Number(row.question_id), row.n, row.ef, row.interval, row.due, row.wrong, row.seen, row.last_seen]
      );
    }

    for (const row of historyRows || []) {
      await db.runAsync(
        'INSERT OR IGNORE INTO history (id, entry, created_at) VALUES (?, ?, ?)',
        [uuid(), JSON.stringify(row.entry), row.created_at]
      );
    }

    if (streakRow) {
      await setMeta(db, 'streak', String(streakRow.streak || 0));
      await setMeta(db, 'last_study', streakRow.last_study || '');
    }
  } catch (e) {
    // Offline on first run, or no remote data yet — fine, start empty.
    console.warn('initialHydrate skipped:', e?.message || e);
    return; // don't mark done — try again next launch
  }

  await setMeta(db, 'initial_hydrate_done', '1');
}

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
// Same cache-then-revalidate approach as the web app: show what's cached
// instantly, refetch in the background, replace on success. The bundled
// FALLBACK_Q only seeds a true cold start (no cache yet) that also has no
// network — after that, Supabase is the only source of truth.
function mapRemoteQuestion(r) {
  return {
    id: Number(r.id), cat: r.category, type: r.type,
    en: [r.en_question, r.en_options, r.en_correct, r.en_explanation],
    da: [r.da_question, r.da_options, r.da_correct, r.da_explanation],
  };
}

async function replaceLocalQuestions(db, questions) {
  await db.execAsync('DELETE FROM questions');
  for (const q of questions) {
    await db.runAsync(
      'INSERT INTO questions (id, cat, type, en, da) VALUES (?, ?, ?, ?, ?)',
      [q.id, q.cat, q.type, JSON.stringify(q.en), JSON.stringify(q.da)]
    );
  }
}

export async function getLocalQuestions() {
  const db = await ready();
  const rows = await db.getAllAsync('SELECT * FROM questions ORDER BY id ASC');
  return rows.map(r => ({ id: r.id, cat: r.cat, type: r.type, en: JSON.parse(r.en), da: JSON.parse(r.da) }));
}

export async function syncQuestions() {
  const db = await getDb();
  try {
    const { data, error } = await withTimeout(
      supabase.from('questions').select('*').order('id', { ascending: true }),
      15000
    );
    if (error || !data || data.length === 0) return false;
    await replaceLocalQuestions(db, data.map(mapRemoteQuestion));
    return true;
  } catch (e) {
    // Timeout, or offline — caller falls back to whatever's already cached.
    console.warn('syncQuestions failed, keeping local cache:', e?.message || e);
    return false;
  }
}

async function ensureQuestionsLoaded(db) {
  const row = await db.getFirstAsync('SELECT COUNT(*) as n FROM questions');
  if ((row?.n || 0) > 0) {
    syncQuestions(); // have something to show already — refresh in the background
    return;
  }
  const synced = await syncQuestions(); // cold start — block until we have something
  if (!synced) {
    const stillEmpty = ((await db.getFirstAsync('SELECT COUNT(*) as n FROM questions'))?.n || 0) === 0;
    if (stillEmpty) await replaceLocalQuestions(db, FALLBACK_Q); // offline on very first launch
  }
}

// ── IDENTITY SWITCH ───────────────────────────────────────────────────────────
// Signing in as a different account (or signing out, which starts a fresh
// anonymous session) means the local cache belongs to the wrong user now.
let _trackedUserId = null;
function armIdentityWatcher() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    const newId = session?.user?.id || null;
    if (newId && _trackedUserId !== null && newId !== _trackedUserId) {
      const db = await getDb();
      await flushSyncQueue().catch(() => {}); // best-effort: push whatever the old identity owed first
      await db.execAsync('DELETE FROM progress; DELETE FROM history; DELETE FROM sync_queue;');
      await setMeta(db, 'initial_hydrate_done', '0');
      await initialHydrate(db);
    }
    _trackedUserId = newId;
  });
}

let _listenersArmed = false;
function armBackgroundFlush() {
  if (_listenersArmed) return;
  _listenersArmed = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') flushSyncQueue();
  });
  Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    if (isConnected && isInternetReachable !== false) flushSyncQueue();
  });
  // Also sweep periodically in case neither event fires during a long session.
  setInterval(() => flushSyncQueue(), 5 * 60 * 1000);
}

export function initDb() {
  if (!_readyPromise) {
    _readyPromise = (async () => {
      const db = await getDb();
      await createTables(db);
      await initialHydrate(db);
      await ensureQuestionsLoaded(db);
      armBackgroundFlush();
      armIdentityWatcher();
      flushSyncQueue(); // opportunistic, don't block startup on it
      return db;
    })();
  }
  return _readyPromise;
}

async function ready() {
  return initDb();
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
export async function getLocalProgress() {
  const db = await ready();
  const rows = await db.getAllAsync('SELECT * FROM progress');
  return Object.fromEntries(rows.map(r => [
    r.question_id,
    { n: r.n, ef: r.ef, interval: r.interval, due: new Date(r.due).getTime(), wrong: r.wrong, seen: r.seen, last: r.last_seen ? new Date(r.last_seen).getTime() : null },
  ]));
}

// `card` is the fully-computed final row (see storage.js) — never a delta.
export async function writeLocalProgress(questionId, card) {
  const db = await ready();
  const due = new Date(card.due).toISOString();
  const lastSeen = new Date(card.last).toISOString();

  await db.runAsync(
    `INSERT INTO progress (question_id, n, ef, interval, due, wrong, seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(question_id) DO UPDATE SET n=excluded.n, ef=excluded.ef, interval=excluded.interval,
       due=excluded.due, wrong=excluded.wrong, seen=excluded.seen, last_seen=excluded.last_seen`,
    [questionId, card.n, card.ef, card.interval, due, card.wrong, card.seen, lastSeen]
  );

  await enqueue(db, 'progress', {
    question_id: String(questionId),
    n: card.n, ef: card.ef, interval: card.interval, due, wrong: card.wrong, seen: card.seen, last_seen: lastSeen,
  });

  flushSyncQueue();
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
export async function getLocalHistory(limit = 50) {
  const db = await ready();
  const rows = await db.getAllAsync('SELECT entry FROM history ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows.map(r => JSON.parse(r.entry));
}

export async function addLocalHistory(entry) {
  const db = await ready();
  const id = uuid();
  const createdAt = new Date().toISOString();

  await db.runAsync('INSERT INTO history (id, entry, created_at) VALUES (?, ?, ?)', [id, JSON.stringify(entry), createdAt]);
  await enqueue(db, 'history', { id, entry, created_at: createdAt });

  flushSyncQueue();
}

export async function clearLocalHistory() {
  const db = await ready();
  await db.runAsync('DELETE FROM history');
  await enqueue(db, 'history_clear', {});
  flushSyncQueue();
}

// ── STREAK ────────────────────────────────────────────────────────────────────
export async function getLocalStreak() {
  const db = await ready();
  const streak = await getMeta(db, 'streak');
  const lastStudy = await getMeta(db, 'last_study');
  return { streak: Number(streak || 0), lastStudy: lastStudy || '' };
}

export async function setLocalStreak(streak, lastStudy) {
  const db = await ready();
  await setMeta(db, 'streak', String(streak));
  await setMeta(db, 'last_study', lastStudy);
  await enqueue(db, 'streak', { streak, last_study: lastStudy });
  flushSyncQueue();
}

// ── SYNC QUEUE ────────────────────────────────────────────────────────────────
async function enqueue(db, kind, payload) {
  await db.runAsync(
    'INSERT INTO sync_queue (kind, payload, created_at) VALUES (?, ?, ?)',
    [kind, JSON.stringify(payload), new Date().toISOString()]
  );
}

const BACKOFF_MS = [5000, 30000, 120000, 900000]; // 5s, 30s, 2min, 15min

let _flushing = false;
export async function flushSyncQueue() {
  if (_flushing) return;
  _flushing = true;
  try {
    const db = await ready();
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.isConnected === false) return;

    const userId = await getUserId().catch(() => null);
    if (!userId) return;

    const now = Date.now();
    const rows = await db.getAllAsync(
      'SELECT * FROM sync_queue WHERE next_attempt_at <= ? ORDER BY id ASC LIMIT 50',
      [now]
    );

    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      try {
        if (row.kind === 'progress') {
          const { error } = await supabase.from('progress').upsert(
            { user_id: userId, ...payload },
            { onConflict: 'user_id,question_id' }
          );
          if (error) throw error;
        } else if (row.kind === 'history') {
          const { error } = await supabase.from('history').upsert(
            { id: payload.id, user_id: userId, entry: payload.entry, created_at: payload.created_at },
            { onConflict: 'id' }
          );
          if (error) throw error;
        } else if (row.kind === 'history_clear') {
          const { error } = await supabase.from('history').delete().eq('user_id', userId);
          if (error) throw error;
        } else if (row.kind === 'streak') {
          const { error } = await supabase.from('streaks').upsert(
            { user_id: userId, streak: payload.streak, last_study: payload.last_study },
            { onConflict: 'user_id' }
          );
          if (error) throw error;
        }

        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
      } catch (e) {
        const attempts = row.attempts + 1;
        const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
        await db.runAsync(
          'UPDATE sync_queue SET attempts = ?, next_attempt_at = ? WHERE id = ?',
          [attempts, Date.now() + delay, row.id]
        );
        // Stop this pass on first failure — later rows for the same kind are
        // likely to fail the same way (e.g. offline), no point burning through them.
        break;
      }
    }
  } finally {
    _flushing = false;
  }
}

export async function getSyncQueueLength() {
  const db = await ready();
  const row = await db.getFirstAsync('SELECT COUNT(*) as n FROM sync_queue');
  return row?.n ?? 0;
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────
export async function clearLocalDb() {
  const db = await ready();
  await db.execAsync('DELETE FROM progress; DELETE FROM history; DELETE FROM sync_queue; DELETE FROM meta;');
}
