import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions,
  StatusBar, Animated, Alert, Share, useColorScheme, Platform
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Q, COLORS, CAT_EN, CAT_DA, TYPE_LABELS, shuffle } from './src/questions';
import {
  markAnswer, getWrongIds, addHistory, getHistory, clearHistory,
  checkStreak, getMastery, getPrefs, savePrefs
} from './src/storage';

const { width: SW, height: SH } = Dimensions.get('window');

// ── THEME ────────────────────────────────────────────────────────────────────
const light = {
  bg: '#F7F3EE', card: '#FFFFFF', text: '#1a1a2e', sub: '#6b6b6b',
  bdr: '#E4DDD4', pbg: '#EDE8E0', ebg: '#1a1a2e', etxt: 'rgba(255,255,255,.9)',
  opt: '#FFFFFF', optBdr: '#DDD6CC', sh: 'rgba(30,20,10,0.1)',
};
const dark = {
  bg: '#0e0e0e', card: '#1a1a1a', text: '#EDE8E0', sub: '#777777',
  bdr: '#2a2a2a', pbg: '#222222', ebg: '#222222', etxt: 'rgba(255,255,255,.88)',
  opt: '#1a1a1a', optBdr: '#333333', sh: 'rgba(0,0,0,0.4)',
};

// ── SCREENS ──────────────────────────────────────────────────────────────────
const SCREENS = { HOME: 'HOME', QUIZ: 'QUIZ', RESULTS: 'RESULTS', FLASHCARDS: 'FLASHCARDS', HISTORY: 'HISTORY' };

