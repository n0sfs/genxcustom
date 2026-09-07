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
  const letterSlots = document.querySelectorAll('#screen-initials .letter-slot');
  const marqueeTrack = document.getElementById('marquee-track');
  const levelListEl = document.getElementById('level-list');

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

  // --- tiny procedural background loop, just a low bassline arpeggio ---
  const MUSIC_STEP_MS = 150;
  const MUSIC_PATTERN = [110, 0, 146.83, 0, 130.81, 0, 146.83, 164.81];
  let musicTimer = null;
  let musicStep = 0;

  function musicTick() {
    const freq = MUSIC_PATTERN[musicStep % MUSIC_PATTERN.length];
    if (freq) tone(freq, 0.09, 'square', 0.035);
    musicStep++;
  }

  function resumeMusic() {
    stopMusic();
    musicTimer = setInterval(musicTick, MUSIC_STEP_MS);
  }

  function startMusic() {
    musicStep = 0;
    resumeMusic();
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
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

  // --- per-game top-5 local leaderboards with classic arcade 3-letter initials ---
  function getAllLeaderboards() {
    try {
      const all = JSON.parse(localStorage.getItem(LB_KEY));
      return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
    } catch (e) {
      return {};
    }
  }

  function getLeaderboard(gameName) {
    const all = getAllLeaderboards();
    return Array.isArray(all[gameName]) ? all[gameName] : [];
  }

  function getBestScore(gameName) {
    const lb = getLeaderboard(gameName);
    return lb.length ? lb[0].score : 0;
  }

  function qualifiesForLeaderboard(gameName, score) {
    if (score <= 0) return false;
    const lb = getLeaderboard(gameName);
    return lb.length < LB_MAX || score > lb[lb.length - 1].score;
  }

  function saveLeaderboardEntry(gameName, initials, score) {
    const all = getAllLeaderboards();
    const lb = Array.isArray(all[gameName]) ? all[gameName] : [];
    lb.push({ initials, score });
    lb.sort((a, b) => b.score - a.score);
    lb.length = Math.min(lb.length, LB_MAX);
    all[gameName] = lb;
    localStorage.setItem(LB_KEY, JSON.stringify(all));
  }

  function renderMarquee() {
    if (!marqueeTrack) return;
    const all = getAllLeaderboards();
    const champs = Object.entries(all).filter(([, lb]) => lb.length);
    const spotlight = champs.length
      ? (() => { const [name, lb] = champs[Math.floor(Math.random() * champs.length)]; return `${name} CHAMPION: ${lb[0].initials} WITH ${lb[0].score}`; })()
      : 'NO HIGH SCORES YET — BE THE FIRST';
    const messages = [
      '★ GENX ARCADE ★',
      '15 GAMES · PICK ONE · CHASE THE HIGH SCORE',
      spotlight,
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
    const def = state.levelDefs[state.currentGameIndex];
    saveLeaderboardEntry(def.name, initials, state.pendingResult.score);
    renderLevelList();
    renderMarquee();
    const { score } = state.pendingResult;
    sfx('levelclear');
    state.mode = 'gameover';
    goScore.textContent = `SCORE ${score}  — NEW HIGH SCORE, ${initials}!`;
    showScreen('gameover');
  }

  const HAND_BUILT_STAGES = 10;

  const state = {
    mode: 'title', // title | playing | levelcomplete | gameover | win | pause | initials
    currentGameIndex: -1, // which registered game is active this session, -1 = none yet
    selectedLevel: 0, // which card is highlighted on the title screen
    stage: 1,
    lives: START_LIVES,
    score: 0,
    levelDefs: [], // { name, factory, tag }
    levelInstance: null,
    lastTime: 0,
    pendingResult: null,
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
        if (state.mode === 'title') startGame(state.selectedLevel);
        else if (state.mode === 'levelcomplete') continueStage();
        else if (state.mode === 'win') continueStage();
        else if (state.mode === 'gameover') startGame(state.currentGameIndex);
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

  // Mouse tracking: canvas-space coordinates (correct regardless of CSS
  // scaling/layout - desktop, mobile portrait, or the landscape height-sized
  // stage) plus left-button state. A press also pulses the same Space
  // keydown/keyup every on-screen touch button already dispatches, so
  // "click = action button" works in every game for free; each level reads
  // raw position/press state via the api to decide its own genre-appropriate
  // mapping (paddle follows cursor, reticle aims, click-and-hold to move...).
  const mouse = { x: W / 2, y: H / 2, down: false };
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
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = toCanvasSpace(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !mouse.down) return;
    mouse.down = false;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
      .map((def, i) => {
        const best = getBestScore(def.name);
        return `
        <div class="lvl-card" role="button" tabindex="0" data-idx="${i}" style="--accent:${accentFor(i, total)}" aria-label="Play ${def.name}">
          <span class="lvl-thumb" data-thumb="${i}"></span>
          <span class="lvl-info">
            <span class="lvl-num">${String(i + 1).padStart(2, '0')} &middot; ${def.name}</span>
            <span class="lvl-tagline">${def.tagline}</span>
            <span class="lvl-meta"><span class="tag">${def.tag}</span>${best ? `<span class="lvl-best">BEST ${best}</span>` : ''}</span>
          </span>
        </div>
      `;
      })
      .join('');
    Array.from(levelListEl.children).forEach((el, i) => {
      el.addEventListener('click', () => {
        state.selectedLevel = i;
        renderLevelSelection();
        sfx('select');
        startGame(i);
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

  function startGame(index) {
    sfx('coin');
    state.currentGameIndex = index;
    state.stage = 1;
    state.lives = START_LIVES;
    state.score = 0;
    const def = state.levelDefs[index];
    state.levelInstance = def.factory(api);
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
      showScreen('pause');
      stopMusic();
    } else if (state.mode === 'pause') {
      state.mode = 'playing';
      hideAllScreens();
      resumeMusic();
    }
  }

  function quitToMenu() {
    state.levelInstance = null;
    state.mode = 'title';
    showScreen('title');
    stopMusic();
    renderLevelList();
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
      stopMusic();
      vibrate([60, 40, 120]);
      const def = state.levelDefs[state.currentGameIndex];
      if (qualifiesForLeaderboard(def.name, state.score)) {
        startInitialsEntry('gameover', state.score);
      } else {
        state.mode = 'gameover';
        goScore.textContent = `SCORE ${state.score}  (BEST ${getBestScore(def.name)})`;
        showScreen('gameover');
      }
    } else {
      sfx('lifeLost');
      state.levelInstance.init(state.stage);
    }
  }

  let shakeTime = 0, shakeMag = 0;
  function shake(duration, magnitude) {
    shakeTime = Math.max(shakeTime, duration);
    shakeMag = Math.max(shakeMag, magnitude);
    vibrate(Math.min(Math.round(magnitude * 8), 60));
  }

  function winLevel(bonus = 0) {
    if (bonus) addScore(bonus);
    const def = state.levelDefs[state.currentGameIndex];
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
      lcTitle.textContent = `${def.name} — STAGE ${clearedStage} CLEAR`;
      lcScore.textContent = `SCORE ${state.score}${bonus ? `  (+${bonus} bonus)` : ''}`;
      showScreen('levelcomplete');
    }
  }

  function updateHud() {
    const def = state.currentGameIndex >= 0 ? state.levelDefs[state.currentGameIndex] : null;
    hudLevel.textContent = def ? `${def.name} · STAGE ${state.stage}` : 'SELECT A GAME';
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
    get mouseX() { return mouse.x; },
    get mouseY() { return mouse.y; },
    get mouseDown() { return mouse.down; },
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
    updateHud();
    renderMarquee();
    renderLevelList();
    document.querySelectorAll('[data-key]').forEach(bindVirtualKey);
    if (hudSound) {
      hudSound.style.cursor = 'pointer';
      hudSound.addEventListener('click', () => {
        toggleMute();
        sfx('select');
      });
    }
    showScreen('title');
    requestAnimationFrame(loop);
  }

  return { registerLevel, boot };
})();
