import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  PROGRESS: 'dk_progress',
  HISTORY:  'dk_history',
  STREAK:   'dk_streak',
  LAST_STUDY: 'dk_lastStudy',
  DARK:     'dk_dark',
  LANG:     'dk_lang',
};

// ── SM-2 CARD SCHEMA ──────────────────────────────────────────────────────────
// Each card in progress:
// {
//   n:        number   — repetition count (SM-2 n)
//   ef:       number   — easiness factor, starts at 2.5
//   interval: number   — days until next review
//   due:      number   — unix ms timestamp of next due date
//   wrong:    number   — total wrong answers (kept for compat)
//   seen:     number   — total answers
//   last:     number   — timestamp of last answer
// }

const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;

// SM-2 grade: 5 = perfect, 4 = correct hesitation, 3 = correct with difficulty,
// 2 = incorrect easy recall, 1 = incorrect, 0 = blackout
// We map boolean ok → grade internally.
// Perfect answer on first try → 5, ok after wrong attempts → 3, wrong → 1
const gradeFromOk = (ok) => ok ? 5 : 1;

function sm2(card, grade) {
  let { n, ef, interval } = card;

  // Update EF
  ef = Math.max(MIN_EF, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  if (grade < 3) {
    // Failed: reset repetitions but keep EF
    n = 0;
    interval = 1;
  } else {
    // Passed
    if (n === 0)      interval = 1;
    else if (n === 1) interval = 6;
    else              interval = Math.round(interval * ef);
    n += 1;
  }

  const due = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { n, ef, interval, due };
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
export const getProgress = async () => {
  try {
    const v = await AsyncStorage.getItem(KEYS.PROGRESS);
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
};

export const saveProgress = async (p) => {
  try { await AsyncStorage.setItem(KEYS.PROGRESS, JSON.stringify(p)); } catch {}
};

export const markAnswer = async (id, ok) => {
  const p = await getProgress();
  const existing = p[id] || { n: 0, ef: DEFAULT_EF, interval: 0, due: 0, wrong: 0, seen: 0 };

  const grade = gradeFromOk(ok);
  const { n, ef, interval, due } = sm2(existing, grade);

  p[id] = {
    ...existing,
    n,
    ef,
    interval,
    due,
    wrong: existing.wrong + (ok ? 0 : 1),
    seen:  existing.seen + 1,
    last:  Date.now(),
  };

  await saveProgress(p);
};

// ── WEAK SPOTS: SM-2 PRIORITY ─────────────────────────────────────────────────
// Returns question IDs sorted by priority descending.
// Priority = how overdue the card is, scaled by error rate.
// Cards never seen score 0 (excluded — they belong in normal practice).
// Cards due in the future score > 0 if they have wrong answers (still worth reviewing
// if you've never got them right consistently).

export const getWrongIds = async () => {
  const p = await getProgress();
  const now = Date.now();

  const scored = Object.entries(p)
    .filter(([, card]) => card.wrong > 0)
    .map(([id, card]) => {
      // How overdue in days (negative = not yet due)
      const overdueDays = (now - (card.due || 0)) / (24 * 60 * 60 * 1000);
      // Error rate
      const errorRate = card.seen > 0 ? card.wrong / card.seen : 0;
      // Priority: overdue cards weighted by error rate
      // Cards not yet due still get a small positive score if errorRate is high
      const priority = overdueDays * errorRate + errorRate;
      return { id: Number(id), priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .map(({ id }) => id);

  return scored;
};

// ── HISTORY ───────────────────────────────────────────────────────────────────
export const getHistory = async () => {
  try {
    const v = await AsyncStorage.getItem(KEYS.HISTORY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};

export const addHistory = async (entry) => {
  const h = await getHistory();
  h.unshift(entry);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(h.slice(0, 50)));
};

export const clearHistory = async () => {
  await AsyncStorage.removeItem(KEYS.HISTORY);
};

// ── STREAK ────────────────────────────────────────────────────────────────────
export const checkStreak = async () => {
  try {
    const today     = new Date().toDateString();
    const last      = await AsyncStorage.getItem(KEYS.LAST_STUDY) || '';
    const streak    = parseInt(await AsyncStorage.getItem(KEYS.STREAK) || '0');
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = last === today ? streak : last === yesterday ? streak + 1 : 1;
    if (last !== today) {
      await AsyncStorage.setItem(KEYS.STREAK,     String(newStreak));
      await AsyncStorage.setItem(KEYS.LAST_STUDY, today);
    }
    return newStreak;
  } catch { return 0; }
};

// ── MASTERY ───────────────────────────────────────────────────────────────────
// Mastery now reflects SM-2 health: % of seen cards with EF >= 2.0 and interval >= 7
// i.e. cards you've genuinely learned, not just seen once.
export const getMastery = async () => {
  const { Q, CAT_EN } = require('./questions');
  const p = await getProgress();
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
      // pct represents "mature" cards out of total, so it doesn't inflate
      // just from seeing a card once
      pct: catQs.length > 0 ? Math.round((mature.length / catQs.length) * 100) : 0,
    };
  });
  return result;
};

// ── PREFS ─────────────────────────────────────────────────────────────────────
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
