function createPinballLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GRAVITY = 900;
  const BALL_R = 9;
  const MAX_SPEED = 900;
  const TARGET_SCORE = 150;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  const walls = [
    { x: 14, y: 0, w: 10, h: 470 },
    { x: 616, y: 0, w: 10, h: 470 },
    { x: 14, y: 0, w: 612, h: 10 },
  ];

  const bumpers = [
    { x: 220, y: 150, r: 24, color: '#4fe3d0', cooldown: 0 },
    { x: 420, y: 150, r: 24, color: '#ff4fa3', cooldown: 0 },
    { x: 320, y: 235, r: 22, color: '#ffd24f', cooldown: 0 },
  ];

  const flippers = {
    left: {
      pivot: { x: 240, y: 420 }, length: 62,
      restDir: normalize(-0.55, 0.75), activeDir: normalize(0.9, -0.25),
      raise: 0,
    },
    right: {
      pivot: { x: 400, y: 420 }, length: 62,
      restDir: normalize(0.55, 0.75), activeDir: normalize(-0.9, -0.25),
      raise: 0,
    },
  };

  const START_POS = { x: 590, y: 430 };
  const COMBO_WINDOW = 1.3;

  const TARGET_DEFS = [
    { x: 240, y: 60, w: 34, h: 14 },
    { x: 304, y: 60, w: 34, h: 14 },
    { x: 368, y: 60, w: 34, h: 14 },
  ];

  let balls, score, comboCount, comboTimer, popups, targets;

  function targetBounce(b) {
    for (const t of targets) {
      if (!t.alive) continue;
      const cx = clamp(b.x, t.x, t.x + t.w);
      const cy = clamp(b.y, t.y, t.y + t.h);
      const dx = b.x - cx, dy = b.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < BALL_R * BALL_R) {
        const dist = Math.sqrt(distSq) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        b.x += nx * (BALL_R - dist);
        b.y += ny * (BALL_R - dist);
        const vDotN = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        t.alive = false;
        score += 20;
        addScore(20);
        sfx('hit');
        shake(0.06, 2);
        popups.push({ x: t.x + t.w / 2, y: t.y - 6, text: '+20', life: 0.7 });
        if (targets.every((tt) => !tt.alive)) triggerMultiball(b);
      }
    }
  }

  function triggerMultiball(source) {
    sfx('levelclear');
    shake(0.15, 4);
    popups.push({ x: 320, y: 210, text: 'MULTIBALL!', life: 1.3 });
    for (let i = 0; i < 2; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
      balls.push({ x: source.x, y: source.y, vx: Math.cos(ang) * 350, vy: Math.sin(ang) * 350, launched: true });
    }
    targets.forEach((t) => { t.alive = true; });
  }

  function circleRectBounce(b) {
    for (const w of walls) {
      const cx = clamp(b.x, w.x, w.x + w.w);
      const cy = clamp(b.y, w.y, w.y + w.h);
      const dx = b.x - cx, dy = b.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < BALL_R * BALL_R) {
        const dist = Math.sqrt(distSq) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        b.x += nx * (BALL_R - dist);
        b.y += ny * (BALL_R - dist);
        const vDotN = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        b.vx *= 0.97; b.vy *= 0.97;
      }
    }
  }

  function bumperBounce(b, dt) {
    bumpers.forEach((bp) => {
      bp.cooldown = Math.max(0, bp.cooldown - dt);
      const dx = b.x - bp.x, dy = b.y - bp.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_R + bp.r) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        b.x = bp.x + nx * (BALL_R + bp.r);
        b.y = bp.y + ny * (BALL_R + bp.r);
        const vDotN = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        const speed = Math.max(Math.hypot(b.vx, b.vy), 380);
        const dir = normalize(b.vx, b.vy);
        b.vx = dir.x * speed;
        b.vy = dir.y * speed;
        bp.flash = 0.15;
        if (bp.cooldown <= 0) {
          bp.cooldown = 0.15;
          comboCount = comboTimer > 0 ? comboCount + 1 : 1;
          comboTimer = COMBO_WINDOW;
          const bonus = 10 + (comboCount - 1) * 5;
          score += bonus;
          addScore(bonus);
          sfx('bumper');
          shake(0.08, 2.5);
          popups.push({
            x: bp.x, y: bp.y - bp.r - 4,
            text: comboCount > 1 ? `COMBO x${comboCount}  +${bonus}` : `+${bonus}`,
            life: 0.8,
          });
        }
      }
    });
  }

  function flipperState(flip, key, dt) {
    const target = isDown(key) ? 1 : 0;
    const rate = 11;
    const delta = clamp(target - flip.raise, -rate * dt, rate * dt);
    flip.raise = clamp(flip.raise + delta, 0, 1);
    flip.raiseVel = delta / dt;
    flip.dir = normalize(
      lerp(flip.restDir.x, flip.activeDir.x, flip.raise),
      lerp(flip.restDir.y, flip.activeDir.y, flip.raise)
    );
    flip.tip = { x: flip.pivot.x + flip.dir.x * flip.length, y: flip.pivot.y + flip.dir.y * flip.length };
  }

  function flipperBounce(b, flip) {
    const px = flip.pivot.x, py = flip.pivot.y;
    const tx = flip.tip.x, ty = flip.tip.y;
    const segX = tx - px, segY = ty - py;
    const segLenSq = segX * segX + segY * segY;
    let t = ((b.x - px) * segX + (b.y - py) * segY) / segLenSq;
    t = clamp(t, 0, 1);
    const cx = px + segX * t, cy = py + segY * t;
    const dx = b.x - cx, dy = b.y - cy;
    const dist = Math.hypot(dx, dy);
    const thickness = 9;
    if (dist < BALL_R + thickness) {
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      b.x = cx + nx * (BALL_R + thickness);
      b.y = cy + ny * (BALL_R + thickness);
      const vDotN = b.vx * nx + b.vy * ny;
      b.vx -= 2 * vDotN * nx;
      b.vy -= 2 * vDotN * ny;
      if (flip.raiseVel > 0.3) {
        const kick = flip.raiseVel * flip.length * 0.9;
        b.vx += flip.dir.y * -kick * 0.4 + nx * kick * 0.6;
        b.vy += flip.dir.x * kick * 0.4 + ny * kick * 0.6;
        sfx('swing');
      } else {
        sfx('bounce');
      }
    }
  }

  return {
    init() {
      balls = [{ x: START_POS.x, y: START_POS.y, vx: 0, vy: 0, launched: false }];
      flippers.left.raise = 0;
      flippers.right.raise = 0;
      bumpers.forEach((bp) => { bp.cooldown = 0; bp.flash = 0; });
      targets = TARGET_DEFS.map((t) => ({ ...t, alive: true }));
      score = 0;
      comboCount = 0;
      comboTimer = 0;
      popups = [];
    },

    update(dt) {
      flipperState(flippers.left, 'ArrowLeft', dt);
      flipperState(flippers.right, 'ArrowRight', dt);
      bumpers.forEach((bp) => { bp.flash = Math.max(0, (bp.flash || 0) - dt); });
      comboTimer = Math.max(0, comboTimer - dt);
      popups.forEach((p) => { p.y -= 25 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);

      balls.forEach((ball) => {
        if (!ball.launched) {
          if (isDown('Space')) {
            ball.launched = true;
            ball.vx = -90;
            ball.vy = -560;
            sfx('launch');
          }
          return;
        }

        ball.vy += GRAVITY * dt;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_SPEED) {
          const s = MAX_SPEED / speed;
          ball.vx *= s; ball.vy *= s;
        }
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        circleRectBounce(ball);
        bumperBounce(ball, dt);
        targetBounce(ball);
        flipperBounce(ball, flippers.left);
        flipperBounce(ball, flippers.right);
      });

      balls = balls.filter((ball) => !ball.launched || ball.y - BALL_R < H);

      if (balls.length === 0) {
        loseLife();
        return;
      }

      if (score >= TARGET_SCORE) {
        winLevel(30);
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, W, H);

      FX.gradientRect(ctx, 20, 8, 600, 462, '#1e2038', '#12121e');

      walls.forEach((w) => {
        FX.bevelRect(ctx, w.x, w.y, w.w, w.h, '#4a4a6a', 2);
      });

      bumpers.forEach((bp) => {
        FX.shadow(ctx, bp.x, bp.y + bp.r * 0.7, bp.r * 0.9, bp.r * 0.3, 0.3);
        FX.sphere(ctx, bp.x, bp.y, bp.r, bp.flash > 0 ? '#ffffff' : bp.color);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, bp.r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      });

      [flippers.left, flippers.right].forEach((f) => {
        ctx.strokeStyle = '#e8ecff';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.pivot.x, f.pivot.y);
        ctx.lineTo(f.tip.x, f.tip.y);
        ctx.stroke();
      });

      targets.forEach((t) => {
        if (t.alive) FX.bevelBlock(ctx, t.x, t.y, t.w, t.h, '#ff9a4f', 2);
        else {
          ctx.fillStyle = '#3a2a20';
          ctx.fillRect(t.x, t.y, t.w, t.h);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(t.x, t.y, t.w, t.h);
      });

      if (balls.some((b) => !b.launched)) {
        ctx.fillStyle = '#7d86a3';
        ctx.font = '10px monospace';
        ctx.fillText('SPACE TO LAUNCH', 470, 400);
      }

      balls.forEach((ball) => {
        FX.sphere(ctx, ball.x, ball.y, BALL_R, '#ffd24f');
      });

      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffd24f';
        ctx.globalAlpha = Math.max(0, p.life / 0.8);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';

      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px monospace';
      ctx.fillText(`SCORE ${score} / ${TARGET_SCORE}`, 24, 24);
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('ARROWS = FLIPPERS', 24, 40);
      ctx.fillText(`TARGETS ${targets.filter((t) => t.alive).length}/${targets.length} FOR MULTIBALL`, 24, 452);
      if (comboTimer > 0 && comboCount > 1) {
        ctx.fillStyle = '#ff9a4f';
        ctx.font = '9px monospace';
        ctx.fillText(`COMBO x${comboCount}`, 24, 54);
      }
    },
  };
}
