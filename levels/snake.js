function createSnakeLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 20;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const BASE_STEP = 0.11;
  const MIN_STEP = 0.058;
  const ABS_MIN_STEP = 0.03;
  const WIN_LENGTH = 16;
  const GOLDEN_LIFE = 4;
  const STREAK_WINDOW = 2.6;
  const ENDLESS_CAP = 2.6;

  let snake, dir, nextDir, food, timer, alive, golden, goldenTimer, eatStreak, streakTimer;
  let walls, wallSet, inset, speedMult, winLength;

  // A hollow-diamond cluster of wall cells centered on (cx, cy) — a
  // recognizable static obstacle shape, not just a random blob.
  function diamond(cx, cy) {
    return [
      { x: cx - 2, y: cy }, { x: cx + 2, y: cy },
      { x: cx, y: cy - 2 }, { x: cx, y: cy + 2 },
      { x: cx - 1, y: cy - 1 }, { x: cx + 1, y: cy - 1 },
      { x: cx - 1, y: cy + 1 }, { x: cx + 1, y: cy + 1 },
    ];
  }

  // Fills out an obstacle list to `count` cells with extra scattered single
  // blocks (used by endless mode once the hand-built stage-3 layout stops
  // being "enough"), staying clear of the spawn column and board edges.
  function scatterExtra(base, count, insetAmt) {
    const list = [...base];
    const taken = new Set(list.map((c) => c.x + ',' + c.y));
    let guard = 0;
    while (list.length < count && guard < count * 40) {
      guard++;
      const x = insetAmt + 3 + Math.floor(Math.random() * (COLS - 2 * insetAmt - 6));
      const y = insetAmt + 1 + Math.floor(Math.random() * (ROWS - 2 * insetAmt - 2));
      const key = x + ',' + y;
      if (taken.has(key) || (x <= 8 && y >= 9 && y <= 15)) continue; // keep spawn area clear
      taken.add(key);
      list.push({ x, y });
    }
    return list;
  }

  // Stage config: 3 hand-built stages, then a smooth endless ramp reusing
  // stage 3's layout as its base.
  function stageConfig(stage) {
    const s = Math.max(1, Math.floor(stage));
    if (s === 1) {
      return { speedMult: 1, walls: [], inset: 0, winLength: WIN_LENGTH };
    }
    if (s === 2) {
      return { speedMult: 1.25, walls: diamond(20, 12), inset: 0, winLength: WIN_LENGTH + 4 };
    }
    if (s === 3) {
      return {
        speedMult: 1.5,
        walls: [...diamond(10, 8), ...diamond(23, 16), { x: 16, y: 4 }, { x: 16, y: 19 }],
        inset: 2, // smaller effective play area — a 2-cell margin becomes solid
        winLength: WIN_LENGTH + 8,
      };
    }
    // Endless mode: stage 3 as the base, scaled continuously and capped so
    // it never becomes literally unplayable.
    const scale = Math.min(1 + (s - 3) * 0.12, ENDLESS_CAP);
    const base = [...diamond(10, 8), ...diamond(23, 16), { x: 16, y: 4 }, { x: 16, y: 19 }];
    const targetCount = Math.min(Math.round(base.length * scale), Math.floor(COLS * ROWS * 0.12));
    return {
      speedMult: Math.min(1.5 * scale, 3), // absolute cap: never faster than 3x stage-1 speed
      walls: scatterExtra(base, targetCount, 2),
      inset: 2,
      winLength: Math.min(WIN_LENGTH + 8 + Math.round((s - 3) * 2), 80),
    };
  }

  function randomFood() {
    let cell;
    let guard = 0;
    do {
      cell = {
        x: inset + Math.floor(Math.random() * (COLS - 2 * inset)),
        y: inset + Math.floor(Math.random() * (ROWS - 2 * inset)),
      };
      guard++;
    } while (guard < 500 && (wallSet.has(cell.x + ',' + cell.y) || snake.some((s) => s.x === cell.x && s.y === cell.y)));
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
    init(stage = 1) {
      const cfg = stageConfig(stage);
      speedMult = cfg.speedMult;
      inset = cfg.inset;
      winLength = cfg.winLength;
      walls = cfg.walls;
      wallSet = new Set(walls.map((w) => w.x + ',' + w.y));

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

      const effBase = BASE_STEP / speedMult;
      const effMin = Math.max(ABS_MIN_STEP, MIN_STEP / speedMult);
      const stepTime = Math.max(effMin, effBase - snake.length * 0.0035);
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

      if (head.x < inset || head.x >= COLS - inset || head.y < inset || head.y >= ROWS - inset ||
          wallSet.has(head.x + ',' + head.y) ||
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
        if (snake.length >= winLength) {
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

      if (inset > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, inset * CELL);
        ctx.fillRect(0, H - inset * CELL, W, inset * CELL);
        ctx.fillRect(0, 0, inset * CELL, H);
        ctx.fillRect(W - inset * CELL, 0, inset * CELL, H);
      }
      walls.forEach((wcell) => {
        FX.bevelBlock(ctx, wcell.x * CELL + 1, wcell.y * CELL + 1, CELL - 2, CELL - 2, '#5a4a3a', 2);
      });

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
      ctx.fillText(`LENGTH ${snake.length}/${winLength}`, 8, 16);
      if (eatStreak >= 2) {
        ctx.fillStyle = '#ffd24f';
        ctx.fillText(`STREAK x${eatStreak}`, 8, 28);
      }
    },
  };
}
