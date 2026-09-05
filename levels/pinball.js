function createPinballLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GRAVITY_BASE = 900;
  const BALL_R = 9;
  const MAX_SPEED_BASE = 900;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // structural boundary + inlane guides - identical on every stage. Without
  // these, the gap between the outer rails and the flippers' resting reach
  // is so wide that a ball can roll straight down either side and drain
  // untouched. These funnel it back toward the flippers, like the plastic
  // guides on a real table, while still leaving a narrower "outlane" for risk.
  const BASE_WALLS = [
    { x: 14, y: 0, w: 10, h: 470 },
    { x: 616, y: 0, w: 10, h: 470 },
    { x: 14, y: 0, w: 612, h: 10 },
    { x: 170, y: 280, w: 8, h: 150 },
    { x: 462, y: 280, w: 8, h: 150 },
  ];

  // stage 4+ ("endless mode") scales continuously off stage 3's numbers
  // instead of hand-tuning forever - capped so it never turns into an
  // unwinnable or physics-breaking mess
  function endlessScale(stageNum) {
    return Math.min(1 + Math.max(0, stageNum - 3) * 0.12, 2.5);
  }
  function stagePhysicsMult(stageNum) {
    if (stageNum <= 2) return 1.0;
    if (stageNum === 3) return 1.15;
    return Math.min(1.15 * endlessScale(stageNum), 2.6);
  }
  function stageTargetScore(stageNum) {
    if (stageNum <= 1) return 150;
    if (stageNum === 2) return 220;
    if (stageNum === 3) return 300;
    return Math.round(300 * endlessScale(stageNum));
  }

  // ---- stage layouts ----

  function bumperLayoutStage1() {
    return [
      { x: 220, y: 150, r: 24, color: '#4fe3d0' },
      { x: 420, y: 150, r: 24, color: '#ff4fa3' },
      { x: 320, y: 235, r: 22, color: '#ffd24f' },
    ];
  }
  function bumperLayoutStage2() {
    // 4 bumpers in a wider diamond that opens a new lane straight down the middle
    return [
      { x: 320, y: 138, r: 22, color: '#ffd24f' },
      { x: 210, y: 195, r: 24, color: '#4fe3d0' },
      { x: 430, y: 195, r: 24, color: '#ff4fa3' },
      { x: 320, y: 270, r: 22, color: '#8f8fff' },
    ];
  }
  function bumperLayoutStage3() {
    // 5 bumpers in a tight central cluster - much less open space to coast through
    return [
      { x: 320, y: 140, r: 20, color: '#ffd24f' },
      { x: 250, y: 178, r: 22, color: '#4fe3d0' },
      { x: 390, y: 178, r: 22, color: '#ff4fa3' },
      { x: 288, y: 230, r: 20, color: '#8f8fff' },
      { x: 352, y: 230, r: 20, color: '#6bff6b' },
    ];
  }

  function targetLayoutStage1() {
    return [
      { x: 240, y: 60, w: 34, h: 14 },
      { x: 304, y: 60, w: 34, h: 14 },
      { x: 368, y: 60, w: 34, h: 14 },
    ];
  }
  function targetLayoutStage2() {
    // the original top row, plus a second lower "ramp" group of targets
    return [
      { x: 240, y: 60, w: 34, h: 14 },
      { x: 304, y: 60, w: 34, h: 14 },
      { x: 368, y: 60, w: 34, h: 14 },
      { x: 268, y: 155, w: 30, h: 14 },
      { x: 342, y: 155, w: 30, h: 14 },
    ];
  }
  function targetLayoutStage3() {
    // both rows again, tighter spacing and a 4th top target - the hardest gauntlet
    return [
      { x: 226, y: 55, w: 28, h: 14 },
      { x: 262, y: 55, w: 28, h: 14 },
      { x: 350, y: 55, w: 28, h: 14 },
      { x: 386, y: 55, w: 28, h: 14 },
      { x: 268, y: 150, w: 28, h: 14 },
      { x: 344, y: 150, w: 28, h: 14 },
    ];
  }

  function extraWallsForStage(stageNum) {
    if (stageNum <= 1) return [];
    // stage 2 and beyond (including every endless stage, since they all
    // reuse stage 3's table) add a short ramp guide under the second row
    // of targets - a small ramp-like ricochet feature the original table
    // didn't have
    return [{ x: 300, y: 100, w: 40, h: 8 }];
  }

  function layoutForStage(stageNum) {
    if (stageNum <= 1) return { bumpers: bumperLayoutStage1(), targets: targetLayoutStage1() };
    if (stageNum === 2) return { bumpers: bumperLayoutStage2(), targets: targetLayoutStage2() };
    // stage 3 AND every endless stage beyond it reuse this layout verbatim
    return { bumpers: bumperLayoutStage3(), targets: targetLayoutStage3() };
  }

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

  let balls, score, comboCount, comboTimer, popups, targets, bumpers, walls;
  let wallCooldown = 0;
  let plungerCharge = 0;
  let curStage = 1;
  let targetScore = stageTargetScore(1);

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
    sfx('explosion');
    shake(0.15, 4);
    popups.push({ x: 320, y: 210, text: 'MULTIBALL!', life: 1.3 });
    for (let i = 0; i < 2; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
      balls.push({ x: source.x, y: source.y, vx: Math.cos(ang) * 350, vy: Math.sin(ang) * 350, launched: true });
    }
    targets.forEach((t) => { t.alive = true; });
  }

  function circleRectBounce(b, dt) {
    wallCooldown = Math.max(0, wallCooldown - dt);
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
        const impactSpeed = Math.abs(vDotN);
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        b.vx *= 0.97; b.vy *= 0.97;
        // only a real, fast impact gets a sound/rumble - a ball resting or
        // rolling along a rail would otherwise spam the same sfx every frame
        if (impactSpeed > 160 && wallCooldown <= 0) {
          wallCooldown = 0.1;
          sfx('bounce');
          if (impactSpeed > 500) shake(0.05, 1.5);
        }
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
        const speed = Math.max(Math.hypot(b.vx, b.vy), 380 * stagePhysicsMult(curStage));
        const dir = normalize(b.vx, b.vy);
        b.vx = dir.x * speed;
        b.vy = dir.y * speed;
        bp.flash = 0.15;
        if (bp.cooldown <= 0) {
          bp.cooldown = 0.15;
          comboCount = comboTimer > 0 ? comboCount + 1 : 1;
          comboTimer = COMBO_WINDOW;
          // bonus escalates with the streak but is capped so one lucky bumper
          // rally can't blow past the stage's target score and trivialize the table
          const bonus = 10 + Math.min(comboCount - 1, 6) * 5;
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

  // ---- draw helpers (cosmetic only) ----

  function drawWall(ctx, w) {
    FX.chrome(ctx, w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
    // rivet studs along the rail
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const vertical = w.h > w.w;
    const span = vertical ? w.h : w.w;
    const count = Math.max(1, Math.floor(span / 42));
    for (let i = 1; i <= count; i++) {
      const t = (i * span) / (count + 1);
      const rx = vertical ? w.x + w.w / 2 : w.x + t;
      const ry = vertical ? w.y + t : w.y + w.h / 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(rx - 0.4, ry - 0.4, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
    }
  }

  function drawBumper(ctx, bp) {
    FX.shadow(ctx, bp.x, bp.y + bp.r * 0.7, bp.r * 0.9, bp.r * 0.3, 0.3);

    // metallic base rim
    const rim = ctx.createRadialGradient(bp.x, bp.y, bp.r * 0.75, bp.x, bp.y, bp.r * 1.2);
    rim.addColorStop(0, 'rgba(255,255,255,0.1)');
    rim.addColorStop(0.7, 'rgba(200,205,220,0.55)');
    rim.addColorStop(1, 'rgba(50,54,70,0.9)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r * 1.2, 0, Math.PI * 2);
    ctx.fill();

    FX.sphere(ctx, bp.x, bp.y, bp.r, bp.flash > 0 ? '#ffffff' : bp.color);

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(bp.x - bp.r * 0.3, bp.y - bp.r * 0.35, bp.r * 0.28, bp.r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlipper(ctx, f) {
    ctx.lineCap = 'round';

    // dark outline pass (wider, drawn under)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x, f.pivot.y);
    ctx.lineTo(f.tip.x, f.tip.y);
    ctx.stroke();

    // glossy metallic body
    const grad = ctx.createLinearGradient(f.pivot.x, f.pivot.y, f.tip.x, f.tip.y);
    grad.addColorStop(0, '#c4c9e4');
    grad.addColorStop(0.5, '#f8faff');
    grad.addColorStop(1, '#ced3ec');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x, f.pivot.y);
    ctx.lineTo(f.tip.x, f.tip.y);
    ctx.stroke();

    // specular streak along one edge
    const px = -f.dir.y * 3.2, py = f.dir.x * 3.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x - px, f.pivot.y - py);
    ctx.lineTo(f.tip.x - px, f.tip.y - py);
    ctx.stroke();

    // pivot rivet cap
    FX.sphere(ctx, f.pivot.x, f.pivot.y, 6, '#9098b8');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.pivot.x, f.pivot.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBall(ctx, ball) {
    FX.sphere(ctx, ball.x, ball.y, BALL_R, '#ffd24f');

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(ball.x - BALL_R * 0.35, ball.y - BALL_R * 0.4, BALL_R * 0.32, BALL_R * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
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
        const kick = flip.raiseVel * flip.length * 0.9 * stagePhysicsMult(curStage);
        b.vx += flip.dir.y * -kick * 0.4 + nx * kick * 0.6;
        b.vy += flip.dir.x * kick * 0.4 + ny * kick * 0.6;
        sfx('swing');
        shake(0.06, 2);
      } else {
        sfx('bounce');
      }
    }
  }

  return {
    init(stage = 1) {
      curStage = stage;
      targetScore = stageTargetScore(curStage);
      const layout = layoutForStage(curStage);
      bumpers = layout.bumpers.map((bp) => ({ ...bp, cooldown: 0, flash: 0 }));
      targets = layout.targets.map((t) => ({ ...t, alive: true }));
      walls = BASE_WALLS.concat(extraWallsForStage(curStage));

      balls = [{ x: START_POS.x, y: START_POS.y, vx: 0, vy: 0, launched: false }];
      flippers.left.raise = 0;
      flippers.right.raise = 0;
      score = 0;
      comboCount = 0;
      comboTimer = 0;
      popups = [];
      wallCooldown = 0;
      plungerCharge = 0;
    },

    update(dt) {
      const physMult = stagePhysicsMult(curStage);
      const gravity = GRAVITY_BASE * physMult;
      const maxSpeed = MAX_SPEED_BASE * physMult;

      flipperState(flippers.left, 'ArrowLeft', dt);
      flipperState(flippers.right, 'ArrowRight', dt);
      bumpers.forEach((bp) => { bp.flash = Math.max(0, (bp.flash || 0) - dt); });
      comboTimer = Math.max(0, comboTimer - dt);
      popups.forEach((p) => { p.y -= 25 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);

      balls.forEach((ball) => {
        if (!ball.launched) {
          // hold Space to pull back the plunger, release to fire - a quick
          // tap still gives the old baseline launch, holding it gives a
          // stronger, slightly more forward shot
          if (isDown('Space')) {
            plungerCharge = Math.min(1, plungerCharge + dt / 0.6);
          } else if (plungerCharge > 0) {
            const power = (560 + plungerCharge * 160) * physMult;
            ball.launched = true;
            ball.vx = -90 - plungerCharge * 30;
            ball.vy = -power;
            sfx('launch');
            plungerCharge = 0;
          }
          return;
        }

        ball.vy += gravity * dt;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > maxSpeed) {
          const s = maxSpeed / speed;
          ball.vx *= s; ball.vy *= s;
        }
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        circleRectBounce(ball, dt);
        bumperBounce(ball, dt);
        targetBounce(ball);
        flipperBounce(ball, flippers.left);
        flipperBounce(ball, flippers.right);

        // anti-stuck safety net: a ball wedged in a corner where two
        // surfaces keep reflecting it back and forth can end up with almost
        // no net movement despite constant gravity/velocity churn. If that
        // happens for too long, give it a small nudge free rather than
        // leaving the player stuck watching a jittering ball forever.
        ball._stuckT = (ball._stuckT || 0) + dt;
        if (ball._stuckSX === undefined) { ball._stuckSX = ball.x; ball._stuckSY = ball.y; }
        if (ball._stuckT > 0.6) {
          const moved = Math.hypot(ball.x - ball._stuckSX, ball.y - ball._stuckSY);
          if (moved < 6) {
            ball.vx += (Math.random() - 0.5) * 300;
            ball.vy -= 260;
          }
          ball._stuckSX = ball.x;
          ball._stuckSY = ball.y;
          ball._stuckT = 0;
        }
      });

      balls = balls.filter((ball) => !ball.launched || ball.y - BALL_R < H);

      if (balls.length === 0) {
        loseLife();
        return;
      }

      if (score >= targetScore) {
        const clearBonus = Math.round(30 + (curStage - 1) * 6);
        winLevel(clearBonus);
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, W, H);

      FX.gradientRect(ctx, 20, 8, 600, 462, '#1e2038', '#12121e');

      // faint brushed-felt streaks across the playfield
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const gx = 60 + i * 100;
        ctx.beginPath();
        ctx.moveTo(gx, 8);
        ctx.lineTo(gx - 40, 470);
        ctx.stroke();
      }

      walls.forEach((w) => {
        drawWall(ctx, w);
      });

      bumpers.forEach((bp) => {
        drawBumper(ctx, bp);
      });

      [flippers.left, flippers.right].forEach((f) => {
        drawFlipper(ctx, f);
      });

      targets.forEach((t) => {
        if (t.alive) {
          FX.bevelBlock(ctx, t.x, t.y, t.w, t.h, '#ff9a4f', 2);
          ctx.save();
          FX.roundRectPath(ctx, t.x, t.y, t.w, t.h, 2);
          ctx.clip();
          const g = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
          g.addColorStop(0, 'rgba(255,255,255,0.45)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
          g.addColorStop(1, 'rgba(0,0,0,0.2)');
          ctx.fillStyle = g;
          ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.restore();
        } else {
          FX.insetRect(ctx, t.x, t.y, t.w, t.h, '#3a2a20', 2);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(t.x + 0.75, t.y + 0.75, t.w - 1.5, t.h - 1.5);
      });

      if (balls.some((b) => !b.launched)) {
        ctx.fillStyle = '#7d86a3';
        ctx.font = '10px monospace';
        ctx.fillText(plungerCharge > 0 ? 'HOLD, THEN RELEASE!' : 'HOLD SPACE TO LAUNCH', 470, 400);
        // plunger charge meter
        const mx = 470, my = 410, mw = 90, mh = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
        if (plungerCharge > 0) {
          ctx.fillStyle = '#ffd24f';
          ctx.fillRect(mx + 1, my + 1, (mw - 2) * plungerCharge, mh - 2);
        }
      }

      balls.forEach((ball) => {
        drawBall(ctx, ball);
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
      ctx.fillText(`SCORE ${score} / ${targetScore}`, 24, 24);
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
