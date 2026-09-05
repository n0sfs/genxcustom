function createBreakoutLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const PADDLE_W = 80, PADDLE_H = 12;
  const BALL_R = 6;
  const ROWS = 5, COLS = 10;
  const BRICK_W = 56, BRICK_H = 18, BRICK_GAP = 6;
  const gridW = COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP;
  const startX = (W - gridW) / 2;
  const colors = ['#ff4fa3', '#ffd24f', '#4fe3d0', '#6bff6b', '#8f8fff'];
  const POWERUP_CHANCE = 0.18;
  const POWERUP_TYPES = [
    { key: 'W', label: 'WIDE', color: '#6bff6b' },
    { key: 'M', label: 'MULTI', color: '#ffd24f' },
    { key: 'S', label: 'SLOW', color: '#4fe3d0' },
  ];
  const COMBO_WINDOW = 0.9;
  const totalBricks = ROWS * COLS;

  let paddle, balls, bricks, particles, powerups, wideTimer, slowTimer;
  let comboCount, comboTimer, popups;

  function burst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.3, color });
    }
  }

  function makeBricks() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: startX + c * (BRICK_W + BRICK_GAP),
          y: 40 + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W, h: BRICK_H,
          alive: true,
          color: colors[r % colors.length],
        });
      }
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
    init() {
      paddle = { x: W / 2 - PADDLE_W / 2, y: H - 30, w: PADDLE_W, h: PADDLE_H, speed: 320 };
      makeBricks();
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

      // ball speed creeps up as the wall clears out, for an escalating arcade pace
      const aliveBricks = bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
      const destroyedFrac = 1 - aliveBricks / totalBricks;
      const progressMult = 1 + destroyedFrac * 0.35;
      const speedMult = (slowTimer > 0 ? 0.65 : 1) * progressMult;

      balls.forEach((ball) => {
        if (ball.attached) {
          ball.x = paddle.x + paddle.w / 2;
          ball.y = paddle.y - BALL_R - 1;
          if (isDown('Space', 'ArrowUp', 'w')) {
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
            b.alive = false;

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
        winLevel(40);
      }
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, '#0c1712', '#03060a');

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
