function createPatternPulseLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const DIRS = ['up', 'down', 'left', 'right'];

  // Per-stage difficulty config. Stages 1-10 are hand-built; stage 11+ is
  // "endless mode" — a smooth continuous scale-up off the stage-10 baseline,
  // capped so deep stages stay merely hard instead of unreadable.
  function computeStageConfig(stage) {
    const s = Math.max(1, Math.floor(stage) || 1);

    if (s === 1) {
      return { startLen: 1, targetLen: 10, litTime: 0.45, gapTime: 0.2, startPause: 0.5, stepTimeout: 3.5 };
    }
    if (s === 2) {
      return { startLen: 3, targetLen: 14, litTime: 0.36, gapTime: 0.16, startPause: 0.4, stepTimeout: 3.0 };
    }
    if (s === 3) {
      return { startLen: 5, targetLen: 18, litTime: 0.3, gapTime: 0.13, startPause: 0.35, stepTimeout: 2.6 };
    }
    if (s === 4) {
      return { startLen: 7, targetLen: 22, litTime: 0.28, gapTime: 0.122, startPause: 0.33, stepTimeout: 2.40 };
    }
    if (s === 5) {
      return { startLen: 9, targetLen: 26, litTime: 0.26, gapTime: 0.115, startPause: 0.31, stepTimeout: 2.20 };
    }
    if (s === 6) {
      return { startLen: 11, targetLen: 29, litTime: 0.24, gapTime: 0.109, startPause: 0.29, stepTimeout: 2.02 };
    }
    if (s === 7) {
      return { startLen: 13, targetLen: 32, litTime: 0.225, gapTime: 0.104, startPause: 0.275, stepTimeout: 1.90 };
    }
    if (s === 8) {
      return { startLen: 14, targetLen: 35, litTime: 0.21, gapTime: 0.10, startPause: 0.26, stepTimeout: 1.80 };
    }
    if (s === 9) {
      return { startLen: 15, targetLen: 38, litTime: 0.195, gapTime: 0.095, startPause: 0.245, stepTimeout: 1.72 };
    }
    if (s === 10) {
      return { startLen: 16, targetLen: 40, litTime: 0.18, gapTime: 0.09, startPause: 0.23, stepTimeout: 1.65 };
    }

    // Endless mode: stage 11+, scaled off the stage-10 baseline.
    const n = s - 10;
    const speedScale = Math.min(1 + n * 0.12, 2.3); // cap ~2.3x faster than stage 10
    // Math.round (not floor) so stage 11 (n=1) already ticks startLen up past
    // stage 10's baseline instead of repeating it verbatim — otherwise the
    // first endless stage was a pure speed bump with zero length increase.
    const startLen = Math.min(16 + Math.round(n * 0.6), 32); // cap so the watch phase stays sane
    const targetLen = Math.min(startLen + 24 + Math.floor(n * 1.0), 80);

    return {
      startLen,
      targetLen: Math.max(targetLen, startLen + 1),
      // Floors tuned so speed plateaus by ~stage 13 (3 endless steps past the
      // stage-10 baseline) rather than becoming unreadably fast — past that
      // point, difficulty climbs purely via startLen/targetLen (memory load),
      // not raw speed.
      litTime: Math.max(0.18 / speedScale, 0.14),
      gapTime: Math.max(0.09 / speedScale, 0.07),
      startPause: Math.max(0.23 / speedScale, 0.18),
      stepTimeout: Math.max(1.65 / speedScale, 1.3),
    };
  }

  let TARGET_LEN, LIT_TIME, GAP_TIME, START_PAUSE, STEP_TIMEOUT, START_LEN;

  const cx = W / 2, cy = H / 2;
  const TL = [0, 0], TR = [W, 0], BR = [W, H], BL = [0, H], C = [cx, cy];

  const NOTE = { up: 'hop', right: 'bounce', down: 'pickup', left: 'select' };

  // Cheap per-stage "new place" cue: a very low-alpha color wash over the
  // whole board that cycles through a small palette by stage number. Doesn't
  // touch the quadrant colors themselves (those stay fixed so the direction
  // mapping is never ambiguous), just tints the ambient lighting.
  const STAGE_TINTS = ['#2a6bff', '#ff2a6b', '#2affb0', '#ffb02a', '#9d2aff', '#2affe0'];

  const QUADS = {
    up: { dir: 'up', color: '#28e0ff', tri: [TL, TR, C], label: [cx, 78] },
    right: { dir: 'right', color: '#39ff6a', tri: [TR, BR, C], label: [W - 78, cy] },
    down: { dir: 'down', color: '#ff3ec2', tri: [BR, BL, C], label: [cx, H - 66] },
    left: { dir: 'left', color: '#ffe135', tri: [BL, TL, C], label: [78, cy] },
  };

  const KEY_MAP = {
    ArrowUp: 'up', w: 'up',
    ArrowDown: 'down', s: 'down',
    ArrowLeft: 'left', a: 'left',
    ArrowRight: 'right', d: 'right',
  };

  function randomDir() {
    return DIRS[Math.floor(Math.random() * DIRS.length)];
  }

  let curStage = 1;
  let sequence, phase, prevKeys;
  let playbackIndex, playbackSub, playbackTimer, litQuad;
  let inputIndex, stepTimer, flashQuad, flashTimer;

  function startWatchRound() {
    phase = 'watch';
    playbackIndex = 0;
    playbackSub = 'pause';
    playbackTimer = START_PAUSE;
    litQuad = -1;
  }

  function beginInputPhase() {
    phase = 'input';
    inputIndex = 0;
    stepTimer = STEP_TIMEOUT;
    litQuad = -1;
  }

  function fail() {
    sfx('lose');
    shake(0.15, 3);
    loseLife();
  }

  return {
    init(stage = 1) {
      curStage = Math.max(1, Math.floor(stage) || 1);
      const cfg = computeStageConfig(stage);
      TARGET_LEN = cfg.targetLen;
      LIT_TIME = cfg.litTime;
      GAP_TIME = cfg.gapTime;
      START_PAUSE = cfg.startPause;
      STEP_TIMEOUT = cfg.stepTimeout;
      START_LEN = cfg.startLen;

      sequence = [];
      for (let i = 0; i < START_LEN; i++) sequence.push(randomDir());

      prevKeys = {};
      flashQuad = -1;
      flashTimer = 0;
      startWatchRound();
    },

    update(dt) {
      flashTimer = Math.max(0, flashTimer - dt);
      if (flashTimer <= 0) flashQuad = -1;

      const justPressed = {};
      Object.keys(KEY_MAP).forEach((k) => {
        const down = isDown(k);
        const dir = KEY_MAP[k];
        justPressed[dir] = justPressed[dir] || (down && !prevKeys[k]);
        prevKeys[k] = down;
      });

      if (phase === 'watch') {
        playbackTimer -= dt;
        if (playbackSub === 'pause' && playbackTimer <= 0) {
          litQuad = sequence[playbackIndex];
          playbackSub = 'lit';
          playbackTimer = LIT_TIME;
          sfx(NOTE[litQuad]);
        } else if (playbackSub === 'lit' && playbackTimer <= 0) {
          litQuad = -1;
          playbackSub = 'gap';
          playbackTimer = GAP_TIME;
        } else if (playbackSub === 'gap' && playbackTimer <= 0) {
          playbackIndex++;
          if (playbackIndex >= sequence.length) {
            beginInputPhase();
          } else {
            litQuad = sequence[playbackIndex];
            playbackSub = 'lit';
            playbackTimer = LIT_TIME;
            sfx(NOTE[litQuad]);
          }
        }
        return;
      }

      if (phase === 'input') {
        stepTimer -= dt;

        const pressedDir = DIRS.find((d) => justPressed[d]);
        if (pressedDir) {
          flashQuad = pressedDir;
          flashTimer = 0.15;

          if (pressedDir === sequence[inputIndex]) {
            sfx(NOTE[pressedDir]);
            inputIndex++;
            stepTimer = STEP_TIMEOUT;

            if (inputIndex >= sequence.length) {
              const completedLen = sequence.length;
              addScore(completedLen * 10);
              if (completedLen >= TARGET_LEN) {
                sfx('win');
                winLevel(100);
                return;
              }
              sfx('levelclear');
              sequence.push(randomDir());
              startWatchRound();
            }
          } else {
            fail();
            return;
          }
        } else if (stepTimer <= 0) {
          fail();
          return;
        }
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, W, H);

      DIRS.forEach((dir) => {
        const q = QUADS[dir];
        const isLit = litQuad === dir;
        const isFlash = flashQuad === dir;
        const bright = isLit || isFlash;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(q.tri[0][0], q.tri[0][1]);
        ctx.lineTo(q.tri[1][0], q.tri[1][1]);
        ctx.lineTo(q.tri[2][0], q.tri[2][1]);
        ctx.closePath();
        ctx.clip();

        const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(W, H) * 0.62);
        if (bright) {
          grad.addColorStop(0, FX.shade(q.color, 60));
          grad.addColorStop(0.6, q.color);
          grad.addColorStop(1, FX.shade(q.color, 20));
        } else {
          grad.addColorStop(0, FX.shade(q.color, -8));
          grad.addColorStop(0.6, FX.shade(q.color, -45));
          grad.addColorStop(1, FX.shade(q.color, -65));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        if (bright) {
          ctx.shadowColor = q.color;
          ctx.shadowBlur = 45;
          ctx.fillStyle = FX.shade(q.color, 25);
          ctx.globalAlpha = 0.55;
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        }

        // subtle radial sheen streaks for a glowing arcade-button feel
        ctx.strokeStyle = bright ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, (Math.max(W, H) * 0.62) * (i / 4), 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(q.tri[0][0], q.tri[0][1]);
        ctx.lineTo(q.tri[1][0], q.tri[1][1]);
        ctx.lineTo(q.tri[2][0], q.tri[2][1]);
        ctx.closePath();
        ctx.strokeStyle = bright ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
        ctx.lineWidth = bright ? 3 : 2;
        ctx.stroke();

        // direction glyph (arrow) + label
        const [lx, ly] = q.label;
        ctx.save();
        ctx.translate(lx, ly);
        const rot = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[dir];
        ctx.rotate(rot);
        ctx.fillStyle = bright ? '#ffffff' : 'rgba(20,20,30,0.55)';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -8);
        ctx.lineTo(-6, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // ambient stage-tint wash — sells "you're somewhere new" each stage
      // without touching the direction-color mapping above
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = STAGE_TINTS[(curStage - 1) % STAGE_TINTS.length];
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      // center hub
      FX.shadow(ctx, cx, cy + 4, 26, 10, 0.35);
      FX.sphere(ctx, cx, cy, 22, litQuad !== -1 ? FX.shade(QUADS[litQuad].color, 10) : '#3a3a4a');
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();

      // divider lines between quadrants
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      [TL, TR, BR, BL].forEach((corner) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(corner[0], corner[1]);
        ctx.stroke();
      });

      // HUD
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`ROUND ${sequence.length}/${TARGET_LEN}`, 8, 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = phase === 'watch' ? '#ffd24f' : '#6bff6b';
      ctx.fillText(phase === 'watch' ? 'WATCH' : 'REPEAT!', W - 8, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('ARROWS / WASD — REPEAT THE PATTERN', cx, H - 8);
      ctx.textAlign = 'left';
    },
  };
}
