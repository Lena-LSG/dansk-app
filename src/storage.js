import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  PROGRESS: 'dk_progress',
  HISTORY: 'dk_history',
  STREAK: 'dk_streak',
  LAST_STUDY: 'dk_lastStudy',
  DARK: 'dk_dark',
  LANG: 'dk_lang',
};

export const getProgress = async () => {
  try { const v = await AsyncStorage.getItem(KEYS.PROGRESS); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
};
export const saveProgress = async (p) => {
  try { await AsyncStorage.setItem(KEYS.PROGRESS, JSON.stringify(p)); } catch {}
};
export const markAnswer = async (id, ok) => {
  const p = await getProgress();
  if (!p[id]) p[id] = { wrong: 0, seen: 0 };
  p[id].seen++;
  if (!ok) p[id].wrong++;
  p[id].last = Date.now();
  await saveProgress(p);
};
export const getWrongIds = async () => {
  const p = await getProgress();
  return Object.keys(p).filter(id => p[id].wrong > 0).map(Number);
};
export const getHistory = async () => {
  try { const v = await AsyncStorage.getItem(KEYS.HISTORY); return v ? JSON.parse(v) : []; }
  catch { return []; }
};
export const addHistory = async (entry) => {
  const h = await getHistory();
  h.unshift(entry);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(h.slice(0, 50)));
};
export const clearHistory = async () => {
  await AsyncStorage.removeItem(KEYS.HISTORY);
};
export const checkStreak = async () => {
  try {
    const today = new Date().toDateString();
    const last = await AsyncStorage.getItem(KEYS.LAST_STUDY) || '';
    const streak = parseInt(await AsyncStorage.getItem(KEYS.STREAK) || '0');
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = last === today ? streak : last === yesterday ? streak + 1 : 1;
    if (last !== today) {
      await AsyncStorage.setItem(KEYS.STREAK, String(newStreak));
      await AsyncStorage.setItem(KEYS.LAST_STUDY, today);
    }
    return newStreak;
  } catch { return 0; }
};
export const getMastery = async () => {
  const { Q, CAT_EN } = require('./questions');
  const p = await getProgress();
  const result = {};
  Object.keys(CAT_EN).forEach(cat => {
    const catQs = Q.filter(q => q.cat === cat);
    const seen = catQs.filter(q => p[q.id]);
    const good = catQs.filter(q => p[q.id] && p[q.id].seen > 0 && p[q.id].wrong < p[q.id].seen);
    result[cat] = { total: catQs.length, seen: seen.length, pct: seen.length ? Math.round((good.length / seen.length) * 100) : 0 };
  });
  return result;
};
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
