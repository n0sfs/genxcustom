function createTetrisLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 24;
  const COLS = 10, ROWS = 20;
  const BOARD_X = 30, BOARD_Y = 0;
  const TARGET_LINES = 16;
  const CLEAR_SCORES = [0, 10, 30, 60, 100];

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

  let board, piece, nextType, bag, fallTimer, fallInterval, linesCleared, particles;
  let leftPrev, rightPrev, leftHeld, rightHeld, leftRepeat, rightRepeat, rotPrev, dropPrev;

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
    for (const k of [0, -1, 1, -2, 2]) {
      const p3 = { ...p2, x: p2.x + k };
      if (canPlace(p3)) { piece = p3; sfx('bounce'); return; }
    }
  }

  function burst(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.35, color });
    }
  }

  function clearLines() {
    board.forEach((row, r) => {
      if (row.every((c) => c)) {
        for (let c = 0; c < COLS; c++) burst(BOARD_X + c * CELL + CELL / 2, BOARD_Y + r * CELL + CELL / 2, row[c]);
      }
    });
    const remaining = board.filter((row) => !row.every((c) => c));
    const cleared = ROWS - remaining.length;
    if (cleared > 0) {
      const newRows = Array.from({ length: cleared }, () => new Array(COLS).fill(null));
      board = [...newRows, ...remaining];
    }
    return cleared;
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
    const cleared = clearLines();
    if (cleared > 0) {
      addScore(CLEAR_SCORES[Math.min(cleared, 4)]);
      linesCleared += cleared;
      sfx(cleared >= 4 ? 'levelclear' : 'hit');
      shake(0.1, cleared >= 4 ? 4 : 2);
      fallInterval = Math.max(0.15, 0.8 - Math.floor(linesCleared / 3) * 0.07);
      if (linesCleared >= TARGET_LINES) {
        winLevel(50);
        return;
      }
    } else {
      sfx('bounce');
    }
    spawnPiece();
    if (!canPlace(piece)) {
      loseLife();
    }
  }

  return {
    init() {
      board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
      bag = [];
      nextType = drawBag();
      spawnPiece();
      fallInterval = 0.8;
      linesCleared = 0;
      particles = [];
      leftPrev = rightPrev = rotPrev = dropPrev = false;
      leftHeld = rightHeld = leftRepeat = rightRepeat = 0;
    },

    update(dt) {
      const leftDown = isDown('ArrowLeft', 'a');
      const rightDown = isDown('ArrowRight', 'd');
      const rotateDown = isDown('ArrowUp', 'w');
      const downDown = isDown('ArrowDown', 's');
      const dropDown = isDown('Space');

      if (leftDown) {
        if (!leftPrev) { tryMove(-1, 0); leftHeld = 0; leftRepeat = 0; }
        else {
          leftHeld += dt;
          if (leftHeld > 0.28) { leftRepeat += dt; if (leftRepeat > 0.05) { leftRepeat = 0; tryMove(-1, 0); } }
        }
      } else { leftHeld = 0; leftRepeat = 0; }
      leftPrev = leftDown;

      if (rightDown) {
        if (!rightPrev) { tryMove(1, 0); rightHeld = 0; rightRepeat = 0; }
        else {
          rightHeld += dt;
          if (rightHeld > 0.28) { rightRepeat += dt; if (rightRepeat > 0.05) { rightRepeat = 0; tryMove(1, 0); } }
        }
      } else { rightHeld = 0; rightRepeat = 0; }
      rightPrev = rightDown;

      const rotatePressed = rotateDown && !rotPrev;
      rotPrev = rotateDown;
      if (rotatePressed) tryRotate();

      const dropPressed = dropDown && !dropPrev;
      dropPrev = dropDown;
      if (dropPressed) {
        let dropped = 0;
        while (tryMove(0, 1)) dropped++;
        addScore(dropped);
        sfx('hop');
        lockPiece();
        if (linesCleared >= TARGET_LINES) return;
      }

      fallTimer += dt * (downDown ? 9 : 1);
      if (fallTimer >= fallInterval) {
        fallTimer = 0;
        if (!tryMove(0, 1)) lockPiece();
      }

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);
    },

    draw(ctx) {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#12121e';
      ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.015)';
            ctx.fillRect(BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, CELL);
          }
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(BOARD_X + c * CELL, BOARD_Y); ctx.lineTo(BOARD_X + c * CELL, BOARD_Y + ROWS * CELL); ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(BOARD_X, BOARD_Y + r * CELL); ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL); ctx.stroke();
      }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c]) {
            drawLockedCell(ctx, BOARD_X + c * CELL + 1, BOARD_Y + r * CELL + 1, CELL - 2, board[r][c]);
          }
        }
      }

      let ghost = { ...piece };
      while (canPlace({ ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      pieceCells(ghost).forEach(([gx, gy]) => {
        if (gy >= 0) ctx.strokeRect(BOARD_X + gx * CELL + 2, BOARD_Y + gy * CELL + 2, CELL - 4, CELL - 4);
      });

      pieceCells(piece).forEach(([gx, gy]) => {
        if (gy >= 0) drawActiveCell(ctx, BOARD_X + gx * CELL + 1, BOARD_Y + gy * CELL + 1, CELL - 2, SHAPES[piece.type].color);
      });

      particles.forEach((p) => {
        const a = Math.max(0, p.life / 0.35);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 3);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(0.4, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      const sideX = BOARD_X + COLS * CELL + 30;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px monospace';
      ctx.fillText('NEXT', sideX, 20);
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
      ctx.fillText(`LINES ${linesCleared}/${TARGET_LINES}`, sideX, 130);
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('LEFT/RIGHT MOVE', sideX, 160);
      ctx.fillText('UP ROTATE', sideX, 174);
      ctx.fillText('DOWN SOFT DROP', sideX, 188);
      ctx.fillText('SPACE HARD DROP', sideX, 202);
    },
  };
}
