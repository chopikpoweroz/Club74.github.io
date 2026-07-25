/************************************************************
 * POKER TIMER CLEAN APP
 * Без патчей. Один нормальный файл логики.
 ************************************************************/

/************************************************************
 * SUPABASE
 ************************************************************/

const SUPABASE_URL = 'https://ivvzrjnutuyoqtlzpbqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2dnpyam51dHV5b3F0bHpwYnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjY2NzQsImV4cCI6MjA5ODQwMjY3NH0.haUuHEhGrBCQ5xflu_l-dKmFRMs_r-Qo3rlCSzvec4I';

// Единственный админ входит через Supabase Auth (email+пароль).
// В UI остаётся только поле пароля, email зашит здесь.
const ADMIN_EMAIL = 'Caponerj@mail.ru';

let supabaseClient = null;
let applyingRemote = false;
let cloudReady = false;

// v2: id турнира в новых таблицах (tournaments/timer_state/players/tables/settings)
let tournamentIdV2 = null;

/************************************************************
 * STATE
 ************************************************************/

const state = {
    isAdmin: false,
    currentPage: 'timerPage',
	tournament: {
	    name: 'Покерный турнир',
	    date: '',
	    startingChips: 500,
	    maxPlayersPerTable: 6
	},

    timer: {
        currentLevel: 1,
        timeRemaining: 15 * 60,
        totalLevelTime: 15 * 60,
        elapsedTime: 0,
        isRunning: false,
        isPaused: false,
        isBreak: false,
        breakType: null,
        tournamentEnded: false,
        tournamentStartedAt: null,
        targetEndTime: null,
        interval: null
    },

    templates: {
        'Стандарт': {
            levelDuration: 15,
            breakDuration: 5,
            breakEveryNLevels: 4,
            bigBreakAfterLevel: 10,
            bigBreakDuration: 20,
            levels: [
                { level: 1, sb: 100, bb: 200, ante: 0 },
                { level: 2, sb: 200, bb: 200, ante: 200 },
                { level: 3, sb: 200, bb: 400, ante: 400 },
                { level: 4, sb: 300, bb: 600, ante: 600 },
                { level: 5, sb: 400, bb: 800, ante: 800 },
                { level: 6, sb: 500, bb: 1000, ante: 1000 },
                { level: 7, sb: 600, bb: 1200, ante: 1200 },
                { level: 8, sb: 800, bb: 1600, ante: 1600 },
                { level: 9, sb: 1000, bb: 2000, ante: 2000 },
                { level: 10, sb: 1200, bb: 2500, ante: 2500 },
                { level: 11, sb: 1500, bb: 3000, ante: 3000 },
                { level: 12, sb: 2000, bb: 4000, ante: 4000 },
                { level: 13, sb: 2500, bb: 5000, ante: 5000 },
                { level: 14, sb: 3000, bb: 6000, ante: 6000 },
                { level: 15, sb: 4000, bb: 8000, ante: 8000 },
                { level: 16, sb: 5000, bb: 10000, ante: 10000 },
                { level: 17, sb: 6000, bb: 12000, ante: 12000 },
                { level: 18, sb: 8000, bb: 16000, ante: 16000 },
                { level: 19, sb: 10000, bb: 20000, ante: 20000 },
                { level: 20, sb: 12000, bb: 25000, ante: 25000 },
                { level: 21, sb: 15000, bb: 30000, ante: 30000 },
                { level: 22, sb: 20000, bb: 40000, ante: 40000 },
                { level: 23, sb: 25000, bb: 50000, ante: 50000 }
            ]
        }
    },

    currentTemplate: 'Стандарт',

    settings: {
        adminPassword: 'secret',
        primaryColor: '#00bfff',
        volume: 70,
        defaultBlindSound: 'https://chopikpower.github.io/Club74.github.io/sound/blind.mp3',
        defaultBreakSound: 'https://chopikpower.github.io/Club74.github.io/sound/break.mp3',
        defaultBigBreakSound: 'https://chopikpower.github.io/Club74.github.io/sound/bigbreak.mp3',
        customLevelSound: null,
        customBreakSound: null,
        customBigBreakSound: null,
        totalPoints: 1000,
        prizePlaces: [
            { place: 1, percentage: 60 },
            { place: 2, percentage: 30 },
            { place: 3, percentage: 10 }
        ]
    },

    grid: {
        players: [],
        tables: [],
        maxPlayersPerTable: 6,
        selectedPlayer: null,
        gridCreated: false,
        eliminationOrder: [],
        tournamentEnded: false
    },

    rules: {
        text: ''
    },

    registration: {
        agreementText: ''
    }
};

/************************************************************
 * HELPERS
 ************************************************************/

const $ = id => document.getElementById(id);

function now() {
    return Date.now();
}

function uid() {
    return Date.now() + Math.floor(Math.random() * 1000000);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function show(el, display = '') {
    if (el) el.style.display = display;
}

function hide(el) {
    if (el) el.style.display = 'none';
}

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function currentTemplate() {
    return state.templates[state.currentTemplate];
}

function shuffleArray(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

/************************************************************
 * LOCAL STORAGE
 ************************************************************/

function saveLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function loadLocal(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

/**
 * v2: админ-статус больше не хранится в localStorage и не завязан
 * на общий пароль. Источник истины — сессия Supabase Auth.
 * state.isAdmin выставляется в onAuthStateChange (см. ниже) и
 * автоматически восстанавливается при перезагрузке страницы,
 * пока сессия не истекла — работает в любом браузере/инкогнито,
 * если ввести правильный пароль хотя бы раз.
 */

/************************************************************
 * SUPABASE SYNC
 ************************************************************/

function supabaseConfigured() {
    return SUPABASE_URL &&
        SUPABASE_KEY &&
        !SUPABASE_URL.includes('ВСТАВЬ') &&
        !SUPABASE_KEY.includes('ВСТАВЬ');
}

/************************************************************
 * v2 AUTH (Supabase Auth вместо общего пароля в localStorage)
 ************************************************************/

async function adminLogin(password) {
    if (!supabaseClient) return { error: 'Supabase не готов' };

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password
    });

    return { error: error ? error.message : null };
}

async function adminLogout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
}

function handleAuthChange(session) {
    state.isAdmin = !!session;
    updateAdminUI();
    renderTables();

    // Как только узнали, что мы админ — подтягиваем актуальный
    // таймер из облака (на случай если гостевой поллинг что-то пропустил).
    if (state.isAdmin) {
        loadTimerFromCloudV2();
    }
}

/************************************************************
 * v2 TIMER SYNC (таблица timer_state вместо ключа 'timer'
 * в общей свалке app_state)
 ************************************************************/

async function ensureTournamentIdV2() {
    if (tournamentIdV2) return tournamentIdV2;
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
        .from('tournaments')
        .select('id')
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('v2: ошибка чтения tournaments:', error);
        return null;
    }

    if (!data) {
        console.warn('v2: строка в tournaments не найдена. Проверь, что 01_schema.sql выполнялся.');
        return null;
    }

    tournamentIdV2 = data.id;
    return tournamentIdV2;
}

function timerRowToData(row) {
    return {
        currentLevel: row.current_level,
        totalLevelTime: row.total_level_time,
        targetEndTime: row.target_end_time ? new Date(row.target_end_time).getTime() : null,
        isRunning: row.is_running,
        isPaused: row.is_paused,
        isBreak: row.is_break,
        breakType: row.break_type,
        tournamentEnded: row.tournament_ended,
        tournamentStartedAt: row.tournament_started_at ? new Date(row.tournament_started_at).getTime() : null
    };
}

function applyTimerRowV2(row) {
    if (!row) return;

    applyingRemote = true;
    applyTimerData(timerRowToData(row));
    applyingRemote = false;

    saveLocal('pokerTimerState', makeTimerData());
    syncTimer(true);
    updateTimerDisplay();
    restartTimerIntervalIfNeeded();
}

async function loadTimerFromCloudV2() {
    const id = await ensureTournamentIdV2();
    if (!id || !supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('timer_state')
        .select('*')
        .eq('tournament_id', id)
        .maybeSingle();

    if (error) {
        console.error('v2: ошибка чтения timer_state:', error);
        return;
    }

    if (data) applyTimerRowV2(data);
}

function subscribeTimerV2(id) {
    supabaseClient
        .channel('poker_timer_v2_timer_state')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'timer_state',
                filter: 'tournament_id=eq.' + id
            },
            payload => {
                if (!payload.new) return;
                applyTimerRowV2(payload.new);
            }
        )
        .subscribe();
}

/**
 * Фолбэк-поллинг на случай обрыва realtime-канала (заблокированный
 * экран, слабая мобильная сеть). Гость раз в 3 секунды дочитывает
 * актуальное состояние из timer_state напрямую. Админ не поллит —
 * он сам источник истины и так узнаёт об изменениях мгновенно.
 */
let lastTimerUpdatedAtV2 = null;

async function pollTimerV2() {
    if (state.isAdmin || !tournamentIdV2 || !supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('timer_state')
        .select('*')
        .eq('tournament_id', tournamentIdV2)
        .maybeSingle();

    if (error || !data) return;
    if (lastTimerUpdatedAtV2 && data.updated_at === lastTimerUpdatedAtV2) return;

    lastTimerUpdatedAtV2 = data.updated_at;
    applyTimerRowV2(data);
}

function startTimerPollingV2() {
    setInterval(pollTimerV2, 3000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) pollTimerV2();
    });

    window.addEventListener('online', pollTimerV2);
    window.addEventListener('focus', pollTimerV2);
}

async function writeTimerToCloudV2() {
    if (!supabaseClient || applyingRemote || !state.isAdmin) return;

    const id = await ensureTournamentIdV2();
    if (!id) return;

    const t = state.timer;

    const { error } = await supabaseClient
        .from('timer_state')
        .update({
            current_level: t.currentLevel,
            total_level_time: t.totalLevelTime,
            target_end_time: t.targetEndTime ? new Date(t.targetEndTime).toISOString() : null,
            is_running: t.isRunning,
            is_paused: t.isPaused,
            is_break: t.isBreak,
            break_type: t.breakType,
            tournament_started_at: t.tournamentStartedAt ? new Date(t.tournamentStartedAt).toISOString() : null,
            tournament_ended: t.tournamentEnded,
            updated_at: new Date().toISOString()
        })
        .eq('tournament_id', id);

    if (error) {
        console.error('v2: ошибка записи timer_state:', error);
    }
}

async function initSupabase() {
    if (!supabaseConfigured()) {
        console.warn('Supabase не настроен');
        return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Восстанавливаем сессию админа, если она ещё жива (работает
    // в любом браузере/устройстве после однократного входа).
    const { data: sessionData } = await supabaseClient.auth.getSession();
    state.isAdmin = !!sessionData?.session;

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session);
    });

    await loadCloudInitial();
    subscribeCloud();

    const id = await ensureTournamentIdV2();
    if (id) {
        await loadTimerFromCloudV2();
        subscribeTimerV2(id);
        startTimerPollingV2();
    }

    cloudReady = true;
}

async function cloudSet(key, value) {
    if (!supabaseClient || !cloudReady || applyingRemote) return;

    /**
     * Пишет только админ.
     * Гости только читают.
     */
    if (!state.isAdmin) return;

    const { error } = await supabaseClient
        .from('app_state')
        .upsert({
            key,
            value,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Supabase write error:', error);
    }
}

async function cloudSetForce(key, value) {
    /**
     * Используется для действий гостя, которые должны быть видны всем
     * (например, саморегистрация участника). В отличие от cloudSet,
     * не проверяет права админа.
     */
    if (!supabaseClient || !cloudReady) return;

    const { error } = await supabaseClient
        .from('app_state')
        .upsert({
            key,
            value,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Supabase write error:', error);
    }
}

async function loadCloudInitial() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('app_state')
        .select('key,value')
        .in('key', ['grid', 'settings', 'rules', 'registration']);

    if (error) {
        console.error('Supabase read error:', error);
        return;
    }

    applyingRemote = true;

    for (const row of data || []) {
        applyCloudRow(row);
    }

    applyingRemote = false;
}

function subscribeCloud() {
    supabaseClient
        .channel('poker_timer_app_state')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'app_state'
            },
            payload => {
                if (!payload.new) return;

                applyingRemote = true;
                applyCloudRow(payload.new);
                applyingRemote = false;
            }
        )
        .subscribe();
}

function applyCloudRow(row) {
    if (!row || !row.key) return;

    // 'timer' больше не приходит через app_state — см. applyTimerRowV2 / timer_state.

    if (row.key === 'grid') {
        applyGridData(row.value || {});
        saveLocal('pokerGridData', makeGridData());
        renderPlayerList();
        renderTables();
        renderRating();
    }

    if (row.key === 'settings') {
        applySettingsData(row.value || {});
        updateSettingsUI();
        renderRating();
    }

    if (row.key === 'rules') {
        state.rules.text = String(row.value?.text || '');
        localStorage.setItem('pokerRulesText', state.rules.text);
        renderRulesPage();
    }

    if (row.key === 'registration') {
        state.registration.agreementText = String(row.value?.text || '');
        localStorage.setItem('pokerRegistrationText', state.registration.agreementText);

        if ($('registrationAgreementModal') && $('registrationAgreementModal').classList.contains('active')) {
            renderRegistrationAgreement();
        }
    }
}

/************************************************************
 * DATA OBJECTS
 ************************************************************/

function makeTimerData() {
    return {
        currentLevel: state.timer.currentLevel,
        timeRemaining: state.timer.timeRemaining,
        totalLevelTime: state.timer.totalLevelTime,
        elapsedTime: state.timer.elapsedTime,
        isRunning: state.timer.isRunning,
        isPaused: state.timer.isPaused,
        isBreak: state.timer.isBreak,
        breakType: state.timer.breakType,
        tournamentEnded: state.timer.tournamentEnded,
        tournamentStartedAt: state.timer.tournamentStartedAt,
        targetEndTime: state.timer.targetEndTime,
        currentTemplate: state.currentTemplate,
        templates: state.templates
    };
}

function applyTimerData(data) {
    if (data.templates) state.templates = data.templates;
    if (data.currentTemplate && state.templates[data.currentTemplate]) {
        state.currentTemplate = data.currentTemplate;
    }

    Object.assign(state.timer, {
        currentLevel: Number(data.currentLevel || 1),
        timeRemaining: Number(data.timeRemaining || currentTemplate().levelDuration * 60),
        totalLevelTime: Number(data.totalLevelTime || currentTemplate().levelDuration * 60),
        elapsedTime: Number(data.elapsedTime || 0),
        isRunning: !!data.isRunning,
        isPaused: !!data.isPaused,
        isBreak: !!data.isBreak,
        breakType: data.breakType || null,
        tournamentEnded: !!data.tournamentEnded,
        tournamentStartedAt: data.tournamentStartedAt || null,
        targetEndTime: data.targetEndTime || null
    });
}

function makeGridData() {
    return {
        players: state.grid.players,
        tables: state.grid.tables,
        maxPlayersPerTable: state.grid.maxPlayersPerTable,
        gridCreated: state.grid.gridCreated,
        eliminationOrder: state.grid.eliminationOrder,
        tournamentEnded: state.grid.tournamentEnded
    };
}

function applyGridData(data) {
    state.grid.players = data.players || [];
    state.grid.tables = data.tables || [];
    state.grid.maxPlayersPerTable = data.maxPlayersPerTable || 6;
    state.grid.gridCreated = !!data.gridCreated;
    state.grid.eliminationOrder = data.eliminationOrder || [];
    state.grid.tournamentEnded = !!data.tournamentEnded;
}

function makeSettingsData() {
    return {
        primaryColor: state.settings.primaryColor,
        volume: state.settings.volume,
        totalPoints: state.settings.totalPoints,
        prizePlaces: state.settings.prizePlaces,
        tournament: state.tournament
    };
}

function applySettingsData(data) {
    if (data.primaryColor) state.settings.primaryColor = data.primaryColor;
    if (typeof data.volume !== 'undefined') state.settings.volume = data.volume;
    if (data.totalPoints) state.settings.totalPoints = data.totalPoints;
    if (Array.isArray(data.prizePlaces)) state.settings.prizePlaces = data.prizePlaces;

    if (data.tournament) {
        state.tournament = {
            ...state.tournament,
            ...data.tournament
        };
    }
}

/************************************************************
 * SAVE FUNCTIONS
 ************************************************************/

function saveTimerState() {
    const data = makeTimerData();
    saveLocal('pokerTimerState', data);
    writeTimerToCloudV2();
}

function saveGridData() {
    const data = makeGridData();
    saveLocal('pokerGridData', data);
    cloudSet('grid', data);
}

