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

  const HAND_BUILT_STAGES = 10;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Shared recursive-backtracker carve, parametrized by seed cell + braid
  // (extra-loop) chance so each stage can produce a genuinely different wall
  // layout without duplicating the whole generator. colLimit/rowLimit (both
  // optional) confine the carve to a sub-rectangle of the maze-cell grid
  // (used by the mirrored/quadrant stages) — the braid pass is confined to
  // the same sub-rectangle so it never spuriously opens a connector into an
  // as-yet-uncarved region.
  function carveFrom(seedCx, seedCy, braidChance, colLimit, rowLimit) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const visited = Array.from({ length: M_ROWS }, () => Array(M_COLS).fill(false));
    const maxCol = colLimit == null ? M_COLS : colLimit;
    const maxRow = rowLimit == null ? M_ROWS : rowLimit;

    function carve(cx, cy) {
      visited[cy][cx] = true;
      grid[cy * 2 + 1][cx * 2 + 1] = 0;
      const dirs = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < maxCol && ny >= 0 && ny < maxRow && !visited[ny][nx]) {
          grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
          carve(nx, ny);
        }
      }
    }
    carve(seedCx, seedCy);

    const braidMaxGx = colLimit == null ? COLS - 1 : colLimit * 2;
    const braidMaxGy = rowLimit == null ? ROWS - 1 : rowLimit * 2;
    for (let gy = 1; gy < braidMaxGy; gy++) {
      for (let gx = 1; gx < braidMaxGx; gx++) {
        const between = (gx % 2 === 0 && gy % 2 === 1) || (gx % 2 === 1 && gy % 2 === 0);
        if (between && grid[gy][gx] === 1 && Math.random() < braidChance) grid[gy][gx] = 0;
      }
    }
    return grid;
  }

  // Visits every maze cell (cx,cy) exactly once in clockwise boundary-peeling
  // order (outer ring first, then the next ring in, ...). Standard property:
  // every consecutive pair in the returned list is grid-adjacent, which is
  // what lets buildMazeStage4 turn it directly into a connected corridor.
  function spiralOrder() {
    const order = [];
    let top = 0, bottom = M_ROWS - 1, left = 0, right = M_COLS - 1;
    while (top <= bottom && left <= right) {
      for (let x = left; x <= right; x++) order.push([x, top]);
      top++;
      for (let y = top; y <= bottom; y++) order.push([right, y]);
      right--;
      if (top <= bottom) {
        for (let x = right; x >= left; x--) order.push([x, bottom]);
        bottom--;
      }
      if (left <= right) {
        for (let y = bottom; y >= top; y--) order.push([left, y]);
        left++;
      }
    }
    return order;
  }

  // Distance (in maze cells) from a cell to the nearest maze edge — 0 on the
  // outer ring, increasing inward. Two 4-adjacent cells with the same layer
  // always lie on the same concentric ring/frame; two 4-adjacent cells whose
  // layers differ by exactly 1 are on neighboring rings. Used by
  // buildMazeStage5's concentric-rings generator.
  function layerOf(cx, cy) {
    return Math.min(cx, cy, M_COLS - 1 - cx, M_ROWS - 1 - cy);
  }

  // Scatters a few extra wall-openings across the whole grid on top of an
  // already-connected maze. Since it only ever removes walls, it can never
  // sever a connection — only add shortcut loops — so it's safe to call on
  // any fully-carved grid. Used by stages that build their grid with
  // something other than carveFrom (which has its own confined braid pass).
  function braidPass(grid, chance) {
    for (let gy = 1; gy < ROWS - 1; gy++) {
      for (let gx = 1; gx < COLS - 1; gx++) {
        const between = (gx % 2 === 0 && gy % 2 === 1) || (gx % 2 === 1 && gy % 2 === 0);
        if (between && grid[gy][gx] === 1 && Math.random() < chance) grid[gy][gx] = 0;
      }
    }
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

  // Stage 4: spiral corridor maze — carved as one long corridor that winds
  // from the outer ring inward to the center (spiralOrder() visits every
  // maze cell exactly once, each consecutive pair grid-adjacent), so this is
  // a genuine Hamiltonian-path spanning tree rather than a branching carve.
  // A light braid pass adds a handful of shortcut loops so it isn't a pure
  // single-thread corridor to walk.
  function buildMazeStage4() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const order = spiralOrder();
    order.forEach(([cx, cy], i) => {
      grid[cy * 2 + 1][cx * 2 + 1] = 0;
      if (i > 0) {
        const [px, py] = order[i - 1];
        grid[py * 2 + 1 + (cy - py)][px * 2 + 1 + (cx - px)] = 0;
      }
    });
    braidPass(grid, 0.06);
    return grid;
  }

  // Stage 5: concentric-rings maze — every maze cell is open; walls form
  // rectangular "onion" rings (layerOf groups cells into rings by distance
  // from the edge), and each ring connects to the ring just inside it
  // through at least one deliberate spoke opening (1-2, chosen randomly from
  // every valid boundary pair each time), so the whole thing is one
  // connected maze of nested loops rather than a tree of dead ends. The
  // "at least one spoke" guarantee is structural, not probabilistic: every
  // ring boundary always has candidate connector pairs, and one is always
  // taken.
  function buildMazeStage5() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    for (let cy = 0; cy < M_ROWS; cy++) {
      for (let cx = 0; cx < M_COLS; cx++) {
        grid[cy * 2 + 1][cx * 2 + 1] = 0;
        if (cx + 1 < M_COLS && layerOf(cx + 1, cy) === layerOf(cx, cy)) grid[cy * 2 + 1][cx * 2 + 2] = 0;
        if (cy + 1 < M_ROWS && layerOf(cx, cy + 1) === layerOf(cx, cy)) grid[cy * 2 + 2][cx * 2 + 1] = 0;
      }
    }
    const maxLayer = layerOf(Math.floor(M_COLS / 2), Math.floor(M_ROWS / 2));
    for (let L = 0; L < maxLayer; L++) {
      const candidates = [];
      for (let cy = 0; cy < M_ROWS; cy++) {
        for (let cx = 0; cx < M_COLS; cx++) {
          if (layerOf(cx, cy) !== L) continue;
          [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < M_COLS && ny >= 0 && ny < M_ROWS && layerOf(nx, ny) === L + 1) {
              candidates.push([cx, cy, dx, dy]);
            }
          });
        }
      }
      shuffle(candidates);
      const spokes = Math.min(candidates.length, 1 + Math.floor(Math.random() * 2));
      for (let i = 0; i < spokes; i++) {
        const [cx, cy, dx, dy] = candidates[i];
        grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
      }
    }
    return grid;
  }

  // Stage 6: four mirrored quadrants — only the top-left quadrant (plus the
  // shared center row/column) is carved, then mirrored across both the
  // vertical AND horizontal center lines, producing a fully symmetric
  // 4-quadrant layout — a step up from stage 3's single left-right mirror.
  // Connectivity holds by the same argument as stage 3's mirror (the carve
  // spans a connected tree over the whole sub-rectangle, including the
  // shared center row/column, so both mirror passes stitch onto shared,
  // already-carved cells rather than two disjoint copies).
  function buildMazeStage6() {
    const halfCols = Math.ceil(M_COLS / 2); // 5 -> maze cols 0..4, grid col 9 shared
    const halfRows = Math.ceil(M_ROWS / 2); // 4 -> maze rows 0..3, grid row 7 shared
    const grid = carveFrom(0, 0, 0.15, halfCols, halfRows);
    // mirror left -> right across the shared center column
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const mx = COLS - 1 - gx;
        if (mx > gx) grid[gy][mx] = grid[gy][gx];
      }
    }
    // mirror top -> bottom across the shared center row, now that the full
    // top band (both quadrants) exists to reflect downward
    for (let gy = 0; gy < ROWS; gy++) {
      const my = ROWS - 1 - gy;
      if (my > gy) {
        for (let gx = 0; gx < COLS; gx++) grid[my][gx] = grid[gy][gx];
      }
    }
    return grid;
  }

  // Stage 7: dense small-cell maze — grown with a randomized-Prim's frontier
  // (pick a random cell touching the already-visited region, connect it
  // back) rather than the recursive-backtracker's long twisty corridors,
  // which packs the same fixed grid with lots of short, evenly-scattered
  // branches and small dead-end pockets for a denser feel. (The engine's
  // cell grid size is shared across every stage, so "small-cell" is
  // expressed as maze density rather than literally shrinking the grid.)
  function buildMazeStage7() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const visited = Array.from({ length: M_ROWS }, () => Array(M_COLS).fill(false));
    const sx = Math.floor(M_COLS / 2), sy = 0;
    visited[sy][sx] = true;
    grid[sy * 2 + 1][sx * 2 + 1] = 0;
    const frontier = [];
    const pushFrontier = (cx, cy) => {
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < M_COLS && ny >= 0 && ny < M_ROWS && !visited[ny][nx]) frontier.push([nx, ny]);
      });
    };
    pushFrontier(sx, sy);
    while (frontier.length) {
      const [cx, cy] = frontier.splice(Math.floor(Math.random() * frontier.length), 1)[0];
      if (visited[cy][cx]) continue;
      const back = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]).find(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        return nx >= 0 && nx < M_COLS && ny >= 0 && ny < M_ROWS && visited[ny][nx];
      });
      if (back) grid[cy * 2 + 1 + back[1]][cx * 2 + 1 + back[0]] = 0;
      visited[cy][cx] = true;
      grid[cy * 2 + 1][cx * 2 + 1] = 0;
      pushFrontier(cx, cy);
    }
    braidPass(grid, 0.08);
    return grid;
  }

  // Stage 8: sparse open maze — same corner-seeded carve as stage 1 but with
  // a much heavier braid pass, dissolving most interior walls into a wide
  // open floor with only a few dividers — the opposite feel from stage 7's
  // dense pockets.
  function buildMazeStage8() {
    return carveFrom(Math.floor(M_COLS / 2), Math.floor(M_ROWS / 2), 0.55, null);
  }

  // Stage 9: asymmetric organic maze — a "growing tree" carve seeded from a
  // random cell each time (no fixed corner/center/mirror symmetry) that
  // mostly extends from the newest cell (tree-like corridors) but
  // occasionally branches off an older, randomly-picked cell instead,
  // producing an irregular mix of long runs and stubby side-branches.
  function buildMazeStage9() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const visited = Array.from({ length: M_ROWS }, () => Array(M_COLS).fill(false));
    const startCx = Math.floor(Math.random() * M_COLS);
    const startCy = Math.floor(Math.random() * M_ROWS);
    visited[startCy][startCx] = true;
    grid[startCy * 2 + 1][startCx * 2 + 1] = 0;
    const active = [[startCx, startCy]];
    while (active.length) {
      const idx = Math.random() < 0.7 ? active.length - 1 : Math.floor(Math.random() * active.length);
      const [cx, cy] = active[idx];
      const dirs = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
      let carved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < M_COLS && ny >= 0 && ny < M_ROWS && !visited[ny][nx]) {
          visited[ny][nx] = true;
          grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
          grid[ny * 2 + 1][nx * 2 + 1] = 0;
          active.push([nx, ny]);
          carved = true;
          break;
        }
      }
      if (!carved) active.splice(idx, 1);
    }
    braidPass(grid, 0.1);
    return grid;
  }

  // Stage 10: checkerboard-block maze — instead of corridor-and-wall carving,
  // the entire interior floor starts open and solid 1x1 pillar blocks are
  // dropped in a checkerboard-spaced pattern (every cell whose maze-cell
  // coords are BOTH even), a classic arcade "block maze" feel. Pillars are
  // confined to the interior (never the outer ring, which stays a clean
  // single frame). Spacing pillars 2 apart on both axes (rather than a
  // literal 1-cell checkerboard) is deliberate: two pillars are never
  // 4-adjacent to each other, so every pillar is an isolated single-cell
  // hole in an otherwise fully-open floor and can never sever a path — a
  // strict 1-cell checkerboard would instead turn every surviving cell's
  // parity the same way as its neighbors, stranding each one alone with
  // only its own dead-end connector nubs.
  function buildMazeStage10() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    for (let cy = 0; cy < M_ROWS; cy++) {
      for (let cx = 0; cx < M_COLS; cx++) {
        grid[cy * 2 + 1][cx * 2 + 1] = 0;
        if (cx + 1 < M_COLS) grid[cy * 2 + 1][cx * 2 + 2] = 0;
        if (cy + 1 < M_ROWS) grid[cy * 2 + 2][cx * 2 + 1] = 0;
      }
    }
    for (let cy = 1; cy < M_ROWS - 1; cy++) {
      for (let cx = 1; cx < M_COLS - 1; cx++) {
        if (cx % 2 === 0 && cy % 2 === 0) grid[cy * 2 + 1][cx * 2 + 1] = 1;
      }
    }
    return grid;
  }

  function buildMazeForStage(stage) {
    if (stage <= 1) return buildMazeStage1();
    if (stage === 2) return buildMazeStage2();
    if (stage === 3) return buildMazeStage3();
    if (stage === 4) return buildMazeStage4();
    if (stage === 5) return buildMazeStage5();
    if (stage === 6) return buildMazeStage6();
    if (stage === 7) return buildMazeStage7();
    if (stage === 8) return buildMazeStage8();
    if (stage === 9) return buildMazeStage9();
    return buildMazeStage10(); // stage 10, and the base for endless mode (11+)
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
  // and fourth join in as stages 2 and 3 escalate the chase; the fifth joins
  // at stage 7 as the hand-built stages keep escalating (see
  // ghostCountForStage below). All five spawn cells are guaranteed-open
  // maze-cell centers (odd/odd grid coords) under every generator above:
  // stages 1-9 either carve every maze cell (corner, center, mirrored,
  // spiral, rings, quadrant, dense-Prim's, sparse-braid and organic variants
  // all produce a full spanning tree touching every cell) or, for stage 10's
  // checkerboard pillars, land on a cell the pillar rule deliberately never
  // blocks (every spawn has at least one odd maze-cell coordinate, or sits
  // on the outer ring — a stage-10 pillar only ever lands on a cell whose
  // coords are BOTH even and interior).
  const GHOST_ROSTER = [
    { spawn: [17, 1], color: '#ff4fa3', baseSpeed: 3.6 },
    { spawn: [9, 7], color: '#4fe3d0', baseSpeed: 3.7 },
    { spawn: [13, 7], color: '#ffb84f', baseSpeed: 3.9 },
    { spawn: [5, 7], color: '#b84fff', baseSpeed: 4.0 },
    { spawn: [15, 5], color: '#4f8cff', baseSpeed: 4.1 },
  ];

  // Stage-baseline speed multiplier: stages 1-10 step the ghosts up smoothly
  // as more of them join the chase and the hand-built stages get harder;
  // stage 11+ ("endless") keeps stage 10's full roster but keeps scaling
  // smoothly on top, capped so it never becomes unbeatable.
  //
  // Ghosts chase with a real (greedy-nearest) heuristic, not a random patrol,
  // so ghost speed relative to the player's fixed 4.4 cells/s matters a lot
  // more here than a raw multiplier suggests. At stage 10's baseline (x1.70)
  // the fastest ghost (baseSpeed 4.1) is already at ~6.97, ~58% faster than
  // the player — a fitting "hardest hand-built stage" bite. An earlier,
  // unbounded endless formula compounded on top of a similar baseline and
  // reached x3.0+ within a handful of endless stages, putting the fastest
  // ghost at ~3.7x the player's speed once the within-stage "board is
  // clearing out" ramp (up to another x1.35) is folded in. Combined with
  // dead-end corridors, that's not "hard", it's uncatchable. Capping the
  // endless scale so the product never exceeds x2.0 keeps the fastest ghost
  // at ~1.86x player speed at the plateau (~2.5x during the endgame ramp),
  // still a real threat but not a guaranteed corner, and reaches that
  // plateau around stage ~15 so it keeps climbing through the whole endless
  // range instead of flatlining right after stage 10.
  const STAGE_SPEED_MULT = [1.00, 1.06, 1.12, 1.19, 1.27, 1.35, 1.44, 1.53, 1.62, 1.70];
  function stageSpeedMult(stage) {
    const idx = Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1;
    if (stage <= HAND_BUILT_STAGES) return STAGE_SPEED_MULT[idx];
    const base = STAGE_SPEED_MULT[STAGE_SPEED_MULT.length - 1];
    return Math.min(base * (1 + (stage - HAND_BUILT_STAGES) * 0.035), 2.0);
  }

  // Cheap per-stage palette shift for the wall blocks + backdrop — the maze
  // shape itself already differs a lot stage to stage (corner-seeded,
  // center-seeded, mirrored, spiral, rings, quadrant-mirrored, dense,
  // sparse, organic, checkerboard-block), so this is just a light color wash
  // on top of the existing wall/background draw calls (no new geometry) to
  // reinforce "somewhere new", the same idea as the racing level's
  // day/dusk/night themes. Stage 11+ (endless) reuses stage 10's palette,
  // same as it reuses stage 10's maze generator and ghost roster.
  const STAGE_THEMES = [
    { bg: '#050510', wall: '#2a2f6d' }, // 1: corner-seeded — cool blue
    { bg: '#120616', wall: '#5a2f6d' }, // 2: center-seeded — violet
    { bg: '#03120c', wall: '#1f6d4a' }, // 3: mirrored — green
    { bg: '#020e12', wall: '#1f5a6d' }, // 4: spiral corridor — teal/cyan
    { bg: '#160d02', wall: '#6d4a1f' }, // 5: concentric rings — amber
    { bg: '#170305', wall: '#6d1f2f' }, // 6: 4 mirrored quadrants — crimson
    { bg: '#0a0d12', wall: '#3a4a5e' }, // 7: dense small-cell — slate steel
    { bg: '#0a0620', wall: '#3f2f8a' }, // 8: sparse open — deep indigo
    { bg: '#0d1204', wall: '#4a5e1f' }, // 9: asymmetric organic — moss olive
    { bg: '#170216', wall: '#6d1f5a' }, // 10: checkerboard-block — magenta
  ];
  function themeForStage(stage) { return STAGE_THEMES[Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1]; }

  const GHOST_COUNT_BY_STAGE = [2, 3, 4, 4, 4, 4, 5, 5, 5, 5];
  function ghostCountForStage(stage) {
    const idx = Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1;
    return GHOST_COUNT_BY_STAGE[idx]; // stage 11+ (endless) reuses stage 10's full roster
  }

  // How much of the within-stage "board is clearing out" ramp applies (see
  // update() below) — kept as a baseline stages layer on top of, not replace.
  const BASE_WANDER_BY_STAGE = [0.25, 0.225, 0.20, 0.175, 0.15, 0.13, 0.11, 0.09, 0.07, 0.06];
  function baseWanderChance(stage) {
    const idx = Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1;
    if (stage <= HAND_BUILT_STAGES) return BASE_WANDER_BY_STAGE[idx];
    const base = BASE_WANDER_BY_STAGE[BASE_WANDER_BY_STAGE.length - 1];
    return Math.max(0.05, base - (stage - HAND_BUILT_STAGES) * 0.005);
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

  // Juice systems — created once per level instance (not per frame/init) and
  // driven from update()/draw() every tick. Cleared on init() so a fresh
  // stage/retry never carries over stray particles from before.
  const particles = FX.makeParticles(90);
  const floatText = FX.makeFloatText(24);
  let flashTimer = 0, flashMax = 0.35;

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
        dots.delete('15,5');

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
      particles.clear();
      floatText.clear();
      flashTimer = 0;
    },

    update(dt) {
      mouthPhase += dt * 10;
      if (frightTimer > 0) frightTimer = Math.max(0, frightTimer - dt);
      if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);
      particles.update(dt);
      floatText.update(dt);

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
        const dp = cellToPx(player.col, player.row);
        particles.burst(dp.x, dp.y, 3, {
          colors: ['#ffd24f', '#fff5b0'], speedMin: 20, speedMax: 60,
          lifeMin: 0.15, lifeMax: 0.3, sizeMin: 1, sizeMax: 2, gravity: 40,
        });
      }
      if (powerPellets.has(key)) {
        powerPellets.delete(key);
        frightTimer = FRIGHT_TIME;
        ghostChain = 0;
        addScore(10);
        sfx('pickup');
        const pp = cellToPx(player.col, player.row);
        particles.burst(pp.x, pp.y, 10, {
          colors: ['#fff5b0', '#ffd24f', '#ffffff'], speedMin: 50, speedMax: 140,
          lifeMin: 0.3, lifeMax: 0.6, sizeMin: 2, sizeMax: 4, gravity: 20,
        });
        floatText.spawn(pp.x, pp.y - 10, '+10', '#fff5b0', { life: 0.7, vy: -45, size: 13 });
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
            const gain = 50 * Math.pow(2, Math.min(ghostChain - 1, 3));
            addScore(gain);
            sfx('explosion');
            shake(0.1, 3);
            particles.burst(gPos.x, gPos.y, 12, {
              colors: ['#2a3fd0', '#8ea0ff', '#ffffff'], speedMin: 60, speedMax: 180,
              lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 4, gravity: 0,
            });
            floatText.spawn(gPos.x, gPos.y - 10, `+${gain}`, '#8ea0ff', { life: 0.7, vy: -50, size: 13 });
            if (ghostChain >= ghosts.length) {
              // Cleared every ghost on the board during one power pellet —
              // a little extra reward for the perfect combo.
              addScore(100);
              shake(0.2, 6);
              floatText.spawn(pPos.x, pPos.y - 22, 'PERFECT +100', '#ffd24f', { life: 1.0, vy: -40, size: 13 });
            }
            g.col = g.spawn[0]; g.row = g.spawn[1];
            g.dir = { dx: 0, dy: 0 }; g.t = 0;
            g.respawnDelay = 1.4;
          } else {
            particles.burst(pPos.x, pPos.y, 14, {
              colors: ['#ff4fa3', '#ff8a4f', '#ffffff'], speedMin: 60, speedMax: 200,
              lifeMin: 0.3, lifeMax: 0.6, sizeMin: 2, sizeMax: 4, gravity: 40,
            });
            flashTimer = flashMax;
            shake(0.22, 7);
            loseLife();
            return;
          }
        }
      }

      if (dots.size === 0 && powerPellets.size === 0) {
        // Maze-clear celebration: a scattered particle shower across the
        // board plus a banner, then hand off to the normal win-level flow.
        for (let i = 0; i < 3; i++) {
          particles.burst(OX + Math.random() * COLS * CELL, OY + Math.random() * ROWS * CELL, 10, {
            colors: ['#ffd24f', '#fff5b0', '#4fe3d0', '#ff4fa3'], speedMin: 60, speedMax: 160,
            lifeMin: 0.4, lifeMax: 0.9, sizeMin: 2, sizeMax: 4, gravity: 80,
          });
        }
        floatText.spawn(W / 2, H / 2, 'MAZE CLEAR!', '#ffd24f', { life: 1.2, vy: -20, size: 20 });
        winLevel(60);
      }
    },

    draw(ctx) {
      const theme = themeForStage(currentStage);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      const wallGlowColor = FX.shade(theme.wall, 70);
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
            // subtle themed glow pulse so the block wall reads as "powered"
            const pulse = 0.08 + (Math.sin(mouthPhase * 0.7 + (c * 0.5 + r * 0.7)) * 0.5 + 0.5) * 0.09;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = wallGlowColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx + 1, by + 1, CELL - 2, CELL - 2);
            ctx.restore();
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
        // soft blinking halo behind the pellet to draw the eye
        ctx.save();
        ctx.globalAlpha = 0.22 + Math.sin(mouthPhase * 1.5) * 0.14;
        ctx.fillStyle = '#fff5b0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, pelletPulse + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        FX.sphere(ctx, p.x, p.y, pelletPulse, '#fff5b0');
      });

      const playerPos = pixelPos(player);
      ghosts.forEach((g, gi) => {
        if (g.respawnDelay > 0) return;
        const rawPos = pixelPos(g);
        // subtle idle bob so ghosts never look perfectly static, even when
        // stalled against a wall or waiting to turn
        const bob = Math.sin(mouthPhase * 2 + gi * 1.7) * 1.4;
        const pos = { x: rawPos.x, y: rawPos.y + bob };
        const frightened = frightTimer > 0;
        const flashing = frightened && frightTimer < 2 && Math.floor(frightTimer * 6) % 2 === 0;
        const ghostColor = flashing ? '#ffffff' : frightened ? '#2a3fd0' : g.color;
        FX.shadow(ctx, rawPos.x, rawPos.y + CELL * 0.4, CELL * 0.35, CELL * 0.12, 0.3);
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
            // pupils mostly track the movement direction, but blend in a
            // slight lean toward the player's position so idle/stalled
            // ghosts still read as "watching" rather than dead-eyed
            const toPX = playerPos.x - pos.x, toPY = playerPos.y - pos.y;
            const toPLen = Math.hypot(toPX, toPY) || 1;
            const lookX = g.dir.dx * 0.7 + (toPX / toPLen) * 0.3;
            const lookY = g.dir.dy * 0.7 + (toPY / toPLen) * 0.3;
            ctx.fillStyle = '#1a1a2a';
            ctx.beginPath();
            ctx.arc(pos.x - eyeOffX + lookX * 1.2, pos.y + eyeOffY + lookY * 1.2, 1.3, 0, Math.PI * 2);
            ctx.arc(pos.x + eyeOffX + lookX * 1.2, pos.y + eyeOffY + lookY * 1.2, 1.3, 0, Math.PI * 2);
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

      // juice layer: particle bursts + floating score text drawn on top of
      // every sprite, before the HUD text and hit-stun flash wash
      particles.draw(ctx);
      floatText.draw(ctx);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`DOTS ${dots.size + powerPellets.size}`, 8, 16);

      if (flashTimer > 0) {
        FX.flash(ctx, W, H, '#ff2a4a', (flashTimer / flashMax) * 0.4);
      }
    },
  };
}
