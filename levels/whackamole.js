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
  // `glow` is a matching ambient accent used for a soft pulsing backdrop wash.
  const THEMES = {
    day: { bg: ['#241610', '#120a07'], mound: ['#1a0f08', '#4a2e1a'], glow: '#ff8c42' },
    dusk: { bg: ['#2a1030', '#140818'], mound: ['#1a0a1c', '#4a2040'], glow: '#c04fd6' },
    night: { bg: ['#0a1020', '#04060c'], mound: ['#0a0f1a', '#26304a'], glow: '#4f7dff' },
    neonpulse: { bg: ['#2a0a3a', '#12041c'], mound: ['#1c0828', '#5a1e6a'], glow: '#ff2fd6' },
    inferno: { bg: ['#3a1005', '#180602'], mound: ['#2a0e04', '#7a3010'], glow: '#ff5a1f' },
    toxic: { bg: ['#0a2a12', '#04140a'], mound: ['#0a1c0e', '#2a6a30'], glow: '#39ff6a' },
    aurora: { bg: ['#0a2a3a', '#04141c'], mound: ['#0a1c28', '#1e6a5a'], glow: '#2fe8c8' },
    blackout: { bg: ['#050505', '#000000'], mound: ['#0a0a0a', '#2a2a2a'], glow: '#6a6a7a' },
    gold: { bg: ['#3a2a05', '#181002'], mound: ['#2a1e04', '#7a5a10'], glow: '#ffd24f' },
    chrome: { bg: ['#141820', '#080a0e'], mound: ['#1a1e26', '#4a5568'], glow: '#b8c4d8' },
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

  // Instance-scoped juice systems - created once, updated/drawn every frame.
  const particles = FX.makeParticles(80);
  const floatText = FX.makeFloatText(16);

  let score, misses, activeHole, nextHole, moleTimer, gapTimer, phase, prevKeys, popScale, hitFlash, isBomb, bombFlash;
  let streak, streakTimer, consecutiveBombs;
  let squashFx; // brief flatten animation after a hole resolves (hit/bomb/miss)
  let screenFlashColor, screenFlashAlpha;
  let ambientT;
  const STREAK_WINDOW = 1.6;
  const ANTICIPATE_FRAC = 0.4; // fraction of the gap, right before pop, used for the "crouch" tell

  function scheduleGap() {
    phase = 'gap';
    gapTimer = GAP_TIME;
    activeHole = -1;
    // Pre-pick which hole pops next so the mound can telegraph it with a
    // little anticipation squash before the mole actually appears.
    nextHole = Math.floor(Math.random() * holes.length);
  }

  function spawnMole() {
    phase = 'up';
    activeHole = nextHole >= 0 ? nextHole : Math.floor(Math.random() * holes.length);
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

  function comboColor(s) {
    if (s >= 7) return '#ffffff';
    if (s >= 4) return '#ff6a3d';
    if (s >= 2) return '#ffae42';
    return '#ffd24f';
  }

  function popFlash(color, alpha) {
    screenFlashColor = color;
    screenFlashAlpha = alpha;
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
      squashFx = null;
      screenFlashColor = '#fff';
      screenFlashAlpha = 0;
      ambientT = 0;
      particles.clear();
      floatText.clear();
      nextHole = -1;
      scheduleGap();
    },

    update(dt) {
      ambientT += dt;
      hitFlash = Math.max(0, hitFlash - dt);
      bombFlash = Math.max(0, bombFlash - dt);
      streakTimer = Math.max(0, streakTimer - dt);
      if (streakTimer <= 0) streak = 0;
      screenFlashAlpha = Math.max(0, screenFlashAlpha - dt * 3.2);
      particles.update(dt);
      floatText.update(dt);
      if (squashFx) {
        squashFx.t -= dt;
        if (squashFx.t <= 0) squashFx = null;
      }

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
          const hx = holes[activeHole].x;
          const hy = holes[activeHole].y;
          if (isBomb) {
            misses += 2;
            bombFlash = 0.2;
            streak = 0;
            streakTimer = 0;
            sfx('explosion');
            shake(0.15, 4);
            popFlash('#ff2c2c', 0.4);
            particles.burst(hx, hy - 18, 14, {
              colors: ['#ff5c3c', '#ffae42', '#2a2a2a', '#ffe066'],
              speedMin: 90, speedMax: 230, lifeMin: 0.3, lifeMax: 0.6,
              sizeMin: 2, sizeMax: 5, gravity: 260,
            });
            squashFx = { x: hx, y: hy, t: 0.2, dur: 0.2, kind: 'bomb' };
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
            particles.burst(hx, hy - 14, 10, {
              colors: ['#ffe066', '#fff9c4', '#8aff8a', '#ffd24f'],
              speedMin: 60, speedMax: 190, lifeMin: 0.25, lifeMax: 0.5,
              sizeMin: 2, sizeMax: 4, gravity: 220, angle: -Math.PI / 2, spread: Math.PI * 0.9,
            });
            squashFx = { x: hx, y: hy, t: 0.16, dur: 0.16, kind: 'hit' };
            const col = comboColor(streak);
            const size = Math.min(20, 11 + streak * 1.1);
            const label = streak > 1 ? `+${gained} x${streak}` : `+${gained}`;
            floatText.spawn(hx, hy - 26, label, col, { life: 0.7, vy: -46, size });
            if (streak > 0 && streak % 4 === 0) {
              sfx('pickup');
              popFlash('#ffffff', 0.18);
              floatText.spawn(hx, hy - 44, 'STREAK!', '#ffffff', { life: 0.8, vy: -30, size: 15 });
            } else if (streak > 1) {
              popFlash(col, 0.1);
            }
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
          const hx = holes[activeHole].x;
          const hy = holes[activeHole].y;
          shake(0.08, 2);
          popFlash('#8a6a3a', 0.16);
          particles.burst(hx, hy - 6, 8, {
            colors: ['#4a3520', '#6b4a28', '#8a6a3a'],
            speedMin: 30, speedMax: 90, lifeMin: 0.3, lifeMax: 0.5,
            sizeMin: 2, sizeMax: 4, gravity: 180, angle: -Math.PI / 2, spread: Math.PI * 0.6,
          });
          squashFx = { x: hx, y: hy, t: 0.18, dur: 0.18, kind: 'miss' };
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

      // ambient themed glow, pulsing gently so the cabinet feels "alive"
      const pulse = 0.5 + 0.5 * Math.sin(ambientT * 1.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1 + pulse * 0.08;
      const ambientGlow = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, H * 0.8);
      ambientGlow.addColorStop(0, theme.glow);
      ambientGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

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
        // solid metal backing plate so the hole reads as a recessed fixture,
        // not a flat painted circle
        FX.insetRect(ctx, h.x - HOLE_R - 8, h.y - HOLE_R * 0.62, (HOLE_R + 8) * 2, HOLE_R * 1.15, '#2a2e38', 3);

        // anticipation "crouch" - the mound compresses just before the next
        // mole pops, telegraphing the hit without changing spawn timing
        let anticipate = 0;
        if (phase === 'gap' && i === nextHole) {
          const window = GAP_TIME * ANTICIPATE_FRAC;
          if (gapTimer < window && window > 0) anticipate = 1 - gapTimer / window;
        }

        FX.shadow(ctx, h.x, h.y + 22, HOLE_R * 0.9, HOLE_R * 0.35, 0.4);
        const moundRy = HOLE_R * 0.5 * (1 - anticipate * 0.18);
        const moundGrad = ctx.createRadialGradient(h.x, h.y + 8, 4, h.x, h.y + 14, HOLE_R);
        moundGrad.addColorStop(0, theme.mound[0]);
        moundGrad.addColorStop(1, theme.mound[1]);
        ctx.fillStyle = moundGrad;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 14, HOLE_R, moundRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 14, HOLE_R, moundRy, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + 12, HOLE_R * 0.96, moundRy * 0.92, 0, Math.PI, Math.PI * 2);
        ctx.stroke();

        if (i === activeHole) {
          // ease-out pop with a touch of overshoot bounce for a springy feel
          const raw = popScale;
          const eased = 1 - Math.pow(1 - Math.min(raw, 1), 3);
          const overshoot = raw < 1 ? Math.sin(Math.min(raw, 1) * Math.PI) * 0.12 : 0;
          const s = Math.min(1.12, eased + overshoot);

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
        } else if (squashFx && Math.abs(squashFx.x - h.x) < 1 && Math.abs(squashFx.y - h.y) < 1) {
          // squash-down aftermath: a flattening blob that shrinks into the mound
          const t = Math.max(0, squashFx.t / squashFx.dur);
          const flatRy = HOLE_R * 0.32 * t;
          if (flatRy > 0.5) {
            const color = squashFx.kind === 'bomb' ? '#3a2a2a' : squashFx.kind === 'miss' ? '#5a4028' : '#8a6a3a';
            ctx.save();
            ctx.globalAlpha = 0.85 * t;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(h.x, h.y + 16, HOLE_R * 0.62 * (1.3 - t * 0.3), flatRy, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        ctx.fillStyle = '#7d86a3';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(KEYS[i], h.x, h.y + 38);
        ctx.textAlign = 'left';
      });

      // juice layers: particles + floating score/combo text, drawn after
      // sprites and before the CRT-style post-processing below
      particles.draw(ctx);
      floatText.draw(ctx);
      if (screenFlashAlpha > 0) FX.flash(ctx, W, H, screenFlashColor, screenFlashAlpha);

      ctx.fillStyle = '#ffd24f';
      ctx.font = '10px monospace';
      ctx.fillText(`SCORE ${score}/${TARGET_SCORE}`, 12, 24);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillText(`MISSES ${misses}/${MISS_LIMIT}`, 12, 40);
      if (streak > 1 && streakTimer > 0) {
        ctx.fillStyle = comboColor(streak);
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`STREAK x${streak}`, 12, 56);
      }
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('WHACK MOLES, DODGE BOMBS', 12, H - 12);

      FX.scanlines(ctx, W, H, 0.05);
      FX.vignette(ctx, W, H, 0.3);
    },
  };
}
