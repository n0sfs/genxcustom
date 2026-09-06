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

  let paddle, balls, bricks, particles, powerups, wideTimer, slowTimer;
  let comboCount, comboTimer, popups;
  let curStage = 1;
  let totalBricks = 0;

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
      color,
    }));
    totalBricks = bricks.length;
  }

  function burst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.3, color });
    }
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

    // dark silhouette outline
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5, 3);
    ctx.stroke();
  }

  function drawPaddle(ctx) {
    const baseColor = wideTimer > 0 ? '#8fffb0' : '#4fe3d0';
    const light = FX.shade(baseColor, 50);
    const dark = FX.shade(baseColor, -40);
    FX.shadow(ctx, paddle.x + paddle.w / 2, paddle.y + paddle.h + 4, paddle.w / 2, 3, 0.25);

    const g = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    g.addColorStop(0, light);
    g.addColorStop(0.5, baseColor);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    FX.roundRectPath(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 5);
    ctx.fill();

    // specular strip
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(paddle.x + 4, paddle.y + 1.5, paddle.w - 8, 2);

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
      particles = [];
      powerups = [];
      popups = [];
      wideTimer = 0;
      slowTimer = 0;
      comboCount = 0;
      comboTimer = 0;
    },

    update(dt) {
      wideTimer = Math.max(0, wideTimer - dt);
      slowTimer = Math.max(0, slowTimer - dt);
      comboTimer = Math.max(0, comboTimer - dt);
      if (comboTimer <= 0) comboCount = 0;
      paddle.w = currentPaddleWidth();

      if (isDown('ArrowLeft', 'a')) paddle.x -= paddle.speed * dt;
      if (isDown('ArrowRight', 'd')) paddle.x += paddle.speed * dt;
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

        if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx *= -1; sfx('bounce'); }
        if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx *= -1; sfx('bounce'); }
        if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy *= -1; sfx('bounce'); }

        if (circleRectOverlap(ball, BALL_R, paddle) && ball.vy > 0) {
          ball.y = paddle.y - BALL_R;
          const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          ball.vx = hitPos * 300;
          ball.vy = -Math.abs(ball.vy);
          sfx('bounce');
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
              // so the hit visibly registers before it finally breaks
              b.color = FX.shade(b.color, -22);
            }

            comboCount = comboTimer > 0 ? comboCount + 1 : 1;
            comboTimer = COMBO_WINDOW;
            const bonus = 8 + Math.min(comboCount - 1, 8) * 3;
            addScore(bonus);
            burst(b.x + b.w / 2, b.y + b.h / 2, b.color);
            sfx('hit');
            shake(0.04, 1.3);
            if (comboCount > 2) {
              popups.push({ x: b.x + b.w / 2, y: b.y, text: `x${comboCount} +${bonus}`, life: 0.5 });
            }

            if (destroyed) {
              const rowMates = bricks.filter((o) => o.y === b.y);
              if (rowMates.every((o) => !o.alive)) {
                addScore(25);
                sfx('explosion');
                shake(0.18, 5);
                popups.push({ x: b.x + b.w / 2, y: b.y - 10, text: 'ROW CLEAR +25', life: 0.9 });
                burst(b.x + b.w / 2, b.y + b.h / 2, b.color);
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

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);

      popups.forEach((p) => { p.y -= 22 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);

      if (bricks.every((b) => !b.alive)) {
        const clearBonus = Math.round(40 + (curStage - 1) * 8);
        winLevel(clearBonus);
      }
    },

    draw(ctx) {
      const [bgTop, bgBottom] = bgTheme(curStage);
      FX.gradientRect(ctx, 0, 0, W, H, bgTop, bgBottom);

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

      particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 0.3);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffe28a';
        ctx.globalAlpha = Math.max(0, p.life / 0.5);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';

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
