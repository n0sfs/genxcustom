const Game = (() => {
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
  const titleLeaderboard = document.getElementById('title-leaderboard');
  const letterSlots = document.querySelectorAll('#screen-initials .letter-slot');
  const marqueeTrack = document.getElementById('marquee-track');
  const levelListEl = document.getElementById('level-list');
  const touchDpad = document.getElementById('touch-dpad');
  const touchNumpad = document.getElementById('touch-numpad');

  const START_LIVES = 3;
  const LB_KEY = 'genxArcadeLeaderboard';
  const LB_MAX = 5;
  const MUTE_KEY = 'genxArcadeMuted';

  // --- tiny synthesized SFX engine (no audio files, all oscillator blips) ---
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
    shoot: () => tone(880, 0.06, 'square', 0.09, 700),
    hit: () => tone(220, 0.14, 'sawtooth', 0.14, 70),
    explosion: () => tone(180, 0.22, 'sawtooth', 0.16, 40),
    hurt: () => tone(160, 0.25, 'square', 0.16, 55),
    pickup: () => tone(660, 0.09, 'triangle', 0.13, 1100),
    jump: () => tone(320, 0.1, 'square', 0.12, 620),
    bounce: () => tone(240, 0.05, 'triangle', 0.1),
    bumper: () => tone(520, 0.09, 'square', 0.15, 240),
    launch: () => tone(160, 0.28, 'sawtooth', 0.15, 760),
    select: () => tone(440, 0.05, 'square', 0.1),
    hop: () => tone(380, 0.06, 'square', 0.1, 520),
    swing: () => tone(300, 0.07, 'triangle', 0.12, 140),
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

  function updateSoundHud() {
    if (hudSound) hudSound.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    updateSoundHud();
    if (!muted) ensureAudio();
  }

  // --- top-5 local leaderboard with classic arcade 3-letter initials ---
  function getLeaderboard() {
    try {
      const list = JSON.parse(localStorage.getItem(LB_KEY));
      return Array.isArray(list) ? list : [];
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
    return lb;
  }

  function renderTitleLeaderboard() {
    if (!titleLeaderboard) return;
    const lb = getLeaderboard();
    if (!lb.length) {
      titleLeaderboard.innerHTML = '<div class="lb-empty">NO SCORES YET — BE THE FIRST</div>';
      return;
    }
    titleLeaderboard.innerHTML = lb
      .map((e, i) => `<div class="lb-row"><span>${i + 1}. ${e.initials}</span><span>${e.score}</span></div>`)
      .join('');
  }

  function renderMarquee() {
    if (!marqueeTrack) return;
    const lb = getLeaderboard();
    const topLine = lb.length ? `HIGH SCORE ${lb[0].score} BY ${lb[0].initials}` : 'NO HIGH SCORE YET — BE THE FIRST';
    const messages = [
      '★ GENX ARCADE ★',
      '15 GAMES · ONE QUARTER',
      topLine,
      'INSERT COIN TO CONTINUE',
      'CLICK ANY CABINET TO PLAY',
    ];
    const text = messages.join('    ◆    ');
    marqueeTrack.textContent = `${text}    ◆    ${text}`;
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

  function startInitialsEntry(kind, score) {
    state.mode = 'initials';
    state.pendingResult = { kind, score };
    initialsLetters = ['A', 'A', 'A'];
    initialsCursor = 0;
    renderInitials();
    showScreen('initials');
  }

  function confirmInitials() {
    const initials = initialsLetters.join('');
    saveLeaderboardEntry(initials, state.pendingResult.score);
    renderTitleLeaderboard();
    renderMarquee();
    const { kind, score } = state.pendingResult;
    sfx('levelclear');
    if (kind === 'win') {
      state.mode = 'win';
      winScore.textContent = `FINAL SCORE ${score}  — NEW HIGH SCORE, ${initials}!`;
      showScreen('win');
    } else {
      state.mode = 'gameover';
      goScore.textContent = `SCORE ${score}  — NEW HIGH SCORE, ${initials}!`;
      showScreen('gameover');
    }
  }

  const state = {
    mode: 'title', // title | playing | levelcomplete | gameover | win | pause
    levelIndex: 0,
    selectedLevel: 0,
    lives: START_LIVES,
    score: 0,
    levelDefs: [], // { name, factory, tag }
    levelInstance: null,
    lastTime: 0,
    prevMode: null,
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
        if (state.mode === 'title') startRun(state.selectedLevel);
        else if (state.mode === 'levelcomplete') advanceLevel();
        else if (state.mode === 'gameover') startRun(state.selectedLevel);
        else if (state.mode === 'win') startRun(state.selectedLevel);
      }
    }
    if (state.mode === 'title' && ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
      const dir = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 1;
      const n = state.levelDefs.length;
      state.selectedLevel = (state.selectedLevel + dir + n) % n;
      sfx('hop');
      renderLevelSelection();
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
      quitToMenu();
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

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== name);
    });
  }

  function hideAllScreens() {
    Object.values(screens).forEach((el) => el.classList.add('hidden'));
  }

  function registerLevel(name, factory, tag, tagline) {
    state.levelDefs.push({ name, factory, tag: tag || '', tagline: tagline || '' });
  }

  function accentFor(i, total) {
    return `hsl(${Math.round((i * 360) / total)}, 85%, 62%)`;
  }

  function renderLevelList() {
    if (!levelListEl) return;
    const total = state.levelDefs.length;
    levelListEl.innerHTML = state.levelDefs
      .map((def, i) => `
        <div class="lvl-card" role="button" tabindex="0" data-idx="${i}" style="--accent:${accentFor(i, total)}" aria-label="Play ${def.name}">
          <span class="lvl-thumb" data-thumb="${i}"></span>
          <span class="lvl-info">
            <span class="lvl-num">${String(i + 1).padStart(2, '0')} &middot; ${def.name}</span>
            <span class="lvl-tagline">${def.tagline}</span>
            <span class="tag">${def.tag}</span>
          </span>
        </div>
      `)
      .join('');
    Array.from(levelListEl.children).forEach((el, i) => {
      el.addEventListener('click', () => {
        state.selectedLevel = i;
        renderLevelSelection();
        sfx('select');
        startRun(i);
      });
    });
    renderLevelSelection();
    renderThumbnails();
  }

  function renderLevelSelection() {
    if (!levelListEl) return;
    Array.from(levelListEl.children).forEach((el, i) => {
      el.classList.toggle('selected', i === state.selectedLevel);
    });
  }

  function renderThumbnails() {
    state.levelDefs.forEach((def, i) => {
      const slot = levelListEl.querySelector(`[data-thumb="${i}"]`);
      if (!slot) return;
      try {
        const tCanvas = document.createElement('canvas');
        tCanvas.width = W;
        tCanvas.height = H;
        const tCtx = tCanvas.getContext('2d');
        const previewApi = {
          W, H, ctx: tCtx,
          isDown: () => false,
          addScore: () => {},
          loseLife: () => {},
          winLevel: () => {},
          sfx: () => {},
          shake: () => {},
          get lives() { return START_LIVES; },
          get score() { return 0; },
        };
        const instance = def.factory(previewApi);
        instance.init();
        instance.update(1 / 60);
        instance.draw(tCtx);
        slot.appendChild(tCanvas);
      } catch (e) {
        slot.style.background = 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(0,0,0,0.3))';
      }
    });
  }

  function startRun(startIndex = 0) {
    sfx('coin');
    state.levelIndex = startIndex;
    state.lives = START_LIVES;
    state.score = 0;
    loadLevel(startIndex);
    state.mode = 'playing';
    hideAllScreens();
  }

  function loadLevel(index) {
    const def = state.levelDefs[index];
    state.levelInstance = def.factory(api);
    state.levelInstance.init();
    updateHud();
    const usesNumpad = def.tag === 'reflex';
    if (touchDpad) touchDpad.classList.toggle('hidden', usesNumpad);
    if (touchNumpad) touchNumpad.classList.toggle('hidden', !usesNumpad);
  }

  function advanceLevel() {
    state.levelIndex++;
    if (state.levelIndex >= state.levelDefs.length) {
      sfx('win');
      if (qualifiesForLeaderboard(state.score)) {
        startInitialsEntry('win', state.score);
      } else {
        state.mode = 'win';
        winScore.textContent = `FINAL SCORE ${state.score}  (BEST ${getBestScore()})`;
        showScreen('win');
      }
      return;
    }
    loadLevel(state.levelIndex);
    state.mode = 'playing';
    hideAllScreens();
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'pause';
      showScreen('pause');
    } else if (state.mode === 'pause') {
      state.mode = 'playing';
      hideAllScreens();
    }
  }

  function quitToMenu() {
    state.levelInstance = null;
    state.mode = 'title';
    showScreen('title');
  }

  function addScore(n) {
    state.score += n;
    updateHud();
  }

  function loseLife() {
    state.lives--;
    updateHud();
    shake(0.3, 6);
    if (state.lives <= 0) {
      sfx('lose');
      if (qualifiesForLeaderboard(state.score)) {
        startInitialsEntry('gameover', state.score);
      } else {
        state.mode = 'gameover';
        goScore.textContent = `SCORE ${state.score}  (BEST ${getBestScore()})`;
        showScreen('gameover');
      }
    } else {
      sfx('lifeLost');
      state.levelInstance.init();
    }
  }

  let shakeTime = 0, shakeMag = 0;
  function shake(duration, magnitude) {
    shakeTime = Math.max(shakeTime, duration);
    shakeMag = Math.max(shakeMag, magnitude);
  }

  function winLevel(bonus = 0) {
    if (bonus) addScore(bonus);
    state.mode = 'levelcomplete';
    lcTitle.textContent = `${state.levelDefs[state.levelIndex].name} CLEAR`;
    lcScore.textContent = `SCORE ${state.score}${bonus ? `  (+${bonus} bonus)` : ''}`;
    sfx('levelclear');
    showScreen('levelcomplete');
  }

  function updateHud() {
    hudLevel.textContent = `LEVEL ${Math.min(state.levelIndex + 1, state.levelDefs.length)}/${state.levelDefs.length}`;
    hudScore.textContent = `SCORE ${state.score}`;
    hudLives.textContent = `LIVES ${'▲'.repeat(Math.max(state.lives, 0))}`;
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
  };

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

  // On-screen buttons (touch + mouse) dispatch the exact same synthetic
  // KeyboardEvents a real keyboard would send, so they flow through the one
  // keydown/keyup listener above — no separate input path to keep in sync.
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

  function boot() {
    updateSoundHud();
    renderTitleLeaderboard();
    renderMarquee();
    renderLevelList();
    document.querySelectorAll('[data-key]').forEach(bindVirtualKey);
    showScreen('title');
    requestAnimationFrame(loop);
  }

  return { registerLevel, boot };
})();