function saveSettingsData() {
    const data = makeSettingsData();
    saveLocal('pokerSettings', data);
    cloudSet('settings', data);
}

/************************************************************
 * TIMER
 ************************************************************/

function shouldBigBreakAfterCurrentLevel() {
    const t = currentTemplate();

    return !state.timer.isBreak &&
        t.bigBreakAfterLevel > 0 &&
        Number(state.timer.currentLevel) === Number(t.bigBreakAfterLevel);
}

function shouldRegularBreakAfterCurrentLevel() {
    const t = currentTemplate();

    if (state.timer.isBreak) return false;
    if (!t.breakDuration || t.breakDuration <= 0) return false;
    if (!t.breakEveryNLevels || t.breakEveryNLevels <= 0) return false;
    if (shouldBigBreakAfterCurrentLevel()) return false;

    return Number(state.timer.currentLevel) % Number(t.breakEveryNLevels) === 0;
}

function setStageDuration(seconds, baseTime = now()) {
    state.timer.totalLevelTime = Number(seconds);
    state.timer.timeRemaining = Number(seconds);
    state.timer.elapsedTime = 0;

    if (state.timer.isRunning) {
        state.timer.targetEndTime = baseTime + Number(seconds) * 1000;
    } else {
        state.timer.targetEndTime = null;
    }
}

function ensureTournamentStarted() {
    if (!state.timer.tournamentStartedAt) {
        state.timer.tournamentStartedAt = now();
    }
}

function getTotalElapsedSeconds() {
    if (!state.timer.tournamentStartedAt) return 0;
    return Math.floor((now() - Number(state.timer.tournamentStartedAt)) / 1000);
}

function finishTimer() {
    state.timer.tournamentEnded = true;
    state.timer.isRunning = false;
    state.timer.isPaused = false;
    state.timer.isBreak = false;
    state.timer.breakType = null;
    state.timer.targetEndTime = null;

    clearInterval(state.timer.interval);

    saveTimerState();
    updateTimerDisplay();
}

function moveToNextStage(baseTime = now()) {
    const t = currentTemplate();
    const totalLevels = t.levels.length;

    if (state.timer.isBreak) {
        const next = Number(state.timer.currentLevel) + 1;

        if (next > totalLevels) {
            finishTimer();
            return;
        }

        state.timer.currentLevel = next;
        state.timer.isBreak = false;
        state.timer.breakType = null;
        setStageDuration(t.levelDuration * 60, baseTime);
        return;
    }

    if (Number(state.timer.currentLevel) >= totalLevels) {
        finishTimer();
        return;
    }

    if (shouldBigBreakAfterCurrentLevel()) {
        state.timer.isBreak = true;
        state.timer.breakType = 'big';
        setStageDuration(t.bigBreakDuration * 60, baseTime);
        return;
    }

    if (shouldRegularBreakAfterCurrentLevel()) {
        state.timer.isBreak = true;
        state.timer.breakType = 'regular';
        setStageDuration(t.breakDuration * 60, baseTime);
        return;
    }

    state.timer.currentLevel++;
    state.timer.isBreak = false;
    state.timer.breakType = null;
    setStageDuration(t.levelDuration * 60, baseTime);
}

function playStageSound() {
    if (state.timer.isBreak) {
        playSound(state.timer.breakType === 'big' ? 'bigBreakEnd' : 'breakEnd');
    } else {
        playSound('levelEnd');
    }
}

function syncTimer(silent = false) {
    if (!state.timer.isRunning || !state.timer.targetEndTime || state.timer.tournamentEnded) return;

    const currentNow = now();
    let changedStage = false;

    while (
        state.timer.isRunning &&
        !state.timer.tournamentEnded &&
        state.timer.targetEndTime &&
        currentNow >= state.timer.targetEndTime
    ) {
        const endedAt = state.timer.targetEndTime;

        if (!silent) playStageSound();

        moveToNextStage(endedAt);
        changedStage = true;
    }

    if (state.timer.isRunning && !state.timer.tournamentEnded && state.timer.targetEndTime) {
        const remainingMs = Math.max(0, state.timer.targetEndTime - now());
        state.timer.timeRemaining = Math.ceil(remainingMs / 1000);
        state.timer.elapsedTime = Math.max(0, state.timer.totalLevelTime - state.timer.timeRemaining);
    }

    if (changedStage) saveTimerState();
}

function timerTick() {
    syncTimer(false);
    updateTimerDisplay();
}

function startTimerInterval() {
    clearInterval(state.timer.interval);
    state.timer.interval = setInterval(timerTick, 500);
}

function restartTimerIntervalIfNeeded() {
    clearInterval(state.timer.interval);

    if (state.timer.isRunning) {
        startTimerInterval();
    }
}

function startTimer() {
    if (state.timer.isRunning || state.timer.tournamentEnded) return;

    ensureTournamentStarted();

    state.timer.isRunning = true;
    state.timer.isPaused = false;
    state.timer.targetEndTime = now() + state.timer.timeRemaining * 1000;

    startTimerInterval();
    saveTimerState();
    updateTimerDisplay();
}

function pauseTimer() {
    if (!state.timer.isRunning) return;

    syncTimer(true);

    state.timer.isRunning = false;
    state.timer.isPaused = true;
    state.timer.targetEndTime = null;

    clearInterval(state.timer.interval);

    saveTimerState();
    updateTimerDisplay();
}

function resetTimer() {
    const t = currentTemplate();

    clearInterval(state.timer.interval);

    Object.assign(state.timer, {
        currentLevel: 1,
        timeRemaining: t.levelDuration * 60,
        totalLevelTime: t.levelDuration * 60,
        elapsedTime: 0,
        isRunning: false,
        isPaused: false,
        isBreak: false,
        breakType: null,
        tournamentEnded: false,
        tournamentStartedAt: null,
        targetEndTime: null
    });

    saveTimerState();
    updateTimerDisplay();
}

function nextLevel() {
    const wasRunning = state.timer.isRunning;

    moveToNextStage(now());

    if (!state.timer.tournamentEnded) {
        state.timer.isRunning = wasRunning;
        state.timer.isPaused = false;

        if (wasRunning) {
            state.timer.targetEndTime = now() + state.timer.timeRemaining * 1000;
            startTimerInterval();
        } else {
            state.timer.targetEndTime = null;
            clearInterval(state.timer.interval);
        }
    }

    saveTimerState();
    updateTimerDisplay();
}

function prevLevel() {
    const t = currentTemplate();

    if (state.timer.currentLevel <= 1 && !state.timer.isBreak) {
        alert('Это первый уровень, назад перемотать нельзя');
        return;
    }

    clearInterval(state.timer.interval);

    if (state.timer.isBreak) {
        state.timer.isBreak = false;
        state.timer.breakType = null;
    } else {
        state.timer.currentLevel = Math.max(1, state.timer.currentLevel - 1);
    }

    state.timer.isRunning = false;
    state.timer.isPaused = false;
    state.timer.tournamentEnded = false;
    state.timer.totalLevelTime = t.levelDuration * 60;
    state.timer.timeRemaining = state.timer.totalLevelTime;
    state.timer.elapsedTime = 0;
    state.timer.targetEndTime = null;

    saveTimerState();
    updateTimerDisplay();
}

function seekTimerByProgress(event) {
    if (!state.isAdmin) return;
    if (state.timer.tournamentEnded) return;

    const box = $('progressContainer');
    const rect = box.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    state.timer.elapsedTime = Math.round(state.timer.totalLevelTime * percent);
    state.timer.timeRemaining = Math.max(0, state.timer.totalLevelTime - state.timer.elapsedTime);

    if (state.timer.isRunning) {
        state.timer.targetEndTime = now() + state.timer.timeRemaining * 1000;
    }

    saveTimerState();
    updateTimerDisplay();
}

/************************************************************
 * TIMER DISPLAY
 ************************************************************/

function getCurrentLevelData() {
    return currentTemplate().levels.find(l => Number(l.level) === Number(state.timer.currentLevel)) ||
        currentTemplate().levels[0];
}

function getNextLevelText() {
    const t = currentTemplate();

    if (state.timer.tournamentEnded) return 'Турнир завершён';

    if (state.timer.isBreak) {
        const next = t.levels.find(l => l.level === state.timer.currentLevel + 1);
        return next ? `После перерыва: ${next.sb} / ${next.bb}` : 'После перерыва: завершение турнира';
    }

    if (shouldBigBreakAfterCurrentLevel()) {
        return `Большой перерыв ${t.bigBreakDuration} минут`;
    }

    if (shouldRegularBreakAfterCurrentLevel()) {
        return `Перерыв ${t.breakDuration} минут`;
    }

    const next = t.levels.find(l => l.level === state.timer.currentLevel + 1);

    return next ? `${next.sb} / ${next.bb}` : 'Завершение турнира';
}

function updateTimerDisplay() {
    const t = currentTemplate();
    const level = getCurrentLevelData();

    if (state.timer.tournamentEnded) {
        setText('levelDisplay', 'ТУРНИР ЗАВЕРШЁН!');
        setText('timerDisplay', '--:--');
        setText('timerStatus', 'Завершён');
        setText('nextLevelInfo', 'Турнир завершён');
        return;
    }

    const levelDisplay = $('levelDisplay');

    if (levelDisplay) {
        if (state.timer.isBreak) {
            levelDisplay.textContent = state.timer.breakType === 'big' ? 'БОЛЬШОЙ ПЕРЕРЫВ' : 'ПЕРЕРЫВ';
            levelDisplay.className = 'level-display break-mode';
        } else {
            levelDisplay.innerHTML = `УРОВЕНЬ <span id="currentLevel">${state.timer.currentLevel}</span>`;
            levelDisplay.className = 'level-display';
        }
    }

    setText('smallBlind', level.sb);
    setText('bigBlind', level.bb);
    setText('anteDisplay', level.ante);

    setText('timerDisplay', formatTime(state.timer.timeRemaining));
    setText('elapsedTime', formatTime(state.timer.elapsedTime));
    setText('totalTime', formatTime(state.timer.totalLevelTime));
    setText('statElapsedTime', formatTime(getTotalElapsedSeconds()));
    setText('statLevel', state.timer.currentLevel);
    setText('statTotalLevels', t.levels.length);
    setText('currentTemplate', state.currentTemplate);
    setText('nextLevelInfo', getNextLevelText());

    setText('gridCurrentLevel', state.timer.currentLevel);
    setText('gridSmallBlind', level.sb);
    setText('gridBigBlind', level.bb);
    setText('gridTimerDisplay', formatTime(state.timer.timeRemaining));

    const progress = state.timer.totalLevelTime > 0
        ? (state.timer.elapsedTime / state.timer.totalLevelTime) * 100
        : 0;

    if ($('progressFill')) $('progressFill').style.width = `${progress}%`;

    if (state.timer.isRunning) {
        setText('timerStatus', state.timer.isBreak ? 'Перерыв' : 'Идёт игра');
    } else if (state.timer.isPaused) {
        setText('timerStatus', 'Пауза');
    } else {
        setText('timerStatus', 'Готов');
    }
}

/************************************************************
 * SOUND
 ************************************************************/

function playSound(type) {
    let src = null;

    if (type === 'levelEnd') src = state.settings.defaultBlindSound;
    if (type === 'breakEnd') src = state.settings.defaultBreakSound;
    if (type === 'bigBreakEnd') src = state.settings.defaultBigBreakSound;

    if (!src) return;

    const audio = new Audio(src);
    audio.volume = Number(state.settings.volume) / 100;
    audio.play().catch(() => {});
}

function playDefaultSound(src) {
    const audio = new Audio(src);
    audio.volume = Number(state.settings.volume) / 100;
    audio.play().catch(() => {
        alert('Не удалось воспроизвести файл: ' + src);
    });
}

/************************************************************
 * GRID / PLAYERS
 ************************************************************/

function addPlayer() {
    const name = $('playerName').value.trim();
    const chips = parseInt($('playerChips').value) || 500;

    if (!name) {
        alert('Введите имя участника');
        return;
    }

    state.grid.players.push({
        id: uid(),
        name,
        chips,
        eliminated: false,
        eliminationPlace: null
    });

    $('playerName').value = '';
    $('playerChips').value = 500;

    renderPlayerList();
    saveGridData();
}

function removePlayer(id) {
    state.grid.players = state.grid.players.filter(p => p.id !== id);
    renderPlayerList();
    saveGridData();
}

function renderPlayerList() {
    const list = $('playerList');
    if (!list) return;

    list.innerHTML = '';

    state.grid.players.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'player-item';

        if (state.isAdmin) {
            item.innerHTML = `
                <div class="player-item-info" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <span>${index + 1}.</span>
                    <input type="text" class="player-edit-name" data-id="${p.id}" value="${escapeHtml(p.name)}"
                        style="width:150px; padding:6px 8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color);">
                    <input type="number" class="player-edit-chips" data-id="${p.id}" value="${p.chips}" min="0"
                        style="width:90px; padding:6px 8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color);">
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-primary btn-small" onclick="savePlayerEdit(${p.id})">💾</button>
                    <button class="btn btn-warning btn-small" onclick="removePlayer(${p.id})">✕</button>
                </div>
            `;
        } else {
            item.innerHTML = `
                <div class="player-item-info">
                    <span class="player-item-name">${index + 1}. ${escapeHtml(p.name)}</span>
                    <span class="player-item-chips">${p.chips} очков</span>
                </div>
            `;
        }

        list.appendChild(item);
    });
}

function savePlayerEdit(id) {
    if (!state.isAdmin) return;

    const nameInput = document.querySelector(`.player-edit-name[data-id="${id}"]`);
    const chipsInput = document.querySelector(`.player-edit-chips[data-id="${id}"]`);

    if (!nameInput || !chipsInput) return;

    const newName = nameInput.value.trim();
    const newChips = parseInt(chipsInput.value) || 0;

    if (!newName) {
        alert('Имя не может быть пустым');
        return;
    }

    const duplicate = state.grid.players.some(p => Number(p.id) !== Number(id) && p.name.trim().toLowerCase() === newName.toLowerCase());

    if (duplicate) {
        alert('Участник с таким именем уже есть в списке');
        return;
    }

    state.grid.players.forEach(p => {
        if (Number(p.id) === Number(id)) {
            p.name = newName;
            p.chips = newChips;
        }
    });

    state.grid.tables.forEach(t => {
        t.players.forEach(p => {
            if (Number(p.id) === Number(id)) {
                p.name = newName;
                p.chips = newChips;
            }
        });
    });

    renderPlayerList();
    renderTables();
    renderRating();
    saveGridData();

    alert('Данные участника обновлены');
}

function createGrid() {
    if (state.grid.players.length === 0) {
        alert('Добавьте участников');
        return;
    }

    state.grid.maxPlayersPerTable = parseInt($('maxPlayersPerTable').value) || 6;

    let players = shuffleArray(state.grid.players);
    players = shuffleArray(players);
    players = shuffleArray(players);

    state.grid.tables = [];

    let tableId = 1;

    for (let i = 0; i < players.length; i += state.grid.maxPlayersPerTable) {
        const tablePlayers = players.slice(i, i + state.grid.maxPlayersPerTable);

        state.grid.tables.push({
            id: tableId++,
            players: tablePlayers.map((p, index) => ({
                ...p,
                seatNumber: index + 1
            }))
        });
    }

    state.grid.gridCreated = true;

    show($('addPlayerAfterGridSection'), 'block');

    renderTables();
    saveGridData();
}

function addPlayerToGrid() {
    const name = $('newPlayerName').value.trim();
    const chips = parseInt($('newPlayerChips').value) || 500;

    if (!name) {
        alert('Введите имя участника');
        return;
    }

    const player = {
        id: uid(),
        name,
        chips,
        eliminated: false,
        eliminationPlace: null
    };

    state.grid.players.push(player);

    let target = state.grid.tables[0];

    state.grid.tables.forEach(t => {
        if (t.players.length < target.players.length) target = t;
    });

    if (target) {
        player.seatNumber = getFreeSeatNumber(target);
        target.players.push(player);
    }

    $('newPlayerName').value = '';
    $('newPlayerChips').value = 500;

    renderPlayerList();
    renderTables();
    saveGridData();
}

function getFreeSeatNumber(table) {
    for (let i = 1; i <= state.grid.maxPlayersPerTable; i++) {
        if (!table.players.some(p => Number(p.seatNumber) === i)) return i;
    }

    return table.players.length + 1;
}

function sortTablePlayers(table) {
    table.players.sort((a, b) => Number(a.seatNumber) - Number(b.seatNumber));
}

function calculateSeatSize(name) {
    return Math.min(80 + Math.floor(String(name).length / 3) * 5, 120);
}

