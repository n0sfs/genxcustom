function createBreakoutLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const PADDLE_W = 80, PADDLE_H = 12;
  const BALL_R = 6;
  const COLS = 10;
  const BRICK_W = 56, BRICK_H = 18, BRICK_GAP = 6;
  const gridW = COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP;
  const startX = (W - gridW) / 2;
  const colors = ['#ff4fa3', '#ffd24f', '#4fe3d0', '#6bff6b', '#8f8fff'];
  const TOUGH_COLOR = '#dfe6ff';
  const POWERUP_CHANCE = 0.18;
  const POWERUP_TYPES = [
    { key: 'W', label: 'WIDE', color: '#6bff6b' },
    { key: 'M', label: 'MULTI', color: '#ffd24f' },
    { key: 'S', label: 'SLOW', color: '#4fe3d0' },
  ];
  const COMBO_WINDOW = 0.9;

  // cheap per-stage cabinet-glow tint so each stage reads as "somewhere new"
  // without touching any gameplay or brick colors - stage 10's tint carries
  // into endless mode, same as the layout it reuses. Runs a loose
  // day -> dusk -> night -> storm -> dawn/inferno cycle across the 10
  // hand-built stages.
  const HAND_BUILT_STAGES = 10;
  const BG_THEMES = {
    1: ['#0c1712', '#03060a'], // dim workshop green
    2: ['#0c1424', '#03060a'], // cool blue-violet
    3: ['#1c0f14', '#050308'], // hot magenta-red
    4: ['#0d1a1a', '#03080a'], // deep teal dusk
    5: ['#1a1408', '#0a0503'], // amber dust storm
    6: ['#160c22', '#040308'], // violet twilight
    7: ['#10141c', '#03050a'], // stormy slate
    8: ['#220a0a', '#0a0202'], // crimson alert
    9: ['#0a0614', '#020104'], // void black-purple
    10: ['#2c0a06', '#0a0101'], // white-hot inferno - the toughest wall
  };
  function bgTheme(stageNum) {
    return BG_THEMES[Math.min(Math.max(stageNum, 1), HAND_BUILT_STAGES)];
  }

  let paddle, balls, bricks, powerups, wideTimer, slowTimer;
  let comboCount, comboTimer, floatTexts;
  let curStage = 1;
  let totalBricks = 0;
  let stars = [];
  let elapsed = 0;
  let flashTimer = 0, flashMax = 0, flashColor = '#fff', flashPeak = 0;

  // shared juice systems (fx.js) - created once per level instance, ticked
  // and drawn every frame; init() just clears them out on stage (re)start
  const fxParticles = FX.makeParticles(160);
  const floatText = FX.makeFloatText(28);

  function triggerFlash(color, duration, peak) {
    flashTimer = duration;
    flashMax = duration;
    flashColor = color;
    flashPeak = peak;
  }

  function spark(x, y, angle) {
    fxParticles.burst(x, y, 6, {
      colors: ['#ffffff', '#bfe8ff'],
      speedMin: 30, speedMax: 90,
      lifeMin: 0.15, lifeMax: 0.3,
      sizeMin: 1, sizeMax: 2.5,
      angle, spread: Math.PI * 0.7,
    });
  }

  function makeStars(n = 28) {
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (H * 0.6),
        r: 0.5 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.4,
      });
    }
  }

  // "ball speeds up as the wall clears" coefficient, hand-tuned per stage.
  // stage 11+ ("endless mode") scales continuously off of stage 10's numbers
  // instead of hand-tuning forever - capped so it never becomes unplayable
  function endlessScale(stageNum) {
    return Math.min(1 + Math.max(0, stageNum - HAND_BUILT_STAGES) * 0.12, 2.5);
  }

  // hand-tuned baseline for stages 1-10; endless mode (11+) scales the last
  // entry by endlessScale() below, capped at the same 3.2 ceiling that was
  // already tuned for this curve
  const STAGE_SPEED_MULT = [1.0, 1.15, 1.3, 1.42, 1.53, 1.64, 1.75, 1.86, 1.97, 2.08];
  function stageSpeedMult(stageNum) {
    const idx = Math.min(Math.max(stageNum, 1), HAND_BUILT_STAGES) - 1;
    if (stageNum <= HAND_BUILT_STAGES) return STAGE_SPEED_MULT[idx];
    return Math.min(STAGE_SPEED_MULT[STAGE_SPEED_MULT.length - 1] * endlessScale(stageNum), 3.2);
  }

  // "ball speeds up as the wall clears" coefficient, hand-tuned per stage.
  // Past stage 10 this stays FLAT at stage 10's value rather than climbing
  // further - stageSpeedMult() above already carries the endless-mode ramp
  // (with its own explicit cap), so multiplying two independently-growing
  // endless curves together would blow well past that cap: a ball nearing a
  // full clear could hit far more than the intended ~3.2x baseline speed,
  // right as the player is about to win the stage.
  const STAGE_PROGRESS_COEFF = [0.35, 0.42, 0.5, 0.56, 0.62, 0.68, 0.74, 0.80, 0.86, 0.92];
  function stageProgressCoeff(stageNum) {
    const idx = Math.min(Math.max(stageNum, 1), HAND_BUILT_STAGES) - 1;
    return STAGE_PROGRESS_COEFF[idx];
  }

  // ---- stage layouts: (row, col) grids that get turned into brick objects ----

  function layoutStage1() {
    // the original full 5x10 wall - untouched default
    const list = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < COLS; c++) {
        list.push({ r, c, hp: 1, color: colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage2() {
    // 6 rows with "window" gaps punched into every odd row, and a tough
    // 2-hit shield along the top 2 rows - a genuinely different shape to
    // fight through, not just the same wall sped up
    const list = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r % 2 === 1 && (c === 2 || c === 3 || c === 6 || c === 7)) continue;
        const tough = r < 2;
        list.push({ r, c, hp: tough ? 2 : 1, color: tough ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage3() {
    // 7 rows, almost solid - only a narrow 2-brick slit dead center for the
    // ball to sneak through - plus a checkerboard of 2-hit bricks, denser
    // and tougher than stage 2
    const list = [];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 3 && (c === 4 || c === 5)) continue;
        const tough = (r + c) % 3 === 0;
        list.push({ r, c, hp: tough ? 2 : 1, color: tough ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage4() {
    // 9-row diamond formation, narrow at top and bottom and full-width
    // through the middle, with a thick 2-hit band tracing the diamond's
    // outer edges around a softer 1-hit core
    const list = [];
    const rows = 9, centerCol = (COLS - 1) / 2;
    for (let r = 0; r < rows; r++) {
      const halfWidth = 5 - Math.abs(r - 4);
      for (let c = 0; c < COLS; c++) {
        const dist = Math.abs(c - centerCol);
        if (dist >= halfWidth) continue;
        const tough = dist >= halfWidth - 2;
        list.push({ r, c, hp: tough ? 2 : 1, color: tough ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage5() {
    // 8-row stepped pyramid - width grows in blocky 2-row steps rather than
    // a smooth diagonal, capped with a reinforced 2-hit base
    const list = [];
    const rows = 8, centerCol = (COLS - 1) / 2;
    for (let r = 0; r < rows; r++) {
      const halfWidth = 2 + Math.floor(r / 2);
      for (let c = 0; c < COLS; c++) {
        const dist = Math.abs(c - centerCol);
        if (dist >= halfWidth) continue;
        const base = r >= rows - 2;
        list.push({ r, c, hp: base ? 2 : 1, color: base ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage6() {
    // fortress: a solid roof, 3-hit reinforced corner towers, and an open
    // lane straight down the middle once the roof is breached
    const list = [];
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r > 0 && (c === 4 || c === 5)) continue; // open center lane below the roof
        const corner = (r < 2 || r >= rows - 2) && (c < 2 || c >= COLS - 2);
        list.push({ r, c, hp: corner ? 3 : 1, color: corner ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage7() {
    // checkerboard of gaps - the ball has empty pockets to slip through,
    // but roughly half of what remains is a 2-hit tank, so sloppy hits
    // barely dent the wall
    const list = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((r + c) % 2 === 0) continue; // checkerboard gap
        const tough = (r + c) % 4 === 1;
        list.push({ r, c, hp: tough ? 2 : 1, color: tough ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage8() {
    // zigzag corridor - a single-column gap snakes back and forth across
    // the full width of the wall, bordered by 2-hit bricks, forcing precise
    // angled shots to thread it
    const list = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const period = 8;
      const tri = Math.abs(((r % period) + period) % period - period / 2); // 0..4 triangle wave
      const gapCol = 1 + tri * 2; // sweeps between col 1 and col 9
      for (let c = 0; c < COLS; c++) {
        if (c === gapCol) continue;
        const border = c === gapCol - 1 || c === gapCol + 1;
        list.push({ r, c, hp: border ? 2 : 1, color: border ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage9() {
    // wall with windows - regular 2-hi punch-outs give the ball entry
    // points, but most of what's left standing is now 2-hit reinforced
    const list = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const isWindow = (r % 4 === 1 || r % 4 === 2) && (c % 4 === 1 || c % 4 === 2);
        if (isWindow) continue;
        const tough = (r + c) % 3 !== 0; // roughly two-thirds reinforced
        list.push({ r, c, hp: tough ? 2 : 1, color: tough ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  function layoutStage10() {
    // the final wall: dense, mostly 2-hit reinforced, a single zigzag path
    // to sneak through, and four 4-hit "boss" blocks anchoring the corners
    // - the toughest hand-built stage, but still clearable by a steady,
    // well-aimed player
    const list = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const period = 8;
      const tri = Math.abs(((r % period) + period) % period - period / 2);
      const gapCol = 1 + tri * 2;
      for (let c = 0; c < COLS; c++) {
        if (c === gapCol) continue;
        const isBoss = (r < 2 || r >= rows - 2) && (c < 2 || c >= COLS - 2);
        const tough = !isBoss && (r + c) % 2 === 0;
        const hp = isBoss ? 4 : tough ? 2 : 1;
        list.push({ r, c, hp, color: isBoss ? TOUGH_COLOR : colors[r % colors.length] });
      }
    }
    return list;
  }

  const LAYOUT_FNS = [
    layoutStage1, layoutStage2, layoutStage3, layoutStage4, layoutStage5,
    layoutStage6, layoutStage7, layoutStage8, layoutStage9, layoutStage10,
  ];

  function makeBricks(stageNum) {
    const idx = Math.min(Math.max(stageNum, 1), HAND_BUILT_STAGES) - 1;
    const layout = LAYOUT_FNS[idx]();

    // endless mode reuses stage 10's layout verbatim but piles extra hit
    // points onto every brick as the stage climbs
    const scale = endlessScale(stageNum);
    const extraHp = stageNum > HAND_BUILT_STAGES ? Math.floor((scale - 1) * 2.2) : 0;

    bricks = layout.map(({ r, c, hp, color }) => ({
      x: startX + c * (BRICK_W + BRICK_GAP),
      y: 40 + r * (BRICK_H + BRICK_GAP),
      w: BRICK_W, h: BRICK_H,
      alive: true,
      hp: hp + extraHp,
      maxHp: hp + extraHp,
      cracks: [],
      color,
    }));
    totalBricks = bricks.length;
  }

  // stores a stable jagged crack line on a damaged (but still standing)
  // brick, so the damage reads as a growing fracture rather than a flicker
  function addCrack(b) {
    const edge = Math.floor(Math.random() * 4);
    let sx, sy;
    if (edge === 0) { sx = b.x + Math.random() * b.w; sy = b.y; }
    else if (edge === 1) { sx = b.x + b.w; sy = b.y + Math.random() * b.h; }
    else if (edge === 2) { sx = b.x + Math.random() * b.w; sy = b.y + b.h; }
    else { sx = b.x; sy = b.y + Math.random() * b.h; }
    const ex = b.x + b.w / 2 + (Math.random() - 0.5) * b.w * 0.4;
    const ey = b.y + b.h / 2 + (Math.random() - 0.5) * b.h * 0.4;
    const mx = (sx + ex) / 2 + (Math.random() - 0.5) * 6;
    const my = (sy + ey) / 2 + (Math.random() - 0.5) * 6;
    b.cracks.push({ sx, sy, mx, my, ex, ey });
  }

  function resetBalls() {
    balls = [{ x: paddle.x + paddle.w / 2, y: paddle.y - BALL_R - 1, vx: 0, vy: 0, attached: true }];
  }

  function currentPaddleWidth() {
    return wideTimer > 0 ? PADDLE_W * 1.5 : PADDLE_W;
  }

  // ---- draw helpers (cosmetic only) ----

  function drawBrick(ctx, b) {
    const light = FX.shade(b.color, 50);
    const mid = FX.shade(b.color, 6);
    const dark = FX.shade(b.color, -45);
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, light);
    g.addColorStop(0.45, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    FX.roundRectPath(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.fill();

    // glossy highlight band across the top
    ctx.save();
    FX.roundRectPath(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.clip();
    const shine = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h * 0.55);
    shine.addColorStop(0, 'rgba(255,255,255,0.45)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(b.x, b.y, b.w, b.h * 0.55);
    ctx.restore();

    // faint mortar seam down the middle
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y + 3);
    ctx.lineTo(b.x + b.w / 2, b.y + b.h - 3);
    ctx.stroke();

    // damage cracks - grows as a multi-hit brick takes punishment
    if (b.cracks && b.cracks.length) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      b.cracks.forEach((c) => {
        ctx.beginPath();
        ctx.moveTo(c.sx, c.sy);
        ctx.lineTo(c.mx, c.my);
        ctx.lineTo(c.ex, c.ey);
        ctx.stroke();
      });
    }

    // dark silhouette outline
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5, 3);
    ctx.stroke();
  }

  function drawPaddle(ctx) {
    const active = wideTimer > 0 || slowTimer > 0;
    const baseColor = wideTimer > 0 ? '#8fffb0' : slowTimer > 0 ? '#bfe8ff' : '#4fe3d0';
    FX.shadow(ctx, paddle.x + paddle.w / 2, paddle.y + paddle.h + 4, paddle.w / 2, 3, 0.25);

    // pulsing glow while a powerup timer is active
    if (active) {
      const pulse = 0.4 + 0.3 * Math.sin(elapsed * 7);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = baseColor;
      FX.roundRectPath(ctx, paddle.x - 4, paddle.y - 4, paddle.w + 8, paddle.h + 8, 8);
      ctx.fill();
      ctx.restore();
    }

    // solid chrome/metal bar: brushed-steel base blended with a color tint
    ctx.save();
    FX.roundRectPath(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 5);
    ctx.clip();
    FX.chrome(ctx, paddle.x, paddle.y, paddle.w, paddle.h);
    const tint = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    tint.addColorStop(0, FX.shade(baseColor, 45));
    tint.addColorStop(0.5, baseColor);
    tint.addColorStop(1, FX.shade(baseColor, -45));
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = tint;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.globalAlpha = 1;
    ctx.restore();

    // chrome rim light along the top edge
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(paddle.x + 4, paddle.y + 1, paddle.w - 8, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(paddle.x + 4, paddle.y + 3, paddle.w - 8, 1);

    // chrome end caps (rivets)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(paddle.x + 5, paddle.y + paddle.h / 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(paddle.x + paddle.w - 5, paddle.y + paddle.h / 2, 2, 0, Math.PI * 2); ctx.fill();

    // dark silhouette outline
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, paddle.x + 0.75, paddle.y + 0.75, paddle.w - 1.5, paddle.h - 1.5, 5);
    ctx.stroke();
  }

  function drawBall(ctx, ball) {
    const color = slowTimer > 0 ? '#bfe8ff' : '#ffd24f';
    FX.sphere(ctx, ball.x, ball.y, BALL_R, color);

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

  return {
    init(stage = 1) {
      curStage = stage;
      paddle = { x: W / 2 - PADDLE_W / 2, y: H - 30, w: PADDLE_W, h: PADDLE_H, speed: 320 };
      makeBricks(curStage);
      resetBalls();
      powerups = [];
      wideTimer = 0;
      slowTimer = 0;
      comboCount = 0;
      comboTimer = 0;
      elapsed = 0;
      flashTimer = 0;
      fxParticles.clear();
      floatText.clear();
      makeStars();
    },

    update(dt) {
      elapsed += dt;
      wideTimer = Math.max(0, wideTimer - dt);
      slowTimer = Math.max(0, slowTimer - dt);
      comboTimer = Math.max(0, comboTimer - dt);
      flashTimer = Math.max(0, flashTimer - dt);
      if (comboTimer <= 0) comboCount = 0;
      paddle.w = currentPaddleWidth();

      // keyboard/touch d-pad take priority for any frame they're actively
      // pressed; otherwise the paddle tracks the mouse cursor directly
      // (classic Arkanoid-style control) regardless of button state
      const keyLeft = isDown('ArrowLeft', 'a');
      const keyRight = isDown('ArrowRight', 'd');
      if (keyLeft) paddle.x -= paddle.speed * dt;
      if (keyRight) paddle.x += paddle.speed * dt;
      if (!keyLeft && !keyRight) paddle.x = api.mouseX - paddle.w / 2;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

      // ball speed creeps up as the wall clears out, for an escalating arcade pace;
      // the stage baseline (and, past stage 3, the endless-mode scale) stacks on top
      const aliveBricks = bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
      const destroyedFrac = 1 - aliveBricks / totalBricks;
      const progressMult = 1 + destroyedFrac * stageProgressCoeff(curStage);
      const speedMult = (slowTimer > 0 ? 0.65 : 1) * stageSpeedMult(curStage) * progressMult;

      balls.forEach((ball) => {
        if (ball.attached) {
          ball.x = paddle.x + paddle.w / 2;
          ball.y = paddle.y - BALL_R - 1;
          if (isDown('Space', 'ArrowUp', 'w')) {
            // base launch velocity stays fixed - the per-frame speedMult below
            // (which already folds in the stage baseline) is what actually
            // makes higher stages feel faster, so this must not double it up
            ball.attached = false;
            ball.vx = 180 * (Math.random() < 0.5 ? -1 : 1);
            ball.vy = -320;
            sfx('launch');
          }
          return;
        }

        ball.x += ball.vx * dt * speedMult;
        ball.y += ball.vy * dt * speedMult;

        // faint fading afterimage trail once the ball is moving fast -
        // pure cosmetic motion cue, reuses the shared particle pool
        const realSpeed = Math.hypot(ball.vx, ball.vy) * speedMult;
        if (realSpeed > 340) {
          fxParticles.spawn(ball.x, ball.y, {
            vx: 0, vy: 0, life: 0.12,
            size: BALL_R * 1.4,
            color: slowTimer > 0 ? '#bfe8ff' : '#ffd24f',
            fade: true, shrink: true,
          });
        }

        if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx *= -1; sfx('bounce'); spark(ball.x, ball.y, Math.PI); }
        if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx *= -1; sfx('bounce'); spark(ball.x, ball.y, 0); }
        if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy *= -1; sfx('bounce'); spark(ball.x, ball.y, Math.PI / 2); }

        if (circleRectOverlap(ball, BALL_R, paddle) && ball.vy > 0) {
          ball.y = paddle.y - BALL_R;
          const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          ball.vx = hitPos * 300;
          ball.vy = -Math.abs(ball.vy);
          sfx('bounce');
          spark(ball.x, ball.y, -Math.PI / 2);
        }

        for (const b of bricks) {
          if (!b.alive) continue;
          if (circleRectOverlap(ball, BALL_R, b)) {
            b.hp -= 1;
            const destroyed = b.hp <= 0;
            if (destroyed) {
              b.alive = false;
            } else {
              // still standing (a tough multi-hit brick) - darken it a shade
              // and etch a fresh crack so the hit visibly registers before
              // it finally breaks
              b.color = FX.shade(b.color, -22);
              addCrack(b);
            }

            comboCount = comboTimer > 0 ? comboCount + 1 : 1;
            comboTimer = COMBO_WINDOW;
            const bonus = 8 + Math.min(comboCount - 1, 8) * 3;
            addScore(bonus);

            // debris burst tinted to the brick's own color, plus a floating
            // score number for every hit; combo streaks get louder colors
            const comboColor = comboCount > 8 ? '#ff6b6b' : comboCount > 5 ? '#ff9f4f' : comboCount > 2 ? '#ffd24f' : '#ffe28a';
            fxParticles.burst(b.x + b.w / 2, b.y + b.h / 2, 9, {
              colors: [b.color, FX.shade(b.color, 45), FX.shade(b.color, -30)],
              speedMin: 50, speedMax: 170,
              lifeMin: 0.25, lifeMax: 0.5,
              sizeMin: 2, sizeMax: 4,
              gravity: 260,
            });
            floatText.spawn(b.x + b.w / 2, b.y + b.h / 2, `+${bonus}`, comboColor, { life: 0.45, vy: -34, size: comboCount > 2 ? 10 : 8 });
            sfx('hit');
            shake(0.04, 1.3);
            if (comboCount > 2) {
              floatText.spawn(b.x + b.w / 2, b.y - 6, `COMBO x${comboCount}`, comboColor, { life: 0.55, vy: -26, size: 9 });
            }

            if (destroyed) {
              const rowMates = bricks.filter((o) => o.y === b.y);
              if (rowMates.every((o) => !o.alive)) {
                addScore(25);
                sfx('explosion');
                shake(0.18, 5);
                floatText.spawn(b.x + b.w / 2, b.y - 10, 'ROW CLEAR +25', '#8fffb0', { life: 0.9, vy: -22, size: 10 });
                fxParticles.burst(b.x + b.w / 2, b.y + b.h / 2, 14, {
                  colors: [b.color, '#ffffff'],
                  speedMin: 60, speedMax: 200,
                  lifeMin: 0.3, lifeMax: 0.6,
                  sizeMin: 2, sizeMax: 5,
                  gravity: 220,
                });
              }

              if (Math.random() < POWERUP_CHANCE) {
                const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
                powerups.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vy: 110, ...type });
              }
            }
            const overlapLeft = Math.abs(ball.x - b.x);
            const overlapRight = Math.abs(ball.x - (b.x + b.w));
            const overlapTop = Math.abs(ball.y - b.y);
            const overlapBottom = Math.abs(ball.y - (b.y + b.h));
            const min = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            if (min === overlapLeft || min === overlapRight) ball.vx *= -1;
            else ball.vy *= -1;
            break;
          }
        }
      });
      const ballsBefore = balls.length;
      balls = balls.filter((ball) => ball.attached || ball.y - BALL_R < H);

      if (balls.length === 0) {
        comboCount = 0;
        comboTimer = 0;
        triggerFlash('#ff3b3b', 0.3, 0.4);
        shake(0.15, 4);
        loseLife();
        return;
      }

      // dropping a ball breaks the streak even if other balls (multiball) are still alive
      if (balls.length < ballsBefore) {
        comboCount = 0;
        comboTimer = 0;
      }

      powerups.forEach((p) => { p.y += p.vy * dt; });
      powerups = powerups.filter((p) => {
        if (p.y > paddle.y && p.y < paddle.y + paddle.h && p.x > paddle.x - 10 && p.x < paddle.x + paddle.w + 10) {
          sfx('pickup');
          shake(0.06, 2);
          addScore(5);
          fxParticles.burst(p.x, p.y, 10, {
            colors: [p.color, '#ffffff'],
            speedMin: 60, speedMax: 160,
            lifeMin: 0.25, lifeMax: 0.5,
            sizeMin: 2, sizeMax: 4,
          });
          floatText.spawn(p.x, p.y - 4, p.label, p.color, { life: 0.5, vy: -30, size: 9 });
          if (p.key === 'W') wideTimer = 12;
          else if (p.key === 'S') slowTimer = 8;
          else if (p.key === 'M') {
            const extra = balls.filter((b) => !b.attached).slice(0, 2).map((b) => ({
              x: b.x, y: b.y, attached: false,
              vx: -b.vx || (Math.random() < 0.5 ? -160 : 160),
              vy: b.vy || -320,
            }));
            extra.forEach((b) => {
              const ang = (Math.random() - 0.5) * 0.6;
              const speed = Math.hypot(b.vx, b.vy) || 300;
              b.vx = Math.sin(ang) * speed;
              b.vy = -Math.abs(Math.cos(ang) * speed);
            });
            balls.push(...extra);
          }
          return false;
        }
        return p.y < H + 20;
      });

      fxParticles.update(dt);
      floatText.update(dt);

      if (bricks.every((b) => !b.alive)) {
        const clearBonus = Math.round(40 + (curStage - 1) * 8);
        // wall-clear celebration: a shower of debris across the cleared
        // field plus a bright flash, right before handing off to winLevel
        for (let i = 0; i < 8; i++) {
          const rx = startX + Math.random() * gridW;
          const ry = 30 + Math.random() * 200;
          fxParticles.burst(rx, ry, 10, {
            colors: colors.concat(TOUGH_COLOR),
            speedMin: 60, speedMax: 220,
            lifeMin: 0.4, lifeMax: 0.9,
            sizeMin: 2, sizeMax: 5,
            gravity: 140,
          });
        }
        floatText.spawn(W / 2, H / 2 - 20, 'WALL CLEAR!', '#ffe28a', { life: 1.0, vy: -18, size: 16 });
        triggerFlash('#ffffff', 0.35, 0.5);
        shake(0.22, 5);
        winLevel(clearBonus);
      }
    },

    draw(ctx) {
      const [bgTop, bgBottom] = bgTheme(curStage);
      FX.gradientRect(ctx, 0, 0, W, H, bgTop, bgBottom);

      // faint twinkling starfield behind the brick field for cabinet-glow ambience
      stars.forEach((s) => {
        const tw = 0.12 + 0.15 * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase));
        ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // steel cabinet rails along the play boundary
      FX.chrome(ctx, 0, 0, 6, H);
      FX.chrome(ctx, W - 6, 0, 6, H);
      FX.chrome(ctx, 0, 0, W, 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6.5, 0); ctx.lineTo(6.5, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - 6.5, 0); ctx.lineTo(W - 6.5, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 6.5); ctx.lineTo(W, 6.5); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i <= 6; i++) {
        const rx = (i * W) / 7;
        ctx.beginPath(); ctx.arc(rx, 3, 1.4, 0, Math.PI * 2); ctx.fill();
      }

      bricks.forEach((b) => {
        if (!b.alive) return;
        drawBrick(ctx, b);
      });

      powerups.forEach((p) => {
        // pulsing glow halo so pickups read as "alive" while they fall
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6 + p.x * 0.05);
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.25 * pulse;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12 + pulse * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        FX.sphere(ctx, p.x, p.y, 9, p.color);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#0a0a0a';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.key, p.x, p.y + 3);
        ctx.textAlign = 'left';
      });

      drawPaddle(ctx);

      balls.forEach((ball) => {
        drawBall(ctx, ball);
      });

      fxParticles.draw(ctx);
      floatText.draw(ctx);

      if (comboTimer > 0 && comboCount > 2) {
        ctx.fillStyle = '#ffd24f';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`COMBO x${comboCount}`, 12, 20);
      }

      if (balls.some((b) => b.attached)) {
        ctx.fillStyle = '#9aa3c0';
        ctx.font = '9px monospace';
        ctx.fillText('PRESS SPACE TO LAUNCH', W / 2 - 78, H / 2);
      }

      if (flashTimer > 0) {
        FX.flash(ctx, W, H, flashColor, flashPeak * (flashTimer / flashMax));
      }
    },
  };
}

function circleRectOverlap(circle, r, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < r * r;
}
