function createWhackAMoleLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;
  const BOMB_CHANCE = 0.2;

  const GRID = 3;
  const HOLE_R = 46;
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const TARGET_SCORE = 30;
  const MISS_LIMIT = 4;
  const UP_TIME_START = 1.05;
  const UP_TIME_MIN = 0.55;
  const GAP_TIME = 0.35;

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

  function scheduleGap() {
    phase = 'gap';
    gapTimer = GAP_TIME;
    activeHole = -1;
  }

  function spawnMole() {
    phase = 'up';
    activeHole = Math.floor(Math.random() * holes.length);
    isBomb = Math.random() < BOMB_CHANCE;
    const upTime = Math.max(UP_TIME_MIN, UP_TIME_START - score * 0.02);
    moleTimer = upTime;
    popScale = 0;
  }

  return {
    init() {
      score = 0;
      misses = 0;
      prevKeys = {};
      hitFlash = 0;
      bombFlash = 0;
      isBomb = false;
      scheduleGap();
    },

    update(dt) {
      hitFlash = Math.max(0, hitFlash - dt);
      bombFlash = Math.max(0, bombFlash - dt);
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
            sfx('explosion');
            shake(0.15, 4);
            if (misses >= MISS_LIMIT) {
              loseLife();
              return;
            }
          } else {
            score += 3;
            addScore(3);
            hitFlash = 0.15;
            sfx('hit');
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
      FX.gradientRect(ctx, 0, 0, W, H, '#241610', '#120a07');

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
        moundGrad.addColorStop(0, '#1a0f08');
        moundGrad.addColorStop(1, '#4a2e1a');
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

      ctx.fillStyle = '#ffd24f';
      ctx.font = '10px monospace';
      ctx.fillText(`SCORE ${score}/${TARGET_SCORE}`, 12, 24);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillText(`MISSES ${misses}/${MISS_LIMIT}`, 12, 40);
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('WHACK MOLES, DODGE BOMBS', 12, H - 12);
    },
  };
}
