function createMazeLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;
  const FRIGHT_TIME = 6.5;
  const POWER_CELLS = [[1, 1], [17, 13], [9, 1], [9, 13]];

  const CELL = 32;
  const M_COLS = 9, M_ROWS = 7;
  const COLS = M_COLS * 2 + 1; // 19
  const ROWS = M_ROWS * 2 + 1; // 15
  const OX = (W - COLS * CELL) / 2;
  const OY = (H - ROWS * CELL) / 2;

  function buildMaze() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const visited = Array.from({ length: M_ROWS }, () => Array(M_COLS).fill(false));

    function carve(cx, cy) {
      visited[cy][cx] = true;
      grid[cy * 2 + 1][cx * 2 + 1] = 0;
      const dirs = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < M_COLS && ny >= 0 && ny < M_ROWS && !visited[ny][nx]) {
          grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
          carve(nx, ny);
        }
      }
    }
    carve(0, 0);

    for (let gy = 1; gy < ROWS - 1; gy++) {
      for (let gx = 1; gx < COLS - 1; gx++) {
        const between = (gx % 2 === 0 && gy % 2 === 1) || (gx % 2 === 1 && gy % 2 === 0);
        if (between && grid[gy][gx] === 1 && Math.random() < 0.15) grid[gy][gx] = 0;
      }
    }
    return grid;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isOpen(grid, col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return grid[row][col] === 0;
  }

  function cellToPx(col, row) {
    return { x: OX + col * CELL + CELL / 2, y: OY + row * CELL + CELL / 2 };
  }

  const DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  let grid, dots, powerPellets, player, ghosts, mouthPhase, frightTimer, ghostChain;

  // Movement uses a cell + progress-fraction model: a mover sits at (col,row)
  // and, while `dir` is nonzero, `t` (0..1) tracks progress toward the next
  // cell. Direction is only re-evaluated on arrival (t wraps past 1), so
  // there is no pixel-proximity snapping that could cause it to stall.
  function makeMover(col, row, speedCells) {
    return { col, row, dir: { dx: 0, dy: 0 }, t: 0, speed: speedCells };
  }

  function pixelPos(m) {
    const c = cellToPx(m.col, m.row);
    if (m.dir.dx === 0 && m.dir.dy === 0) return c;
    const n = cellToPx(m.col + m.dir.dx, m.row + m.dir.dy);
    return { x: c.x + (n.x - c.x) * m.t, y: c.y + (n.y - c.y) * m.t };
  }

  function tryTurn(mover, chooseDir) {
    const desired = chooseDir(mover.col, mover.row, mover.dir);
    if (desired && (desired.dx || desired.dy) && isOpen(grid, mover.col + desired.dx, mover.row + desired.dy)) {
      mover.dir = desired;
      return true;
    }
    return false;
  }

  function stepMover(mover, dt, chooseDir) {
    if (mover.dir.dx === 0 && mover.dir.dy === 0) {
      tryTurn(mover, chooseDir);
      return;
    }
    mover.t += mover.speed * dt;
    while (mover.t >= 1) {
      mover.t -= 1;
      mover.col += mover.dir.dx;
      mover.row += mover.dir.dy;
      if (!tryTurn(mover, chooseDir) && !isOpen(grid, mover.col + mover.dir.dx, mover.row + mover.dir.dy)) {
        mover.dir = { dx: 0, dy: 0 };
        mover.t = 0;
        break;
      }
    }
  }

  return {
    init() {
      grid = buildMaze();
      dots = new Set();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === 0) dots.add(`${c},${r}`);
        }
      }
      dots.delete('1,13');
      dots.delete('17,1');
      dots.delete('9,7');

      powerPellets = new Set();
      POWER_CELLS.forEach(([c, r]) => {
        const key = `${c},${r}`;
        if (dots.has(key)) {
          dots.delete(key);
          powerPellets.add(key);
        }
      });

      player = makeMover(1, 13, 4.4);
      player.nextDir = { dx: 0, dy: 0 };
      ghosts = [
        Object.assign(makeMover(17, 1, 3.6), { color: '#ff4fa3', spawn: [17, 1], respawnDelay: 0, baseSpeed: 3.6 }),
        Object.assign(makeMover(9, 7, 3.7), { color: '#4fe3d0', spawn: [9, 7], respawnDelay: 0, baseSpeed: 3.7 }),
      ];
      mouthPhase = 0;
      frightTimer = 0;
      ghostChain = 0;
    },

    update(dt) {
      mouthPhase += dt * 10;
      if (frightTimer > 0) frightTimer = Math.max(0, frightTimer - dt);

      if (isDown('ArrowRight', 'd')) player.nextDir = { dx: 1, dy: 0 };
      else if (isDown('ArrowLeft', 'a')) player.nextDir = { dx: -1, dy: 0 };
      else if (isDown('ArrowDown', 's')) player.nextDir = { dx: 0, dy: 1 };
      else if (isDown('ArrowUp', 'w')) player.nextDir = { dx: 0, dy: -1 };

      stepMover(player, dt, (col, row, curDir) => {
        if (player.nextDir.dx !== 0 || player.nextDir.dy !== 0) {
          if (isOpen(grid, col + player.nextDir.dx, row + player.nextDir.dy)) return player.nextDir;
        }
        return curDir;
      });

      const key = `${player.col},${player.row}`;
      if (dots.has(key)) {
        dots.delete(key);
        addScore(2);
        sfx('hop');
      }
      if (powerPellets.has(key)) {
        powerPellets.delete(key);
        frightTimer = FRIGHT_TIME;
        ghostChain = 0;
        addScore(10);
        sfx('pickup');
      }

      ghosts.forEach((g) => {
        if (g.respawnDelay > 0) {
          g.respawnDelay = Math.max(0, g.respawnDelay - dt);
          return;
        }
        g.speed = frightTimer > 0 ? g.baseSpeed * 0.55 : g.baseSpeed;
        stepMover(g, dt, (col, row, curDir) => {
          const options = DIRS.filter((d) => {
            if (d.dx === -curDir.dx && d.dy === -curDir.dy && (curDir.dx || curDir.dy)) return false;
            return isOpen(grid, col + d.dx, row + d.dy);
          });
          if (!options.length) return { dx: -curDir.dx, dy: -curDir.dy };
          if (frightTimer > 0 || Math.random() < 0.25) return options[Math.floor(Math.random() * options.length)];
          options.sort((a, b) => {
            const da = Math.hypot(col + a.dx - player.col, row + a.dy - player.row);
            const db = Math.hypot(col + b.dx - player.col, row + b.dy - player.row);
            return da - db;
          });
          return options[0];
        });
      });

      const pPos = pixelPos(player);
      for (const g of ghosts) {
        if (g.respawnDelay > 0) continue;
        const gPos = pixelPos(g);
        if (Math.hypot(gPos.x - pPos.x, gPos.y - pPos.y) < CELL * 0.5) {
          if (frightTimer > 0) {
            ghostChain++;
            addScore(50 * Math.pow(2, Math.min(ghostChain - 1, 3)));
            sfx('explosion');
            shake(0.1, 3);
            g.col = g.spawn[0]; g.row = g.spawn[1];
            g.dir = { dx: 0, dy: 0 }; g.t = 0;
            g.respawnDelay = 1.4;
          } else {
            loseLife();
            return;
          }
        }
      }

      if (dots.size === 0 && powerPellets.size === 0) {
        winLevel(60);
      }
    },

    draw(ctx) {
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, W, H);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === 1) FX.bevelBlock(ctx, OX + c * CELL, OY + r * CELL, CELL, CELL, '#2a2f6d', 2);
        }
      }

      dots.forEach((k) => {
        const [c, r] = k.split(',').map(Number);
        const p = cellToPx(c, r);
        FX.sphere(ctx, p.x, p.y, 3, '#ffd24f');
      });

      const pelletPulse = 6 + Math.sin(mouthPhase * 1.5) * 2;
      powerPellets.forEach((k) => {
        const [c, r] = k.split(',').map(Number);
        const p = cellToPx(c, r);
        FX.sphere(ctx, p.x, p.y, pelletPulse, '#fff5b0');
      });

      ghosts.forEach((g) => {
        if (g.respawnDelay > 0) return;
        const pos = pixelPos(g);
        const frightened = frightTimer > 0;
        const flashing = frightened && frightTimer < 2 && Math.floor(frightTimer * 6) % 2 === 0;
        const ghostColor = flashing ? '#ffffff' : frightened ? '#2a3fd0' : g.color;
        FX.shadow(ctx, pos.x, pos.y + CELL * 0.4, CELL * 0.35, CELL * 0.12, 0.3);
        const ghostGrad = ctx.createLinearGradient(pos.x, pos.y - CELL * 0.38, pos.x, pos.y + CELL * 0.32);
        ghostGrad.addColorStop(0, FX.shade(ghostColor, 35));
        ghostGrad.addColorStop(1, FX.shade(ghostColor, -20));
        ctx.fillStyle = ghostGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, CELL * 0.38, Math.PI, 0);
        ctx.lineTo(pos.x + CELL * 0.38, pos.y + CELL * 0.32);
        ctx.lineTo(pos.x, pos.y + CELL * 0.2);
        ctx.lineTo(pos.x - CELL * 0.38, pos.y + CELL * 0.32);
        ctx.closePath();
        ctx.fill();
        if (frightened) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(pos.x - 5, pos.y - 3, 2.2, 0, Math.PI * 2);
          ctx.arc(pos.x + 5, pos.y - 3, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const playerPos = pixelPos(player);
      const mouthOpen = Math.abs(Math.sin(mouthPhase)) * 0.28 + 0.04;
      let angle = 0;
      if (player.dir.dx === 1) angle = 0;
      else if (player.dir.dx === -1) angle = Math.PI;
      else if (player.dir.dy === 1) angle = Math.PI / 2;
      else if (player.dir.dy === -1) angle = -Math.PI / 2;
      FX.shadow(ctx, playerPos.x, playerPos.y + CELL * 0.42, CELL * 0.36, CELL * 0.14, 0.3);
      const pacGrad = ctx.createRadialGradient(
        playerPos.x - CELL * 0.15, playerPos.y - CELL * 0.15, CELL * 0.05,
        playerPos.x, playerPos.y, CELL * 0.45
      );
      pacGrad.addColorStop(0, FX.shade('#ffd24f', 45));
      pacGrad.addColorStop(1, FX.shade('#ffd24f', -20));
      ctx.fillStyle = pacGrad;
      ctx.beginPath();
      ctx.moveTo(playerPos.x, playerPos.y);
      ctx.arc(playerPos.x, playerPos.y, CELL * 0.42, angle + mouthOpen * Math.PI, angle + (2 - mouthOpen) * Math.PI);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`DOTS ${dots.size + powerPellets.size}`, 8, 16);
    },
  };
}