function calculateSymmetricSeatPositions(totalSeats) {
    const positions = [];
    const angleStep = (2 * Math.PI) / totalSeats;
    const startAngle = -Math.PI / 2;

    for (let i = 0; i < totalSeats; i++) {
        const angle = startAngle + i * angleStep;

        positions.push({
            x: 50 + 42 * Math.cos(angle),
            y: 50 + 38 * Math.sin(angle)
        });
    }

    return positions;
}

function renderTables() {
    const container = $('tablesContainer');
    if (!container) return;

    container.innerHTML = '';

    state.grid.tables.forEach(table => {
        sortTablePlayers(table);

        const maxSeat = table.players.reduce((m, p) => Math.max(m, Number(p.seatNumber || 0)), 0);
        const totalSeats = Math.max(state.grid.maxPlayersPerTable, maxSeat, table.players.length, 1);
        const positions = calculateSymmetricSeatPositions(totalSeats);

        const tableDiv = document.createElement('div');
        tableDiv.className = 'poker-table';

        tableDiv.innerHTML = `
            <div class="table-header">Стол ${table.id} - ${table.players.length} участников</div>
            <div class="table-oval-container">
                ${table.id === 'Финальный' ? `<div class="final-table-label">ФИНАЛ</div>` : ''}
                <div class="table-oval ${table.id === 'Финальный' ? 'final-table' : ''}"></div>
            </div>
        `;

        const oval = tableDiv.querySelector('.table-oval');

        table.players.forEach(player => {
            const seatIndex = Math.max(0, Number(player.seatNumber || 1) - 1);
            const pos = positions[seatIndex] || positions[0];

            const seat = document.createElement('div');
            seat.className = `table-seat ${player.eliminated ? 'eliminated' : ''}`;

            const size = calculateSeatSize(player.name);
            seat.style.width = `${size}px`;
            seat.style.height = `${size}px`;
            seat.style.left = `${pos.x}%`;
            seat.style.top = `${pos.y}%`;

            seat.innerHTML = `
                <div class="seat-number">#${player.seatNumber}</div>
                <div class="seat-name">${escapeHtml(player.name)}</div>
                <div class="seat-chips">${player.chips}</div>
            `;

            if (state.isAdmin) {
                seat.onclick = () => openPlayerAction(player, table.id);
            }

            oval.appendChild(seat);
        });

        if (state.isAdmin) {
            const controls = document.createElement('div');
            controls.className = 'table-controls';
            controls.innerHTML = `
                <button class="btn btn-warning btn-small" onclick="eliminateFromTable('${table.id}')">Выбывание</button>
            `;
            tableDiv.appendChild(controls);
        }

        container.appendChild(tableDiv);
    });

    const active = state.grid.players.filter(p => !p.eliminated).length;

    if ($('finalTableSection')) {
        $('finalTableSection').style.display = state.isAdmin && active >= 1 ? 'block' : 'none';
    }
}

function openPlayerAction(player, tableId) {
    state.grid.selectedPlayer = { player, tableId };

    $('playerActionTitle').textContent = `Игрок: ${player.name}`;

    $('playerActionContent').innerHTML = `
        <div class="form-group">
            <label>Количество очков</label>
            <input type="number" id="updateChips" value="${player.chips}" min="0">
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:20px;">
            <button class="btn btn-primary" onclick="updatePlayerChips()">💾 Обновить очки</button>
            <button class="btn btn-warning" onclick="openMovePlayer()">🔄 Пересадить</button>
            <button class="btn btn-danger" onclick="eliminatePlayer()">❌ Выбивание</button>
        </div>
    `;

    $('playerActionModal').classList.add('active');
}

function updatePlayerChips() {
    const selected = state.grid.selectedPlayer;
    if (!selected) return;

    const chips = parseInt($('updateChips').value) || 0;

    state.grid.players.forEach(p => {
        if (p.id === selected.player.id) p.chips = chips;
    });

    state.grid.tables.forEach(t => {
        t.players.forEach(p => {
            if (p.id === selected.player.id) p.chips = chips;
        });
    });

    $('playerActionModal').classList.remove('active');

    renderTables();
    renderRating();
    saveGridData();
}

function openMovePlayer() {
    $('playerActionModal').classList.remove('active');

    const tableSelect = $('moveToTable');
    tableSelect.innerHTML = '';

    state.grid.tables.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `Стол ${t.id}`;
        tableSelect.appendChild(option);
    });

    updateSeatOptions();
    tableSelect.onchange = updateSeatOptions;

    $('movePlayerModal').classList.add('active');
}

function updateSeatOptions() {
    const seatSelect = $('moveToSeat');
    seatSelect.innerHTML = '';

    for (let i = 1; i <= state.grid.maxPlayersPerTable; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Место ${i}`;
        seatSelect.appendChild(option);
    }
}

function confirmMovePlayer() {
    const selected = state.grid.selectedPlayer;
    if (!selected) return;

    const toTableId = $('moveToTable').value;
    const toSeat = parseInt($('moveToSeat').value);

    const fromTable = state.grid.tables.find(t => String(t.id) === String(selected.tableId));
    const toTable = state.grid.tables.find(t => String(t.id) === String(toTableId));

    if (!fromTable || !toTable) return;

    const moving = fromTable.players.find(p => p.id === selected.player.id);
    if (!moving) return;

    const oldSeat = Number(moving.seatNumber);
    const existing = toTable.players.find(p => Number(p.seatNumber) === toSeat && p.id !== moving.id);

    if (String(fromTable.id) === String(toTable.id)) {
        if (existing) existing.seatNumber = oldSeat;
        moving.seatNumber = toSeat;
    } else {
        fromTable.players = fromTable.players.filter(p => p.id !== moving.id);

        if (existing) {
            toTable.players = toTable.players.filter(p => p.id !== existing.id);
            existing.seatNumber = oldSeat;
            fromTable.players.push(existing);
        }

        moving.seatNumber = toSeat;
        toTable.players.push(moving);
    }

    sortTablePlayers(fromTable);
    sortTablePlayers(toTable);

    $('movePlayerModal').classList.remove('active');

    renderTables();
    saveGridData();
}

function eliminatePlayer() {
    const selected = state.grid.selectedPlayer;
    if (!selected) return;

    markEliminated(selected.player.id);

    $('playerActionModal').classList.remove('active');

    renderTables();
    renderRating();
    saveGridData();
}

function eliminateFromTable(tableId) {
    const table = state.grid.tables.find(t => String(t.id) === String(tableId));
    if (!table) return;

    const name = prompt('Введите имя игрока для выбывания:');
    if (!name) return;

    const player = table.players.find(p => p.name.toLowerCase() === name.toLowerCase() && !p.eliminated);

    if (!player) {
        alert('Игрок не найден или уже выбыл');
        return;
    }

    markEliminated(player.id);

    renderTables();
    renderRating();
    saveGridData();
}

function markEliminated(id) {
    state.grid.players.forEach(p => {
        if (p.id === id && !p.eliminated) {
            p.eliminated = true;
            state.grid.eliminationOrder.push(id);
        }
    });

    state.grid.tables.forEach(t => {
        t.players.forEach(p => {
            if (p.id === id) p.eliminated = true;
        });
    });
}

function createFinalTable() {
    const active = state.grid.players.filter(p => !p.eliminated);

    if (active.length < 2) {
        alert('Для финального стола нужно минимум 2 игрока');
        return;
    }

    const shuffled = shuffleArray(shuffleArray(shuffleArray(active)));

    state.grid.tables = [{
        id: 'Финальный',
        players: shuffled.map((p, index) => ({
            ...p,
            seatNumber: index + 1
        }))
    }];

    renderTables();
    saveGridData();

    alert(`Финальный стол сформирован из ${shuffled.length} игроков`);
}

function endTournament() {
    const active = state.grid.players.filter(p => !p.eliminated);

    if (active.length === 0) {
        alert('Все игроки уже выбыли');
        return;
    }

    if (!confirm('Завершить турнир?')) return;

    active.sort((a, b) => b.chips - a.chips);

    active.forEach(p => {
        if (!p.eliminated) {
            p.eliminated = true;
            state.grid.eliminationOrder.push(p.id);
        }
    });

    state.grid.tournamentEnded = true;

    renderTables();
    renderRating();
    saveGridData();
}

/************************************************************
 * PLAYER FILE IMPORT / EXPORT
 ************************************************************/

function savePlayersToFile() {
    if (!state.grid.players.length) {
        alert('Список игроков пуст');
        return;
    }

    const data = {
        type: 'poker_timer_players',
        version: 1,
        players: state.grid.players.map(p => ({
            name: p.name,
            chips: p.chips
        }))
    };

    downloadJson(data, `poker-players-${new Date().toISOString().slice(0, 10)}.json`);
}

function loadPlayersFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,.txt';

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = ev => {
            try {
                const players = parsePlayersFile(String(ev.target.result), file.name);

                if (!players.length) {
                    alert('Игроки не найдены');
                    return;
                }

                if (state.grid.gridCreated && !confirm('Сетка уже создана. Очистить сетку и загрузить список?')) {
                    return;
                }

                state.grid.tables = [];
                state.grid.gridCreated = false;
                state.grid.eliminationOrder = [];
                state.grid.tournamentEnded = false;

                state.grid.players = players.map((p, index) => ({
                    id: uid() + index,
                    name: String(p.name || p.player || p.имя || '').trim(),
                    chips: parseInt(p.chips || p.points || p.очки) || 500,
                    eliminated: false,
                    eliminationPlace: null
                })).filter(p => p.name);

                hide($('addPlayerAfterGridSection'));

                renderPlayerList();
                renderTables();
                saveGridData();

                alert(`Загружено игроков: ${state.grid.players.length}`);
            } catch (err) {
                alert('Ошибка файла: ' + err.message);
            }
        };

        reader.readAsText(file, 'UTF-8');
    };

    input.click();
}

function parsePlayersFile(text, filename) {
    if (filename.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : data.players || [];
    }

    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter((line, index) => !(index === 0 && /name|chips|имя|очки/i.test(line)))
        .map(line => {
            const parts = line.includes(';') ? line.split(';') : line.split(',');
            return {
                name: parts[0],
                chips: parts[1] || 500
            };
        });
}

function addPlayerFileButtons() {
    if ($('savePlayersFileBtn')) return;

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '10px';
    btns.style.flexWrap = 'wrap';
    btns.style.marginTop = '15px';

    btns.innerHTML = `
        <button class="btn btn-secondary" id="savePlayersFileBtn">💾 Сохранить список игроков</button>
        <button class="btn btn-secondary" id="loadPlayersFileBtn">📂 Загрузить список игроков</button>
    `;

    $('createGridBtn').after(btns);

    $('savePlayersFileBtn').onclick = savePlayersToFile;
    $('loadPlayersFileBtn').onclick = loadPlayersFromFile;
}

function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);
}

/************************************************************
 * RATING
 ************************************************************/

function getPlayersWithPlaces() {
    const total = state.grid.players.length;
    const result = state.grid.players.map(p => ({ ...p }));

    const eliminated = result.filter(p => p.eliminated);

    eliminated.sort((a, b) => {
        return state.grid.eliminationOrder.indexOf(b.id) - state.grid.eliminationOrder.indexOf(a.id);
    });

    eliminated.forEach((p, index) => {
        p.eliminationPlace = total - index;
    });

    const active = result.filter(p => !p.eliminated);
    active.sort((a, b) => b.chips - a.chips);

    active.forEach((p, index) => {
        p.eliminationPlace = index + 1;
    });

    return result.sort((a, b) => a.eliminationPlace - b.eliminationPlace);
}

function renderRating(targetId = 'ratingList') {
    const list = $(targetId);
    if (!list) return;

    list.innerHTML = '';

    if (!state.grid.players.length) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">Нет участников</p>';
        return;
    }

    const players = getPlayersWithPlaces();
    const totalChips = state.grid.players.reduce((s, p) => s + Number(p.chips || 0), 0);

    players.forEach(player => {
        const place = player.eliminationPlace;
        const prize = state.settings.prizePlaces.find(p => Number(p.place) === Number(place));
        const points = prize ? Math.round(totalChips * prize.percentage / 100) : 0;

        const item = document.createElement('div');
        item.className = 'rating-item';

        if (place === 1) item.style.background = 'rgba(255, 215, 0, 0.1)';
        if (place === 2) item.style.background = 'rgba(192, 192, 192, 0.1)';
        if (place === 3) item.style.background = 'rgba(205, 127, 50, 0.1)';

        item.innerHTML = `
            <div class="rating-position">${place}</div>
            <div class="rating-name">${escapeHtml(player.name)}</div>
            <div class="rating-points">${points} очков</div>
        `;

        list.appendChild(item);
    });
}

function saveRatingAsJpg() {
    if (!state.grid.players.length) {
        alert('Нет участников');
        return;
    }

    renderRating('screenshotRatingList');
    setText('screenshotDate', new Date().toLocaleString('ru-RU'));

    const box = $('screenshotContainer');
    box.style.left = '0';
    box.style.zIndex = '9999';

    html2canvas(box, {
        backgroundColor: '#0a0e1a',
        scale: 2,
        useCORS: true
    }).then(canvas => {
        box.style.left = '-9999px';
        box.style.zIndex = '-1';

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.download = `poker-rating-${new Date().toISOString().slice(0, 10)}.jpg`;
        link.click();
    });
}

/************************************************************
 * RULES
 ************************************************************/

function ensureRulesPage() {
    if ($('rulesPage')) return;

    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'rulesPage';

    page.innerHTML = `
        <div class="container">
            <div class="admin-panel">
                <div class="admin-header">
                    <h2>📜 Правила турнира</h2>
                    <button class="btn btn-secondary nav-btn" data-page="timerPage">← Назад к таймеру</button>
                </div>
                <div id="rulesContent"></div>
            </div>
        </div>
    `;

    document.body.appendChild(page);
}

function addRulesButton() {
    if ($('rulesBtn')) return;

    const btn = document.createElement('button');
    btn.className = 'btn btn-warning nav-btn';
    btn.id = 'rulesBtn';
    btn.dataset.page = 'rulesPage';
    btn.textContent = '📜 Правила';

    $('ratingBtn').before(btn);
}

function renderRulesPage() {
    ensureRulesPage();

    const box = $('rulesContent');
    if (!box) return;

    if (state.isAdmin) {
        box.innerHTML = `
            <p style="color:var(--text-muted); margin-bottom:15px;">
                Вы вошли как админ. Здесь можно редактировать правила. Гости смогут только читать.
            </p>
            <textarea id="rulesEditor" style="
                width:100%;
                min-height:500px;
                resize:vertical;
                background:var(--bg-color);
                border:1px solid var(--border-color);
                border-radius:10px;
                color:var(--text-color);
                padding:18px;
                font-size:16px;
                line-height:1.6;
            "></textarea>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:15px;">
                <button class="btn btn-primary" id="saveRulesBtn">💾 Сохранить правила</button>
                <button class="btn btn-secondary" id="defaultRulesBtn">📋 Вставить пример</button>
            </div>
        `;

        $('rulesEditor').value = state.rules.text || '';

        $('saveRulesBtn').onclick = saveRules;
        $('defaultRulesBtn').onclick = () => {
            $('rulesEditor').value = defaultRulesText();
        };
    } else {
        box.innerHTML = state.rules.text
            ? `<div style="white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word; text-align:left; line-height:1.75; font-size:18px; width:100%; box-sizing:border-box;">${escapeHtml(state.rules.text)}</div>`
            : `<p style="color:var(--text-muted); text-align:center;">Правила пока не заполнены администратором.</p>`;
    }
}

function defaultRulesText() {
    return `ПРАВИЛА ПОКЕРНОГО ТУРНИРА

1. Общие положения

Турнир проводится по правилам Texas Hold'em No-Limit. Все участники обязаны соблюдать порядок игры и уважительно относиться к другим игрокам.

2. Старт турнира

Каждый участник получает стартовое количество очков, указанное организатором.

3. Блайнды и уровни

Блайнды повышаются согласно структуре таймера.

4. Перерывы

Перерывы проводятся согласно расписанию таймера.

5. Выбывание игроков

Игрок выбывает из турнира, когда теряет все очки.

6. Финальный стол

Финальный стол формируется организатором из оставшихся игроков.

7. Завершение турнира

Турнир завершается после определения победителя.

8. Спорные ситуации

Все спорные ситуации решаются организатором турнира.`;
}

function saveRules() {
    if (!state.isAdmin) return;

    state.rules.text = $('rulesEditor').value.trim();
    localStorage.setItem('pokerRulesText', state.rules.text);

    cloudSet('rules', {
        text: state.rules.text,
        updatedAt: new Date().toISOString()
    });

    alert('Правила сохранены');
}

/************************************************************
 * REGISTRATION (guest self-registration)
 ************************************************************/

function defaultRegistrationText() {
    return `СОГЛАШЕНИЕ УЧАСТНИКА ТУРНИРА

Регистрируясь в качестве участника турнира, вы соглашаетесь соблюдать правила турнира, уважительно относиться к другим игрокам и организаторам.

Нажимая «Принять», вы подтверждаете, что ознакомились с условиями участия и согласны с ними.`;
}

function addRegistrationButton() {
    if ($('registrationBtn')) return;
    if (!$('rulesBtn')) return;

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.id = 'registrationBtn';
    btn.textContent = '📝 Регистрация';
    btn.style.display = 'inline-block';
    btn.onclick = openRegistrationEntry;

    $('rulesBtn').before(btn);
}

function openRegistrationEntry() {
    renderRegistrationAgreement();
    $('registrationAgreementModal').classList.add('active');
}

function renderRegistrationAgreement() {
    const box = $('registrationAgreementContent');
    const actions = $('registrationAgreementActions');
    if (!box || !actions) return;

    if (state.isAdmin) {
        box.innerHTML = `
            <p style="color:var(--text-muted); margin-bottom:15px;">
                Вы вошли как админ. Здесь можно отредактировать текст соглашения, которое видят гости перед регистрацией. Гости смогут только читать текст и нажимать «Принять».
            </p>
            <textarea id="registrationAgreementEditor" style="
                width:100%;
                min-height:300px;
                resize:vertical;
                background:var(--bg-color);
                border:1px solid var(--border-color);
                border-radius:10px;
                color:var(--text-color);
                padding:16px;
                font-size:15px;
                line-height:1.6;
            "></textarea>
        `;

        $('registrationAgreementEditor').value = state.registration.agreementText || '';

        actions.innerHTML = `
            <button class="btn btn-secondary" id="closeRegistrationAgreementBtn">← Назад к таймеру</button>
            <button class="btn btn-primary" id="saveRegistrationAgreementBtn">💾 Сохранить текст</button>
        `;

        $('saveRegistrationAgreementBtn').onclick = saveRegistrationAgreement;
    } else {
        box.innerHTML = `
            <div style="
                white-space:pre-wrap;
                overflow-wrap:break-word;
                word-break:break-word;
                text-align:left;
                line-height:1.7;
                font-size:16px;
                width:100%;
                box-sizing:border-box;
            ">
                ${state.registration.agreementText
                    ? escapeHtml(state.registration.agreementText)
                    : 'Организатор пока не добавил текст соглашения.'}
            </div>
        `;

        actions.innerHTML = `
            <button class="btn btn-secondary" id="closeRegistrationAgreementBtn">← Назад к таймеру</button>
            <button class="btn btn-success" id="acceptRegistrationBtn">✅ Принять</button>
        `;

        $('acceptRegistrationBtn').onclick = acceptRegistrationAgreement;
    }

    $('closeRegistrationAgreementBtn').onclick = () => {
        $('registrationAgreementModal').classList.remove('active');
    };
}

function saveRegistrationAgreement() {
    if (!state.isAdmin) return;

    state.registration.agreementText = $('registrationAgreementEditor').value.trim();
    localStorage.setItem('pokerRegistrationText', state.registration.agreementText);

    cloudSet('registration', {
        text: state.registration.agreementText,
        updatedAt: new Date().toISOString()
    });

    alert('Текст соглашения сохранён');
}

function acceptRegistrationAgreement() {
    $('registrationAgreementModal').classList.remove('active');
    $('registrationPlayerName').value = '';
    $('registrationFormModal').classList.add('active');
}

function submitRegistration() {
    const nameInput = $('registrationPlayerName');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Введите имя участника');
        return;
    }

    const exists = state.grid.players.some(p => p.name.trim().toLowerCase() === name.toLowerCase());

    if (exists) {
        alert('Участник с таким именем уже есть в списке');
        return;
    }

    const chips = Number(state.tournament.startingChips) || 500;

    state.grid.players.push({
        id: uid(),
        name,
        chips,
        eliminated: false,
        eliminationPlace: null
    });

    saveLocal('pokerGridData', makeGridData());
    cloudSetForce('grid', makeGridData());

    nameInput.value = '';
    $('registrationFormModal').classList.remove('active');

    renderPlayerList();
    renderTables();
    renderRating();

    alert('Вы успешно зарегистрированы! Ваше имя добавлено в список участников.');
}

/************************************************************
 * TEMPLATES / LEVELS
 ************************************************************/

function renderLevelsTable() {
    const tbody = $('levelsTableBody');
    if (!tbody) return;

    const t = currentTemplate();

    $('editingTemplateName').textContent = state.currentTemplate;
    $('levelDuration').value = t.levelDuration;
    $('breakDuration').value = t.breakDuration;
    $('breakEveryNLevels').value = t.breakEveryNLevels;
    $('bigBreakAfterLevel').value = t.bigBreakAfterLevel;
    $('bigBreakDuration').value = t.bigBreakDuration;

    tbody.innerHTML = '';

    t.levels.forEach((level, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${level.level}</strong></td>
            <td><input type="number" value="${level.sb}" onchange="updateLevel(${index}, 'sb', this.value)"></td>
            <td><input type="number" value="${level.bb}" onchange="updateLevel(${index}, 'bb', this.value)"></td>
            <td><input type="number" value="${level.ante}" onchange="updateLevel(${index}, 'ante', this.value)"></td>
            <td><button class="btn btn-danger btn-small" onclick="deleteLevel(${index})">×</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLevel(index, field, value) {
    currentTemplate().levels[index][field] = parseInt(value) || 0;
}

function deleteLevel(index) {
    const t = currentTemplate();

    if (t.levels.length <= 1) {
        alert('Должен остаться хотя бы один уровень');
        return;
    }

    t.levels.splice(index, 1);
    t.levels.forEach((l, i) => l.level = i + 1);

    renderLevelsTable();
}

function addLevel() {
    const t = currentTemplate();
    const last = t.levels[t.levels.length - 1];

    t.levels.push({
        level: t.levels.length + 1,
        sb: last.sb * 2,
        bb: last.bb * 2,
        ante: last.ante ? last.ante * 2 : 0
    });

    renderLevelsTable();
}

function saveLevels() {
    const t = currentTemplate();

    t.levelDuration = parseInt($('levelDuration').value) || 15;
    t.breakDuration = parseInt($('breakDuration').value) || 0;
    t.breakEveryNLevels = parseInt($('breakEveryNLevels').value) || 4;
    t.bigBreakAfterLevel = parseInt($('bigBreakAfterLevel').value) || 0;
    t.bigBreakDuration = parseInt($('bigBreakDuration').value) || 20;

    applyTemplateToTimer();

    alert('Уровни сохранены');
}

function applyTemplateToTimer() {
    const t = currentTemplate();

    clearInterval(state.timer.interval);

    Object.assign(state.timer, {
        currentLevel: 1,
        timeRemaining: t.levelDuration * 60,
        totalLevelTime: t.levelDuration * 60,
        elapsedTime: 0,
        isRunning: false,
        isPaused: false,
        isBreak: false,
        breakType: null,
        tournamentEnded: false,
        tournamentStartedAt: null,
        targetEndTime: null
    });

    saveTimerState();
    updateTimerDisplay();
}

function renderTemplatesList() {
    const box = $('templatesList');
    if (!box) return;

    box.innerHTML = '';

    Object.keys(state.templates).forEach(name => {
        const t = state.templates[name];
        const active = name === state.currentTemplate;

        const div = document.createElement('div');
        div.className = 'template-item';

        div.innerHTML = `
            <div class="template-item-header">
                <div class="template-item-info">
                    <h3 style="color:${active ? 'var(--primary-color)' : 'var(--text-color)'}">
                        ${escapeHtml(name)} ${active ? '✓ Активен' : ''}
                    </h3>
                    <p>${t.levels.length} уровней • ${t.levelDuration} мин/уровень</p>
                </div>
                <div class="template-item-actions">
                    <button class="btn ${active ? 'btn-secondary' : 'btn-success'}" onclick="useTemplate('${name}')">${active ? 'Используется' : 'Использовать'}</button>
                    <button class="btn btn-secondary" onclick="editTemplate('${name}')">✏️ Изменить</button>
                    <button class="btn btn-secondary" onclick="exportSpecificTemplate('${name}')">📥 Экспорт</button>
                    ${Object.keys(state.templates).length > 1 ? `<button class="btn btn-danger" onclick="deleteTemplate('${name}')">🗑️</button>` : ''}
                </div>
            </div>
        `;

        box.appendChild(div);
    });
}

function useTemplate(name) {
    state.currentTemplate = name;
    renderTemplatesList();
    applyTemplateToTimer();
}

function editTemplate(name) {
    state.currentTemplate = name;
    renderLevelsTable();
    document.querySelector('[data-tab="levels"]').click();
}

function deleteTemplate(name) {
    if (Object.keys(state.templates).length <= 1) return;

    if (!confirm(`Удалить шаблон "${name}"?`)) return;

    delete state.templates[name];
    state.currentTemplate = Object.keys(state.templates)[0];

    renderTemplatesList();
    applyTemplateToTimer();
}

function exportSpecificTemplate(name) {
    downloadJson({
        name,
        ...state.templates[name]
    }, `poker-template-${name}.json`);
}

function exportCurrentTemplate() {
    exportSpecificTemplate(state.currentTemplate);
}

function importTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                const name = data.name || 'Импортированный шаблон';

                state.templates[name] = {
                    levelDuration: data.levelDuration || 15,
                    breakDuration: data.breakDuration || 0,
                    breakEveryNLevels: data.breakEveryNLevels || 4,
                    bigBreakAfterLevel: data.bigBreakAfterLevel || 0,
                    bigBreakDuration: data.bigBreakDuration || 20,
                    levels: data.levels || []
                };

                state.currentTemplate = name;
                renderTemplatesList();
                applyTemplateToTimer();

                alert('Шаблон импортирован');
            } catch (err) {
                alert('Ошибка импорта: ' + err.message);
            }
        };

        reader.readAsText(file);
    };

    input.click();
}

function newTemplate() {
    const name = prompt('Название нового шаблона:');
    if (!name) return;

    if (state.templates[name]) {
        alert('Такой шаблон уже есть');
        return;
    }

    state.templates[name] = {
        levelDuration: 15,
        breakDuration: 5,
        breakEveryNLevels: 4,
        bigBreakAfterLevel: 0,
        bigBreakDuration: 20,
        levels: [
            { level: 1, sb: 100, bb: 200, ante: 0 }
        ]
    };

    state.currentTemplate = name;
    renderTemplatesList();
    applyTemplateToTimer();
}

/************************************************************
 * POINTS
 ************************************************************/

function updatePointsConfig() {
    const count = parseInt($('prizePlacesCount').value) || 3;
    const tbody = $('pointsConfigBody');
    tbody.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        const existing = state.settings.prizePlaces.find(p => p.place === i);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${i} место</strong></td>
            <td><input type="number" id="pointsPlace${i}" value="${existing ? existing.percentage : 0}" min="0" max="100" step="0.1">%</td>
        `;
        tbody.appendChild(tr);
    }
}

