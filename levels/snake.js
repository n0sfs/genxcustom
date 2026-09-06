function createSnakeLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 20;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const BASE_STEP = 0.11;
  const MIN_STEP = 0.058;
  // Hard floor on tick period regardless of stage/speedMult. Endless mode's
  // speedMult saturates by stage ~6 (see stageConfig), and length-based
  // speedup saturates the tick rate to this floor shortly after that — so
  // this constant is really "the fastest the game will ever move." At 0.03
  // that was 33 ticks/sec (~1.8 frames at 60fps between moves): not just an
  // early plateau but a ceiling fast enough to outrun realistic reaction
  // time. 0.045 (~22 ticks/sec, ~2.7 frames) keeps endless mode tense while
  // staying humanly reactable; stages 1-2 never approach this floor and
  // stage 3 only grazes it in its last couple of food pickups.
  const ABS_MIN_STEP = 0.045;
  const WIN_LENGTH = 16;
  const GOLDEN_LIFE = 4;
  const STREAK_WINDOW = 2.6;
  const ENDLESS_CAP = 2.6;

  let snake, dir, nextDir, food, timer, alive, golden, goldenTimer, eatStreak, streakTimer;
  let walls, wallSet, inset, speedMult, winLength, theme;

  // Cheap per-stage palette swap (background/grid/wall tint only — same
  // draw calls, just different colors) so each hand-built stage reads as a
  // different "place": a mellow meadow, then a warmer cavern, a cool neon
  // night, then progressively more exotic locales as the obstacle courses
  // escalate through stage 10. Endless mode reuses stage 10's ('void')
  // palette since it's built on stage 10's layout.
  const THEMES = {
    meadow: { bg: '#08120a', grid: 'rgba(180,255,180,0.035)', wall: '#5a4a3a', inset: 'rgba(0,0,0,0.55)' },
    cavern: { bg: '#140d08', grid: 'rgba(255,200,140,0.035)', wall: '#6b5636', inset: 'rgba(25,12,0,0.55)' },
    night: { bg: '#05060f', grid: 'rgba(140,190,255,0.035)', wall: '#3d4568', inset: 'rgba(0,8,28,0.55)' },
    ember: { bg: '#1a0805', grid: 'rgba(255,150,90,0.035)', wall: '#8a4a2a', inset: 'rgba(40,10,0,0.55)' },
    aqua: { bg: '#02141a', grid: 'rgba(120,220,255,0.035)', wall: '#2f6b7a', inset: 'rgba(0,25,35,0.55)' },
    dusk: { bg: '#160a1c', grid: 'rgba(220,150,255,0.035)', wall: '#6b3d7a', inset: 'rgba(25,0,35,0.55)' },
    storm: { bg: '#0c1018', grid: 'rgba(170,190,220,0.035)', wall: '#4a5568', inset: 'rgba(5,10,20,0.55)' },
    circuit: { bg: '#04160a', grid: 'rgba(120,255,160,0.035)', wall: '#2f7a4a', inset: 'rgba(0,30,10,0.55)' },
    fortress: { bg: '#12100c', grid: 'rgba(220,210,180,0.035)', wall: '#7a715a', inset: 'rgba(20,18,10,0.55)' },
    void: { bg: '#050310', grid: 'rgba(190,140,255,0.035)', wall: '#4a3568', inset: 'rgba(15,5,30,0.6)' },
  };

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

  // A plus/cross of wall cells centered on (cx, cy) with arms of length `arm`.
  function cross(cx, cy, arm) {
    const cells = [];
    for (let i = -arm; i <= arm; i++) {
      cells.push({ x: cx + i, y: cy });
      cells.push({ x: cx, y: cy + i });
    }
    return cells;
  }

  // A rectangular ring (picture-frame) of wall cells from (x0,y0) to
  // (x1,y1), with any cells listed in `gaps` punched out as doorways.
  function ringRect(x0, x1, y0, y1, gaps) {
    const gapSet = new Set((gaps || []).map((g) => g.x + ',' + g.y));
    const cells = [];
    for (let x = x0; x <= x1; x++) {
      if (!gapSet.has(x + ',' + y0)) cells.push({ x, y: y0 });
      if (!gapSet.has(x + ',' + y1)) cells.push({ x, y: y1 });
    }
    for (let y = y0 + 1; y <= y1 - 1; y++) {
      if (!gapSet.has(x0 + ',' + y)) cells.push({ x: x0, y });
      if (!gapSet.has(x1 + ',' + y)) cells.push({ x: x1, y });
    }
    return cells;
  }

  // Two staircase walls converging from left to right, one hugging the top
  // and one the bottom, pinching the open lane into a narrowing corridor.
  function corridor(xStart, xEnd, topStart, botStart, step) {
    const cells = [];
    for (let x = xStart; x <= xEnd; x++) {
      const shrink = Math.floor((x - xStart) / step);
      cells.push({ x, y: topStart + shrink });
      cells.push({ x, y: botStart - shrink });
    }
    return cells;
  }

  // A checkerboard of isolated single-cell blocks over a `size`-spaced grid
  // of points spanning (x0,y0)-(x1,y1) — alternating cells filled/open.
  function checkerDots(x0, x1, y0, y1, size) {
    const cells = [];
    for (let x = x0; x <= x1; x += size) {
      for (let y = y0; y <= y1; y += size) {
        if (((x - x0) / size + (y - y0) / size) % 2 === 0) cells.push({ x, y });
      }
    }
    return cells;
  }

  // A square spiral of connected wall cells winding outward from (cx, cy)
  // for `loops` full turns.
  function spiralWall(cx, cy, loops) {
    const cells = [{ x: cx, y: cy }];
    let x = cx, y = cy, steps = 1, dirIdx = 0;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    while (steps <= loops * 2) {
      for (let leg = 0; leg < 2; leg++) {
        const [dx, dy] = dirs[dirIdx % 4];
        for (let i = 0; i < steps; i++) {
          x += dx; y += dy;
          cells.push({ x, y });
        }
        dirIdx++;
      }
      steps++;
    }
    return cells;
  }

  // Hand-placed single-cell pillars from a literal list of [x, y] points.
  function pillars(points) {
    return points.map(([x, y]) => ({ x, y }));
  }

  // True for any cell inside the snake's fixed spawn column/row band. Every
  // hand-built and endless obstacle set is filtered through this so a wall
  // can never overlap the spawn segments or its immediate escape room.
  function inSpawnZone(x, y) {
    return x <= 8 && y >= 9 && y <= 15;
  }

  // Clamps a raw shape's cells to the board and strips spawn-zone and
  // duplicate cells, so every hand-built stage's shape is safe to use as-is.
  function finalizeWalls(list) {
    const seen = new Set();
    const out = [];
    for (const c of list) {
      if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) continue;
      if (inSpawnZone(c.x, c.y)) continue;
      const key = c.x + ',' + c.y;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  // Fills out an obstacle list to `count` cells with extra scattered single
  // blocks (used by endless mode once the hand-built stage-10 layout stops
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
      if (taken.has(key) || inSpawnZone(x, y)) continue; // keep spawn area clear
      taken.add(key);
      list.push({ x, y });
    }
    return list;
  }

  // Stage config: 10 hand-built stages, then a smooth endless ramp reusing
  // stage 10's layout as its base.
  function stageConfig(stage) {
    const s = Math.max(1, Math.floor(stage));
    if (s === 1) {
      return { speedMult: 1, walls: [], inset: 0, winLength: WIN_LENGTH, theme: 'meadow' };
    }
    if (s === 2) {
      return { speedMult: 1.25, walls: finalizeWalls(diamond(20, 12)), inset: 0, winLength: WIN_LENGTH + 4, theme: 'cavern' };
    }
    if (s === 3) {
      return {
        speedMult: 1.5,
        walls: finalizeWalls([...diamond(10, 8), ...diamond(23, 16), { x: 16, y: 4 }, { x: 16, y: 19 }]),
        inset: 2, // smaller effective play area — a 2-cell margin becomes solid
        winLength: WIN_LENGTH + 8,
        theme: 'night',
      };
    }
    if (s === 4) {
      // Plus-shaped beams: one big cross spanning the mid-right lanes, one
      // small cross tucked lower-left — both well clear of the spawn band.
      return {
        speedMult: 1.65,
        walls: finalizeWalls([...cross(20, 12, 5), ...cross(9, 19, 2)]),
        inset: 2,
        winLength: WIN_LENGTH + 12,
        theme: 'ember',
      };
    }
    if (s === 5) {
      // A rectangular ring with doorways punched through its left/right
      // walls right on the spawn row, so the straight-ahead path threads the
      // ring like a tunnel while going around it is also an option.
      return {
        speedMult: 1.8,
        walls: finalizeWalls(ringRect(11, 24, 6, 18, [{ x: 11, y: 12 }, { x: 24, y: 12 }])),
        inset: 2,
        winLength: WIN_LENGTH + 16,
        theme: 'aqua',
      };
    }
    if (s === 6) {
      // Scattered single-cell pillars across the field, hand-placed rather
      // than random, for a "boulder field" feel.
      return {
        speedMult: 1.95,
        walls: finalizeWalls(pillars([
          [12, 4], [18, 5], [26, 4], [11, 10], [16, 9], [21, 10], [27, 9],
          [13, 15], [19, 16], [24, 14], [29, 15], [15, 20], [22, 19], [10, 19],
        ])),
        inset: 2,
        winLength: WIN_LENGTH + 20,
        theme: 'dusk',
      };
    }
    if (s === 7) {
      // Two staircase walls converging from the left edge, squeezing the
      // lane into a tight throat before the board's right side.
      return {
        speedMult: 2.1,
        walls: finalizeWalls(corridor(12, 29, 4, 19, 3)),
        inset: 2,
        winLength: WIN_LENGTH + 24,
        theme: 'storm',
      };
    }
    if (s === 8) {
      // A checkerboard of isolated single blocks: alternating grid points
      // across the mid-board are walls, the rest stay open.
      return {
        speedMult: 2.25,
        walls: finalizeWalls(checkerDots(9, 30, 3, 21, 3)),
        inset: 3,
        winLength: WIN_LENGTH + 28,
        theme: 'circuit',
      };
    }
    if (s === 9) {
      // Outer-ring wall hugging the inset border with four doorways (one per
      // side), so the arena reads as a walled fortress with gated entries.
      return {
        speedMult: 2.4,
        walls: finalizeWalls(ringRect(9, 28, 4, 19, [
          { x: 9, y: 12 }, { x: 28, y: 12 }, { x: 18, y: 4 }, { x: 18, y: 19 },
        ])),
        inset: 3,
        winLength: WIN_LENGTH + 32,
        theme: 'fortress',
      };
    }
    if (s === 10) {
      // A square spiral wall winding out from just right of center — the
      // toughest hand-built layout, and endless mode's base from here on.
      return {
        speedMult: 2.55,
        walls: finalizeWalls(spiralWall(20, 12, 4)),
        inset: 3,
        winLength: WIN_LENGTH + 36,
        theme: 'void',
      };
    }
    // Endless mode: stage 10 as the base, scaled continuously and capped so
    // it never becomes literally unplayable.
    const base = stageConfig(10);
    const scale = Math.min(1 + (s - 10) * 0.12, ENDLESS_CAP);
    const targetCount = Math.min(Math.round(base.walls.length * scale), Math.floor(COLS * ROWS * 0.12));
    return {
      speedMult: Math.min(base.speedMult * scale, 3), // absolute cap: never faster than 3x stage-1 speed
      walls: scatterExtra(base.walls, targetCount, base.inset),
      inset: base.inset,
      winLength: Math.min(base.winLength + Math.round((s - 10) * 2), 80),
      theme: base.theme,
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
      theme = THEMES[cfg.theme];
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
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = theme.grid;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
      }

      if (inset > 0) {
        ctx.fillStyle = theme.inset;
        ctx.fillRect(0, 0, W, inset * CELL);
        ctx.fillRect(0, H - inset * CELL, W, inset * CELL);
        ctx.fillRect(0, 0, inset * CELL, H);
        ctx.fillRect(W - inset * CELL, 0, inset * CELL, H);
      }
      walls.forEach((wcell) => {
        FX.bevelBlock(ctx, wcell.x * CELL + 1, wcell.y * CELL + 1, CELL - 2, CELL - 2, theme.wall, 2);
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
