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

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Shared recursive-backtracker carve, parametrized by seed cell + braid
  // (extra-loop) chance so each stage can produce a genuinely different wall
  // layout without duplicating the whole generator.
  function carveFrom(seedCx, seedCy, braidChance, colLimit) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const visited = Array.from({ length: M_ROWS }, () => Array(M_COLS).fill(false));
    const maxCol = colLimit == null ? M_COLS : colLimit;

    function carve(cx, cy) {
      visited[cy][cx] = true;
      grid[cy * 2 + 1][cx * 2 + 1] = 0;
      const dirs = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < maxCol && ny >= 0 && ny < M_ROWS && !visited[ny][nx]) {
          grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
          carve(nx, ny);
        }
      }
    }
    carve(seedCx, seedCy);

    const braidMaxGx = colLimit == null ? COLS - 1 : colLimit * 2;
    for (let gy = 1; gy < ROWS - 1; gy++) {
      for (let gx = 1; gx < braidMaxGx; gx++) {
        const between = (gx % 2 === 0 && gy % 2 === 1) || (gx % 2 === 1 && gy % 2 === 0);
        if (between && grid[gy][gx] === 1 && Math.random() < braidChance) grid[gy][gx] = 0;
      }
    }
    return grid;
  }

  // Stage 1: original default layout — corner-seeded, light braid (a fairly
  // tree-like maze with deep dead ends).
  function buildMazeStage1() {
    return carveFrom(0, 0, 0.15, null);
  }

  // Stage 2: seeded from the center instead of a corner, with more braiding —
  // corridors radiate outward from the middle and there are noticeably more
  // loops/alternate routes, a genuinely different topology from stage 1.
  function buildMazeStage2() {
    return carveFrom(Math.floor(M_COLS / 2), Math.floor(M_ROWS / 2), 0.25, null);
  }

  // Stage 3: mirrored/symmetric maze — only the left half (plus the shared
  // center column) is carved, then mirrored onto the right half, producing a
  // classic symmetric arcade-maze layout that reads completely differently
  // on screen from stages 1-2.
  function buildMazeStage3() {
    const halfCols = Math.ceil(M_COLS / 2); // 5 -> maze columns 0..4, grid col 9 shared
    const grid = carveFrom(0, Math.floor(M_ROWS / 2), 0.3, halfCols);
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const mx = COLS - 1 - gx;
        if (mx > gx) grid[gy][mx] = grid[gy][gx];
      }
    }
    return grid;
  }

  function buildMazeForStage(stage) {
    if (stage <= 1) return buildMazeStage1();
    if (stage === 2) return buildMazeStage2();
    return buildMazeStage3(); // stage 3, and the base for endless mode (4+)
  }

  function isOpen(grid, col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return grid[row][col] === 0;
  }

  function cellToPx(col, row) {
    return { x: OX + col * CELL + CELL / 2, y: OY + row * CELL + CELL / 2 };
  }

  const DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  // Ghost roster: the first two are the original stage-1 ghosts; the third
  // and fourth are added in as stages 2 and 3 escalate the chase. All four
  // spawn cells are guaranteed-open maze-cell centers (odd/odd grid coords)
  // under every generator above (corner, center, and mirrored variants all
  // produce a full spanning tree, so every cell center ends up carved).
  const GHOST_ROSTER = [
    { spawn: [17, 1], color: '#ff4fa3', baseSpeed: 3.6 },
    { spawn: [9, 7], color: '#4fe3d0', baseSpeed: 3.7 },
    { spawn: [13, 7], color: '#ffb84f', baseSpeed: 3.9 },
    { spawn: [5, 7], color: '#b84fff', baseSpeed: 4.0 },
  ];

  // Stage-baseline speed multiplier: stages 1-3 step the ghosts up as more of
  // them join the chase; stage 4+ ("endless") keeps stage 3's full roster but
  // keeps scaling smoothly on top, capped so it never becomes unbeatable.
  //
  // Ghosts chase with a real (greedy-nearest) heuristic, not a random patrol,
  // so ghost speed relative to the player's fixed 4.4 cells/s matters a lot
  // more here than a raw multiplier suggests. At stage 3's baseline (x1.25)
  // the fastest ghost (baseSpeed 4.0) is already at 5.0, ~14% faster than the
  // player — a fitting "hardest hand-built stage" bite. The old endless
  // formula (rate 0.12, inner cap 2.4, outer cap 3.0) compounded on top of
  // that and reached x3.0 by stage ~15, putting the fastest ghost at 12.0
  // cells/s — 2.7x the player's speed before the within-stage "board is
  // clearing out" ramp (up to another x1.35) pushes it past 3.6x. Combined
  // with dead-end corridors, that's not "hard", it's uncatchable. Capping the
  // endless scale at x1.6 (product x2.0) keeps the fastest ghost at ~1.8x
  // player speed at the plateau (~2.45x during the endgame ramp), still a
  // real threat but not a guaranteed corner, and reaches that plateau at
  // stage ~15 so it keeps climbing through the whole endless range instead
  // of flatlining by stage 6-7.
  function stageSpeedMult(stage) {
    if (stage <= 1) return 1;
    if (stage === 2) return 1.12;
    if (stage === 3) return 1.25;
    const endlessScale = Math.min(1 + (stage - 3) * 0.05, 1.6);
    return 1.25 * endlessScale;
  }

  // Cheap per-stage palette shift for the wall blocks + backdrop — the maze
  // shape itself already differs a lot stage to stage (corner-seeded, then
  // center-seeded, then mirrored-symmetric), so this is just a light color
  // wash on top of the existing wall/background draw calls (no new geometry)
  // to reinforce "somewhere new", the same idea as the racing level's
  // day/dusk/night themes. Stage 4+ (endless) reuses stage 3's palette, same
  // as it reuses stage 3's ghost roster.
  const STAGE_THEMES = [
    { bg: '#050510', wall: '#2a2f6d' },
    { bg: '#120616', wall: '#5a2f6d' },
    { bg: '#03120c', wall: '#1f6d4a' },
  ];
  function themeForStage(stage) { return STAGE_THEMES[Math.min(Math.max(stage, 1), 3) - 1]; }

  function ghostCountForStage(stage) {
    if (stage <= 1) return 2;
    if (stage === 2) return 3;
    return 4; // stage 3, and endless mode reuses stage 3's full roster
  }

  // How much of the within-stage "board is clearing out" ramp applies (see
  // update() below) — kept as a baseline stages layer on top of, not replace.
  function baseWanderChance(stage) {
    if (stage <= 1) return 0.25;
    if (stage === 2) return 0.20;
    if (stage === 3) return 0.15;
    return Math.max(0.06, 0.15 - (stage - 3) * 0.01);
  }

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

  let grid, dots, powerPellets, player, ghosts, mouthPhase, frightTimer, ghostChain;
  let currentStage, totalCollectibles, stageWanderBase;

  return {
    init(stage = 1) {
      const isNewStage = stage !== currentStage;

      if (isNewStage) {
        // Moving to a new stage (first-ever init, or advancing after
        // winLevel()): regenerate the maze, dots, pellets and ghost roster
        // for this stage. Any leftover state from the previous stage must
        // not contaminate the new one.
        currentStage = stage;
        stageWanderBase = baseWanderChance(stage);
        grid = buildMazeForStage(stage);

        dots = new Set();
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 0) dots.add(`${c},${r}`);
          }
        }
        dots.delete('1,13');
        dots.delete('17,1');
        dots.delete('9,7');
        dots.delete('13,7');
        dots.delete('5,7');

        powerPellets = new Set();
        POWER_CELLS.forEach(([c, r]) => {
          const key = `${c},${r}`;
          if (dots.has(key)) {
            dots.delete(key);
            powerPellets.add(key);
          }
        });
        totalCollectibles = dots.size + powerPellets.size;

        const mult = stageSpeedMult(stage);
        const count = ghostCountForStage(stage);
        ghosts = GHOST_ROSTER.slice(0, count).map((def) => Object.assign(
          makeMover(def.spawn[0], def.spawn[1], def.baseSpeed * mult),
          { color: def.color, spawn: def.spawn, respawnDelay: 0, baseSpeed: def.baseSpeed * mult }
        ));
      } else {
        // Same-stage retry after losing a life re-calls init() with the same
        // stage number (see game.js) — the maze, dots and pellets built above
        // are left untouched here, so getting caught by a ghost sends you
        // back to start without wiping out dots you already cleared.
        ghosts.forEach((g) => {
          g.col = g.spawn[0]; g.row = g.spawn[1];
          g.dir = { dx: 0, dy: 0 }; g.t = 0;
          g.respawnDelay = 0;
        });
      }

      player = makeMover(1, 13, 4.4);
      player.nextDir = { dx: 0, dy: 0 };
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

      // Difficulty ramps up as the board clears: ghosts get faster and more
      // relentless about chasing (less random wandering) the fewer dots are
      // left, so the finish of a maze has real tension instead of staying
      // flat. This within-stage ramp layers on top of (not instead of) the
      // stage baseline set in init() — g.baseSpeed already carries the
      // per-stage/endless scale.
      const remaining = dots.size + powerPellets.size;
      const clearProgress = totalCollectibles > 0 ? 1 - remaining / totalCollectibles : 0;
      const aggroSpeedMult = 1 + clearProgress * 0.35;
      const wanderChance = Math.max(0.05, stageWanderBase - clearProgress * 0.17);

      ghosts.forEach((g) => {
        if (g.respawnDelay > 0) {
          g.respawnDelay = Math.max(0, g.respawnDelay - dt);
          return;
        }
        g.speed = frightTimer > 0 ? g.baseSpeed * 0.55 : g.baseSpeed * aggroSpeedMult;
        stepMover(g, dt, (col, row, curDir) => {
          const options = DIRS.filter((d) => {
            if (d.dx === -curDir.dx && d.dy === -curDir.dy && (curDir.dx || curDir.dy)) return false;
            return isOpen(grid, col + d.dx, row + d.dy);
          });
          if (!options.length) return { dx: -curDir.dx, dy: -curDir.dy };
          if (frightTimer > 0 || Math.random() < wanderChance) return options[Math.floor(Math.random() * options.length)];
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
            if (ghostChain >= ghosts.length) {
              // Cleared every ghost on the board during one power pellet —
              // a little extra reward for the perfect combo.
              addScore(100);
              shake(0.2, 6);
            }
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
      const theme = themeForStage(currentStage);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === 1) {
            const bx = OX + c * CELL, by = OY + r * CELL;
            FX.bevelBlock(ctx, bx, by, CELL, CELL, theme.wall, 2);
            // faint panel-line detail so wall blocks read as machined metal panels
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 4.5, by + 4.5, CELL - 9, CELL - 9);
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(bx + CELL / 2 - 1, by + 3, 2, CELL - 6);
          }
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
        const r = CELL * 0.38;
        const baseY = pos.y + CELL * 0.32;
        const ghostGrad = ctx.createLinearGradient(pos.x, pos.y - r, pos.x, baseY);
        ghostGrad.addColorStop(0, FX.shade(ghostColor, 35));
        ghostGrad.addColorStop(0.55, ghostColor);
        ghostGrad.addColorStop(1, FX.shade(ghostColor, -20));
        ctx.fillStyle = ghostGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, Math.PI, 0);
        ctx.lineTo(pos.x + r, baseY - 2);
        // scalloped wavy skirt hem — classic ghost-sprite silhouette
        const scallops = 3;
        const segW = (2 * r) / scallops;
        for (let i = 0; i < scallops; i++) {
          const x0 = pos.x + r - i * segW;
          const xMid = x0 - segW / 2;
          const x1 = x0 - segW;
          ctx.quadraticCurveTo(xMid, baseY + 5, x1, baseY - 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // specular sheen on the dome
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.ellipse(pos.x - r * 0.35, pos.y - r * 0.4, r * 0.28, r * 0.16, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // eyes: white sclera always, colored pupils track movement dir unless frightened
        if (!flashing) {
          const eyeOffX = 4, eyeOffY = -2;
          ctx.fillStyle = frightened ? 'rgba(255,255,255,0.85)' : '#ffffff';
          ctx.beginPath();
          ctx.arc(pos.x - eyeOffX, pos.y + eyeOffY, 2.6, 0, Math.PI * 2);
          ctx.arc(pos.x + eyeOffX, pos.y + eyeOffY, 2.6, 0, Math.PI * 2);
          ctx.fill();
          if (!frightened) {
            const dx = g.dir.dx, dy = g.dir.dy;
            ctx.fillStyle = '#1a1a2a';
            ctx.beginPath();
            ctx.arc(pos.x - eyeOffX + dx * 1.2, pos.y + eyeOffY + dy * 1.2, 1.3, 0, Math.PI * 2);
            ctx.arc(pos.x + eyeOffX + dx * 1.2, pos.y + eyeOffY + dy * 1.2, 1.3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = '#1a1a2a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pos.x - eyeOffX - 1.4, pos.y + eyeOffY - 1.4);
            ctx.lineTo(pos.x - eyeOffX + 1.4, pos.y + eyeOffY + 1.4);
            ctx.moveTo(pos.x + eyeOffX - 1.4, pos.y + eyeOffY - 1.4);
            ctx.lineTo(pos.x + eyeOffX + 1.4, pos.y + eyeOffY + 1.4);
            ctx.stroke();
          }
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
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // specular gloss + eye with a tiny glint, classic 90s-sprite highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(playerPos.x - CELL * 0.14, playerPos.y - CELL * 0.16, CELL * 0.12, CELL * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
      const eyeAngle = angle - Math.PI / 2.3;
      const eyeX = playerPos.x + Math.cos(eyeAngle) * CELL * 0.16;
      const eyeY = playerPos.y + Math.sin(eyeAngle) * CELL * 0.16 - CELL * 0.06;
      ctx.fillStyle = '#3a2a10';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(eyeX - 0.6, eyeY - 0.6, 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`DOTS ${dots.size + powerPellets.size}`, 8, 16);
    },
  };
}
