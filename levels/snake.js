function createSnakeLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx } = api;

  const CELL = 20;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const BASE_STEP = 0.11;
  const MIN_STEP = 0.058;
  const WIN_LENGTH = 16;
  const GOLDEN_LIFE = 4;

  let snake, dir, nextDir, food, timer, alive, golden, goldenTimer;

  function randomFood() {
    let cell;
    do {
      cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
    return cell;
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

      const stepTime = Math.max(MIN_STEP, BASE_STEP - snake.length * 0.0035);
      timer += dt;
      if (timer < stepTime) return;
      timer -= stepTime;

      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
          snake.some((s) => s.x === head.x && s.y === head.y)) {
        alive = false;
        loseLife();
        return;
      }

      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        addScore(golden ? 20 : 6);
        sfx('pickup');
        if (snake.length >= WIN_LENGTH) {
          winLevel(40);
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
      ctx.fillStyle = golden ? '#ffd24f' : '#ff4fa3';
      ctx.beginPath();
      ctx.arc(fcx, fcy, CELL / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(fcx - 2, fcy - 2, 2, 0, Math.PI * 2);
      ctx.fill();

      for (let i = snake.length - 1; i > 0; i--) {
        const s = snake[i];
        ctx.fillStyle = i % 2 === 0 ? '#3ab8a8' : '#4fe3d0';
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      }

      const head = snake[0];
      const hx = head.x * CELL, hy = head.y * CELL;
      ctx.fillStyle = '#6bff6b';
      ctx.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = '#0f2a0f';
      const eo = 5;
      const ex1 = hx + CELL / 2 + (dir.y !== 0 ? -eo : dir.x * eo * 0.4);
      const ex2 = hx + CELL / 2 + (dir.y !== 0 ? eo : dir.x * eo * 0.4);
      const ey1 = hy + CELL / 2 + (dir.x !== 0 ? -eo : dir.y * eo * 0.4);
      const ey2 = hy + CELL / 2 + (dir.x !== 0 ? eo : dir.y * eo * 0.4);
      ctx.beginPath();
      ctx.arc(ex1, ey1, 2, 0, Math.PI * 2);
      ctx.arc(ex2, ey2, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`LENGTH ${snake.length}/${WIN_LENGTH}`, 8, 16);
    },
  };
}
