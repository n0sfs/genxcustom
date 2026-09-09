// GRIDIRON DASH - standalone engine. Ported from the shared GENX ARCADE
// engine (audio, input, leaderboard, screens, main loop) but scoped to one
// game instead of fifteen - no level picker, no per-game leaderboard map,
// just this one drive. sim.js (createGridironLevel) is untouched from its
// arcade-anthology version; only the harness around it changed.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const screens = {
    title: document.getElementById('screen-title'),
    levelcomplete: document.getElementById('screen-levelcomplete'),
    gameover: document.getElementById('screen-gameover'),
    win: document.getElementById('screen-win'),
    pause: document.getElementById('screen-pause'),
    initials: document.getElementById('screen-initials'),
  };
  const hudLevel = document.getElementById('hud-level');
  const hudScore = document.getElementById('hud-score');
  const hudLives = document.getElementById('hud-lives');
  const hudSound = document.getElementById('hud-sound');
  const lcTitle = document.getElementById('lc-title');
  const lcScore = document.getElementById('lc-score');
  const goScore = document.getElementById('go-score');
  const winScore = document.getElementById('win-score');
  const letterSlots = document.querySelectorAll('#screen-initials .letter-slot');
  const bestScoreLine = document.getElementById('best-score-line');

  const HAND_BUILT_STAGES = 10;
  const START_LIVES = 3;
  const LB_KEY = 'gridironDashLeaderboard';
  const LB_MAX = 5;
  const MUTE_KEY = 'gridironDashMuted';

  // --- tiny synthesized SFX engine (ported as-is from the shared engine) ---
  let actx = null;
  let muted = localStorage.getItem(MUTE_KEY) === '1';

  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, duration, type = 'square', volume = 0.16, glideTo = null, delay = 0) {
    if (muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const SFX = {
    hit: () => tone(220, 0.14, 'sawtooth', 0.14, 70),
    hurt: () => tone(160, 0.25, 'square', 0.16, 55),
    bounce: () => tone(240, 0.05, 'triangle', 0.1),
    select: () => tone(440, 0.05, 'square', 0.1),
    hop: () => tone(380, 0.06, 'square', 0.1, 520),
    levelclear: () => { tone(523, 0.1, 'square', 0.14, null, 0); tone(659, 0.1, 'square', 0.14, null, 0.1); tone(784, 0.16, 'square', 0.14, null, 0.2); },
    win: () => { tone(523, 0.12, 'square', 0.15, null, 0); tone(659, 0.12, 'square', 0.15, null, 0.12); tone(784, 0.12, 'square', 0.15, null, 0.24); tone(1046, 0.2, 'square', 0.16, null, 0.36); },
    lose: () => { tone(220, 0.16, 'sawtooth', 0.15, null, 0); tone(160, 0.22, 'sawtooth', 0.15, null, 0.14); },
    lifeLost: () => tone(140, 0.2, 'square', 0.15, 60),
    coin: () => { tone(988, 0.05, 'square', 0.12, 1400, 0); tone(1318, 0.09, 'square', 0.14, null, 0.06); },
  };

  function sfx(name) {
    const fn = SFX[name];
    if (fn) fn();
  }

  // --- tiny procedural background loop, same bassline as the arcade ---
  const MUSIC_STEP_MS = 150;
  const MUSIC_PATTERN = [110, 0, 146.83, 0, 130.81, 0, 146.83, 164.81];
  let musicTimer = null;
  let musicStep = 0;

  function musicTick() {
    const freq = MUSIC_PATTERN[musicStep % MUSIC_PATTERN.length];
    if (freq) tone(freq, 0.09, 'square', 0.035);
    musicStep++;
  }
  function resumeMusic() { stopMusic(); musicTimer = setInterval(musicTick, MUSIC_STEP_MS); }
  function startMusic() { musicStep = 0; resumeMusic(); }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

  function updateSoundHud() { if (hudSound) hudSound.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; }
  function toggleMute() {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    updateSoundHud();
    if (!muted) ensureAudio();
  }

  // --- leaderboard: one flat top-5 list, this being a single standalone game ---
  function getLeaderboard() {
    try {
      const lb = JSON.parse(localStorage.getItem(LB_KEY));
      return Array.isArray(lb) ? lb : [];
    } catch (e) {
      return [];
    }
  }
  function getBestScore() {
    const lb = getLeaderboard();
    return lb.length ? lb[0].score : 0;
  }
  function qualifiesForLeaderboard(score) {
    if (score <= 0) return false;
    const lb = getLeaderboard();
    return lb.length < LB_MAX || score > lb[lb.length - 1].score;
  }
  function saveLeaderboardEntry(initials, score) {
    const lb = getLeaderboard();
    lb.push({ initials, score });
    lb.sort((a, b) => b.score - a.score);
    lb.length = Math.min(lb.length, LB_MAX);
    localStorage.setItem(LB_KEY, JSON.stringify(lb));
  }
  function renderBestScoreLine() {
    if (!bestScoreLine) return;
    const best = getBestScore();
    bestScoreLine.textContent = best > 0 ? `BEST SCORE: ${best}` : 'NO HIGH SCORE YET — BE THE FIRST';
  }

  const INITIAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let initialsLetters = ['A', 'A', 'A'];
  let initialsCursor = 0;

  function renderInitials() {
    letterSlots.forEach((el, i) => {
      el.textContent = initialsLetters[i];
      el.classList.toggle('active', i === initialsCursor);
    });
  }
  function cycleLetter(dir) {
    const cur = initialsLetters[initialsCursor];
    const idx = (INITIAL_LETTERS.indexOf(cur) + dir + 26) % 26;
    initialsLetters[initialsCursor] = INITIAL_LETTERS[idx];
    renderInitials();
  }
  function startInitialsEntry(score) {
    state.mode = 'initials';
    state.pendingScore = score;
    initialsLetters = ['A', 'A', 'A'];
    initialsCursor = 0;
    renderInitials();
    showScreen('initials');
  }
  function confirmInitials() {
    const initials = initialsLetters.join('');
    saveLeaderboardEntry(initials, state.pendingScore);
    renderBestScoreLine();
    const score = state.pendingScore;
    sfx('levelclear');
    state.mode = 'gameover';
    goScore.textContent = `SCORE ${score}  — NEW HIGH SCORE, ${initials}!`;
    showScreen('gameover');
  }

  const state = {
    mode: 'title', // title | playing | levelcomplete | gameover | win | pause | initials
    stage: 1,
    lives: START_LIVES,
    score: 0,
    levelInstance: null,
    lastTime: 0,
    pendingScore: 0,
  };

  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[normalizeKey(e.key)] = true;

    if (e.key === 'Enter') {
      if (state.mode === 'initials') {
        confirmInitials();
      } else {
        sfx('select');
        if (state.mode === 'title') startGame();
        else if (state.mode === 'levelcomplete') continueStage();
        else if (state.mode === 'win') continueStage();
        else if (state.mode === 'gameover') startGame();
      }
    }
    if (state.mode === 'initials') {
      if (e.key === 'ArrowUp') { cycleLetter(1); sfx('hop'); }
      else if (e.key === 'ArrowDown') { cycleLetter(-1); sfx('hop'); }
      else if (e.key === 'ArrowLeft') { initialsCursor = (initialsCursor + 2) % 3; renderInitials(); sfx('select'); }
      else if (e.key === 'ArrowRight') { initialsCursor = (initialsCursor + 1) % 3; renderInitials(); sfx('select'); }
    }
    if ((e.key === 'p' || e.key === 'P') && (state.mode === 'playing' || state.mode === 'pause')) {
      togglePause();
    }
    if (e.key === 'Escape' && state.mode === 'pause') {
      sfx('select');
      quitToTitle();
    }
    if (e.key === 'm' || e.key === 'M') {
      toggleMute();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[normalizeKey(e.key)] = false;
  });

  function normalizeKey(k) {
    if (k === ' ') return 'Space';
    if (k.length === 1) return k.toLowerCase();
    return k;
  }
  function isDown(...names) {
    return names.some((n) => keys[n]);
  }

  // --- mouse tracking, ported as-is from the shared engine ---
  const mouse = { x: W / 2, y: H / 2, down: false, active: false };
  function toCanvasSpace(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  }
  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvasSpace(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.active = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = toCanvasSpace(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.active = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !mouse.down) return;
    mouse.down = false;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- on-screen buttons dispatch the same synthetic KeyboardEvents a real
  // keyboard would, so they flow through the one keydown/keyup listener above ---
  function bindVirtualKey(el) {
    const key = el.dataset.key;
    const press = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    };
    const release = (e) => {
      if (e) e.preventDefault();
      el.classList.remove('pressed');
      window.dispatchEvent(new KeyboardEvent('keyup', { key }));
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.querySelectorAll('.touch-btn').forEach(bindVirtualKey);
  document.querySelectorAll('.menu-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: btn.dataset.key }));
    });
  });
  if (hudSound) hudSound.addEventListener('click', () => { toggleMute(); sfx('select'); });

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (el) el.classList.toggle('hidden', key !== name);
    });
  }
  function hideAllScreens() {
    Object.values(screens).forEach((el) => { if (el) el.classList.add('hidden'); });
  }

  function updateHud() {
    hudLevel.textContent = `STAGE ${state.stage}`;
    hudScore.textContent = `SCORE ${state.score}`;
    hudLives.textContent = `LIVES ${'▲'.repeat(Math.max(state.lives, 0))}`;
  }

  function addScore(n) {
    state.score += n;
    updateHud();
  }

  let shakeTime = 0, shakeMag = 0;
  function shake(duration, magnitude) {
    shakeTime = Math.max(shakeTime, duration);
    shakeMag = Math.max(shakeMag, magnitude);
  }

  function loseLife() {
    state.lives--;
    updateHud();
    shake(0.3, 6);
    if (state.lives <= 0) {
      sfx('lose');
      stopMusic();
      vibrate([60, 40, 120]);
      if (qualifiesForLeaderboard(state.score)) {
        startInitialsEntry(state.score);
      } else {
        state.mode = 'gameover';
        goScore.textContent = `SCORE ${state.score}  (BEST ${getBestScore()})`;
        showScreen('gameover');
      }
    } else {
      sfx('lifeLost');
      state.levelInstance.init(state.stage);
    }
  }

  function winLevel(bonus = 0) {
    if (bonus) addScore(bonus);
    const justHitEndless = state.stage === HAND_BUILT_STAGES;
    const clearedStage = state.stage;
    state.stage++;
    sfx('levelclear');
    stopMusic();
    if (justHitEndless) {
      state.mode = 'win';
      winScore.textContent = `SCORE ${state.score}  — ALL STAGES CLEARED! ENDLESS MODE ENGAGED`;
      showScreen('win');
    } else {
      state.mode = 'levelcomplete';
      lcTitle.textContent = `STAGE ${clearedStage} CLEAR`;
      lcScore.textContent = `SCORE ${state.score}`;
      showScreen('levelcomplete');
    }
  }

  const api = {
    W, H, ctx,
    isDown,
    addScore,
    loseLife,
    winLevel,
    sfx,
    shake,
    get lives() { return state.lives; },
    get score() { return state.score; },
    get mouseX() { return mouse.x; },
    get mouseY() { return mouse.y; },
    get mouseDown() { return mouse.down; },
    get mouseActive() { return mouse.active; },
  };

  function startGame() {
    sfx('coin');
    state.stage = 1;
    state.lives = START_LIVES;
    state.score = 0;
    state.levelInstance = createGridironLevel(api);
    state.levelInstance.init(state.stage);
    updateHud();
    state.mode = 'playing';
    hideAllScreens();
    startMusic();
  }

  function continueStage() {
    state.levelInstance.init(state.stage);
    updateHud();
    state.mode = 'playing';
    hideAllScreens();
    startMusic();
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'pause';
      stopMusic();
      showScreen('pause');
      sfx('select');
    } else if (state.mode === 'pause') {
      state.mode = 'playing';
      hideAllScreens();
      resumeMusic();
      sfx('select');
    }
  }

  function quitToTitle() {
    stopMusic();
    state.mode = 'title';
    hideAllScreens();
    showScreen('title');
    renderBestScoreLine();
  }

  function loop(t) {
    const dt = Math.min((t - state.lastTime) / 1000, 0.05) || 0;
    state.lastTime = t;

    ctx.clearRect(0, 0, W, H);

    shakeTime = Math.max(0, shakeTime - dt);
    const shaking = shakeTime > 0;
    if (shaking) {
      const falloff = shakeTime / 0.3;
      const ox = (Math.random() - 0.5) * shakeMag * falloff;
      const oy = (Math.random() - 0.5) * shakeMag * falloff;
      ctx.save();
      ctx.translate(ox, oy);
    }

    if (state.mode === 'playing' && state.levelInstance) {
      state.levelInstance.update(dt);
      state.levelInstance.draw(ctx);
    } else if (state.levelInstance) {
      state.levelInstance.draw(ctx);
    }

    if (shaking) ctx.restore();

    FX.vignette(ctx, W, H, 0.4);
    FX.scanlines(ctx, W, H, 0.045);

    requestAnimationFrame(loop);
  }

  function boot() {
    updateSoundHud();
    updateHud();
    renderBestScoreLine();
    showScreen('title');
    requestAnimationFrame(loop);
  }

  boot();
})();