function savePointsConfig() {
    const count = parseInt($('prizePlacesCount').value) || 3;
    const places = [];
    let sum = 0;

    for (let i = 1; i <= count; i++) {
        const percentage = parseFloat($(`pointsPlace${i}`).value) || 0;
        places.push({ place: i, percentage });
        sum += percentage;
    }

    if (Math.abs(sum - 100) > 0.1) {
        alert(`Сумма процентов должна быть 100%. Сейчас: ${sum}%`);
        return;
    }

    state.settings.totalPoints = parseInt($('totalPoints').value) || 1000;
    state.settings.prizePlaces = places;

    saveSettingsData();
    renderRating();

    alert('Конфигурация очков сохранена');
}

function loadPointsPreset() {
    const value = $('pointsPresetSelect').value;

    if (value === 'small') {
        $('prizePlacesCount').value = 3;
        state.settings.prizePlaces = [
            { place: 1, percentage: 52 },
            { place: 2, percentage: 38 },
            { place: 3, percentage: 10 }
        ];
    }

    if (value === 'medium') {
        $('prizePlacesCount').value = 5;
        state.settings.prizePlaces = [
            { place: 1, percentage: 45 },
            { place: 2, percentage: 26 },
            { place: 3, percentage: 16 },
            { place: 4, percentage: 8 },
            { place: 5, percentage: 5 }
        ];
    }

    if (value === 'large') {
        $('prizePlacesCount').value = 6;
        state.settings.prizePlaces = [
            { place: 1, percentage: 42 },
            { place: 2, percentage: 26 },
            { place: 3, percentage: 16 },
            { place: 4, percentage: 8 },
            { place: 5, percentage: 5 },
            { place: 6, percentage: 3 }
        ];
    }

    updatePointsConfig();
    $('pointsPresetModal').classList.remove('active');
}
/************************************************************
 * TOURNAMENT PAGE
 ************************************************************/

function ensureTournamentPage() {
    if ($('tournamentPage')) return;

    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'tournamentPage';

    page.innerHTML = `
        <div class="tournament-container">
            <div class="tournament-hero">
                <div>
                    <h2>⚙️ Управление турниром</h2>
                    <p>
                        Здесь собраны основные настройки турнира:
                        уровни, перерывы, участники, призовые очки и правила.
                    </p>
                </div>
                <button class="btn btn-secondary nav-btn" data-page="timerPage">← Назад к таймеру</button>
            </div>

            <div class="tournament-tabs">
                <button class="tournament-tab active" data-tournament-tab="overview">📌 Обзор</button>
                <button class="tournament-tab" data-tournament-tab="structure">⏱ Уровни и перерывы</button>
                <button class="tournament-tab" data-tournament-tab="players">👥 Участники</button>
                <button class="tournament-tab" data-tournament-tab="points">🏆 Очки</button>
                <button class="tournament-tab" data-tournament-tab="rules">📜 Правила</button>
            </div>

            <div id="tournamentContent"></div>
        </div>
    `;

    document.body.appendChild(page);
}

function setTournamentTab(tabName) {
    state.tournamentActiveTab = tabName;

    document.querySelectorAll('.tournament-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tournamentTab === tabName);
    });

    renderTournamentPage(tabName);
}

function renderTournamentPage(tabName = state.tournamentActiveTab || 'overview') {
    ensureTournamentPage();

    state.tournamentActiveTab = tabName;

    document.querySelectorAll('.tournament-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tournamentTab === tabName);
    });

    if (tabName === 'overview') renderTournamentOverview();
    if (tabName === 'structure') renderTournamentStructure();
    if (tabName === 'players') renderTournamentPlayers();
    if (tabName === 'points') renderTournamentPoints();
    if (tabName === 'rules') renderTournamentRules();
}

/************************************************************
 * TOURNAMENT: OVERVIEW
 ************************************************************/

function renderTournamentOverview() {
    const box = $('tournamentContent');
    if (!box) return;

    const activePlayers = state.grid.players.filter(p => !p.eliminated).length;
    const totalPlayers = state.grid.players.length;
    const template = currentTemplate();

    box.innerHTML = `
        <div class="tournament-grid">
            <div class="tournament-card">
                <h3>🎲 Турнир</h3>
                <p>Название турнира</p>
                <div class="tournament-value">${escapeHtml(state.tournament.name || 'Без названия')}</div>
            </div>

            <div class="tournament-card">
                <h3>👥 Участники</h3>
                <p>Всего / активных</p>
                <div class="tournament-value">${totalPlayers} / ${activePlayers}</div>
            </div>

            <div class="tournament-card">
                <h3>⏱ Уровень</h3>
                <p>Текущий уровень таймера</p>
                <div class="tournament-value">${state.timer.currentLevel} / ${template.levels.length}</div>
            </div>

            <div class="tournament-card">
                <h3>🏆 Призовые места</h3>
                <p>Количество оплачиваемых мест</p>
                <div class="tournament-value">${state.settings.prizePlaces.length}</div>
            </div>
        </div>

        <div class="tournament-panel">
            <h3>📌 Основные настройки</h3>

            <div class="form-row">
                <div class="form-group">
                    <label>Название турнира</label>
                    <input type="text" id="tournamentNameInput" value="${escapeHtml(state.tournament.name || '')}">
                </div>

                <div class="form-group">
                    <label>Дата турнира</label>
                    <input type="date" id="tournamentDateInput" value="${escapeHtml(state.tournament.date || '')}">
                </div>

                <div class="form-group">
                    <label>Стартовые очки игрока</label>
                    <input type="number" id="tournamentStartingChipsInput" value="${Number(state.tournament.startingChips || 500)}" min="1">
                </div>

                <div class="form-group">
                    <label>Игроков за столом</label>
                    <input type="number" id="tournamentMaxPlayersInput" value="${Number(state.grid.maxPlayersPerTable || state.tournament.maxPlayersPerTable || 6)}" min="2" max="12">
                </div>
            </div>

            <div class="tournament-actions">
                <button class="btn btn-primary" onclick="saveTournamentMainSettings()">💾 Сохранить настройки</button>
                <button class="btn btn-secondary" onclick="setTournamentTab('structure')">⏱ Настроить уровни</button>
                <button class="btn btn-secondary" onclick="setTournamentTab('players')">👥 Участники</button>
            </div>
        </div>
    `;
}

