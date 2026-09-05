function createPatternPulseLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const DIRS = ['up', 'down', 'left', 'right'];
  const TARGET_LEN = 10;
  const LIT_TIME = 0.45;
  const GAP_TIME = 0.2;
  const START_PAUSE = 0.5;
  const STEP_TIMEOUT = 3.5;

  const cx = W / 2, cy = H / 2;
  const TL = [0, 0], TR = [W, 0], BR = [W, H], BL = [0, H], C = [cx, cy];

  const NOTE = { up: 'hop', right: 'bounce', down: 'pickup', left: 'select' };

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
    init() {
      sequence = [randomDir()];
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
