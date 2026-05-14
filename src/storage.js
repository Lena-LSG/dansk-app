import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Q, CAT_EN } from './questions';

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

  const due = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();
  return { n, ef, interval, due };
}

// ── AUTH HELPER ───────────────────────────────────────────────────────────────
// Returns current user ID, signing in anonymously if needed.
// All progress is tied to this ID — upgrades to real account preserve data.
async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  // No session — sign in anonymously
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user.id;
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
// Returns progress as { [questionId]: card } — same shape as before
export const getProgress = async () => {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('progress')
      .select('question_id, n, ef, interval, due, wrong, seen, last_seen')
      .eq('user_id', userId);

    if (error) throw error;

    return Object.fromEntries(
      (data || []).map(row => [
        Number(row.question_id),
        {
          n:        row.n,
          ef:       row.ef,
          interval: row.interval,
          due:      new Date(row.due).getTime(),
          wrong:    row.wrong,
          seen:     row.seen,
          last:     row.last_seen ? new Date(row.last_seen).getTime() : null,
        }
      ])
    );
  } catch { return {}; }
};

export const markAnswer = async (id, ok) => {
  try {
    const userId = await getUserId();

    // Fetch existing card
    const { data: existing } = await supabase
      .from('progress')
      .select('*')
      .eq('user_id', userId)
      .eq('question_id', String(id))
      .single();

    const card = existing || { n: 0, ef: DEFAULT_EF, interval: 0, due: new Date().toISOString(), wrong: 0, seen: 0 };
    const grade = gradeFromOk(ok);
    const { n, ef, interval, due } = sm2(card, grade);

    await supabase.from('progress').upsert({
      user_id:     userId,
      question_id: String(id),
      n,
      ef,
      interval,
      due,
      wrong:     (card.wrong || 0) + (ok ? 0 : 1),
      seen:      (card.seen  || 0) + 1,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });
  } catch (e) {
    console.error('markAnswer failed:', e);
  }
};

export const getWrongIds = async () => {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('progress')
      .select('question_id, n, ef, interval, due, wrong, seen')
      .eq('user_id', userId)
      .gt('wrong', 0);

    if (error) throw error;

    const now = Date.now();
    return (data || [])
      .map(row => {
        const overdueDays = (now - new Date(row.due).getTime()) / (24 * 60 * 60 * 1000);
        const errorRate   = row.seen > 0 ? row.wrong / row.seen : 0;
        const priority    = overdueDays * errorRate + errorRate;
        return { id: Number(row.question_id), priority };
      })
      .sort((a, b) => b.priority - a.priority)
      .map(({ id }) => id);
  } catch { return []; }
};

// ── HISTORY ───────────────────────────────────────────────────────────────────
// Stored in a separate Supabase table. Add to schema if needed:
// create table history (
//   id uuid default gen_random_uuid() primary key,
//   user_id uuid references auth.users(id) on delete cascade,
//   entry jsonb not null,
//   created_at timestamptz default now()
// );
// alter table history enable row level security;
// create policy "history owner only" on history for all using (auth.uid() = user_id);
// GRANT SELECT, INSERT, DELETE ON public.history TO service_role;

export const getHistory = async () => {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('history')
      .select('entry, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []).map(r => r.entry);
  } catch { return []; }
};

export const addHistory = async (entry) => {
  try {
    const userId = await getUserId();
    await supabase.from('history').insert({ user_id: userId, entry });
  } catch (e) {
    console.error('addHistory failed:', e);
  }
};

export const clearHistory = async () => {
  try {
    const userId = await getUserId();
    await supabase.from('history').delete().eq('user_id', userId);
  } catch (e) {
    console.error('clearHistory failed:', e);
  }
};

// ── STREAK ────────────────────────────────────────────────────────────────────
// Stored in a streak table. Add to schema if needed:
// create table streaks (
//   user_id uuid primary key references auth.users(id) on delete cascade,
//   streak int default 0,
//   last_study date
// );
// alter table streaks enable row level security;
// create policy "streaks owner only" on streaks for all using (auth.uid() = user_id);
// GRANT SELECT, INSERT, UPDATE ON public.streaks TO service_role;

export const checkStreak = async () => {
  try {
    const userId  = await getUserId();
    const today   = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const { data } = await supabase
      .from('streaks')
      .select('streak, last_study')
      .eq('user_id', userId)
      .single();

    const last   = data?.last_study || '';
    const streak = data?.streak     || 0;

    if (last === today) return streak;

    const newStreak = last === yesterday ? streak + 1 : 1;

    await supabase.from('streaks').upsert({
      user_id:    userId,
      streak:     newStreak,
      last_study: today,
    }, { onConflict: 'user_id' });

    return newStreak;
  } catch { return 0; }
};

// ── MASTERY ───────────────────────────────────────────────────────────────────
export const getMastery = async () => {
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
