import AsyncStorage from '@react-native-async-storage/async-storage';
import { CAT_EN } from './questions';
import {
  getLocalProgress, writeLocalProgress,
  getLocalHistory, addLocalHistory, clearLocalHistory,
  getLocalStreak, setLocalStreak,
  getLocalQuestions, syncQuestions,
} from './db';

export {
  getAuthState, onAuthChange, signUpEmail, signInEmail, signOutUser,
} from './db';

export const getQuestions = () => getLocalQuestions();
export const refreshQuestions = () => syncQuestions();

// ── LOCAL KEYS (prefs only — stay on device) ──────────────────────────────────
const KEYS = {
  DARK:      'dk_dark',
  LANG:      'dk_lang',
};

// ── SM-2 ──────────────────────────────────────────────────────────────────────
const DEFAULT_EF = 2.5;
const MIN_EF     = 1.3;

const gradeFromOk = (ok) => ok ? 5 : 1;

function sm2(card, grade) {
  let { n, ef, interval } = card;

  ef = Math.max(MIN_EF, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  if (grade < 3) {
    n = 0;
    interval = 1;
  } else {
    if (n === 0)      interval = 1;
    else if (n === 1) interval = 6;
    else              interval = Math.round(interval * ef);
    n += 1;
  }

  const due = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { n, ef, interval, due };
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
// Reads are always local — no network round trip, works fully offline.
export const getProgress = async () => {
  try { return await getLocalProgress(); } catch { return {}; }
};

export const markAnswer = async (id, ok) => {
  try {
    const p = await getLocalProgress();
    const existing = p[id] || { n: 0, ef: DEFAULT_EF, interval: 0, due: 0, wrong: 0, seen: 0 };

    const grade = gradeFromOk(ok);
    const { n, ef, interval, due } = sm2(existing, grade);

    const card = {
      n, ef, interval, due,
      wrong: existing.wrong + (ok ? 0 : 1),
      seen:  existing.seen + 1,
      last:  Date.now(),
    };

    // Writes locally first (instant, offline-safe) and queues the same
    // computed row for background sync — see db.js for the dedup rationale.
    await writeLocalProgress(id, card);
  } catch (e) {
    console.error('markAnswer failed:', e);
  }
};

export const getWrongIds = async () => {
  try {
    const p = await getLocalProgress();
    const now = Date.now();
    return Object.entries(p)
      .filter(([, card]) => card.wrong > 0)
      .map(([id, card]) => {
        const overdueDays = (now - card.due) / (24 * 60 * 60 * 1000);
        const errorRate   = card.seen > 0 ? card.wrong / card.seen : 0;
        const priority    = overdueDays * errorRate + errorRate;
        return { id: Number(id), priority };
      })
      .sort((a, b) => b.priority - a.priority)
      .map(({ id }) => id);
  } catch { return []; }
};

// ── HISTORY ───────────────────────────────────────────────────────────────────
export const getHistory = async () => {
  try { return await getLocalHistory(50); } catch { return []; }
};

export const addHistory = async (entry) => {
  try { await addLocalHistory(entry); } catch (e) { console.error('addHistory failed:', e); }
};

export const clearHistory = async () => {
  try { await clearLocalHistory(); } catch (e) { console.error('clearHistory failed:', e); }
};

// ── STREAK ────────────────────────────────────────────────────────────────────
export const checkStreak = async () => {
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const { streak, lastStudy } = await getLocalStreak();
    if (lastStudy === today) return streak;

    const newStreak = lastStudy === yesterday ? streak + 1 : 1;
    await setLocalStreak(newStreak, today);
    return newStreak;
  } catch { return 0; }
};

// ── MASTERY ───────────────────────────────────────────────────────────────────
export const getMastery = async () => {
  const [p, Q] = await Promise.all([getProgress(), getQuestions()]);
  const result = {};
  Object.keys(CAT_EN).forEach(cat => {
    const catQs  = Q.filter(q => q.cat === cat);
    const seen   = catQs.filter(q => p[q.id] && p[q.id].seen > 0);
    const mature = seen.filter(q => {
      const card = p[q.id];
      return card.ef >= 2.0 && card.interval >= 7;
    });
    result[cat] = {
      total:  catQs.length,
      seen:   seen.length,
      mature: mature.length,
      pct:    catQs.length > 0 ? Math.round((mature.length / catQs.length) * 100) : 0,
    };
  });
  return result;
};

// ── PREFS (local only) ────────────────────────────────────────────────────────
export const getPrefs = async () => {
  try {
    const dark = await AsyncStorage.getItem(KEYS.DARK);
    const lang = await AsyncStorage.getItem(KEYS.LANG);
    return { dark: dark === 'true', lang: lang || 'en' };
  } catch { return { dark: false, lang: 'en' }; }
};

export const savePrefs = async (prefs) => {
  try {
    await AsyncStorage.setItem(KEYS.DARK, String(prefs.dark));
    await AsyncStorage.setItem(KEYS.LANG, prefs.lang);
  } catch {}
};