export default function App() {
  const systemScheme = useColorScheme();
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState('en');
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [selCat, setSelCat] = useState('All');
  const [homeData, setHomeData] = useState({ streak: 0, mastery: {}, weakCount: 0 });
  const [quizState, setQuizState] = useState(null);
  const [results, setResults] = useState(null);
  const [flashState, setFlashState] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const T = darkMode ? dark : light;
  const da = lang === 'da';

  // Load prefs on mount
  useEffect(() => {
    (async () => {
      const p = await getPrefs();
      setDarkMode(p.dark);
      setLang(p.lang);
    })();
  }, []);

  const toggleDark = async () => {
    const nd = !darkMode; setDarkMode(nd);
    await savePrefs({ dark: nd, lang });
    Haptics.selectionAsync();
  };
  const toggleLang = async () => {
    const nl = lang === 'en' ? 'da' : 'en'; setLang(nl);
    setSelCat(nl === 'en' ? 'All' : 'Alle');
    await savePrefs({ dark: darkMode, lang: nl });
    Haptics.selectionAsync();
  };

  const loadHomeData = useCallback(async () => {
    const [streak, mastery, wrongIds] = await Promise.all([checkStreak(), getMastery(), getWrongIds()]);
    setHomeData({ streak, mastery, weakCount: wrongIds.length });
  }, []);

  useEffect(() => { if (screen === SCREENS.HOME) loadHomeData(); }, [screen]);
  useEffect(() => { if (screen === SCREENS.HISTORY) getHistory().then(setHistoryData); }, [screen]);

  const cmap = () => da ? CAT_DA : CAT_EN;
  const filtered = () => {
    const all = da ? 'Alle' : 'All';
    return selCat === all ? Q : Q.filter(q => cmap()[q.cat] === selCat);
  };

  const goHome = () => { setScreen(SCREENS.HOME); };

  // ── START QUIZ ────────────────────────────────────────────────────────────
  const startQuiz = (mode) => {
    let qs;
    if (mode === 'mock' || mode === 'exam') {
      const c = shuffle(Q.filter(q => q.type === 'cur')).slice(0, 35);
      const v = shuffle(Q.filter(q => q.type === 'val')).slice(0, 5);
      const n = shuffle(Q.filter(q => q.type === 'news')).slice(0, 5);
      qs = shuffle([...c, ...v, ...n]);
    } else if (mode === 'weak') {
      getWrongIds().then(ids => {
        const wqs = ids.slice(0, 20).map(id => Q.find(q => q.id === id));
        setQuizState({ mode, qs: wqs, idx: 0, score: 0, valScore: 0, answers: [], chosen: null, timerSecs: mode === 'exam' ? 2700 : null });
        setScreen(SCREENS.QUIZ);
      });
      return;
    } else {
      qs = shuffle(filtered()).slice(0, Math.min(10, filtered().length));
    }
    setQuizState({ mode, qs, idx: 0, score: 0, valScore: 0, answers: [], chosen: null, timerSecs: mode === 'exam' ? 2700 : null });
    setScreen(SCREENS.QUIZ);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const startFlash = () => {
    const qs = shuffle(filtered());
    setFlashState({ qs, idx: 0, flipped: false });
    setScreen(SCREENS.FLASHCARDS);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={darkMode ? 'light-content' : 'light-content'} backgroundColor="#C8102E" />
      <View style={[styles.root, { backgroundColor: T.bg }]}>
        {screen === SCREENS.HOME && (
          <HomeScreen T={T} da={da} lang={lang} selCat={selCat} setSelCat={setSelCat}
            homeData={homeData} toggleDark={toggleDark} toggleLang={toggleLang}
            darkMode={darkMode} startQuiz={startQuiz} startFlash={startFlash}
            goHistory={() => setScreen(SCREENS.HISTORY)} filtered={filtered} cmap={cmap} />
        )}
        {screen === SCREENS.QUIZ && quizState && (
          <QuizScreen T={T} da={da} lang={lang} state={quizState} setState={setQuizState}
            goHome={goHome} onFinish={(r) => { setResults(r); setScreen(SCREENS.RESULTS); }} />
        )}
        {screen === SCREENS.RESULTS && results && (
          <ResultsScreen T={T} da={da} results={results} goHome={goHome}
            retry={() => startQuiz(results.mode)} />
        )}
        {screen === SCREENS.FLASHCARDS && flashState && (
          <FlashScreen T={T} da={da} lang={lang} state={flashState} setState={setFlashState}
            goHome={goHome} toggleDark={toggleDark} toggleLang={toggleLang} darkMode={darkMode} />
        )}
        {screen === SCREENS.HISTORY && (
          <HistoryScreen T={T} da={da} data={historyData} goHome={goHome}
            onClear={async () => { await clearHistory(); setHistoryData([]); }} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

// ── HOME SCREEN ───────────────────────────────────────────────────────────────
function HomeScreen({ T, da, lang, selCat, setSelCat, homeData, toggleDark, toggleLang, darkMode, startQuiz, startFlash, goHistory, filtered, cmap }) {
  const { streak, mastery, weakCount } = homeData;
  const cats = da ? ['Alle', 'Historie', 'Regering', 'Geografi', 'Kultur', 'Rettigheder', 'Værdier', 'Aktuelle Emner']
                  : ['All', 'History', 'Government', 'Geography', 'Culture', 'Rights', 'Values', 'Current Affairs'];
  const catKeys = Object.keys(CAT_EN);
  const hasMastery = Object.values(mastery).some(m => m.seen > 0);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#C8102E', darkMode ? '#7a0000' : '#a00020']} style={styles.hdr}>
        <SafeAreaView edges={['top']}>
          <View style={styles.hdrTop}>
            <View style={styles.hdrBrand}>
              <DanishFlag />
              <View>
                <Text style={styles.hdrTitle}>DANSK</Text>
                <Text style={styles.hdrSub}>{da ? 'INDFØDSRETSPRØVEN' : 'CITIZENSHIP TEST PREP'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.tbtnHdr} onPress={toggleLang}>
                <Text style={styles.tbtnTxt}>{lang === 'en' ? '🇩🇰 DA' : '🇬🇧 EN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tbtnHdr} onPress={toggleDark}>
                <Text style={styles.tbtnTxt}>{darkMode ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.hdrDesc}>
            {da ? 'Mester den viden der kræves til Indfødsretsprøven.' : 'Master the knowledge needed for the Indfødsretsprøven.'}
          </Text>
        </SafeAreaView>
      </LinearGradient>

      {streak > 0 && (
        <View style={[styles.streakBar, { backgroundColor: T.card }]}>
          <Text style={[styles.streakTxt, { color: T.text }]}>🔥 {streak} {da ? `dag${streak > 1 ? 'e' : ''} i træk` : `day streak`}</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {hasMastery && (
          <View style={styles.section}>
            <Text style={[styles.sectionLbl, { color: T.sub }]}>{da ? 'DIN FREMGANG' : 'YOUR PROGRESS'}</Text>
            <View style={styles.masteryGrid}>
              {catKeys.map(cat => {
                const m = mastery[cat] || { pct: 0, seen: 0, total: 0 };
                const col = COLORS[cat];
                return (
                  <View key={cat} style={[styles.masteryCard, { backgroundColor: T.card, shadowColor: T.sh }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={[styles.dot, { backgroundColor: col }]} />
                      <Text style={[styles.masteryName, { color: T.text }]} numberOfLines={1}>
                        {(da ? CAT_DA : CAT_EN)[cat]}
                      </Text>
                    </View>
                    <View style={[styles.barBg, { backgroundColor: T.bdr }]}>
                      <View style={[styles.barFill, { width: `${m.pct}%`, backgroundColor: col }]} />
                    </View>
                    <Text style={[styles.masteryPct, { color: T.sub }]}>{m.pct}% · {m.seen}/{m.total}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLbl, { color: T.sub }]}>{da ? 'FILTRER EFTER EMNE' : 'FILTER BY TOPIC'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
            {cats.map(cat => {
              const ck = Object.keys(cmap()).find(k => cmap()[k] === cat);
              const col = ck ? COLORS[ck] : '#C8102E';
              const active = cat === selCat;
              return (
                <TouchableOpacity key={cat} onPress={() => { setSelCat(cat); Haptics.selectionAsync(); }}
                  style={[styles.chip, { borderColor: active ? col : T.bdr, backgroundColor: active ? col : T.card }]}>
                  <View style={[styles.chipDot, { backgroundColor: active ? 'rgba(255,255,255,.7)' : col }]} />
                  <Text style={[styles.chipTxt, { color: active ? '#fff' : T.sub }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={[styles.qCountTxt, { color: T.sub }]}>
            {filtered().length} {da ? 'spørgsmål tilgængelige' : 'questions available'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLbl, { color: T.sub }]}>{da ? 'VÆLG TILSTAND' : 'CHOOSE YOUR MODE'}</Text>
          <ModeBtn color="#C8102E" icon="📝" title={da ? 'Øvequiz' : 'Practice Quiz'} desc={da ? '10 tilfældige spørgsmål' : '10 random questions'} onPress={() => startQuiz('practice')} />
          <ModeBtn color="#0033A0" icon="🏆" title={da ? 'Fuld Prøveeksamen' : 'Full Mock Test'} desc={da ? '45 spørgsmål · rigtig format' : '45 questions · real format'} onPress={() => startQuiz('mock')} />
          <ModeBtn color="#5B2D8E" icon="⏱️" title={da ? 'Eksamenssimulator' : 'Exam Simulator'} desc={da ? '45 min · ingen hints · rigtige betingelser' : '45 min · no hints · real conditions'} onPress={() => startQuiz('exam')} />
          {weakCount > 0 && <ModeBtn color="#00695C" icon="🎯" title={da ? 'Svage Punkter' : 'Weak Spots'} desc={da ? `${weakCount} spørgsmål du svarede forkert` : `${weakCount} questions you got wrong`} onPress={() => startQuiz('weak')} />}
          <ModeBtn color="#1a1a2e" icon="🃏" title={da ? 'Flashkort' : 'Flashcards'} desc={da ? 'Gennemgå alle emner' : 'Study all topics'} onPress={startFlash} />
          <ModeBtn color="#AD1457" icon="📈" title={da ? 'Historik' : 'History'} desc={da ? 'Tidligere resultater og scores' : 'Past results & scores'} onPress={goHistory} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLbl, { color: T.sub }]}>{da ? 'OM DEN RIGTIGE PRØVE' : 'REAL TEST INFO'}</Text>
          <View style={[styles.infoCard, { backgroundColor: T.card, shadowColor: T.sh }]}>
            {(da ? ['45 multiple choice-spørgsmål', '45 minutter · ingen hjælpemidler', 'Skal score 36/45 (80%) for at bestå', 'Skal svare rigtigt på 4/5 værdispørgsmål', 'Afholdes juni og november', 'Gebyr: 905 kr. (2026)']
                 : ['45 multiple-choice questions', '45 minutes · no aids allowed', 'Must score 36/45 (80%) to pass', 'Must get 4/5 values questions correct', 'Held in June and November', 'Fee: 905 DKK (2026)']).map((item, i, arr) => (
              <View key={i} style={[styles.infoRow, { borderBottomColor: T.bdr, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }]}>
                <Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 13 }}>✓</Text>
                <Text style={[styles.infoTxt, { color: T.text }]}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={styles.statsRow}>
            {[{ n: Q.length, l: da ? 'Spørgsmål\ni bank' : 'Questions\nin bank' }, { n: '80%', l: da ? 'Beståelsesgrænse\n(36/45)' : 'Pass mark\n(36/45)' }, { n: '5', l: da ? 'Værdis-\npørgsmål' : 'Values\nquestions' }].map((s, i) => (
              <View key={i} style={[styles.statCard, { backgroundColor: T.card, shadowColor: T.sh }]}>
                <Text style={[styles.statN, { color: '#C8102E' }]}>{s.n}</Text>
                <Text style={[styles.statL, { color: T.sub }]}>{s.l}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── QUIZ SCREEN ───────────────────────────────────────────────────────────────
function QuizScreen({ T, da, lang, state, setState, goHome, onFinish }) {
  const { mode, qs, idx, score, valScore, answers, chosen, timerSecs } = state;
  const q = qs[idx];
  const d = q[lang];
  const [localChosen, setLocalChosen] = useState(null);
  const [showExp, setShowExp] = useState(false);
  const [secs, setSecs] = useState(timerSecs);
  const timerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setLocalChosen(null);
    setShowExp(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    return () => fadeAnim.setValue(0);
  }, [idx]);

  useEffect(() => {
    if (mode !== 'exam' || secs === null) return;
    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(timerRef.current); finishQuiz(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const finishQuiz = async (finalAnswers, finalScore, finalVal) => {
    clearInterval(timerRef.current);
    const ans = finalAnswers || answers;
    const sc = finalScore ?? score;
    const vs = finalVal ?? valScore;
    const total = qs.length;
    const passed = (mode === 'mock' || mode === 'exam')
      ? (sc >= Math.ceil(total * 0.8) && vs >= 4)
      : (sc >= Math.ceil(total * 0.7));
    await addHistory({ mode, score: sc, total, pct: Math.round((sc / total) * 100), val: vs, passed, date: new Date().toLocaleDateString(da ? 'da-DK' : 'en-GB'), ts: Date.now() });
    onFinish({ mode, qs, answers: ans, score: sc, total, valScore: vs, passed });
  };

  const doAnswer = async (i) => {
    if (localChosen !== null) return;
    setLocalChosen(i);
    const correct = d[2];
    const ok = i === correct;
    await markAnswer(q.id, ok);
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    const newAnswers = [...answers, { q, chosen: i, ok }];
    const newScore = score + (ok ? 1 : 0);
    const newVal = valScore + (ok && q.type === 'val' ? 1 : 0);
    setState(s => ({ ...s, score: newScore, valScore: newVal, answers: newAnswers }));
    if (mode !== 'exam') setShowExp(true);
    else {
      setTimeout(() => advance(newAnswers, newScore, newVal), 1200);
    }
  };

  const advance = (ans, sc, vs) => {
    const newAnswers = ans || answers;
    const newScore = sc ?? score;
    const newVal = vs ?? valScore;
    if (idx + 1 >= qs.length) finishQuiz(newAnswers, newScore, newVal);
    else setState(s => ({ ...s, idx: s.idx + 1, chosen: null }));
  };

  const timerMin = secs !== null ? Math.floor(secs / 60) : 0;
  const timerSecStr = secs !== null ? String(secs % 60).padStart(2, '0') : '00';
  const urgent = secs !== null && secs < 300;
  const catColor = COLORS[q.cat];
  const progress = (idx + 1) / qs.length;
  const tmap = da ? { cur: 'Pensum', val: '⚖️ Værdier', news: '📰 Aktuelle' } : { cur: 'Curriculum', val: '⚖️ Values', news: '📰 Current' };
  const modeLabel = { exam: da ? '⏱️ Eksamen' : '⏱️ Exam', weak: da ? '🎯 Svage' : '🎯 Weak', mock: da ? '🏆 Prøve' : '🏆 Mock' }[mode] || '';

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: T.card }}>
        <View style={[styles.quizHdr, { backgroundColor: T.card, borderBottomColor: T.bdr }]}>
          <View style={styles.quizHdrRow}>
            <TouchableOpacity onPress={() => { clearInterval(timerRef.current); goHome(); }}>
              <Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 14 }}>← {da ? 'Hjem' : 'Home'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
              <View style={[styles.pill, { backgroundColor: catColor }]}>
                <Text style={styles.pillTxt}>{(da ? CAT_DA : CAT_EN)[q.cat]}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: T.pbg }]}>
                <Text style={[styles.pillTxt, { color: T.sub }]}>{tmap[q.type]}</Text>
              </View>
              {modeLabel ? <View style={[styles.pill, { backgroundColor: '#5B2D8E' }]}><Text style={styles.pillTxt}>{modeLabel}</Text></View> : null}
            </View>
            <Text style={[styles.counter, { color: T.sub }]}>{idx + 1}/{qs.length}</Text>
          </View>
          <View style={[styles.progBg, { backgroundColor: T.pbg }]}>
            <View style={[styles.progFill, { width: `${progress * 100}%`, backgroundColor: catColor }]} />
          </View>
        </View>
      </SafeAreaView>

      {/* Timer */}
      {mode === 'exam' && secs !== null && (
        <View style={[styles.timerBar, { backgroundColor: T.ebg }]}>
          <Text style={[styles.timerLabel, { color: 'rgba(255,255,255,.5)' }]}>{da ? 'RESTERENDE TID' : 'TIME REMAINING'}</Text>
          <Text style={[styles.timerTxt, urgent && styles.timerUrgent]}>{timerMin}:{timerSecStr}</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Question card */}
          <View style={[styles.qCard, { backgroundColor: T.card, shadowColor: T.sh }]}>
            <Text style={[styles.qNum, { color: T.sub }]}>{da ? 'SPØRGSMÅL' : 'QUESTION'} {idx + 1}</Text>
            <Text style={[styles.qText, { color: T.text }]}>{d[0]}</Text>
          </View>

          {/* Options */}
          <View style={styles.options}>
            {d[1].map((opt, i) => {
              const correct = d[2];
              const answered = localChosen !== null;
              let bg = T.opt, bdr = T.optBdr, txtColor = T.text;
              if (answered) {
                if (i === correct) { bg = '#E8F5E9'; bdr = '#2E7D32'; txtColor = '#2E7D32'; }
                else if (i === localChosen) { bg = '#FFEBEE'; bdr = '#C8102E'; txtColor = '#C8102E'; }
                else { bg = T.opt; bdr = T.optBdr; }
              }
              const dim = answered && i !== correct && i !== localChosen;
              return (
                <TouchableOpacity key={i} disabled={answered}
                  onPress={() => doAnswer(i)}
                  style={[styles.optBtn, { backgroundColor: bg, borderColor: bdr, opacity: dim ? 0.35 : 1 }]}>
                  <View style={[styles.optLetter, { backgroundColor: T.pbg }]}>
                    <Text style={[styles.optLetterTxt, { color: T.sub }]}>{['A','B','C','D'][i]}</Text>
                  </View>
                  <Text style={[styles.optText, { color: txtColor }]}>{opt}</Text>
                  {answered && i === correct && <Text style={{ color: '#2E7D32', fontWeight: '700', fontSize: 16 }}>✓</Text>}
                  {answered && i === localChosen && i !== correct && <Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 16 }}>✗</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Explanation */}
          {showExp && (
            <View style={[styles.expCard, { backgroundColor: T.ebg }]}>
              <Text style={styles.expTitle}>💡 {da ? 'Vidste du det?' : 'Did you know?'}</Text>
              <Text style={[styles.expText, { color: T.etxt }]}>{d[3]}</Text>
              <TouchableOpacity style={styles.nextBtn} onPress={() => advance()}>
                <Text style={styles.nextBtnTxt}>
                  {idx + 1 >= qs.length ? (da ? 'Se resultater →' : 'See Results →') : (da ? 'Næste →' : 'Next →')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── RESULTS SCREEN ────────────────────────────────────────────────────────────
function ResultsScreen({ T, da, results, goHome, retry }) {
  const { mode, qs, answers, score, total, valScore, passed } = results;
  const pct = Math.round((score / total) * 100);
  const bgColor = passed ? '#C8102E' : '#1a2a4a';

  const doShare = async () => {
    const txt = da
      ? `Jeg scorede ${score}/${total} (${pct}%) på Indfødsretsprøven-mock! ${passed ? '✅ Bestået!' : '📚 Fortsætter øv.'} 🇩🇰\ndansk.lenagibson.eu`
      : `I scored ${score}/${total} (${pct}%) on the Danish citizenship mock test! ${passed ? '✅ Passed!' : '📚 Keep practicing.'} 🇩🇰\ndansk.lenagibson.eu`;
    try { await Share.share({ message: txt }); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <LinearGradient colors={[bgColor, passed ? '#a00020' : '#0a1a3a']} style={styles.resHdr}>
        <SafeAreaView edges={['top']}>
          <Text style={styles.resEmoji}>{passed ? '🎉' : '📚'}</Text>
          <Text style={styles.resTitle}>{passed ? (da ? 'Bestået! 🎉' : 'Passed! 🎉') : (da ? 'Fortsæt øv! 📚' : 'Keep Practicing!')}</Text>
          <Text style={styles.resSub}>{passed ? (da ? 'Du bestod prøven!' : 'You passed the test!') : (da ? 'Bliv ved med at øve!' : 'Keep going, you can do it!')}</Text>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreNum}>{score}/{total}</Text>
            <Text style={styles.scorePct}>{pct}%</Text>
            {(mode === 'mock' || mode === 'exam') && (
              <Text style={styles.scoreVal}>{da ? 'Værdier' : 'Values'}: {valScore}/5 {da ? '(kræver 4)' : '(need 4)'}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={doShare}>
            <Text style={styles.shareBtnTxt}>📤 {da ? 'Del Resultat' : 'Share Result'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={[styles.sectionLbl, { color: T.sub, marginBottom: 12 }]}>{da ? 'GENNEMGANG' : 'QUESTION REVIEW'}</Text>
        {answers.map(({ q, chosen, ok }, i) => (
          <View key={i} style={[styles.reviewItem, { backgroundColor: T.card, borderLeftColor: ok ? '#2E7D32' : '#C8102E', shadowColor: T.sh }]}>
            <Text style={[styles.reviewQ, { color: T.text }]}>{q[da ? 'da' : 'en'][0]}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {!ok && <View style={styles.rtagW}><Text style={styles.rtagWTxt}>{da ? 'Du: ' : 'You: '}{q[da ? 'da' : 'en'][1][chosen]}</Text></View>}
              <View style={styles.rtagR}><Text style={styles.rtagRTxt}>✓ {q[da ? 'da' : 'en'][1][q[da ? 'da' : 'en'][2]]}</Text></View>
            </View>
          </View>
        ))}
        <View style={{ gap: 10, marginTop: 8 }}>
          <TouchableOpacity style={styles.btnPrimary} onPress={retry}>
            <Text style={styles.btnPrimaryTxt}>{da ? 'Prøv igen' : 'Try Again'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { backgroundColor: T.ebg }]} onPress={goHome}>
            <Text style={styles.btnPrimaryTxt}>← {da ? 'Tilbage til forsiden' : 'Back to Home'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ── FLASHCARD SCREEN ──────────────────────────────────────────────────────────
function FlashScreen({ T, da, lang, state, setState, goHome, toggleDark, toggleLang, darkMode }) {
  const { qs, idx, flipped } = state;
  const q = qs[idx];
  const d = q[lang];
  const flipAnim = useRef(new Animated.Value(0)).current;
  const catColor = COLORS[q.cat];
  const tmap = da ? { cur: 'Pensum', val: '⚖️ Værdier', news: '📰 Aktuelle' } : { cur: 'Curriculum', val: '⚖️ Values', news: '📰 Current' };

  const doFlip = () => {
    Haptics.selectionAsync();
    const toVal = flipped ? 0 : 1;
    Animated.spring(flipAnim, { toValue: toVal, friction: 8, tension: 40, useNativeDriver: true }).start();
    setState(s => ({ ...s, flipped: !flipped }));
  };

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: T.card }}>
        <View style={[styles.quizHdr, { backgroundColor: T.card, borderBottomColor: T.bdr }]}>
          <View style={styles.quizHdrRow}>
            <TouchableOpacity onPress={goHome}>
              <Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 14 }}>← {da ? 'Hjem' : 'Home'}</Text>
            </TouchableOpacity>
            <Text style={[styles.counter, { color: T.sub }]}>{idx + 1}/{qs.length}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={[styles.tbtnInn, { backgroundColor: T.card, borderColor: T.bdr }]} onPress={toggleLang}>
                <Text style={[styles.tbtnInnTxt, { color: T.text }]}>{lang === 'en' ? '🇩🇰 DA' : '🇬🇧 EN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tbtnInn, { backgroundColor: T.card, borderColor: T.bdr }]} onPress={toggleDark}>
                <Text style={[styles.tbtnInnTxt, { color: T.text }]}>{darkMode ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[styles.pill, { backgroundColor: catColor }]}>
              <Text style={styles.pillTxt}>{(da ? CAT_DA : CAT_EN)[q.cat]}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: T.pbg }]}>
              <Text style={[styles.pillTxt, { color: T.sub }]}>{tmap[q.type]}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
        <TouchableOpacity onPress={doFlip} activeOpacity={0.95} style={{ height: 300 }}>
          {/* Front */}
          <Animated.View style={[styles.cardFace, { backgroundColor: catColor, transform: [{ rotateY: frontRotate }], backfaceVisibility: 'hidden' }]}>
            <Text style={[styles.cardLbl, { color: 'rgba(255,255,255,.6)' }]}>{da ? 'SPØRGSMÅL' : 'QUESTION'}</Text>
            <Text style={styles.cardQ}>{d[0]}</Text>
            <Text style={styles.cardHint}>{da ? 'Tryk for at se svar' : 'Tap to reveal answer'}</Text>
          </Animated.View>
          {/* Back */}
          <Animated.View style={[styles.cardFace, styles.cardBack, { backgroundColor: T.card, borderColor: T.bdr, transform: [{ rotateY: backRotate }], backfaceVisibility: 'hidden' }]}>
            <Text style={[styles.cardLbl, { color: T.sub }]}>{da ? 'SVAR' : 'ANSWER'}</Text>
            <Text style={[styles.cardAns, { color: catColor }]}>{d[1][d[2]]}</Text>
            <Text style={[styles.cardExp, { color: T.sub }]}>{d[3]}</Text>
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.studyNav}>
          <TouchableOpacity disabled={idx === 0} onPress={() => { setState(s => ({ ...s, idx: s.idx - 1, flipped: false })); flipAnim.setValue(0); }}
            style={[styles.navBtn, { backgroundColor: T.card, borderColor: T.bdr, opacity: idx === 0 ? 0.3 : 1 }]}>
            <Text style={[styles.navBtnTxt, { color: T.text }]}>‹ {da ? 'Forrige' : 'Prev'}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: Math.min(7, qs.length) }).map((_, i) => {
              const di = qs.length <= 7 ? i : Math.floor(i * (qs.length - 1) / 6);
              const active = di === idx;
              return <View key={i} style={[styles.navDot, { width: active ? 18 : 7, backgroundColor: active ? '#C8102E' : T.bdr }]} />;
            })}
          </View>
          <TouchableOpacity disabled={idx === qs.length - 1} onPress={() => { setState(s => ({ ...s, idx: s.idx + 1, flipped: false })); flipAnim.setValue(0); }}
            style={[styles.navBtn, { backgroundColor: T.card, borderColor: T.bdr, opacity: idx === qs.length - 1 ? 0.3 : 1 }]}>
            <Text style={[styles.navBtnTxt, { color: T.text }]}>{da ? 'Næste' : 'Next'} ›</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.flipHint, { color: T.sub }]}>{da ? 'Tryk på kortet for at vende' : 'Tap card to flip'}</Text>
      </View>
    </View>
  );
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({ T, da, data, goHome, onClear }) {
  const mLabels = { practice: da ? 'Øvequiz' : 'Practice', mock: da ? 'Prøveeksamen' : 'Mock Test', exam: da ? 'Eksamen' : 'Exam', weak: da ? 'Svage Punkter' : 'Weak Spots' };
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: T.card }}>
        <View style={[styles.quizHdr, { backgroundColor: T.card, borderBottomColor: T.bdr }]}>
          <View style={styles.quizHdrRow}>
            <TouchableOpacity onPress={goHome}><Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 14 }}>← {da ? 'Hjem' : 'Home'}</Text></TouchableOpacity>
            <Text style={[styles.histTitle, { color: T.text }]}>{da ? 'Historik' : 'History'}</Text>
            <TouchableOpacity onPress={() => Alert.alert(da ? 'Ryd historik?' : 'Clear history?', da ? 'Dette kan ikke fortrydes.' : 'This cannot be undone.', [{ text: da ? 'Annuller' : 'Cancel', style: 'cancel' }, { text: da ? 'Ryd' : 'Clear', style: 'destructive', onPress: onClear }])}>
              <Text style={{ color: '#C8102E', fontWeight: '700', fontSize: 13 }}>{da ? 'Ryd' : 'Clear'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {data.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 48 }}>📊</Text>
            <Text style={[styles.emptyTitle, { color: T.text }]}>{da ? 'Ingen historik endnu' : 'No history yet'}</Text>
            <Text style={[styles.emptySub, { color: T.sub }]}>{da ? 'Gennemfør en quiz for at se dine resultater her.' : 'Complete a quiz to see your results here.'}</Text>
          </View>
        ) : data.map((e, i) => {
          const col = e.passed ? '#2E7D32' : '#C8102E';
          return (
            <View key={i} style={[styles.histItem, { backgroundColor: T.card, shadowColor: T.sh }]}>
              <Text style={[styles.histScore, { color: col }]}>{e.score}/{e.total}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.histMode, { color: T.text }]}>{mLabels[e.mode] || e.mode}</Text>
                <Text style={[styles.histDate, { color: T.sub }]}>{e.date} · {e.pct}%{(e.mode === 'mock' || e.mode === 'exam') ? ` · ${da ? 'Værdier' : 'Values'}: ${e.val}/5` : ''}</Text>
              </View>
              <View style={[styles.histBadge, { backgroundColor: e.passed ? '#E8F5E9' : '#FFEBEE' }]}>
                <Text style={{ color: col, fontWeight: '700', fontSize: 11 }}>{e.passed ? (da ? 'Bestået' : 'Pass') : (da ? 'Ikke bestået' : 'Fail')}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function DanishFlag() {
  return (
    <View style={styles.flag}>
      <View style={styles.flagCrossV} />
      <View style={styles.flagCrossH} />
    </View>
  );
}
function ModeBtn({ color, icon, title, desc, onPress }) {
  return (
    <TouchableOpacity style={[styles.modeBtn, { backgroundColor: color }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
      <Text style={styles.modeIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeDesc}>{desc}</Text>
      </View>
      <Text style={styles.modeArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  hdr: { paddingHorizontal: 20, paddingBottom: 24 },
  hdrTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  hdrBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hdrTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 34, fontWeight: '700', color: '#fff', letterSpacing: 2 },
  hdrSub: { fontSize: 10, fontWeight: '600', letterSpacing: 3, color: 'rgba(255,255,255,.65)', marginTop: 3 },
  hdrDesc: { fontSize: 13, color: 'rgba(255,255,255,.82)', lineHeight: 20 },
  tbtnHdr: { backgroundColor: 'rgba(255,255,255,.15)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,.3)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  tbtnTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tbtnInn: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  tbtnInnTxt: { fontSize: 12, fontWeight: '600' },
  streakBar: { paddingHorizontal: 20, paddingVertical: 8 },
  streakTxt: { fontWeight: '600', fontSize: 13 },
  section: { paddingHorizontal: 18, paddingTop: 20 },
  sectionLbl: { fontSize: 11, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  masteryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  masteryCard: { width: (SW - 44) / 2, borderRadius: 12, padding: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  masteryName: { fontSize: 12, fontWeight: '600' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  barBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  masteryPct: { fontSize: 11, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 2 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 12, fontWeight: '600' },
  qCountTxt: { fontSize: 12, marginTop: 10, marginBottom: 4 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 14, marginBottom: 9 },
  modeIcon: { fontSize: 22 },
  modeTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '700', color: '#fff' },
  modeDesc: { fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 2 },
  modeArrow: { color: 'rgba(255,255,255,.4)', fontSize: 22, marginLeft: 'auto' },
  infoCard: { borderRadius: 14, padding: 14, marginBottom: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  infoTxt: { fontSize: 13, flex: 1 },
  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 13, padding: 14, alignItems: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  statN: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 24, fontWeight: '700' },
  statL: { fontSize: 11, marginTop: 3, textAlign: 'center', lineHeight: 16 },
  quizHdr: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1 },
  quizHdrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  counter: { fontSize: 13, fontWeight: '600' },
  pill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  progBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 2 },
  timerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  timerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  timerTxt: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: 2 },
  timerUrgent: { color: '#ff6b6b' },
  qCard: { margin: 18, borderRadius: 16, padding: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4 },
  qNum: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  qText: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 18, fontWeight: '700', lineHeight: 28 },
  options: { paddingHorizontal: 18, gap: 9 },
  optBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 12, borderWidth: 2 },
  optLetter: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  optLetterTxt: { fontSize: 11, fontWeight: '700' },
  optText: { fontSize: 14, fontWeight: '500', lineHeight: 20, flex: 1 },
  expCard: { margin: 18, borderRadius: 16, padding: 16 },
  expTitle: { fontSize: 12, fontWeight: '700', color: '#E8A44A', marginBottom: 7 },
  expText: { fontSize: 13, lineHeight: 22 },
  nextBtn: { marginTop: 14, backgroundColor: '#C8102E', borderRadius: 10, padding: 13, alignItems: 'center' },
  nextBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resHdr: { padding: 28, paddingBottom: 28, alignItems: 'center' },
  resEmoji: { fontSize: 52, marginBottom: 8 },
  resTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center' },
  resSub: { fontSize: 15, color: 'rgba(255,255,255,.8)', marginTop: 4, marginBottom: 20, textAlign: 'center' },
  scoreBox: { backgroundColor: 'rgba(255,255,255,.15)', borderRadius: 18, padding: 16, paddingHorizontal: 40, alignItems: 'center', marginBottom: 14 },
  scoreNum: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 36, fontWeight: '700', color: '#fff' },
  scorePct: { fontSize: 14, color: 'rgba(255,255,255,.75)', marginTop: 2 },
  scoreVal: { fontSize: 12, color: 'rgba(255,255,255,.8)', marginTop: 6, fontWeight: '600' },
  shareBtn: { backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 2, borderColor: 'rgba(255,255,255,.35)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24 },
  shareBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  reviewItem: { borderRadius: 12, padding: 13, marginBottom: 9, borderLeftWidth: 4, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  reviewQ: { fontSize: 13, fontWeight: '600', lineHeight: 20, marginBottom: 7 },
  rtagW: { backgroundColor: '#FFEBEE', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  rtagWTxt: { color: '#C8102E', fontSize: 11, fontWeight: '600' },
  rtagR: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  rtagRTxt: { color: '#2E7D32', fontSize: 11, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#C8102E', borderRadius: 13, padding: 15, alignItems: 'center' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { borderRadius: 13, padding: 15, alignItems: 'center' },
  flag: { width: 50, height: 36, backgroundColor: '#C8102E', borderRadius: 3, position: 'relative', overflow: 'hidden' },
  flagCrossV: { position: 'absolute', left: 16, top: 0, width: 7, height: 36, backgroundColor: '#fff' },
  flagCrossH: { position: 'absolute', left: 0, top: 14, width: 50, height: 7, backgroundColor: '#fff' },
  cardFace: { position: 'absolute', width: '100%', height: '100%', borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cardBack: { borderWidth: 2 },
  cardLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 },
  cardQ: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 19, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 28 },
  cardHint: { marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,.5)' },
  cardAns: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 18, fontWeight: '700', textAlign: 'center', lineHeight: 26, marginBottom: 12 },
  cardExp: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  studyNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, marginTop: 20 },
  navBtn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  navBtnTxt: { fontWeight: '700', fontSize: 14 },
  navDot: { height: 7, borderRadius: 4 },
  flipHint: { textAlign: 'center', marginTop: 12, fontSize: 12 },
  histTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '700' },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 9, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  histScore: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, fontWeight: '700' },
  histMode: { fontSize: 13, fontWeight: '600' },
  histDate: { fontSize: 11, marginTop: 2 },
  histBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