function saveTournamentMainSettings() {
    state.tournament.name = $('tournamentNameInput').value.trim() || 'Покерный турнир';
    state.tournament.date = $('tournamentDateInput').value;
    state.tournament.startingChips = parseInt($('tournamentStartingChipsInput').value) || 500;
    state.tournament.maxPlayersPerTable = parseInt($('tournamentMaxPlayersInput').value) || 6;

    state.grid.maxPlayersPerTable = state.tournament.maxPlayersPerTable;

    if ($('playerChips')) $('playerChips').value = state.tournament.startingChips;
    if ($('newPlayerChips')) $('newPlayerChips').value = state.tournament.startingChips;
    if ($('maxPlayersPerTable')) $('maxPlayersPerTable').value = state.grid.maxPlayersPerTable;

    saveSettingsData();
    saveGridData();

    alert('Настройки турнира сохранены');
    renderTournamentPage('overview');
}

/************************************************************
 * TOURNAMENT: STRUCTURE
 ************************************************************/

function renderTournamentStructure() {
    const box = $('tournamentContent');
    if (!box) return;

    const template = currentTemplate();

    box.innerHTML = `
        <div class="tournament-panel">
            <h3>⏱ Уровни и перерывы</h3>

            <div class="form-row">
                <div class="form-group">
                    <label>Длительность уровня, минут</label>
                    <input type="number" id="tournamentLevelDuration" value="${template.levelDuration}" min="1">
                </div>

                <div class="form-group">
                    <label>Обычный перерыв, минут</label>
                    <input type="number" id="tournamentBreakDuration" value="${template.breakDuration}" min="0">
                </div>

                <div class="form-group">
                    <label>Перерыв после каждого N уровня</label>
                    <input type="number" id="tournamentBreakEvery" value="${template.breakEveryNLevels}" min="1">
                </div>

                <div class="form-group">
                    <label>Большой перерыв после уровня</label>
                    <input type="number" id="tournamentBigBreakAfter" value="${template.bigBreakAfterLevel}" min="0">
                </div>

                <div class="form-group">
                    <label>Большой перерыв, минут</label>
                    <input type="number" id="tournamentBigBreakDuration" value="${template.bigBreakDuration}" min="1">
                </div>
            </div>

            <div class="tournament-table-wrap">
                <table class="tournament-levels-table">
                    <thead>
                        <tr>
                            <th>Уровень</th>
                            <th>SB</th>
                            <th>BB</th>
                            <th>Ante</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody id="tournamentLevelsBody"></tbody>
                </table>
            </div>

            <div class="tournament-actions">
                <button class="btn btn-success" onclick="addTournamentLevel()">+ Добавить уровень</button>
                <button class="btn btn-primary" onclick="saveTournamentStructure()">💾 Сохранить структуру</button>
                <button class="btn btn-secondary" onclick="exportCurrentTemplate()">📥 Экспорт шаблона</button>
                <button class="btn btn-secondary" onclick="importTemplate()">📂 Импорт шаблона</button>
            </div>
        </div>
    `;

    renderTournamentLevelsTable();
}

