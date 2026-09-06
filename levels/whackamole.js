function createWhackAMoleLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GRID = 3;
  const HOLE_R = 46;
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const MISS_LIMIT = 4;
  // Default gap between one mole and the next; individual stages can tighten
  // (or ease) this via `gapTime` for pacing variety without changing the
  // single-active-hole game loop structure.
  const GAP_TIME_DEFAULT = 0.35;

  // Cheap per-stage palette shift (background/mound colors only) to sell "the
  // cabinet's come alive" - mirrors the day/dusk/night approach used by racing.js.
  const THEMES = {
    day: { bg: ['#241610', '#120a07'], mound: ['#1a0f08', '#4a2e1a'] },
    dusk: { bg: ['#2a1030', '#140818'], mound: ['#1a0a1c', '#4a2040'] },
    night: { bg: ['#0a1020', '#04060c'], mound: ['#0a0f1a', '#26304a'] },
    neonpulse: { bg: ['#2a0a3a', '#12041c'], mound: ['#1c0828', '#5a1e6a'] },
    inferno: { bg: ['#3a1005', '#180602'], mound: ['#2a0e04', '#7a3010'] },
    toxic: { bg: ['#0a2a12', '#04140a'], mound: ['#0a1c0e', '#2a6a30'] },
    aurora: { bg: ['#0a2a3a', '#04141c'], mound: ['#0a1c28', '#1e6a5a'] },
    blackout: { bg: ['#050505', '#000000'], mound: ['#0a0a0a', '#2a2a2a'] },
    gold: { bg: ['#3a2a05', '#181002'], mound: ['#2a1e04', '#7a5a10'] },
    chrome: { bg: ['#141820', '#080a0e'], mound: ['#1a1e26', '#4a5568'] },
  };

  // Stage 1: the original default pacing.
  const STAGE_CONFIGS = [
    { upTimeStart: 1.05, upTimeMin: 0.55, bombChanceBase: 0.2, bombChanceCap: 0.35, targetScore: 30, theme: 'day' },
    // Stage 2: faster mole cycles, higher bomb chance from the start, higher target.
    { upTimeStart: 0.85, upTimeMin: 0.45, bombChanceBase: 0.28, bombChanceCap: 0.4, targetScore: 45, theme: 'dusk' },
    // Stage 3: faster still, higher bomb chance, higher target.
    { upTimeStart: 0.7, upTimeMin: 0.38, bombChanceBase: 0.34, bombChanceCap: 0.45, targetScore: 60, theme: 'night' },
    // Stage 4: neon carnival wakes up - modestly faster than stage 3, and the
    // gap before the next mole tightens a touch, the first taste of "rush" pacing.
    { upTimeStart: 0.58, upTimeMin: 0.33, bombChanceBase: 0.38, bombChanceCap: 0.48, targetScore: 75, theme: 'neonpulse', gapTime: 0.3 },
    // Stage 5: inferno - short reaction windows, gap tightened further for a
    // "rush burst" feel where the next mole is primed almost as soon as you hit one.
    { upTimeStart: 0.5, upTimeMin: 0.3, bombChanceBase: 0.41, bombChanceCap: 0.5, targetScore: 90, theme: 'inferno', gapTime: 0.26 },
    // Stage 6: toxic - a small breather on the gap (slightly longer) so the
    // rising bomb chance doesn't feel like pure gap-tightening escalation.
    { upTimeStart: 0.44, upTimeMin: 0.28, bombChanceBase: 0.43, bombChanceCap: 0.5, targetScore: 105, theme: 'toxic', gapTime: 0.3 },
    // Stage 7: aurora - tight windows return, deliberately punchy rush pacing.
    { upTimeStart: 0.4, upTimeMin: 0.26, bombChanceBase: 0.45, bombChanceCap: 0.52, targetScore: 120, theme: 'aurora', gapTime: 0.22 },
    // Stage 8: blackout - moles flicker up and down fast; up-time keeps shrinking
    // while the gap eases slightly, trading "instant react" for "constant churn".
    { upTimeStart: 0.36, upTimeMin: 0.24, bombChanceBase: 0.46, bombChanceCap: 0.53, targetScore: 135, theme: 'blackout', gapTime: 0.28 },
    // Stage 9: gold rush - near the top of the hand-built curve, aggressive
    // rush-burst gap with high bomb pressure, but still safely under the caps.
    { upTimeStart: 0.33, upTimeMin: 0.22, bombChanceBase: 0.47, bombChanceCap: 0.54, targetScore: 150, theme: 'gold', gapTime: 0.2 },
    // Stage 10: chrome finale - the hardest hand-built pacing: minimal
    // breathing room between moles and the highest (still-capped) bomb chance.
    { upTimeStart: 0.3, upTimeMin: 0.2, bombChanceBase: 0.48, bombChanceCap: 0.55, targetScore: 165, theme: 'chrome', gapTime: 0.18 },
  ];

  const HAND_BUILT_STAGES = STAGE_CONFIGS.length; // 10

  function getStageConfig(stage) {
    const idx = Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1;
    const base = STAGE_CONFIGS[idx];
    if (stage <= HAND_BUILT_STAGES) return base;
    // Endless mode: stage 10's pacing is the base, scaled smoothly harder each
    // stage, with hard caps so it never becomes unwinnable.
    const scale = Math.min(1 + (stage - HAND_BUILT_STAGES) * 0.12, 2.5);
    // Reuse the same (already-capped) scale to grow the target score, so the
    // level length plateaus alongside the difficulty instead of growing forever
    // (uncapped, +15/stage would reach 300+ by stage 20 for no extra challenge,
    // since upTime/bombChance are already maxed out well before that point).
    const targetProgress = (scale - 1) / 0.12;
    return {
      upTimeStart: Math.max(0.25, base.upTimeStart / scale),
      upTimeMin: Math.max(0.18, base.upTimeMin / scale),
      bombChanceBase: Math.min(0.5, base.bombChanceBase * Math.min(scale, 1.4)),
      bombChanceCap: Math.min(0.55, base.bombChanceCap * Math.min(scale, 1.3)),
      targetScore: base.targetScore + Math.round(targetProgress * 15),
      theme: base.theme,
      gapTime: Math.max(0.15, (base.gapTime || GAP_TIME_DEFAULT) / Math.min(scale, 1.2)),
    };
  }

  let UP_TIME_START, UP_TIME_MIN, BOMB_CHANCE, BOMB_CHANCE_CAP, TARGET_SCORE, GAP_TIME, theme;

  const holes = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      holes.push({
        x: W / 2 + (c - 1) * 170,
        y: 130 + r * 130,
      });
    }
  }

  let score, misses, activeHole, moleTimer, gapTimer, phase, prevKeys, popScale, hitFlash, isBomb, bombFlash;
  let streak, streakTimer, consecutiveBombs, popups;
  const STREAK_WINDOW = 1.6;

  function scheduleGap() {
    phase = 'gap';
    gapTimer = GAP_TIME;
    activeHole = -1;
  }

  function spawnMole() {
    phase = 'up';
    activeHole = Math.floor(Math.random() * holes.length);
    const progress = Math.min(1, score / TARGET_SCORE);
    const bombChance = Math.min(BOMB_CHANCE_CAP, BOMB_CHANCE + progress * 0.12);
    // pity rule: never more than two bombs in a row, so a run of bad luck
    // can't chain into an unavoidable string of misses
    isBomb = consecutiveBombs < 2 && Math.random() < bombChance;
    consecutiveBombs = isBomb ? consecutiveBombs + 1 : 0;
    const upTime = Math.max(UP_TIME_MIN, UP_TIME_START - score * 0.02);
    moleTimer = upTime;
    popScale = 0;
  }

  return {
    init(stage = 1) {
      const cfg = getStageConfig(stage);
      UP_TIME_START = cfg.upTimeStart;
      UP_TIME_MIN = cfg.upTimeMin;
      BOMB_CHANCE = cfg.bombChanceBase;
      BOMB_CHANCE_CAP = cfg.bombChanceCap;
      TARGET_SCORE = cfg.targetScore;
      theme = THEMES[cfg.theme] || THEMES.day;

      score = 0;
      misses = 0;
      prevKeys = {};
      hitFlash = 0;
      bombFlash = 0;
      isBomb = false;
      streak = 0;
      streakTimer = 0;
      consecutiveBombs = 0;
      popups = [];
      scheduleGap();
    },

    update(dt) {
      hitFlash = Math.max(0, hitFlash - dt);
      bombFlash = Math.max(0, bombFlash - dt);
      streakTimer = Math.max(0, streakTimer - dt);
      if (streakTimer <= 0) streak = 0;
      popups.forEach((p) => { p.y -= 18 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);
      const justPressed = {};
      KEYS.forEach((k) => {
        const down = isDown(k);
        justPressed[k] = down && !prevKeys[k];
        prevKeys[k] = down;
      });

      if (phase === 'gap') {
        gapTimer -= dt;
        if (gapTimer <= 0) spawnMole();
        return;
      }

      moleTimer -= dt;
      popScale = Math.min(1, popScale + dt * 8);

      const pressedKey = KEYS.find((k) => justPressed[k]);
      if (pressedKey !== undefined) {
        const idx = KEYS.indexOf(pressedKey);
        if (idx === activeHole) {
          if (isBomb) {
            misses += 2;
            bombFlash = 0.2;
            streak = 0;
            streakTimer = 0;
            sfx('explosion');
            shake(0.15, 4);
            if (misses >= MISS_LIMIT) {
              loseLife();
              return;
            }
          } else {
            streak = streakTimer > 0 ? streak + 1 : 1;
            streakTimer = STREAK_WINDOW;
            const comboBonus = Math.min(streak - 1, 4);
            const gained = 3 + comboBonus;
            score += gained;
            addScore(gained);
            hitFlash = 0.15;
            sfx('hit');
            if (streak > 1) {
              popups.push({ x: holes[activeHole].x, y: holes[activeHole].y - 20, life: 0.6, text: `+${gained} x${streak}` });
            }
            if (streak > 0 && streak % 4 === 0) sfx('pickup');
            if (score >= TARGET_SCORE) {
              winLevel(30);
              return;
            }
          }
          scheduleGap();
          return;
        }
      }

      if (moleTimer <= 0) {
        if (!isBomb) {
          misses++;
          streak = 0;
          streakTimer = 0;
          sfx('bounce');
          if (misses >= MISS_LIMIT) {
            loseLife();
            return;
          }
        }
        scheduleGap();
      }
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, theme.bg[0], theme.bg[1]);

      // wood-plank backdrop texture
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let y = 18; y < H; y += 34) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // carnival-cabinet chrome frame around the play area
      FX.chrome(ctx, 0, 0, W, 7);
      FX.chrome(ctx, 0, H - 7, W, 7);
      FX.chrome(ctx, 0, 0, 7, H);
      FX.chrome(ctx, W - 7, 0, 7, H);
      FX.sphere(ctx, W - 13, 13, 3, '#9098a8');
      FX.sphere(ctx, W - 13, H - 13, 3, '#9098a8');

      holes.forEach((h, i) => {
        FX.shadow(ctx, h.x, h.y + 22, HOLE_R * 0.9, HOLE_R * 0.35, 0.4);
        const moundGrad = ctx.createRadialGradient(h.x, h.y + 8, 4, h.x, h.y + 14, HOLE_R);
        moundGrad.addColorStop(0, theme.mound[0]);
        moundGrad.addColorStop(1, theme.mound[1]);
        ctx.fillStyle = moundGrad;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 14, HOLE_R, HOLE_R * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 14, HOLE_R, HOLE_R * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 12, HOLE_R * 0.96, HOLE_R * 0.46, 0, Math.PI, Math.PI * 2);
        ctx.stroke();

        if (i === activeHole) {
          const s = popScale;
          if (isBomb) {
            FX.sphere(ctx, h.x, h.y + 14 - 30 * s, HOLE_R * 0.5, bombFlash > 0 ? '#ff5c5c' : '#2a2a34');
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(h.x, h.y + 14 - 30 * s, HOLE_R * 0.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#3a3a44';
            ctx.fillRect(h.x - 3, h.y - 20 - 30 * s, 6, 8);
            ctx.strokeStyle = '#ff9a4f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y - 20 - 30 * s);
            ctx.lineTo(h.x + 6, h.y - 28 - 30 * s);
            ctx.stroke();
            const sparkGrad = ctx.createRadialGradient(h.x + 6, h.y - 28 - 30 * s, 0, h.x + 6, h.y - 28 - 30 * s, 7);
            sparkGrad.addColorStop(0, 'rgba(255,236,170,1)');
            sparkGrad.addColorStop(1, 'rgba(255,180,60,0)');
            ctx.fillStyle = sparkGrad;
            ctx.beginPath();
            ctx.arc(h.x + 6, h.y - 28 - 30 * s, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd24f';
            ctx.beginPath();
            ctx.arc(h.x + 6, h.y - 28 - 30 * s, 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(h.x, h.y + 14 - 30 * s, HOLE_R * 0.6, HOLE_R * 0.7 * s, 0, 0, Math.PI * 2);
            ctx.clip();
            FX.sphere(ctx, h.x, h.y + 14 - 30 * s, HOLE_R * 0.65, hitFlash > 0 ? '#6bff6b' : '#a9743f');
            ctx.restore();
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(h.x, h.y + 14 - 30 * s, HOLE_R * 0.6, HOLE_R * 0.7 * s, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(h.x - 10, h.y - 6 - 30 * s, 3, 0, Math.PI * 2);
            ctx.arc(h.x + 10, h.y - 6 - 30 * s, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(h.x - 9, h.y - 7 - 30 * s, 1, 0, Math.PI * 2);
            ctx.arc(h.x + 11, h.y - 7 - 30 * s, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.fillStyle = '#7d86a3';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(KEYS[i], h.x, h.y + 38);
        ctx.textAlign = 'left';
      });

      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffd24f';
        ctx.globalAlpha = Math.max(0, p.life / 0.6);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';

      ctx.fillStyle = '#ffd24f';
      ctx.font = '10px monospace';
      ctx.fillText(`SCORE ${score}/${TARGET_SCORE}`, 12, 24);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillText(`MISSES ${misses}/${MISS_LIMIT}`, 12, 40);
      if (streak > 1 && streakTimer > 0) {
        ctx.fillStyle = '#ff9a4f';
        ctx.fillText(`STREAK x${streak}`, 12, 56);
      }
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('WHACK MOLES, DODGE BOMBS', 12, H - 12);
    },
  };
}
