function createTetrisLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 24;
  const COLS = 10, ROWS = 20;
  const BOARD_X = 30, BOARD_Y = 0;
  const TARGET_LINES = 16;
  const CLEAR_SCORES = [0, 10, 30, 60, 100];
  const BASE_FALL_INTERVAL = 0.8;
  const MIN_FALL_INTERVAL = 0.15;
  const ENDLESS_CAP = 2.6;
  // Mouse-only controls (additive - see update() for the reasoning):
  // MOUSE_MOVE_INTERVAL paces the cursor-follow drift at the same cadence
  // as the keyboard's held-repeat move, MOUSE_CLICK_WINDOW is the longest
  // press-to-release gap that still counts as a "quick click" rotate.
  const MOUSE_MOVE_INTERVAL = 0.05;
  const MOUSE_CLICK_WINDOW = 0.2;

  const SHAPES = {
    I: { color: '#4fe3d0', rot: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ] },
    O: { color: '#ffd24f', rot: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ] },
    T: { color: '#c77dff', rot: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ] },
    S: { color: '#6bff6b', rot: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ] },
    Z: { color: '#ff5c5c', rot: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ] },
    J: { color: '#4f8cff', rot: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ] },
    L: { color: '#ff9a4f', rot: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ] },
  };
  const TYPES = Object.keys(SHAPES);

  let board, piece, nextType, bag, fallTimer, fallInterval, linesCleared, combo;
  let leftPrev, rightPrev, leftHeld, rightHeld, leftRepeat, rightRepeat, rotPrev, dropPrev;
  let mouseMoveTimer, mouseDownPrev, mouseHoldTimer;
  let baseFallInterval, targetLines, theme;

  // Instance-scoped juice systems - created once, updated/drawn every frame.
  const particles = FX.makeParticles(90);
  const floatText = FX.makeFloatText(20);

  // Line-clear sequencing: a piece lock that completes one or more rows
  // doesn't clear them instantly - the rows flash white for CLEAR_FLASH_DURATION
  // (clearingRows/clearTimer) while the piece is hidden, then finishClear()
  // does the actual compaction/scoring and kicks off a brief cascade-drop
  // animation (cascadeTimer/cascadeBottomRow/cascadeDropPx) for the rows that
  // just shifted down. None of this changes scoring, fall-speed scaling, or
  // stage/endless logic - it's purely a deferred-and-animated presentation
  // of the same clear that used to happen synchronously.
  const CLEAR_FLASH_DURATION = 0.16;
  const CASCADE_DURATION = 0.22;
  const SQUASH_DURATION = 0.16;
  let clearingRows, clearTimer;
  let cascadeTimer, cascadeBottomRow, cascadeDropPx;
  let squashCells, squashTimer;
  let flashColor, flashAlpha;

  // Cheap per-stage palette swap (backdrop/board/grid/garbage tint only —
  // same draw calls, just different colors) so the cabinet reads as a
  // different "cabinet mood" per stage: cool and calm with no garbage yet,
  // then progressively warmer/hotter tones as garbage piles up and the
  // stack gets more dangerous, finishing on a magenta "final boss" look
  // for stage 10. Endless mode reuses the stage-10 (apex) palette since
  // it's built on stage 10's setup.
  const THEMES = {
    calm: { bg: '#0a0a14', board: '#12121e', grid: 'rgba(255,255,255,0.04)', garbage: '#4a4a5e' },
    dusk: { bg: '#120a12', board: '#1a121c', grid: 'rgba(255,210,255,0.04)', garbage: '#5a3a56' },
    danger: { bg: '#140808', board: '#1e1010', grid: 'rgba(255,170,140,0.04)', garbage: '#6e3a3a' },
    ember: { bg: '#180a04', board: '#221008', grid: 'rgba(255,190,140,0.05)', garbage: '#7a4a2a' },
    inferno: { bg: '#1c0603', board: '#280a06', grid: 'rgba(255,120,80,0.06)', garbage: '#8a3a1e' },
    abyss: { bg: '#05060f', board: '#0a0c1c', grid: 'rgba(140,160,255,0.05)', garbage: '#3a3a6e' },
    apex: { bg: '#0c0410', board: '#160820', grid: 'rgba(255,140,255,0.06)', garbage: '#8a3a8a' },
  };

  // Pre-placed "garbage" rows for the bottom of the board — each one full
  // except for one or two gaps, so it's a genuine obstacle (must be
  // maneuvered around) rather than free lines. Leaves the top few rows
  // clear so a piece always has room to spawn.
  //
  // `shape` controls gap variety so later stages don't feel like the same
  // single-random-gap pattern with bigger numbers:
  //  - 'single'      original behavior: one random gap column per row.
  //  - 'alternating' the gap alternates between two fixed columns, forcing
  //                  a zigzag maneuver instead of one straight lane.
  //  - 'mixed'       alternating gaps, but every third row gets an easier
  //                  double-wide gap as a breather.
  //  - 'chaos'       gaps rotate through three columns spread across the
  //                  board (no single safe lane), with an easier double
  //                  gap every fourth row.
  function buildGarbageRows(count, color, shape = 'single') {
    const rows = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    const safeCount = Math.min(count, ROWS - 6);
    let gapCols = null;
    if (shape === 'alternating') {
      const a = Math.floor(Math.random() * COLS);
      let b = Math.floor(Math.random() * COLS);
      if (b === a) b = (b + Math.floor(COLS / 2)) % COLS;
      gapCols = [a, b];
    } else if (shape === 'mixed' || shape === 'chaos') {
      gapCols = [Math.floor(COLS * 0.15), Math.floor(COLS * 0.5), Math.floor(COLS * 0.85)];
    }
    for (let i = 0; i < safeCount; i++) {
      const r = ROWS - 1 - i;
      const wantsDoubleGap = (shape === 'mixed' && i % 3 === 2) || (shape === 'chaos' && i % 4 === 3);
      if (wantsDoubleGap) {
        const g1 = Math.floor(Math.random() * COLS);
        const g2 = (g1 + 1 + Math.floor(Math.random() * (COLS - 1))) % COLS;
        rows[r] = Array.from({ length: COLS }, (_, c) => (c === g1 || c === g2 ? null : color));
      } else {
        const gap = gapCols ? gapCols[i % gapCols.length] : Math.floor(Math.random() * COLS);
        rows[r] = Array.from({ length: COLS }, (_, c) => (c === gap ? null : color));
      }
    }
    return rows;
  }

  // Stage config: 10 hand-built stages, then a smooth endless ramp reusing
  // stage 10's setup as its base, capped so it never becomes literally
  // impossible.
  function stageConfig(stage) {
    const s = Math.max(1, Math.floor(stage));
    if (s === 1) {
      return { speedMult: 1, garbageRows: 0, targetLines: TARGET_LINES, theme: 'calm', shape: 'single' };
    }
    if (s === 2) {
      return { speedMult: 1.2, garbageRows: 3, targetLines: TARGET_LINES + 4, theme: 'dusk', shape: 'single' };
    }
    if (s === 3) {
      return { speedMult: 1.45, garbageRows: 6, targetLines: TARGET_LINES + 8, theme: 'danger', shape: 'single' };
    }
    if (s === 4) {
      return { speedMult: 1.65, garbageRows: 8, targetLines: TARGET_LINES + 12, theme: 'ember', shape: 'single' };
    }
    if (s === 5) {
      return { speedMult: 1.85, garbageRows: 9, targetLines: TARGET_LINES + 16, theme: 'ember', shape: 'alternating' };
    }
    if (s === 6) {
      return { speedMult: 2.05, garbageRows: 10, targetLines: TARGET_LINES + 20, theme: 'inferno', shape: 'alternating' };
    }
    if (s === 7) {
      return { speedMult: 2.25, garbageRows: 11, targetLines: TARGET_LINES + 24, theme: 'inferno', shape: 'mixed' };
    }
    if (s === 8) {
      return { speedMult: 2.45, garbageRows: 12, targetLines: TARGET_LINES + 28, theme: 'abyss', shape: 'mixed' };
    }
    if (s === 9) {
      return { speedMult: 2.65, garbageRows: 13, targetLines: TARGET_LINES + 32, theme: 'abyss', shape: 'chaos' };
    }
    if (s === 10) {
      return { speedMult: 2.85, garbageRows: 14, targetLines: TARGET_LINES + 36, theme: 'apex', shape: 'chaos' };
    }
    const scale = Math.min(1 + (s - 10) * 0.12, ENDLESS_CAP);
    return {
      speedMult: Math.min(2.85 * scale, 6), // absolute cap: never faster than ~2.1x stage-10 speed
      garbageRows: Math.min(Math.round(14 * scale), ROWS - 6),
      targetLines: Math.min(TARGET_LINES + 36 + Math.round((s - 10) * 2), 100),
      theme: 'apex',
      shape: 'chaos',
    };
  }

  function drawBag() {
    if (bag.length === 0) {
      bag = [...TYPES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function pieceCells(p) {
    return SHAPES[p.type].rot[p.r].map(([lx, ly]) => [p.x + lx, p.y + ly]);
  }

  // Center column (in board space, possibly fractional) of the piece's
  // occupied cells - used to compare against the mouse's board column for
  // the cursor-follow drift, since comparing raw piece.x would be biased
  // toward whichever local origin each shape happens to use.
  function pieceCenterCol(p) {
    const xs = pieceCells(p).map(([gx]) => gx);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }

  function canPlace(p) {
    for (const [gx, gy] of pieceCells(p)) {
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      if (gy >= 0 && board[gy][gx]) return false;
    }
    return true;
  }

  function tryMove(dx, dy) {
    const p2 = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (canPlace(p2)) { piece = p2; return true; }
    return false;
  }

  function tryRotate() {
    const p2 = { ...piece, r: (piece.r + 1) % 4 };
    // Try same-row kicks first, then a one-row upward kick — lets a
    // rotation succeed when pinned against the floor or a stack instead
    // of just silently failing (the classic "rotation didn't respond" feel).
    for (const dy of [0, -1]) {
      for (const dx of [0, -1, 1, -2, 2]) {
        const p3 = { ...p2, x: p2.x + dx, y: p2.y + dy };
        if (canPlace(p3)) { piece = p3; sfx('bounce'); return true; }
      }
    }
    return false;
  }

  function topOutBurst() {
    const cx = BOARD_X + (COLS * CELL) / 2, cy = BOARD_Y + ROWS * CELL * 0.35;
    particles.burst(cx, cy, 18, {
      colors: TYPES.map((t) => SHAPES[t].color),
      speedMin: 70, speedMax: 240, lifeMin: 0.4, lifeMax: 0.85, sizeMin: 3, sizeMax: 6, gravity: 260,
    });
    floatText.spawn(cx, BOARD_Y + 44, 'TOP OUT!', '#ff5c5c', { life: 1.2, vy: -26, size: 20 });
    flashColor = '#ff2a2a';
    flashAlpha = 0.5;
    shake(0.35, 6);
  }

  // Locked board cells: bevel block plus a soft inner shine and a crisp
  // dark silhouette outline, kept a touch duller than the active piece.
  function drawLockedCell(ctx, x, y, size, color) {
    FX.bevelBlock(ctx, x, y, size, size, color, 3);
    ctx.save();
    FX.roundRectPath(ctx, x, y, size, size, 3);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.3, y + size * 0.3, size * 0.22, size * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    FX.roundRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 3);
    ctx.stroke();
  }

  // Same locked-cell look, but briefly flattened/widened around its own
  // center — a cheap "thud" squash for the instant a piece lands.
  function drawLockedCellSquashed(ctx, x, y, size, color, t) {
    const squeeze = t * 0.32;
    const cx = x + size / 2, cy = y + size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + squeeze * 0.6, 1 - squeeze);
    ctx.translate(-cx, -cy);
    drawLockedCell(ctx, x, y, size, color);
    ctx.restore();
  }

  // Active falling piece / preview: brighter multi-stop glossy gradient,
  // a corner specular glint (glossy-plastic look), and a bold outline.
  function drawActiveCell(ctx, x, y, size, color) {
    FX.roundRectPath(ctx, x, y, size, size, 3);
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, FX.shade(color, 55));
    grad.addColorStop(0.35, color);
    grad.addColorStop(0.7, FX.shade(color, -20));
    grad.addColorStop(1, FX.shade(color, -48));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    FX.roundRectPath(ctx, x, y, size, size, 3);
    ctx.clip();
    ctx.fillStyle = FX.shade(color, 45);
    ctx.fillRect(x, y, size, Math.max(2, size * 0.2));
    ctx.fillStyle = FX.shade(color, -42);
    ctx.fillRect(x, y + size - Math.max(2, size * 0.16), size, Math.max(2, size * 0.16));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.24, y + size * 0.24, size * 0.11, size * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 3);
    ctx.stroke();
  }

  // If the piece is resting on the stack, a deliberate move/rotate buys
  // back some of the fall timer instead of letting it lock the instant the
  // countdown hits — a light, bounded lock-delay so a last-second slide-in
  // doesn't get cut off unfairly. Only called from discrete taps (not the
  // held-key auto-repeat), so it can't be exploited to stall forever.
  function refreshLockDelay() {
    if (!canPlace({ ...piece, y: piece.y + 1 })) {
      fallTimer = Math.min(fallTimer, fallInterval * 0.35);
    }
  }

  function spawnPiece() {
    const type = nextType;
    nextType = drawBag();
    piece = { type, r: 0, x: 3, y: 0 };
    fallTimer = 0;
  }

  function lockPiece() {
    pieceCells(piece).forEach(([gx, gy]) => {
      if (gy >= 0) board[gy][gx] = SHAPES[piece.type].color;
    });

    // Brief squash/thud on the cells that just landed.
    squashCells = pieceCells(piece).filter(([, gy]) => gy >= 0);
    squashTimer = SQUASH_DURATION;

    const fullRows = [];
    board.forEach((row, r) => { if (row.every((c) => c)) fullRows.push(r); });

    if (fullRows.length > 0) {
      // Don't clear/compact yet - let the rows flash for a beat first
      // (finishClear does the actual scoring + board compaction).
      const perRow = Math.max(4, Math.round(16 / fullRows.length));
      fullRows.forEach((r) => {
        particles.burst(BOARD_X + (COLS * CELL) / 2, BOARD_Y + r * CELL + CELL / 2, perRow, {
          colors: board[r].filter(Boolean),
          speedMin: 50, speedMax: 190, lifeMin: 0.3, lifeMax: 0.6, sizeMin: 2, sizeMax: 5, gravity: 220,
        });
      });
      clearingRows = fullRows;
      clearTimer = CLEAR_FLASH_DURATION;
      piece = null; // hide the active piece during the flash beat
    } else {
      combo = 0;
      sfx('hit');
      spawnPiece();
      if (!canPlace(piece)) {
        loseLife();
        topOutBurst();
      }
    }
  }

  // Runs once the flash beat finishes: compacts the board, applies score
  // (identical formula/values to before), kicks the cascade-drop visual,
  // then spawns the next piece / checks win-loss exactly as lockPiece used
  // to do synchronously.
  function finishClear() {
    const cleared = clearingRows.length;
    const remaining = board.filter((row) => !row.every((c) => c));
    const newRows = Array.from({ length: ROWS - remaining.length }, () => new Array(COLS).fill(null));
    board = [...newRows, ...remaining];

    const comboBonus = combo > 0 ? combo * 15 : 0;
    const gained = CLEAR_SCORES[Math.min(cleared, 4)] + comboBonus;
    addScore(gained);
    combo++;
    linesCleared += cleared;
    sfx(cleared >= 4 ? 'levelclear' : 'pickup');
    if (combo > 1) sfx('bumper');
    shake(0.1 + cleared * 0.03, 2 + cleared * 1.5);
    // Smooth, continuous ramp instead of a stepped one every 3 lines —
    // avoids the flat "nothing changed" stretch between speed bumps.
    fallInterval = Math.max(MIN_FALL_INTERVAL, baseFallInterval - linesCleared * 0.035);

    const tx = BOARD_X + (COLS * CELL) / 2;
    const ty = BOARD_Y + (clearingRows.reduce((a, b) => a + b, 0) / cleared) * CELL + CELL / 2;
    if (cleared >= 4) {
      floatText.spawn(tx, ty, 'TETRIS!', '#fff176', { life: 1.15, vy: -46, size: 22 });
      flashColor = '#ffffff';
      flashAlpha = 0.5;
      particles.burst(tx, ty, 14, {
        colors: ['#ffffff', '#fff176', '#9be7ff'],
        speedMin: 90, speedMax: 260, lifeMin: 0.4, lifeMax: 0.75, sizeMin: 2, sizeMax: 5, gravity: 200,
      });
    } else {
      floatText.spawn(tx, ty, `+${gained}`, cleared === 3 ? '#ffb84f' : '#9be7ff', { life: 0.8, vy: -38, size: 13 + cleared * 3 });
      flashColor = '#ffffff';
      flashAlpha = 0.16 + cleared * 0.05;
    }
    if (combo > 1) {
      floatText.spawn(tx, ty + 16, `COMBO x${combo}`, '#ffd24f', { life: 0.85, vy: -30, size: 12 });
    }

    cascadeBottomRow = Math.max(...clearingRows);
    cascadeDropPx = cleared * CELL;
    cascadeTimer = CASCADE_DURATION;
    clearingRows = [];
    clearTimer = 0;

    if (linesCleared >= targetLines) {
      winLevel(50);
      return;
    }
    spawnPiece();
    if (!canPlace(piece)) {
      loseLife();
      topOutBurst();
    }
  }

  return {
    init(stage = 1) {
      const cfg = stageConfig(stage);
      baseFallInterval = Math.max(MIN_FALL_INTERVAL, BASE_FALL_INTERVAL / cfg.speedMult);
      targetLines = cfg.targetLines;
      theme = THEMES[cfg.theme];
      board = cfg.garbageRows > 0
        ? buildGarbageRows(cfg.garbageRows, theme.garbage, cfg.shape)
        : Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
      bag = [];
      nextType = drawBag();
      spawnPiece();
      fallInterval = baseFallInterval;
      linesCleared = 0;
      combo = 0;
      particles.clear();
      floatText.clear();
      clearingRows = [];
      clearTimer = 0;
      cascadeTimer = 0;
      cascadeBottomRow = -1;
      cascadeDropPx = 0;
      squashCells = [];
      squashTimer = 0;
      flashColor = '#ffffff';
      flashAlpha = 0;
      leftPrev = rightPrev = rotPrev = dropPrev = false;
      leftHeld = rightHeld = leftRepeat = rightRepeat = 0;
      mouseMoveTimer = 0;
      mouseDownPrev = false;
      mouseHoldTimer = 0;
    },

    update(dt) {
      particles.update(dt);
      floatText.update(dt);
      if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.2);
      if (squashTimer > 0) squashTimer = Math.max(0, squashTimer - dt);
      if (cascadeTimer > 0) cascadeTimer = Math.max(0, cascadeTimer - dt);

      // Rows are mid-flash: piece is hidden and frozen, just let the beat
      // play out; finishClear() (below) is what actually resumes play.
      if (clearTimer > 0) {
        clearTimer -= dt;
        if (clearTimer <= 0) finishClear();
        return;
      }

      const leftDown = isDown('ArrowLeft', 'a');
      const rightDown = isDown('ArrowRight', 'd');
      const rotateDown = isDown('ArrowUp', 'w');
      const downDown = isDown('ArrowDown', 's');
      const dropDown = isDown('Space');

      if (leftDown) {
        if (!leftPrev) { tryMove(-1, 0); leftHeld = 0; leftRepeat = 0; refreshLockDelay(); }
        else {
          leftHeld += dt;
          if (leftHeld > 0.28) { leftRepeat += dt; if (leftRepeat > 0.05) { leftRepeat = 0; tryMove(-1, 0); } }
        }
      } else { leftHeld = 0; leftRepeat = 0; }
      leftPrev = leftDown;

      if (rightDown) {
        if (!rightPrev) { tryMove(1, 0); rightHeld = 0; rightRepeat = 0; refreshLockDelay(); }
        else {
          rightHeld += dt;
          if (rightHeld > 0.28) { rightRepeat += dt; if (rightRepeat > 0.05) { rightRepeat = 0; tryMove(1, 0); } }
        }
      } else { rightHeld = 0; rightRepeat = 0; }
      rightPrev = rightDown;

      // Mouse horizontal follow: nudge the piece one column at a time
      // toward wherever the cursor currently is, at the same cadence as
      // the keyboard's held-repeat move above (MOUSE_MOVE_INTERVAL matches
      // the 0.05s repeat step) so a mouse move can't warp the piece across
      // the board instantly - it drifts at the same max speed a held arrow
      // key would produce, it just doesn't need the key held.
      const mouseTargetCol = Math.max(0, Math.min(COLS - 1, Math.floor((api.mouseX - BOARD_X) / CELL)));
      const pieceCol = Math.round(pieceCenterCol(piece));
      if (api.mouseActive && mouseTargetCol !== pieceCol) {
        mouseMoveTimer += dt;
        if (mouseMoveTimer > MOUSE_MOVE_INTERVAL) {
          mouseMoveTimer = 0;
          tryMove(mouseTargetCol > pieceCol ? 1 : -1, 0);
        }
      } else {
        mouseMoveTimer = 0;
      }

      const rotatePressed = rotateDown && !rotPrev;
      rotPrev = rotateDown;
      if (rotatePressed && tryRotate()) refreshLockDelay();

      // Mouse-only rotate: a press already pulses a Space keydown for its
      // whole duration (game.js's click->action bridge), which this file's
      // dropDown/dropPressed below reads as an instant hard drop on the
      // press edge - so reusing that same press edge for rotate would fire
      // hard-drop and rotate together on every single click, which isn't a
      // distinct action and fights the existing Space binding. Instead,
      // treat a *quick* click (press then release inside MOUSE_CLICK_WINDOW)
      // as the rotate request, fired on release, calling the exact same
      // tryRotate() the keyboard rotate key uses. A longer press/hold - e.g.
      // held while dragging the piece across with the follow logic above -
      // does not rotate on release, so a deliberate drag never surprises
      // the player with an unwanted spin.
      const mouseIsDown = api.mouseDown;
      if (mouseIsDown && !mouseDownPrev) {
        mouseHoldTimer = 0;
      } else if (mouseIsDown) {
        mouseHoldTimer += dt;
      } else if (mouseDownPrev) {
        if (mouseHoldTimer <= MOUSE_CLICK_WINDOW && tryRotate()) refreshLockDelay();
      }
      mouseDownPrev = mouseIsDown;

      const dropPressed = dropDown && !dropPrev;
      dropPrev = dropDown;
      if (dropPressed) {
        let dropped = 0;
        while (tryMove(0, 1)) dropped++;
        addScore(dropped);
        sfx('hop');
        lockPiece();
        // A clear may have just hidden the piece (clearTimer > 0) - bail
        // out before the fall step below touches a now-null piece.
        if (clearTimer > 0 || linesCleared >= targetLines) return;
      }

      fallTimer += dt * (downDown ? 9 : 1);
      if (fallTimer >= fallInterval) {
        fallTimer = 0;
        const fell = tryMove(0, 1);
        if (!fell) lockPiece();
        else if (downDown) addScore(1);
      }
    },

    draw(ctx) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      // Recessed metal/glass cabinet panel housing the play field, instead
      // of a flat fill — a thin outer chassis bevel around an inset well.
      FX.bevelRect(ctx, BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8, '#262a38', 3);
      FX.insetRect(ctx, BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL, theme.board, 4);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.015)';
            ctx.fillRect(BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, CELL);
          }
        }
      }
      ctx.strokeStyle = theme.grid;
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(BOARD_X + c * CELL, BOARD_Y); ctx.lineTo(BOARD_X + c * CELL, BOARD_Y + ROWS * CELL); ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(BOARD_X, BOARD_Y + r * CELL); ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL); ctx.stroke();
      }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!board[r][c]) continue;
          let x = BOARD_X + c * CELL + 1;
          let y = BOARD_Y + r * CELL + 1;
          // Cascade-drop: rows that just shifted down (everything from the
          // top through the deepest cleared line) ease in from above.
          if (cascadeTimer > 0 && r <= cascadeBottomRow) {
            const t = cascadeTimer / CASCADE_DURATION;
            y -= cascadeDropPx * t * t;
          }
          const squashed = squashTimer > 0 && squashCells.some(([sx, sy]) => sx === c && sy === r);
          if (squashed) {
            drawLockedCellSquashed(ctx, x, y, CELL - 2, board[r][c], squashTimer / SQUASH_DURATION);
          } else {
            drawLockedCell(ctx, x, y, CELL - 2, board[r][c]);
          }
          if (clearingRows.includes(r)) {
            // Strobing white flash on rows about to clear, fading out as
            // the beat runs down instead of just vanishing instantly.
            const flicker = Math.floor(clearTimer * 40) % 2 === 0 ? 0.9 : 0.4;
            ctx.globalAlpha = flicker * (clearTimer / CLEAR_FLASH_DURATION);
            ctx.fillStyle = '#ffffff';
            FX.roundRectPath(ctx, x, y, CELL - 2, CELL - 2, 3);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      if (piece) {
        let ghost = { ...piece };
        while (canPlace({ ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
        const ghostColor = SHAPES[piece.type].color;
        pieceCells(ghost).forEach(([gx, gy]) => {
          if (gy < 0) return;
          const gxp = BOARD_X + gx * CELL + 2, gyp = BOARD_Y + gy * CELL + 2, gs = CELL - 4;
          ctx.save();
          ctx.globalAlpha = 0.14;
          FX.roundRectPath(ctx, gxp, gyp, gs, gs, 3);
          ctx.fillStyle = ghostColor;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          FX.roundRectPath(ctx, gxp + 0.5, gyp + 0.5, gs - 1, gs - 1, 3);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        });

        pieceCells(piece).forEach(([gx, gy]) => {
          if (gy >= 0) drawActiveCell(ctx, BOARD_X + gx * CELL + 1, BOARD_Y + gy * CELL + 1, CELL - 2, SHAPES[piece.type].color);
        });
      }

      // Juice layers: particles + floating score text, drawn after all
      // sprites and before the CRT-style post-processing at the very end.
      particles.draw(ctx);
      floatText.draw(ctx);
      if (flashAlpha > 0) FX.flash(ctx, W, H, flashColor, flashAlpha);

      const sideX = BOARD_X + COLS * CELL + 30;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px monospace';
      ctx.fillText('NEXT', sideX, 20);
      // Metal chassis frame around the chrome display glass.
      FX.bevelRect(ctx, sideX - 4, 26, 108, 78, '#262a38', 3);
      ctx.save();
      FX.roundRectPath(ctx, sideX, 30, 100, 70, 4);
      ctx.clip();
      FX.chrome(ctx, sideX, 30, 100, 70);
      ctx.fillStyle = 'rgba(10,10,20,0.55)';
      ctx.fillRect(sideX, 30, 100, 70);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      FX.roundRectPath(ctx, sideX + 0.5, 30.5, 99, 69, 4);
      ctx.stroke();
      SHAPES[nextType].rot[0].forEach(([lx, ly]) => {
        drawActiveCell(ctx, sideX + 10 + lx * 18, 40 + ly * 18, 16, SHAPES[nextType].color);
      });

      ctx.fillStyle = '#e8ecff';
      ctx.fillText(`LINES ${linesCleared}/${targetLines}`, sideX, 130);
      if (combo > 1) {
        ctx.fillStyle = '#ffd24f';
        ctx.fillText(`COMBO x${combo}`, sideX, 144);
      }
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('LEFT/RIGHT MOVE', sideX, 160);
      ctx.fillText('UP ROTATE', sideX, 174);
      ctx.fillText('DOWN SOFT DROP', sideX, 188);
      ctx.fillText('SPACE HARD DROP', sideX, 202);

      FX.scanlines(ctx, W, H, 0.05);
      FX.vignette(ctx, W, H, 0.3);
    },
  };
}
