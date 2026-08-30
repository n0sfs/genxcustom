function createFroggerLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx } = api;

  const CELL = 40;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const FROG_SIZE = 28;
  const FROG_OFF = (CELL - FROG_SIZE) / 2;
  const HOP_COOLDOWN = 0.13;
  const START_COL = 8, START_ROW = 11;
  const GOAL_ROW = 1;
  const GOAL_COLS = [2, 8, 13];

  const ROAD_LANES = [
    { row: 10, speed: 70, dir: 1, gap: 170, w: 44 },
    { row: 9, speed: 100, dir: -1, gap: 200, w: 36 },
    { row: 8, speed: 60, dir: 1, gap: 150, w: 50 },
    { row: 7, speed: 130, dir: -1, gap: 220, w: 34 },
  ];
  const RIVER_LANES = [
    { row: 5, speed: 50, dir: 1, gap: 200, w: 110 },
    { row: 4, speed: 80, dir: -1, gap: 180, w: 70 },
    { row: 3, speed: 40, dir: 1, gap: 230, w: 140 },
    { row: 2, speed: 65, dir: -1, gap: 190, w: 90 },
  ];
  const SPAN = W + 400;

  function wrap(x) {
    let v = (x + 200) % SPAN;
    if (v < 0) v += SPAN;
    return v - 200;
  }

  function makeLaneEntities(lanes) {
    return lanes.map((lane) => {
      const count = Math.ceil(SPAN / lane.gap) + 1;
      const items = [];
      for (let i = 0; i < count; i++) {
        items.push({ x: -200 + i * lane.gap, y: lane.row * CELL + 6, w: lane.w, h: CELL - 12 });
      }
      return { ...lane, items };
    });
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const TIME_LIMIT = 22;
  let frog, prevKeys, hopTimer, roads, rivers, goalsFilled, bestRow, timeLeft, fly, flyTimer, flyLife;

  function drawFrog(ctx, f) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    ctx.fillStyle = '#2a6a2a';
    ctx.beginPath();
    ctx.ellipse(f.x + 3, f.y + f.h - 3, 4, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(f.x + f.w - 3, f.y + f.h - 3, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3aa33a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, f.w / 2, f.h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5fd45f';
    ctx.beginPath();
    ctx.ellipse(cx, cy, f.w / 2 - 1, f.h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5fd45f';
    ctx.beginPath();
    ctx.arc(cx - 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f2a0f';
    ctx.beginPath();
    ctx.arc(cx - 6, f.y + 4, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + 6, f.y + 4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(ctx, c) {
    ctx.fillStyle = '#8a1a4a';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = '#ff4fa3';
    ctx.fillRect(c.x, c.y + 2, c.w, c.h - 4);
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(c.x + c.w * 0.2, c.y + 3, c.w * 0.6, c.h - 6);
    ctx.fillStyle = '#ffe38a';
    ctx.fillRect(c.x, c.y + 1, 3, 2);
    ctx.fillRect(c.x + c.w - 3, c.y + 1, 3, 2);
  }

  return {
    init() {
      frog = { col: START_COL, row: START_ROW, x: START_COL * CELL + FROG_OFF, y: START_ROW * CELL + FROG_OFF, w: FROG_SIZE, h: FROG_SIZE };
      prevKeys = {};
      hopTimer = 0;
      roads = makeLaneEntities(ROAD_LANES);
      rivers = makeLaneEntities(RIVER_LANES);
      goalsFilled = GOAL_COLS.map(() => false);
      bestRow = START_ROW;
      timeLeft = TIME_LIMIT;
      fly = null;
      flyTimer = 3 + Math.random() * 4;
      flyLife = 0;
    },

    update(dt) {
      hopTimer = Math.max(0, hopTimer - dt);

      timeLeft -= dt;
      if (timeLeft <= 0) {
        loseLife();
        return;
      }

      if (!fly) {
        flyTimer -= dt;
        if (flyTimer <= 0) {
          fly = { col: 1 + Math.floor(Math.random() * (COLS - 2)), row: 6 };
          flyLife = 4.5;
        }
      } else {
        flyLife -= dt;
        if (flyLife <= 0) {
          fly = null;
          flyTimer = 5 + Math.random() * 5;
        }
      }

      roads.forEach((lane) => lane.items.forEach((c) => { c.x = wrap(c.x + lane.dir * lane.speed * dt); }));
      rivers.forEach((lane) => lane.items.forEach((l) => { l.x = wrap(l.x + lane.dir * lane.speed * dt); }));

      const keyMap = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
      const justPressed = {};
      Object.keys(keyMap).forEach((k) => {
        const down = isDown(k);
        justPressed[keyMap[k]] = justPressed[keyMap[k]] || (down && !prevKeys[k]);
        prevKeys[k] = down;
      });

      if (hopTimer <= 0) {
        let dcol = 0, drow = 0;
        if (justPressed.up) drow = -1;
        else if (justPressed.down) drow = 1;
        else if (justPressed.left) dcol = -1;
        else if (justPressed.right) dcol = 1;
        if (dcol || drow) {
          frog.col = Math.max(0, Math.min(COLS - 1, frog.col + dcol));
          frog.row = Math.max(GOAL_ROW, Math.min(START_ROW, frog.row + drow));
          frog.x = frog.col * CELL + FROG_OFF;
          frog.y = frog.row * CELL + FROG_OFF;
          hopTimer = HOP_COOLDOWN;
          sfx('hop');
          if (frog.row < bestRow) {
            bestRow = frog.row;
            addScore(2);
          }
          if (fly && fly.col === frog.col && fly.row === frog.row) {
            fly = null;
            flyTimer = 5 + Math.random() * 5;
            addScore(15);
            sfx('pickup');
          }
        }
      }

      const roadLane = roads.find((l) => l.row === frog.row);
      if (roadLane) {
        for (const c of roadLane.items) {
          if (rectsOverlap(frog, c)) {
            loseLife();
            return;
          }
        }
      }

      const riverLane = rivers.find((l) => l.row === frog.row);
      if (riverLane) {
        const log = riverLane.items.find((l) => frog.x + frog.w / 2 > l.x && frog.x + frog.w / 2 < l.x + l.w);
        if (!log) {
          loseLife();
          return;
        }
        frog.x += riverLane.dir * riverLane.speed * dt;
        if (frog.x < -frog.w || frog.x > W) {
          loseLife();
          return;
        }
      }

      if (frog.row === GOAL_ROW) {
        const centerX = frog.x + frog.w / 2;
        const slotIdx = GOAL_COLS.findIndex((gc) => Math.abs(centerX - (gc * CELL + CELL / 2)) < CELL * 0.4);
        if (slotIdx === -1 || goalsFilled[slotIdx]) {
          loseLife();
          return;
        }
        goalsFilled[slotIdx] = true;
        addScore(20);
        sfx('pickup');
        frog.col = START_COL; frog.row = START_ROW;
        frog.x = frog.col * CELL + FROG_OFF; frog.y = frog.row * CELL + FROG_OFF;
        bestRow = START_ROW;
        timeLeft = TIME_LIMIT;
        if (goalsFilled.every(Boolean)) {
          winLevel(50);
        }
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#0a3d1a';
      ctx.fillRect(0, 0, W, GOAL_ROW * CELL + CELL);

      ctx.fillStyle = '#1e6b3a';
      ctx.fillRect(0, GOAL_ROW * CELL, W, CELL);
      ctx.fillStyle = '#4fe3d0';
      GOAL_COLS.forEach((gc, i) => {
        ctx.fillStyle = goalsFilled[i] ? '#6bff6b' : '#1a4a8a';
        ctx.beginPath();
        ctx.arc(gc * CELL + CELL / 2, GOAL_ROW * CELL + CELL / 2, 15, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#1a4a8a';
      ctx.fillRect(0, 2 * CELL, W, 4 * CELL);
      rivers.forEach((lane) => {
        lane.items.forEach((l) => {
          ctx.fillStyle = '#6a4420';
          ctx.fillRect(l.x, l.y, l.w, l.h);
          ctx.fillStyle = '#9a7040';
          ctx.fillRect(l.x + 2, l.y + 2, l.w - 4, l.h - 4);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let gx = l.x + 6; gx < l.x + l.w - 4; gx += 10) ctx.fillRect(gx, l.y + 3, 2, l.h - 6);
        });
      });

      ctx.fillStyle = '#2a7d3a';
      ctx.fillRect(0, 6 * CELL, W, CELL);

      ctx.fillStyle = '#333';
      ctx.fillRect(0, 7 * CELL, W, 4 * CELL);
      roads.forEach((lane) => {
        lane.items.forEach((c) => drawCar(ctx, c));
      });

      ctx.fillStyle = '#2a7d3a';
      ctx.fillRect(0, 11 * CELL, W, CELL);

      if (fly) {
        const fx = fly.col * CELL + CELL / 2, fy = fly.row * CELL + CELL / 2;
        const bob = Math.sin(flyLife * 12) * 2;
        ctx.fillStyle = flyLife < 1.2 && Math.floor(flyLife * 8) % 2 === 0 ? 'transparent' : '#3a2a1a';
        ctx.beginPath();
        ctx.ellipse(fx, fy + bob, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(fx - 5, fy + bob - 3, 4, 2, -0.4, 0, Math.PI * 2);
        ctx.ellipse(fx + 5, fy + bob - 3, 4, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      drawFrog(ctx, frog);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`PADS ${goalsFilled.filter(Boolean).length}/${GOAL_COLS.length}`, 8, 16);
      ctx.fillStyle = timeLeft < 6 ? '#ff5c5c' : '#e8ecff';
      ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, W - 60, 16);
    },
  };
}