function renderTournamentLevelsTable() {
    const tbody = $('tournamentLevelsBody');
    if (!tbody) return;

    const template = currentTemplate();

    tbody.innerHTML = '';

    template.levels.forEach((level, index) => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><strong>${level.level}</strong></td>
            <td><input type="number" value="${level.sb}" onchange="updateTournamentLevel(${index}, 'sb', this.value)"></td>
            <td><input type="number" value="${level.bb}" onchange="updateTournamentLevel(${index}, 'bb', this.value)"></td>
            <td><input type="number" value="${level.ante}" onchange="updateTournamentLevel(${index}, 'ante', this.value)"></td>
            <td>
                <button class="btn btn-danger btn-small" onclick="deleteTournamentLevel(${index})">×</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function updateTournamentLevel(index, field, value) {
    const template = currentTemplate();

    if (!template.levels[index]) return;

    template.levels[index][field] = parseInt(value) || 0;
}

function addTournamentLevel() {
    const template = currentTemplate();
    const last = template.levels[template.levels.length - 1];

    template.levels.push({
        level: template.levels.length + 1,
        sb: last.sb * 2,
        bb: last.bb * 2,
        ante: last.ante ? last.ante * 2 : 0
    });

    renderTournamentLevelsTable();
}

function deleteTournamentLevel(index) {
    const template = currentTemplate();

    if (template.levels.length <= 1) {
        alert('Должен остаться хотя бы один уровень');
        return;
    }

    template.levels.splice(index, 1);
    template.levels.forEach((level, i) => {
        level.level = i + 1;
    });

    renderTournamentLevelsTable();
}

function saveTournamentStructure() {
    const template = currentTemplate();

    if (state.timer.isRunning) {
        const ok = confirm(
            'Таймер сейчас запущен. Сохранение структуры сбросит таймер на первый уровень.\n\nПродолжить?'
        );

        if (!ok) return;
    }

    template.levelDuration = parseInt($('tournamentLevelDuration').value) || 15;
    template.breakDuration = parseInt($('tournamentBreakDuration').value) || 0;
    template.breakEveryNLevels = parseInt($('tournamentBreakEvery').value) || 4;
    template.bigBreakAfterLevel = parseInt($('tournamentBigBreakAfter').value) || 0;
    template.bigBreakDuration = parseInt($('tournamentBigBreakDuration').value) || 20;

    applyTemplateToTimer();
    saveTimerState();

    alert('Структура турнира сохранена');
    renderTournamentPage('structure');
}

/************************************************************
 * TOURNAMENT: PLAYERS
 ************************************************************/

function renderTournamentPlayers() {
    const box = $('tournamentContent');
    if (!box) return;

    const playersHtml = state.grid.players.length
        ? state.grid.players.map((player, index) => `
            <div class="tournament-player-row">
                <div>
                    <strong>${index + 1}. ${escapeHtml(player.name)}</strong>
                    ${player.eliminated ? '<span style="color:var(--danger-color); margin-left:8px;">выбыл</span>' : ''}
                </div>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <span>${player.chips} очков</span>
                    <button class="btn btn-danger btn-small" onclick="removeTournamentPlayer(${player.id})">Удалить</button>
                </div>
            </div>
        `).join('')
        : `<div class="tournament-empty">Участники ещё не добавлены</div>`;

    box.innerHTML = `
        <div class="tournament-panel">
            <h3>👥 Участники турнира</h3>

            <div class="form-row">
                <div class="form-group">
                    <label>Имя участника</label>
                    <input type="text" id="tournamentPlayerName" placeholder="Введите имя">
                </div>

                <div class="form-group">
                    <label>Очки</label>
                    <input type="number" id="tournamentPlayerChips" value="${Number(state.tournament.startingChips || 500)}" min="1">
                </div>

                <div class="form-group" style="display:flex; align-items:flex-end;">
                    <button class="btn btn-success" onclick="addTournamentPlayer()">+ Добавить</button>
                </div>
            </div>

            <div style="margin-top:15px;">
                ${playersHtml}
            </div>

            <div class="tournament-actions">
                <button class="btn btn-secondary" onclick="savePlayersToFile()">💾 Сохранить список</button>
                <button class="btn btn-secondary" onclick="loadTournamentPlayersFromFile()">📂 Загрузить список</button>
                <button class="btn btn-primary" onclick="createTournamentGrid()">🎲 Создать сетку</button>
                <button class="btn btn-danger" onclick="clearTournamentPlayers()">🗑 Очистить участников</button>
            </div>
        </div>
    `;
}

function addTournamentPlayer() {
    const name = $('tournamentPlayerName').value.trim();
    const chips = parseInt($('tournamentPlayerChips').value) || state.tournament.startingChips || 500;

    if (!name) {
        alert('Введите имя участника');
        return;
    }

    state.grid.players.push({
        id: uid(),
        name,
        chips,
        eliminated: false,
        eliminationPlace: null
    });

    saveGridData();
    renderPlayerList();
    renderTournamentPage('players');
}

function removeTournamentPlayer(id) {
    if (!confirm('Удалить участника?')) return;

    state.grid.players = state.grid.players.filter(p => p.id !== id);

    state.grid.tables.forEach(table => {
        table.players = table.players.filter(p => p.id !== id);
    });

    saveGridData();
    renderPlayerList();
    renderTables();
    renderTournamentPage('players');
}

function clearTournamentPlayers() {
    if (!confirm('Очистить всех участников и сетку?')) return;

    state.grid.players = [];
    state.grid.tables = [];
    state.grid.gridCreated = false;
    state.grid.eliminationOrder = [];
    state.grid.tournamentEnded = false;

    saveGridData();
    renderPlayerList();
    renderTables();
    renderTournamentPage('players');
}

function createTournamentGrid() {
    if ($('maxPlayersPerTable')) {
        $('maxPlayersPerTable').value = state.grid.maxPlayersPerTable || state.tournament.maxPlayersPerTable || 6;
    }

    createGrid();
    renderTournamentPage('players');
}

function loadTournamentPlayersFromFile() {
    loadPlayersFromFile();

    setTimeout(() => {
        renderTournamentPage('players');
    }, 800);
}

/************************************************************
 * TOURNAMENT: POINTS
 ************************************************************/

function renderTournamentPoints() {
    const box = $('tournamentContent');
    if (!box) return;

    box.innerHTML = `
        <div class="tournament-panel">
            <h3>🏆 Очки и призовые места</h3>

            <div class="form-row">
                <div class="form-group">
                    <label>Общее количество очков турнира</label>
                    <input type="number" id="tournamentTotalPoints" value="${Number(state.settings.totalPoints || 1000)}" min="100">
                </div>

                <div class="form-group">
                    <label>Количество призовых мест</label>
                    <input type="number" id="tournamentPrizePlacesCount" value="${state.settings.prizePlaces.length}" min="1" max="20" onchange="renderTournamentPrizeRows()">
                </div>
            </div>

            <div class="tournament-table-wrap">
                <table class="tournament-levels-table">
                    <thead>
                        <tr>
                            <th>Место</th>
                            <th>Процент очков</th>
                        </tr>
                    </thead>
                    <tbody id="tournamentPrizeRows"></tbody>
                </table>
            </div>

            <div class="tournament-actions">
                <button class="btn btn-primary" onclick="saveTournamentPoints()">💾 Сохранить очки</button>
                <button class="btn btn-secondary" onclick="loadTournamentPointsPreset('small')">До 9 игроков</button>
                <button class="btn btn-secondary" onclick="loadTournamentPointsPreset('medium')">12–18 игроков</button>
                <button class="btn btn-secondary" onclick="loadTournamentPointsPreset('large')">19–30 игроков</button>
            </div>
        </div>
    `;

    renderTournamentPrizeRows();
}

function renderTournamentPrizeRows() {
    const tbody = $('tournamentPrizeRows');
    if (!tbody) return;

    const count = parseInt($('tournamentPrizePlacesCount').value) || 3;

    tbody.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        const existing = state.settings.prizePlaces.find(p => Number(p.place) === i);

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><strong>${i} место</strong></td>
            <td>
                <input type="number" id="tournamentPrizePercent${i}" value="${existing ? existing.percentage : 0}" min="0" max="100" step="0.1"> %
            </td>
        `;

        tbody.appendChild(tr);
    }
}

function saveTournamentPoints() {
    const count = parseInt($('tournamentPrizePlacesCount').value) || 3;

    let sum = 0;
    const places = [];

    for (let i = 1; i <= count; i++) {
        const percentage = parseFloat($(`tournamentPrizePercent${i}`).value) || 0;

        places.push({
            place: i,
            percentage
        });

        sum += percentage;
    }

    if (Math.abs(sum - 100) > 0.1) {
        alert(`Сумма процентов должна быть 100%. Сейчас: ${sum}%`);
        return;
    }

    state.settings.totalPoints = parseInt($('tournamentTotalPoints').value) || 1000;
    state.settings.prizePlaces = places;

    saveSettingsData();
    renderRating();

    alert('Настройки очков сохранены');
}

function loadTournamentPointsPreset(type) {
    if (type === 'small') {
        state.settings.prizePlaces = [
            { place: 1, percentage: 60 },
            { place: 2, percentage: 30 },
            { place: 3, percentage: 10 }
        ];
    }

    if (type === 'medium') {
        state.settings.prizePlaces = [
            { place: 1, percentage: 45 },
            { place: 2, percentage: 26 },
            { place: 3, percentage: 16 },
            { place: 4, percentage: 8 },
            { place: 5, percentage: 5 }
        ];
    }

    if (type === 'large') {
        state.settings.prizePlaces = [
            { place: 1, percentage: 42 },
            { place: 2, percentage: 26 },
            { place: 3, percentage: 16 },
            { place: 4, percentage: 8 },
            { place: 5, percentage: 5 },
            { place: 6, percentage: 3 }
        ];
    }

    renderTournamentPage('points');
}

/************************************************************
 * TOURNAMENT: RULES
 ************************************************************/

function renderTournamentRules() {
    const box = $('tournamentContent');
    if (!box) return;

    if (state.isAdmin) {
        box.innerHTML = `
            <div class="tournament-panel">
                <h3>📜 Правила турнира</h3>

                <p style="color:var(--text-muted); margin-bottom:15px;">
                    Админ может редактировать правила. Гости смогут только читать.
                </p>

                <textarea class="tournament-rules-textarea" id="tournamentRulesEditor"></textarea>

                <div class="tournament-actions">
                    <button class="btn btn-primary" onclick="saveTournamentRules()">💾 Сохранить правила</button>
                    <button class="btn btn-secondary" onclick="insertTournamentDefaultRules()">📋 Вставить пример</button>
                </div>
            </div>
        `;

        $('tournamentRulesEditor').value = state.rules.text || '';
    } else {
        box.innerHTML = `
            <div class="tournament-panel">
                <h3>📜 Правила турнира</h3>

                ${
                    state.rules.text
                        ? `<div class="tournament-rules-view">${escapeHtml(state.rules.text)}</div>`
                        : `<div class="tournament-empty">Правила пока не заполнены администратором</div>`
                }
            </div>
        `;
    }
}

function saveTournamentRules() {
    if (!state.isAdmin) return;

    state.rules.text = $('tournamentRulesEditor').value.trim();

    localStorage.setItem('pokerRulesText', state.rules.text);

    cloudSet('rules', {
        text: state.rules.text,
        updatedAt: new Date().toISOString()
    });

    alert('Правила сохранены');
}

function insertTournamentDefaultRules() {
    $('tournamentRulesEditor').value = defaultRulesText();
}

/************************************************************
 * UI / NAVIGATION
 ************************************************************/

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    ensureRulesPage();
    ensureTournamentPage();

    const page = $(pageId);

    if (page) page.classList.add('active');

    state.currentPage = pageId;

    if (pageId === 'timerPage') {
        history.replaceState(null, '', location.pathname);
    } else {
        history.replaceState(null, '', '#' + pageId);
    }

    if (pageId === 'ratingPage') renderRating();
    if (pageId === 'gridPage') renderTables();
    if (pageId === 'editorPage') {
        renderTemplatesList();
        renderLevelsTable();
    }
    if (pageId === 'rulesPage') renderRulesPage();
    if (pageId === 'tournamentPage') renderTournamentPage();

    updateAdminUI();
}

function updateAdminUI() {
    setText('userRole', state.isAdmin ? 'Админ' : 'Гость');

    // Эти кнопки видны всем: и админу, и гостю
    show($('leagueBtn'), 'inline-block');
    show($('registrationBtn'), 'inline-block');
    show($('rulesBtn'), 'inline-block');
    show($('ratingBtn'), 'inline-block');
    show($('gridBtn'), 'inline-block');

    if (state.isAdmin) {
        show($('editorBtn'), 'inline-block');
        hide($('loginBtn'));
        show($('logoutBtn'), 'inline-block');

        show($('timerControls'), 'flex');
        show($('progressContainer'));
        show($('playerRegistrationSection'), 'block');
        show($('saveRatingJpgBtn'), 'inline-block');
    } else {
        hide($('editorBtn'));
        show($('loginBtn'), 'inline-block');
        hide($('logoutBtn'));

        hide($('timerControls'));
        hide($('progressContainer'));
        hide($('playerRegistrationSection'));
        hide($('saveRatingJpgBtn'));
    }

    const grid = $('gridContainer');

    if (grid) {
        grid.classList.toggle('guest-view', !state.isAdmin);
    }

    renderPlayerList();

    if (state.currentPage === 'rulesPage') {
        renderRulesPage();
    }
}

function updateSettingsUI() {
    document.documentElement.style.setProperty('--primary-color', state.settings.primaryColor);

    if ($('primaryColorPicker')) $('primaryColorPicker').value = state.settings.primaryColor;
    if ($('primaryColorText')) $('primaryColorText').value = state.settings.primaryColor;
    if ($('volumeSlider')) $('volumeSlider').value = state.settings.volume;
    if ($('volumeValue')) $('volumeValue').textContent = state.settings.volume;
}

/************************************************************
 * RESET
 ************************************************************/

function resetAll() {
    if (!confirm('Сбросить все данные турнира?')) return;

    resetTimer();

    state.grid.players = [];
    state.grid.tables = [];
    state.grid.gridCreated = false;
    state.grid.eliminationOrder = [];
    state.grid.tournamentEnded = false;

    saveGridData();
    renderPlayerList();
    renderTables();
    renderRating();

    alert('Данные сброшены');
}

/************************************************************
 * EVENTS
 ************************************************************/

   function bindEvents() {
     document.addEventListener('click', e => {
        const navBtn = e.target.closest('.nav-btn');

        if (navBtn) {
            const page = navBtn.dataset.page;

            if (page) {
                e.preventDefault();
                showPage(page);
                return;
            }
        }

        const tab = e.target.closest('.tournament-tab');

        if (tab) {
            const tabName = tab.dataset.tournamentTab;

            if (tabName) {
                e.preventDefault();
                setTournamentTab(tabName);
                return;
            }
        }
    });

    $('startBtn').onclick = startTimer;
    $('pauseBtn').onclick = pauseTimer;
    $('resetBtn').onclick = resetTimer;
    $('backBtn').onclick = prevLevel;
    $('forwardBtn').onclick = nextLevel;
    $('progressContainer').onclick = seekTimerByProgress;

    $('loginBtn').onclick = () => $('loginModal').classList.add('active');
    $('cancelLoginBtn').onclick = () => $('loginModal').classList.remove('active');

    $('confirmLoginBtn').onclick = async () => {
        const pass = $('adminPassword').value;
        const btn = $('confirmLoginBtn');

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Проверка...';

        const { error } = await adminLogin(pass);

        btn.disabled = false;
        btn.textContent = originalText;

        if (!error) {
            // state.isAdmin выставляется автоматически через onAuthStateChange,
            // здесь только закрываем модалку.
            $('loginModal').classList.remove('active');
            $('adminPassword').value = '';
        } else {
            alert('Неверный пароль');
        }
    };

    $('logoutBtn').onclick = async () => {
        await adminLogout();
        showPage('timerPage');
    };

    $('addPlayerBtn').onclick = addPlayer;
    $('createGridBtn').onclick = createGrid;
    $('addPlayerToGridBtn').onclick = addPlayerToGrid;
    $('createFinalTableBtn').onclick = createFinalTable;
    $('endTournamentBtn').onclick = endTournament;

    $('confirmMoveBtn').onclick = confirmMovePlayer;
    $('cancelMoveBtn').onclick = () => $('movePlayerModal').classList.remove('active');
    $('closePlayerActionBtn').onclick = () => $('playerActionModal').classList.remove('active');

    $('saveRatingJpgBtn').onclick = saveRatingAsJpg;

    $('cancelRegistrationFormBtn').onclick = () => {
        $('registrationFormModal').classList.remove('active');
        showPage('timerPage');
    };
    $('submitRegistrationBtn').onclick = submitRegistration;

    $('addLevelBtn').onclick = addLevel;
    $('saveLevelsBtn').onclick = saveLevels;

    $('exportBtn').onclick = exportCurrentTemplate;
    $('importBtn').onclick = importTemplate;
    $('newTemplateBtn').onclick = newTemplate;

    $('savePointsConfigBtn').onclick = savePointsConfig;
    $('loadPresetBtn').onclick = () => $('pointsPresetModal').classList.add('active');

    $('resetAllBtn').onclick = resetAll;

    $('volumeSlider').oninput = e => {
        state.settings.volume = e.target.value;
        setText('volumeValue', e.target.value);
        saveSettingsData();
    };

    $('primaryColorPicker').oninput = e => {
        state.settings.primaryColor = e.target.value;
        updateSettingsUI();
        saveSettingsData();
    };

    $('primaryColorText').oninput = e => {
        state.settings.primaryColor = e.target.value;
        updateSettingsUI();
        saveSettingsData();
    };

    $('changePasswordBtn').onclick = async () => {
        const p1 = $('newPassword').value;
        const p2 = $('confirmPassword').value;

        if (!p1 || p1 !== p2) {
            alert('Пароли не совпадают');
            return;
        }

        if (!supabaseClient || !state.isAdmin) {
            alert('Нужно быть в системе как админ');
            return;
        }

        const { error } = await supabaseClient.auth.updateUser({ password: p1 });

        if (error) {
            alert('Не удалось сменить пароль: ' + error.message);
            return;
        }

        $('newPassword').value = '';
        $('confirmPassword').value = '';

        alert('Пароль изменён');
    };

    $('playDefaultBlindSound').onclick = () => playDefaultSound(state.settings.defaultBlindSound);
    $('playDefaultBreakSound').onclick = () => playDefaultSound(state.settings.defaultBreakSound);
    $('playDefaultBigBreakSound').onclick = () => playDefaultSound(state.settings.defaultBigBreakSound);

    $('saveSoundBtn').onclick = () => alert('Настройки звука сохранены');

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            $(`${tab.dataset.tab}Tab`).classList.add('active');

            if (tab.dataset.tab === 'templates') renderTemplatesList();
            if (tab.dataset.tab === 'levels') renderLevelsTable();
            if (tab.dataset.tab === 'points') updatePointsConfig();
        };
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncTimer(true);
            updateTimerDisplay();
            restartTimerIntervalIfNeeded();
        }
    });
}

/************************************************************
 * INIT
 ************************************************************/

async function init() {
    const localTimer = loadLocal('pokerTimerState');
    if (localTimer) applyTimerData(localTimer);

    const localGrid = loadLocal('pokerGridData');
    if (localGrid) applyGridData(localGrid);

    const localSettings = loadLocal('pokerSettings');
    if (localSettings) applySettingsData(localSettings);

    state.rules.text = localStorage.getItem('pokerRulesText') || '';
    state.registration.agreementText = localStorage.getItem('pokerRegistrationText') || defaultRegistrationText();

    addRulesButton();
    // Кнопка "📝 Регистрация" на главной странице отключена:
    // регистрация игроков теперь происходит на странице players.html.
    // addRegistrationButton();
    ensureRulesPage();
    ensureTournamentPage();
    bindEvents();
    addPlayerFileButtons();

    updateSettingsUI();
    updateTimerDisplay();
    renderPlayerList();
    renderTables();
    renderRating();
    updateAdminUI();

    await initSupabase();

    syncTimer(true);
    restartTimerIntervalIfNeeded();
    updateTimerDisplay();

    const hash = location.hash.replace('#', '').split('?')[0];

    if (hash && $(hash)) {
        showPage(hash);
    }
}

/************************************************************
 * GLOBALS FOR INLINE HANDLERS
 ************************************************************/

window.removePlayer = removePlayer;
window.savePlayerEdit = savePlayerEdit;
window.openPlayerAction = openPlayerAction;
window.updatePlayerChips = updatePlayerChips;
window.openMovePlayer = openMovePlayer;
window.eliminatePlayer = eliminatePlayer;
window.eliminateFromTable = eliminateFromTable;
window.confirmMovePlayer = confirmMovePlayer;

window.updateLevel = updateLevel;
window.deleteLevel = deleteLevel;
window.useTemplate = useTemplate;
window.editTemplate = editTemplate;
window.exportSpecificTemplate = exportSpecificTemplate;
window.deleteTemplate = deleteTemplate;

window.updatePointsConfig = updatePointsConfig;
window.loadPointsPreset = loadPointsPreset;

window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resetTimer = resetTimer;
window.nextLevel = nextLevel;
window.prevLevel = prevLevel;

window.showPage = showPage;

window.setTournamentTab = setTournamentTab;
window.renderTournamentPage = renderTournamentPage;

window.saveTournamentMainSettings = saveTournamentMainSettings;

window.updateTournamentLevel = updateTournamentLevel;
window.addTournamentLevel = addTournamentLevel;
window.deleteTournamentLevel = deleteTournamentLevel;
window.saveTournamentStructure = saveTournamentStructure;

window.addTournamentPlayer = addTournamentPlayer;
window.removeTournamentPlayer = removeTournamentPlayer;
window.clearTournamentPlayers = clearTournamentPlayers;
window.createTournamentGrid = createTournamentGrid;
window.loadTournamentPlayersFromFile = loadTournamentPlayersFromFile;

window.renderTournamentPrizeRows = renderTournamentPrizeRows;
window.saveTournamentPoints = saveTournamentPoints;
window.loadTournamentPointsPreset = loadTournamentPointsPreset;

window.saveTournamentRules = saveTournamentRules;
window.insertTournamentDefaultRules = insertTournamentDefaultRules;

init();


/* ============================================================
 * CLOCK SYNC FIX (объединено из clock-sync-fix.js)
 * ============================================================ */

/************************************************************
 * CLOCK SYNC FIX
 *
 * ПРОБЛЕМА:
 * Таймер считает оставшееся время как targetEndTime - now(),
 * где now() = Date.now() — то есть системные часы КОНКРЕТНОГО
 * устройства. targetEndTime у всех устройств одинаковый (пришёл
 * из облака), но если часы телефонов чуть разошлись (а на
 * практике так почти всегда) — на экранах будет разное
 * оставшееся время, хотя данные синхронизированы идеально.
 *
 * ФИКС:
 * Периодически сверяем часы устройства с часами сервера
 * Supabase (берём заголовок Date из обычного HTTP-ответа) и
 * считаем разницу (clockOffsetMs). Дальше во всём приложении
 * now() возвращает не "голый" Date.now(), а время, скорректированное
 * на эту разницу — то есть все устройства ориентируются на одно
 * и то же "серверное" время, а не на свои локальные часы.
 ************************************************************/

(function () {
    if (window.__CLOCK_SYNC_FIX_PATCHED__) return;
    window.__CLOCK_SYNC_FIX_PATCHED__ = true;

    let clockOffsetMs = 0;

    // Оригинальный now() из app.js возвращал голый Date.now().
    // Подменяем на версию с поправкой на смещение серверных часов.
    window.now = function () {
        return Date.now() + clockOffsetMs;
    };

    async function syncClockOffset() {
        try {
            if (!SUPABASE_URL || !SUPABASE_KEY) return;

            const t0 = Date.now();

            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/app_state?select=key&limit=1`,
                {
                    method: 'GET',
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

            const t1 = Date.now();

            const serverDateHeader = res.headers.get('date');
            if (!serverDateHeader) return;

            const serverTime = new Date(serverDateHeader).getTime();
            if (Number.isNaN(serverTime)) return;

            // Компенсируем время сетевого запроса — считаем,
            // что серверный момент соответствует середине round-trip.
            const rtt = t1 - t0;
            const estimatedServerNowAtT1 = serverTime + rtt / 2;

            clockOffsetMs = estimatedServerNowAtT1 - t1;

            console.log('Clock sync offset (ms):', Math.round(clockOffsetMs));
        } catch (err) {
            console.warn('Clock sync error:', err);
        }
    }

    function boot() {
        syncClockOffset();

        // Переустанавливаем поправку раз в минуту — часы могут
        // "поплыть" за время долгой сессии.
        setInterval(syncClockOffset, 60000);

        // И сразу же при возврате устройства к жизни —
        // после блокировки экрана, сворачивания вкладки, обрыва сети.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) syncClockOffset();
        });

        window.addEventListener('online', syncClockOffset);
        window.addEventListener('focus', syncClockOffset);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();


/* ============================================================
 * ADMIN FEATURES FIX (объединено из admin-features-fix.js)
 * ============================================================ */

/************************************************************
 * ADMIN FEATURES FIX
 *
 * Что делает:
 * ✅ Возвращает кнопку "Изменить пароль" для админа
 * ✅ Добавляет кнопку "Сетка гостям: Показать/Скрыть"
 * ✅ Админ управляет видимостью сетки для гостей
 * ✅ Настройка синхронизируется через Supabase realtime
 * ✅ Гость видит/не видит кнопку "Сетка" в реальном времени
 *
 * Подключать после app.js:
 * <script src="app.js"></script>
 * <script src="admin-features-fix.js"></script>
 ************************************************************/

(function () {
    if (window.__ADMIN_FEATURES_FIX_LOADED__) return;
    window.__ADMIN_FEATURES_FIX_LOADED__ = true;

    console.log('Admin Features Fix loaded');

    /************************************************************
     * CHECK
     ************************************************************/

    if (typeof state === 'undefined') {
        console.error('admin-features-fix.js: state не найден. Подключи файл после app.js');
        return;
    }

    if (!state.settings) state.settings = {};

    if (typeof state.settings.guestGridVisible === 'undefined') {
        state.settings.guestGridVisible = true;
    }

    if (typeof state.settings.guestRegistrationVisible === 'undefined') {
        state.settings.guestRegistrationVisible = true;
    }

    /************************************************************
     * PATCH SETTINGS SAVE / LOAD
     ************************************************************/

    const originalMakeSettingsData = typeof makeSettingsData === 'function'
        ? makeSettingsData
        : null;

    if (originalMakeSettingsData) {
        makeSettingsData = function () {
            const data = originalMakeSettingsData();

            data.guestGridVisible = state.settings.guestGridVisible !== false;
            data.guestRegistrationVisible = state.settings.guestRegistrationVisible !== false;

            return data;
        };

        window.makeSettingsData = makeSettingsData;
    }

    const originalApplySettingsData = typeof applySettingsData === 'function'
        ? applySettingsData
        : null;

    if (originalApplySettingsData) {
        applySettingsData = function (data) {
            originalApplySettingsData(data || {});

            if (data && typeof data.guestGridVisible !== 'undefined') {
                state.settings.guestGridVisible = data.guestGridVisible !== false;
            }

            if (data && typeof data.guestRegistrationVisible !== 'undefined') {
                state.settings.guestRegistrationVisible = data.guestRegistrationVisible !== false;
            }

            applyGuestGridVisibility();
            applyGuestRegistrationVisibility();
            updateAdminFeatureButtons();
        };

        window.applySettingsData = applySettingsData;
    }

    /************************************************************
     * STYLES
     ************************************************************/

    function ensureAdminFeatureStyles() {
        if (document.getElementById('adminFeaturesFixStyles')) return;

        const style = document.createElement('style');
        style.id = 'adminFeaturesFixStyles';

        style.textContent = `
            #adminPasswordFixBtn {
                background: #8e44ad;
                color: white;
            }

            #adminPasswordFixBtn:hover {
                background: #6c3483;
            }

            #guestGridToggleBtn {
                background: #34495e;
                color: white;
            }

            #guestGridToggleBtn.grid-visible {
                background: #2ecc71;
            }

            #guestGridToggleBtn.grid-hidden {
                background: #e74c3c;
            }

            #guestGridToggleBtn:hover {
                filter: brightness(1.08);
            }

            #guestRegistrationToggleBtn {
                background: #34495e;
                color: white;
            }

            #guestRegistrationToggleBtn.registration-visible {
                background: #2ecc71;
            }

            #guestRegistrationToggleBtn.registration-hidden {
                background: #e74c3c;
            }

            #guestRegistrationToggleBtn:hover {
                filter: brightness(1.08);
            }

            .admin-feature-modal-note {
                color: var(--text-muted);
                font-size: 13px;
                margin-top: 8px;
                line-height: 1.5;
            }
        `;

        document.head.appendChild(style);
    }

    /************************************************************
     * PASSWORD MODAL
     ************************************************************/

    function ensurePasswordModal() {
        if (document.getElementById('adminPasswordFixModal')) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'adminPasswordFixModal';

        modal.innerHTML = `
            <div class="modal-content login-modal">
                <div class="modal-header">🔐 Изменить пароль админа</div>

                <div class="form-group">
                    <label>Новый пароль</label>
                    <input type="password" id="adminFeatureNewPassword" placeholder="Введите новый пароль">
                </div>

                <div class="form-group">
                    <label>Повторите пароль</label>
                    <input type="password" id="adminFeatureConfirmPassword" placeholder="Повторите новый пароль">
                    <div class="admin-feature-modal-note">
                        Пароль сохраняется в браузере администратора.
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-secondary" id="adminPasswordFixCancelBtn">Отмена</button>
                    <button class="btn btn-primary" id="adminPasswordFixSaveBtn">💾 Изменить пароль</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('adminPasswordFixCancelBtn').onclick = closePasswordModal;
        document.getElementById('adminPasswordFixSaveBtn').onclick = saveAdminPasswordFromModal;

        const p1 = document.getElementById('adminFeatureNewPassword');
        const p2 = document.getElementById('adminFeatureConfirmPassword');

        [p1, p2].forEach(input => {
            if (!input) return;

            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAdminPasswordFromModal();
                }
            });
        });
    }

    function openPasswordModal() {
        ensurePasswordModal();

        const modal = document.getElementById('adminPasswordFixModal');
        const p1 = document.getElementById('adminFeatureNewPassword');
        const p2 = document.getElementById('adminFeatureConfirmPassword');

        if (p1) p1.value = '';
        if (p2) p2.value = '';

        if (modal) modal.classList.add('active');

        setTimeout(() => {
            if (p1) p1.focus();
        }, 100);
    }

    function closePasswordModal() {
        const modal = document.getElementById('adminPasswordFixModal');

        if (modal) modal.classList.remove('active');
    }

    async function saveAdminPasswordFromModal() {
        if (!state.isAdmin) {
            alert('Только админ может менять пароль');
            return;
        }

        const p1 = document.getElementById('adminFeatureNewPassword')?.value || '';
        const p2 = document.getElementById('adminFeatureConfirmPassword')?.value || '';

        if (!p1.trim()) {
            alert('Введите новый пароль');
            return;
        }

        if (p1 !== p2) {
            alert('Пароли не совпадают');
            return;
        }

        if (!supabaseClient) {
            alert('Supabase не готов, попробуйте ещё раз');
            return;
        }

        const { error } = await supabaseClient.auth.updateUser({ password: p1 });

        if (error) {
            alert('Не удалось сменить пароль: ' + error.message);
            return;
        }

        closePasswordModal();

        alert('Пароль админа изменён');
    }

    /************************************************************
     * HEADER BUTTONS
     ************************************************************/

    function ensureAdminFeatureButtons() {
        ensureAdminFeatureStyles();
        ensurePasswordModal();

        const userInfo = document.querySelector('.user-info');
        const logoutBtn = document.getElementById('logoutBtn');
        const editorBtn = document.getElementById('editorBtn');

        if (!userInfo) return;

        if (!document.getElementById('adminPasswordFixBtn')) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'adminPasswordFixBtn';
            btn.type = 'button';
            btn.textContent = '🔐 Изменить пароль';
            btn.style.display = 'none';
            btn.onclick = openPasswordModal;

            if (logoutBtn) {
                userInfo.insertBefore(btn, logoutBtn);
            } else {
                userInfo.appendChild(btn);
            }
        }

        if (!document.getElementById('guestGridToggleBtn')) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'guestGridToggleBtn';
            btn.type = 'button';
            btn.style.display = 'none';
            btn.onclick = toggleGuestGridVisibility;

            if (editorBtn) {
                userInfo.insertBefore(btn, editorBtn.nextSibling);
            } else if (logoutBtn) {
                userInfo.insertBefore(btn, logoutBtn);
            } else {
                userInfo.appendChild(btn);
            }
        }

        if (!document.getElementById('guestRegistrationToggleBtn')) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'guestRegistrationToggleBtn';
            btn.type = 'button';
            btn.style.display = 'none';
            btn.onclick = toggleGuestRegistrationVisibility;

            const gridToggleBtn = document.getElementById('guestGridToggleBtn');

            if (gridToggleBtn) {
                userInfo.insertBefore(btn, gridToggleBtn.nextSibling);
            } else if (editorBtn) {
                userInfo.insertBefore(btn, editorBtn.nextSibling);
            } else if (logoutBtn) {
                userInfo.insertBefore(btn, logoutBtn);
            } else {
                userInfo.appendChild(btn);
            }
        }

        updateAdminFeatureButtons();
    }

    function updateAdminFeatureButtons() {
        const passwordBtn = document.getElementById('adminPasswordFixBtn');
        const toggleBtn = document.getElementById('guestGridToggleBtn');
        const registrationToggleBtn = document.getElementById('guestRegistrationToggleBtn');

        const isAdmin = !!state.isAdmin;
        const guestGridVisible = state.settings.guestGridVisible !== false;
        const guestRegistrationVisible = state.settings.guestRegistrationVisible !== false;

        if (passwordBtn) {
            passwordBtn.style.display = isAdmin ? 'inline-block' : 'none';
        }

        if (toggleBtn) {
            toggleBtn.style.display = isAdmin ? 'inline-block' : 'none';

            toggleBtn.classList.remove('grid-visible', 'grid-hidden');

            if (guestGridVisible) {
                toggleBtn.classList.add('grid-visible');
                toggleBtn.textContent = '👁 Сетка: Показана';
                toggleBtn.title = 'Нажми, чтобы скрыть сетку от гостей';
            } else {
                toggleBtn.classList.add('grid-hidden');
                toggleBtn.textContent = '🙈 Сетка: Скрыта';
                toggleBtn.title = 'Нажми, чтобы показать сетку гостям';
            }
        }

        if (registrationToggleBtn) {
            registrationToggleBtn.style.display = isAdmin ? 'inline-block' : 'none';

            registrationToggleBtn.classList.remove('registration-visible', 'registration-hidden');

            if (guestRegistrationVisible) {
                registrationToggleBtn.classList.add('registration-visible');
                registrationToggleBtn.textContent = '👁 Регистрация: Показана';
                registrationToggleBtn.title = 'Нажми, чтобы скрыть регистрацию от гостей';
            } else {
                registrationToggleBtn.classList.add('registration-hidden');
                registrationToggleBtn.textContent = '🙈 Регистрация: Скрыта';
                registrationToggleBtn.title = 'Нажми, чтобы показать регистрацию гостям';
            }
        }
    }

    /************************************************************
     * GUEST GRID VISIBILITY
     ************************************************************/

    function applyGuestGridVisibility() {
        const gridBtn = document.getElementById('gridBtn');
        const gridPage = document.getElementById('gridPage');

        const guestGridVisible = state.settings.guestGridVisible !== false;

        /**
         * Админ всегда видит сетку.
         */
        if (state.isAdmin) {
            if (gridBtn) gridBtn.style.display = 'inline-block';
            if (gridPage) gridPage.dataset.guestHidden = '0';
            return;
        }

        /**
         * Гость.
         */
        if (guestGridVisible) {
            if (gridBtn) gridBtn.style.display = 'inline-block';
            if (gridPage) gridPage.dataset.guestHidden = '0';
        } else {
            if (gridBtn) gridBtn.style.display = 'none';
            if (gridPage) gridPage.dataset.guestHidden = '1';

            /**
             * Если гость уже находится на странице сетки,
             * отправляем его обратно на таймер.
             */
            if (state.currentPage === 'gridPage') {
                if (typeof showPage === 'function') {
                    showPage('timerPage');
                } else {
                    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                    const timerPage = document.getElementById('timerPage');
                    if (timerPage) timerPage.classList.add('active');
                    state.currentPage = 'timerPage';
                }
            }
        }
    }

    /************************************************************
     * GUEST REGISTRATION VISIBILITY
     ************************************************************/

    function applyGuestRegistrationVisibility() {
        const registrationBtn = document.getElementById('registrationBtn');

        const guestRegistrationVisible = state.settings.guestRegistrationVisible !== false;

        /**
         * Админ всегда видит кнопку регистрации.
         */
        if (state.isAdmin) {
            if (registrationBtn) registrationBtn.style.display = 'inline-block';
            return;
        }

        /**
         * Гость.
         */
        if (guestRegistrationVisible) {
            if (registrationBtn) registrationBtn.style.display = 'inline-block';
        } else {
            if (registrationBtn) registrationBtn.style.display = 'none';

            /**
             * Если гость уже открыл модалку регистрации,
             * закрываем её и возвращаем на таймер.
             */
            const modal = document.getElementById('registrationAgreementModal');

            if (modal && modal.classList.contains('active')) {
                modal.classList.remove('active');
            }

            const formModal = document.getElementById('registrationFormModal');

            if (formModal && formModal.classList.contains('active')) {
                formModal.classList.remove('active');
            }
        }
    }

    function toggleGuestRegistrationVisibility() {
        if (!state.isAdmin) {
            alert('Только админ может менять видимость регистрации');
            return;
        }

        const current = state.settings.guestRegistrationVisible !== false;

        state.settings.guestRegistrationVisible = !current;

        applyGuestRegistrationVisibility();
        updateAdminFeatureButtons();

        if (typeof saveSettingsData === 'function') {
            saveSettingsData();
        } else {
            localStorage.setItem('pokerSettings', JSON.stringify({
                primaryColor: state.settings.primaryColor,
                volume: state.settings.volume,
                totalPoints: state.settings.totalPoints,
                prizePlaces: state.settings.prizePlaces,
                tournament: state.tournament,
                guestGridVisible: state.settings.guestGridVisible,
                guestRegistrationVisible: state.settings.guestRegistrationVisible
            }));
        }

        alert(
            state.settings.guestRegistrationVisible !== false
                ? 'Регистрация ВКЛ'
                : 'Регистрация ВЫКЛ'
        );
    }

    function toggleGuestGridVisibility() {
        if (!state.isAdmin) {
            alert('Только админ может менять видимость сетки');
            return;
        }

        const current = state.settings.guestGridVisible !== false;

        state.settings.guestGridVisible = !current;

        applyGuestGridVisibility();
        updateAdminFeatureButtons();

        /**
         * Сохраняем локально и в Supabase.
         * saveSettingsData уже использует cloudSet('settings', ...)
         */
        if (typeof saveSettingsData === 'function') {
            saveSettingsData();
        } else {
            localStorage.setItem('pokerSettings', JSON.stringify({
                primaryColor: state.settings.primaryColor,
                volume: state.settings.volume,
                totalPoints: state.settings.totalPoints,
                prizePlaces: state.settings.prizePlaces,
                tournament: state.tournament,
                guestGridVisible: state.settings.guestGridVisible,
                guestRegistrationVisible: state.settings.guestRegistrationVisible
            }));
        }

        alert(
            state.settings.guestGridVisible !== false
                ? 'Сетка ВКЛ'
                : 'Сетка ВЫКЛ'
        );
    }

    /************************************************************
     * PATCH updateAdminUI
     ************************************************************/

    if (typeof updateAdminUI === 'function' && !window.__ADMIN_FEATURES_UPDATE_UI_PATCHED__) {
        window.__ADMIN_FEATURES_UPDATE_UI_PATCHED__ = true;

        const originalUpdateAdminUI = updateAdminUI;

        updateAdminUI = function () {
            originalUpdateAdminUI();

            ensureAdminFeatureButtons();
            applyGuestGridVisibility();
            applyGuestRegistrationVisibility();
            updateAdminFeatureButtons();
        };

        window.updateAdminUI = updateAdminUI;
    }

    /************************************************************
     * PATCH applyCloudRow
     *
     * Когда админ меняет настройку, гости получают settings realtime.
     ************************************************************/

    if (typeof applyCloudRow === 'function' && !window.__ADMIN_FEATURES_CLOUD_PATCHED__) {
        window.__ADMIN_FEATURES_CLOUD_PATCHED__ = true;

        const originalApplyCloudRow = applyCloudRow;

        applyCloudRow = function (row) {
            originalApplyCloudRow(row);

            try {
                if (row && row.key === 'settings') {
                    if (row.value && typeof row.value.guestGridVisible !== 'undefined') {
                        state.settings.guestGridVisible = row.value.guestGridVisible !== false;
                    }

                    if (row.value && typeof row.value.guestRegistrationVisible !== 'undefined') {
                        state.settings.guestRegistrationVisible = row.value.guestRegistrationVisible !== false;
                    }

                    applyGuestGridVisibility();
                    applyGuestRegistrationVisibility();
                    updateAdminFeatureButtons();
                }
            } catch (err) {
                console.warn('Admin features applyCloudRow error:', err);
            }
        };

        window.applyCloudRow = applyCloudRow;
    }

    /************************************************************
     * PATCH showPage
     *
     * Если гость вручную попытается открыть #gridPage,
     * а сетка скрыта — не пустим.
     ************************************************************/

    if (typeof showPage === 'function' && !window.__ADMIN_FEATURES_SHOW_PAGE_PATCHED__) {
        window.__ADMIN_FEATURES_SHOW_PAGE_PATCHED__ = true;

        const originalShowPage = showPage;

        showPage = function (pageId) {
            const guestGridVisible = state.settings.guestGridVisible !== false;

            if (!state.isAdmin && pageId === 'gridPage' && !guestGridVisible) {
                alert('Сетка сейчас скрыта админом');
                pageId = 'timerPage';
            }

            originalShowPage(pageId);

            applyGuestGridVisibility();
            updateAdminFeatureButtons();
        };

        window.showPage = showPage;
    }

    /************************************************************
     * PATCH openRegistrationEntry
     *
     * Если гость вручную попытается открыть регистрацию,
     * а она скрыта — не пустим.
     ************************************************************/

    if (typeof openRegistrationEntry === 'function' && !window.__ADMIN_FEATURES_REGISTRATION_ENTRY_PATCHED__) {
        window.__ADMIN_FEATURES_REGISTRATION_ENTRY_PATCHED__ = true;

        const originalOpenRegistrationEntry = openRegistrationEntry;

        openRegistrationEntry = function () {
            const guestRegistrationVisible = state.settings.guestRegistrationVisible !== false;

            if (!state.isAdmin && !guestRegistrationVisible) {
                alert('Регистрация сейчас скрыта админом');
                return;
            }

            originalOpenRegistrationEntry();
        };

        window.openRegistrationEntry = openRegistrationEntry;

        /**
         * registrationBtn.onclick был назначен в app.js напрямую
         * ссылкой на старую функцию (btn.onclick = openRegistrationEntry),
         * поэтому просто переприсваиваем обработчик на новую версию.
         */
        const regBtn = document.getElementById('registrationBtn');

        if (regBtn) {
            regBtn.onclick = openRegistrationEntry;
        }
    }

    /************************************************************
     * CLOUD FALLBACK POLLING
     *
     * Если realtime Supabase не сработает,
     * гость всё равно обновит настройку раз в 3 секунды.
     ************************************************************/

    let lastSettingsUpdatedAt = null;
    let settingsPollingStarted = false;

    async function loadSettingsFromCloudForGuestGrid() {
        try {
            if (state.isAdmin) return;

            if (!SUPABASE_URL || !SUPABASE_KEY) return;

            if (!window.supabase || typeof window.supabase.createClient !== 'function') {
                return;
            }

            if (!supabaseClient) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            }

            const { data, error } = await supabaseClient
                .from('app_state')
                .select('key,value,updated_at')
                .eq('key', 'settings')
                .maybeSingle();

            if (error) {
                console.warn('Guest grid visibility settings read error:', error);
                return;
            }

            if (!data || !data.value) return;

            if (lastSettingsUpdatedAt && data.updated_at === lastSettingsUpdatedAt) {
                return;
            }

            lastSettingsUpdatedAt = data.updated_at;

            let changed = false;

            if (typeof data.value.guestGridVisible !== 'undefined') {
                state.settings.guestGridVisible = data.value.guestGridVisible !== false;
                changed = true;
            }

            if (typeof data.value.guestRegistrationVisible !== 'undefined') {
                state.settings.guestRegistrationVisible = data.value.guestRegistrationVisible !== false;
                changed = true;
            }

            if (changed) {
                if (typeof saveLocal === 'function') {
                    saveLocal('pokerSettings', {
                        primaryColor: state.settings.primaryColor,
                        volume: state.settings.volume,
                        totalPoints: state.settings.totalPoints,
                        prizePlaces: state.settings.prizePlaces,
                        tournament: state.tournament,
                        guestGridVisible: state.settings.guestGridVisible,
                        guestRegistrationVisible: state.settings.guestRegistrationVisible
                    });
                }

                applyGuestGridVisibility();
                applyGuestRegistrationVisibility();
                updateAdminFeatureButtons();

                console.log('Guest visibility synced:', {
                    grid: state.settings.guestGridVisible,
                    registration: state.settings.guestRegistrationVisible
                });
            }
        } catch (err) {
            console.warn('Guest grid visibility polling error:', err);
        }
    }

    function startSettingsPolling() {
        if (settingsPollingStarted) return;

        settingsPollingStarted = true;

        setInterval(() => {
            if (!state.isAdmin) {
                loadSettingsFromCloudForGuestGrid();
            }
        }, 3000);

        loadSettingsFromCloudForGuestGrid();
    }

    /************************************************************
     * INIT
     ************************************************************/

    function initAdminFeaturesFix() {
        ensureAdminFeatureButtons();

        /**
         * Если настройка уже была в localStorage, подхватим её.
         */
        try {
            const localSettingsRaw = localStorage.getItem('pokerSettings');

            if (localSettingsRaw) {
                const localSettings = JSON.parse(localSettingsRaw);

                if (typeof localSettings.guestGridVisible !== 'undefined') {
                    state.settings.guestGridVisible = localSettings.guestGridVisible !== false;
                }

                if (typeof localSettings.guestRegistrationVisible !== 'undefined') {
                    state.settings.guestRegistrationVisible = localSettings.guestRegistrationVisible !== false;
                }
            }
        } catch {}

        applyGuestGridVisibility();
        applyGuestRegistrationVisibility();
        updateAdminFeatureButtons();

        startSettingsPolling();

        console.log('Admin Features Fix applied');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initAdminFeaturesFix();

            setTimeout(initAdminFeaturesFix, 500);
            setTimeout(initAdminFeaturesFix, 1500);
            setTimeout(initAdminFeaturesFix, 3000);
        });
    } else {
        initAdminFeaturesFix();

        setTimeout(initAdminFeaturesFix, 500);
        setTimeout(initAdminFeaturesFix, 1500);
        setTimeout(initAdminFeaturesFix, 3000);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            initAdminFeaturesFix();

            if (!state.isAdmin) {
                loadSettingsFromCloudForGuestGrid();
            }
        }
    });

})();



/* ============================================================
 * STABLE SOUND FIX (объединено из sound-fix.js)
 * ============================================================ */

/************************************************************
 * STABLE SOUND FIX FOR POKER TIMER
 *
 * ✅ blind.mp3 — при начале каждого уровня
 * ✅ break.mp3 — при начале обычного перерыва
 * ✅ bigbreak.mp3 — при начале большого перерыва
 * ✅ Без дублей
 * ✅ Работает у админа и гостя
 * ✅ Работает при авто-переходе
 * ✅ Работает при кнопке "Вперёд"
 * ✅ При "Назад" звук НЕ играет
 *
 * Подключать ПОСЛЕ app.js и после остальных фиксов:
 * <script src="sound-fix.js"></script>
 ************************************************************/

(function () {
    if (window.__STABLE_POKER_SOUND_FIX__) return;
    window.__STABLE_POKER_SOUND_FIX__ = true;

    console.log('Stable Poker Sound Fix loaded');

    if (typeof state === 'undefined') {
        console.error('sound-fix.js: state не найден. Файл должен быть подключён после app.js');
        return;
    }

    /************************************************************
     * SETTINGS
     ************************************************************/

    const DEFAULT_SOUNDS = {
        levelStart: 'sound/blind.mp3',
        breakStart: 'sound/break.mp3',
        bigBreakStart: 'sound/bigbreak.mp3'
    };

    let lastPlayedStageKey = null;
    let audioUnlocked = false;

    /************************************************************
     * AUDIO UNLOCK
     *
     * Браузеры часто запрещают звук без клика пользователя.
     * Поэтому после любого клика/тапа звук разблокируется.
     ************************************************************/

    function unlockAudio() {
        if (audioUnlocked) return;

        try {
            const audio = new Audio(DEFAULT_SOUNDS.levelStart);
            audio.volume = 0;
            audio.muted = true;

            audio.play()
                .then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audioUnlocked = true;
                    console.log('Audio unlocked');
                })
                .catch(() => {
                    audioUnlocked = false;
                });
        } catch {
            audioUnlocked = false;
        }
    }

    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    /************************************************************
     * SOUND HELPERS
     ************************************************************/

    function getVolume() {
        const volume = Number(state.settings?.volume);

        if (Number.isFinite(volume)) {
            return Math.max(0, Math.min(1, volume / 100));
        }

        return 0.7;
    }

    function getSoundSrc(type) {
        if (type === 'levelStart') {
            return state.settings?.customLevelSound ||
                state.settings?.defaultBlindSound ||
                DEFAULT_SOUNDS.levelStart;
        }

        if (type === 'breakStart') {
            return state.settings?.customBreakSound ||
                state.settings?.defaultBreakSound ||
                DEFAULT_SOUNDS.breakStart;
        }

        if (type === 'bigBreakStart') {
            return state.settings?.customBigBreakSound ||
                state.settings?.defaultBigBreakSound ||
                DEFAULT_SOUNDS.bigBreakStart;
        }

        return null;
    }

    window.playSound = function (type) {
        const src = getSoundSrc(type);

        if (!src) return;

        try {
            const audio = new Audio(src);
            audio.volume = getVolume();

            audio.play().catch(err => {
                console.warn('Звук не проиграл. Возможно, браузер заблокировал autoplay или файл не найден:', src, err);
            });
        } catch (err) {
            console.warn('Ошибка запуска звука:', err);
        }
    };

    window.playDefaultSound = function (src) {
        if (!src) return;

        try {
            const audio = new Audio(src);
            audio.volume = getVolume();

            audio.play().catch(() => {
                alert('Не удалось воспроизвести файл: ' + src);
            });
        } catch {
            alert('Не удалось воспроизвести файл: ' + src);
        }
    };

    /************************************************************
     * STAGE DETECTION
     ************************************************************/

    function getStageSoundType() {
        if (!state.timer || state.timer.tournamentEnded) return null;

        if (state.timer.isBreak) {
            if (state.timer.breakType === 'big') {
                return 'bigBreakStart';
            }

            return 'breakStart';
        }

        return 'levelStart';
    }

    function getStageKey() {
        if (!state.timer || state.timer.tournamentEnded) return null;

        const type = getStageSoundType();

        if (!type) return null;

        /**
         * tournamentStartedAt нужен, чтобы после сброса и нового старта
         * уровень 1 снова мог проиграть blind.mp3.
         *
         * targetEndTime НЕ используем, иначе после паузы/продолжения
         * звук мог бы повторяться.
         */
        return [
            state.timer.tournamentStartedAt || 'not-started',
            type,
            Number(state.timer.currentLevel || 1),
            state.timer.isBreak ? String(state.timer.breakType || 'regular') : 'level'
        ].join(':');
    }

    function playStageStartSoundOnce() {
        const type = getStageSoundType();
        const key = getStageKey();

        if (!type || !key) return;

        if (lastPlayedStageKey === key) {
            return;
        }

        lastPlayedStageKey = key;

        playSound(type);

        console.log('Sound played:', type, key);
    }

    function markCurrentStageAsAlreadyPlayed() {
        lastPlayedStageKey = getStageKey();
    }

    function resetSoundMemory() {
        lastPlayedStageKey = null;
    }

    /************************************************************
     * OVERRIDE syncTimer
     *
     * ВАЖНО:
     * Сначала переводим таймер на новую стадию,
     * потом играем звук НАЧАЛА новой стадии.
     ************************************************************/

    window.syncTimer = function (silent = false) {
        if (
            !state.timer ||
            !state.timer.isRunning ||
            !state.timer.targetEndTime ||
            state.timer.tournamentEnded
        ) {
            return;
        }

        let currentNow = now();
        let changedStage = false;

        while (
            state.timer.isRunning &&
            !state.timer.tournamentEnded &&
            state.timer.targetEndTime &&
            currentNow >= Number(state.timer.targetEndTime)
        ) {
            const endedAt = Number(state.timer.targetEndTime);

            moveToNextStage(endedAt);
            changedStage = true;

            if (!silent && !state.timer.tournamentEnded) {
                playStageStartSoundOnce();
            }

            currentNow = now();
        }

        if (
            state.timer.isRunning &&
            !state.timer.tournamentEnded &&
            state.timer.targetEndTime
        ) {
            const remainingMs = Math.max(0, Number(state.timer.targetEndTime) - now());

            state.timer.timeRemaining = Math.ceil(remainingMs / 1000);
            state.timer.elapsedTime = Math.max(
                0,
                Number(state.timer.totalLevelTime || 0) - Number(state.timer.timeRemaining || 0)
            );
        }

        if (changedStage && typeof saveTimerState === 'function') {
            saveTimerState();
        }
    };

    /************************************************************
     * OVERRIDE timerTick
     ************************************************************/

    window.timerTick = function () {
        syncTimer(false);
        updateTimerDisplay();
    };

    /************************************************************
     * OVERRIDE INTERVALS
     ************************************************************/

    window.startTimerInterval = function () {
        clearInterval(state.timer.interval);

        state.timer.interval = setInterval(() => {
            syncTimer(false);
            updateTimerDisplay();
        }, 500);
    };

    window.restartTimerIntervalIfNeeded = function () {
        clearInterval(state.timer.interval);

        if (state.timer.isRunning) {
            startTimerInterval();
        }
    };

    /************************************************************
     * OVERRIDE startTimer
     *
     * При первом старте уровня играет blind.mp3.
     * При продолжении после паузы звук НЕ повторяется.
     ************************************************************/

    window.startTimer = function () {
        if (state.timer.isRunning || state.timer.tournamentEnded) return;

        ensureTournamentStarted();

        state.timer.isRunning = true;
        state.timer.isPaused = false;
        state.timer.targetEndTime = now() + Number(state.timer.timeRemaining || 0) * 1000;

        startTimerInterval();
        saveTimerState();
        updateTimerDisplay();

        playStageStartSoundOnce();
    };

    /************************************************************
     * OVERRIDE pauseTimer
     *
     * На паузе звук не трогаем.
     ************************************************************/

    window.pauseTimer = function () {
        if (!state.timer.isRunning) return;

        syncTimer(true);

        state.timer.isRunning = false;
        state.timer.isPaused = true;
        state.timer.targetEndTime = null;

        clearInterval(state.timer.interval);

        saveTimerState();
        updateTimerDisplay();
    };

    /************************************************************
     * OVERRIDE nextLevel
     *
     * При ручном "Вперёд" звук играет для новой стадии.
     ************************************************************/

    window.nextLevel = function () {
        const wasRunning = state.timer.isRunning;

        moveToNextStage(now());

        if (!state.timer.tournamentEnded) {
            state.timer.isRunning = wasRunning;
            state.timer.isPaused = false;

            if (wasRunning) {
                state.timer.targetEndTime = now() + Number(state.timer.timeRemaining || 0) * 1000;
                startTimerInterval();
            } else {
                state.timer.targetEndTime = null;
                clearInterval(state.timer.interval);
            }
        }

        saveTimerState();
        updateTimerDisplay();

        if (!state.timer.tournamentEnded) {
            playStageStartSoundOnce();
        }
    };

    /************************************************************
     * OVERRIDE prevLevel
     *
     * При "Назад" звук НЕ играем.
     * Но память звука сбрасываем, чтобы если потом снова нажать "Вперёд",
     * звук новой стадии снова сработал.
     ************************************************************/

    window.prevLevel = function () {
        const t = currentTemplate();

        if (state.timer.currentLevel <= 1 && !state.timer.isBreak) {
            alert('Это первый уровень, назад перемотать нельзя');
            return;
        }

        clearInterval(state.timer.interval);

        if (state.timer.isBreak) {
            state.timer.isBreak = false;
            state.timer.breakType = null;
        } else {
            state.timer.currentLevel = Math.max(1, Number(state.timer.currentLevel) - 1);
        }

        state.timer.isRunning = false;
        state.timer.isPaused = false;
        state.timer.tournamentEnded = false;
        state.timer.totalLevelTime = t.levelDuration * 60;
        state.timer.timeRemaining = state.timer.totalLevelTime;
        state.timer.elapsedTime = 0;
        state.timer.targetEndTime = null;

        resetSoundMemory();

        saveTimerState();
        updateTimerDisplay();
    };

    /************************************************************
     * OVERRIDE resetTimer
     *
     * Сброс — без звука.
     ************************************************************/

    window.resetTimer = function () {
        const t = currentTemplate();

        clearInterval(state.timer.interval);

        Object.assign(state.timer, {
            currentLevel: 1,
            timeRemaining: t.levelDuration * 60,
            totalLevelTime: t.levelDuration * 60,
            elapsedTime: 0,
            isRunning: false,
            isPaused: false,
            isBreak: false,
            breakType: null,
            tournamentEnded: false,
            tournamentStartedAt: null,
            targetEndTime: null
        });

        resetSoundMemory();

        saveTimerState();
        updateTimerDisplay();
    };

    /************************************************************
     * GUEST CLOUD SOUND
     *
     * Гость получает изменение таймера из Supabase.
     * Если админ запустил таймер или перевёл стадию —
     * у гостя тоже играет нужный звук.
     ************************************************************/

    if (typeof applyCloudRow === 'function' && !window.__STABLE_SOUND_CLOUD_PATCHED__) {
        window.__STABLE_SOUND_CLOUD_PATCHED__ = true;

        const originalApplyCloudRow = applyCloudRow;

        window.applyCloudRow = function (row) {
            const beforeKey = getStageKey();
            const beforeRunning = !!state.timer?.isRunning;
            const beforeStartedAt = state.timer?.tournamentStartedAt || null;

            originalApplyCloudRow(row);

            try {
                if (!row || row.key !== 'timer') return;

                const afterKey = getStageKey();
                const afterRunning = !!state.timer?.isRunning;
                const afterStartedAt = state.timer?.tournamentStartedAt || null;

                /**
                 * Админ сам играет звук локально.
                 * Этот блок нужен только гостям.
                 */
                if (state.isAdmin) return;

                /**
                 * При первичной загрузке облака cloudReady ещё false.
                 * Чтобы гость не слышал звук просто при открытии страницы.
                 */
                if (!cloudReady) {
                    markCurrentStageAsAlreadyPlayed();
                    return;
                }

                /**
                 * Если пришёл сброс турнира.
                 */
                if (!afterStartedAt || state.timer.tournamentEnded) {
                    resetSoundMemory();
                    return;
                }

                if (!afterRunning) {
                    return;
                }

                const remoteStarted = !beforeRunning && afterRunning;
                const stageChanged = beforeKey && afterKey && beforeKey !== afterKey;
                const tournamentRestarted = beforeStartedAt && afterStartedAt && beforeStartedAt !== afterStartedAt;

                if (remoteStarted || stageChanged || tournamentRestarted) {
                    playStageStartSoundOnce();
                }
            } catch (err) {
                console.warn('Guest cloud sound error:', err);
            }
        };

        applyCloudRow = window.applyCloudRow;
    }

    /************************************************************
     * REBIND BUTTONS
     *
     * Старый app.js уже назначил onclick на старые функции.
     * Поэтому здесь перепривязываем кнопки к новым функциям.
     ************************************************************/

    function rebindButton(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;

        el.onclick = handler;
    }

    function rebindButtons() {
        rebindButton('startBtn', window.startTimer);
        rebindButton('pauseBtn', window.pauseTimer);
        rebindButton('resetBtn', window.resetTimer);
        rebindButton('forwardBtn', window.nextLevel);
        rebindButton('backBtn', window.prevLevel);

        rebindButton('playDefaultBlindSound', () => {
            playDefaultSound(state.settings?.defaultBlindSound || DEFAULT_SOUNDS.levelStart);
        });

        rebindButton('playDefaultBreakSound', () => {
            playDefaultSound(state.settings?.defaultBreakSound || DEFAULT_SOUNDS.breakStart);
        });

        rebindButton('playDefaultBigBreakSound', () => {
            playDefaultSound(state.settings?.defaultBigBreakSound || DEFAULT_SOUNDS.bigBreakStart);
        });
    }

    /************************************************************
     * FIX EXISTING RUNNING TIMER
     ************************************************************/

    function restartFixedTimerIfNeeded() {
        clearInterval(state.timer.interval);

        if (state.timer.isRunning) {
            startTimerInterval();
        }
    }

    /************************************************************
     * INIT
     ************************************************************/

    function initStableSoundFix() {
        /**
         * При открытии страницы не проигрываем звук текущего уровня.
         * Просто считаем текущую стадию уже озвученной.
         */
        markCurrentStageAsAlreadyPlayed();

        rebindButtons();
        restartFixedTimerIfNeeded();

        if (typeof updateTimerDisplay === 'function') {
            updateTimerDisplay();
        }

        console.log('Stable Poker Sound Fix applied');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initStableSoundFix();

            setTimeout(initStableSoundFix, 500);
            setTimeout(initStableSoundFix, 1500);
        });
    } else {
        initStableSoundFix();

        setTimeout(initStableSoundFix, 500);
        setTimeout(initStableSoundFix, 1500);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            restartFixedTimerIfNeeded();

            if (typeof syncTimer === 'function') {
                syncTimer(true);
            }

            if (typeof updateTimerDisplay === 'function') {
                updateTimerDisplay();
            }
        }
    });

})();

