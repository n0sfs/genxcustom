function createSnakeLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 20;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const BASE_STEP = 0.11;
  const MIN_STEP = 0.058;
  const WIN_LENGTH = 16;
  const GOLDEN_LIFE = 4;
  const STREAK_WINDOW = 2.6;

  let snake, dir, nextDir, food, timer, alive, golden, goldenTimer, eatStreak, streakTimer;

  function randomFood() {
    let cell;
    do {
      cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
    return cell;
  }

  // Glossy 90s-mascot style body segment: gradient fill, mid-band shading
  // line to suggest a scale/joint, a soft specular glint, and a crisp dark
  // silhouette outline so the snake pops off the background.
  function drawSegment(ctx, x, y, size, color, radius) {
    FX.roundRectPath(ctx, x, y, size, size, radius);
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, FX.shade(color, 48));
    grad.addColorStop(0.42, color);
    grad.addColorStop(0.75, FX.shade(color, -18));
    grad.addColorStop(1, FX.shade(color, -42));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    FX.roundRectPath(ctx, x, y, size, size, radius);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + size * 0.58);
    ctx.lineTo(x + size - 2, y + size * 0.58);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.32, y + size * 0.3, size * 0.16, size * 0.09, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, radius);
    ctx.stroke();
  }

  return {
    init() {
      const startY = Math.floor(ROWS / 2);
      snake = [{ x: 6, y: startY }, { x: 5, y: startY }, { x: 4, y: startY }];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      food = randomFood();
      golden = false;
      goldenTimer = 0;
      eatStreak = 0;
      streakTimer = 0;
      timer = 0;
      alive = true;
    },

    update(dt) {
      if (!alive) return;

      if (isDown('ArrowRight', 'd') && dir.x !== -1) nextDir = { x: 1, y: 0 };
      else if (isDown('ArrowLeft', 'a') && dir.x !== 1) nextDir = { x: -1, y: 0 };
      else if (isDown('ArrowDown', 's') && dir.y !== -1) nextDir = { x: 0, y: 1 };
      else if (isDown('ArrowUp', 'w') && dir.y !== 1) nextDir = { x: 0, y: -1 };

      if (golden) {
        goldenTimer -= dt;
        if (goldenTimer <= 0) golden = false;
      }

      if (eatStreak > 0) {
        streakTimer -= dt;
        if (streakTimer <= 0) eatStreak = 0;
      }

      const stepTime = Math.max(MIN_STEP, BASE_STEP - snake.length * 0.0035);
      timer += dt;
      if (timer < stepTime) return;
      timer -= stepTime;

      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      const willEat = head.x === food.x && head.y === food.y;
      // Exclude the tail cell from the collision check when it isn't
      // growing this step — the tail vacates that cell in the same move,
      // so moving into it is legal (classic snake rule). Without this the
      // snake dies "for no reason" chasing its own tail.
      const body = willEat ? snake : snake.slice(0, -1);

      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
          body.some((s) => s.x === head.x && s.y === head.y)) {
        alive = false;
        sfx('hurt');
        shake(0.2, 5);
        loseLife();
        return;
      }

      snake.unshift(head);
      if (willEat) {
        streakTimer = STREAK_WINDOW;
        eatStreak++;
        const streakBonus = Math.min(eatStreak - 1, 8) * 2;
        addScore((golden ? 20 : 6) + streakBonus);
        sfx('pickup');
        if (eatStreak > 1 && eatStreak % 3 === 0) {
          sfx('jump');
          shake(0.12, 3);
        }
        if (snake.length % 4 === 0) shake(0.1, 2);
        if (snake.length >= WIN_LENGTH) {
          shake(0.25, 5);
          winLevel(40 + streakBonus);
          return;
        }
        food = randomFood();
        golden = Math.random() < 0.22;
        goldenTimer = GOLDEN_LIFE;
      } else {
        snake.pop();
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#08120a';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
      }

      const fcx = food.x * CELL + CELL / 2, fcy = food.y * CELL + CELL / 2;
      ctx.fillStyle = '#3a7a2a';
      ctx.fillRect(fcx - 1, food.y * CELL + 2, 2, 4);
      if (golden) {
        ctx.strokeStyle = `rgba(255, 210, 79, ${Math.max(0.2, goldenTimer / GOLDEN_LIFE)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fcx, fcy, CELL / 2, 0, Math.PI * 2 * (goldenTimer / GOLDEN_LIFE));
        ctx.stroke();
      }
      FX.sphere(ctx, fcx, fcy, CELL / 2 - 3, golden ? '#ffd24f' : '#ff4fa3');
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fcx, fcy, CELL / 2 - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(fcx - CELL * 0.13, fcy - CELL * 0.16, 1.8, 1, -0.5, 0, Math.PI * 2);
      ctx.fill();

      for (let i = snake.length - 1; i > 0; i--) {
        const s = snake[i];
        drawSegment(ctx, s.x * CELL + 1, s.y * CELL + 1, CELL - 2, i % 2 === 0 ? '#2f9e91' : '#4fe3d0', 3);
      }

      const head = snake[0];
      const hx = head.x * CELL, hy = head.y * CELL;
      drawSegment(ctx, hx + 1, hy + 1, CELL - 2, '#6bff6b', 5);

      const eo = 5;
      const ex1 = hx + CELL / 2 + (dir.y !== 0 ? -eo : dir.x * eo * 0.4);
      const ex2 = hx + CELL / 2 + (dir.y !== 0 ? eo : dir.x * eo * 0.4);
      const ey1 = hy + CELL / 2 + (dir.x !== 0 ? -eo : dir.y * eo * 0.4);
      const ey2 = hy + CELL / 2 + (dir.x !== 0 ? eo : dir.y * eo * 0.4);
      ctx.fillStyle = '#eafff0';
      ctx.beginPath();
      ctx.arc(ex1, ey1, 3, 0, Math.PI * 2);
      ctx.arc(ex2, ey2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f2a0f';
      ctx.beginPath();
      ctx.arc(ex1, ey1, 1.7, 0, Math.PI * 2);
      ctx.arc(ex2, ey2, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(ex1 - 0.6, ey1 - 0.6, 0.6, 0, Math.PI * 2);
      ctx.arc(ex2 - 0.6, ey2 - 0.6, 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`LENGTH ${snake.length}/${WIN_LENGTH}`, 8, 16);
      if (eatStreak >= 2) {
        ctx.fillStyle = '#ffd24f';
        ctx.fillText(`STREAK x${eatStreak}`, 8, 28);
      }
    },
  };
}
