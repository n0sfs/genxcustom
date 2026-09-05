function createBugBlitzLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL_W = 32;
  const CELL_H = 25;
  const FIELD_TOP = 15;
  const FIELD_ROWS = 16;
  const FIELD_COLS = Math.floor(W / CELL_W);

  const PLAYER_W = 22, PLAYER_H = 14;
  const PLAYER_Y = H - 32;
  const PLAYER_SPEED = 200;
  const SHOT_COOLDOWN = 0.17;
  const BULLET_SPEED = 460;

  const SEGMENT_COUNT = 12;
  const TARGET_DESTROYED = 40;
  const BASE_STEP = 0.14;

  const MUSHROOM_COLOR = '#ff6f91';
  const MUSHROOM_DAMAGED = '#a8455f';
  const HEAD_COLOR = '#ffd24f';
  const BODY_COLORS = ['#6bff6b', '#3fd15a'];

  let player, bullets, mushrooms, chains, prevKeys;
  let shotCooldown, destroyedTotal, waveCount, particles, popups, hitFlash;

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function cellCenter(col, row) {
    return { x: col * CELL_W + CELL_W / 2, y: FIELD_TOP + row * CELL_H + CELL_H / 2 };
  }

  function mushroomAt(row, col) {
    return mushrooms.find((m) => m.row === row && m.col === col);
  }

  function spawnMushroomField() {
    mushrooms = [];
    for (let row = 0; row < FIELD_ROWS; row++) {
      const density = row >= FIELD_ROWS - 2 ? 0.05 : 0.15;
      for (let col = 0; col < FIELD_COLS; col++) {
        if (Math.random() < density) {
          mushrooms.push({ row, col, hp: 2 });
        }
      }
    }
  }

  function makeChainFromSegments(segments, dir) {
    const head = segments[0];
    return {
      segments,
      dir,
      headCol: head.col,
      headRow: head.row,
      path: segments.map((s) => ({ col: s.col, row: s.row })),
      timer: 0,
      colorSeed: Math.floor(Math.random() * BODY_COLORS.length),
    };
  }

  function spawnChain(count) {
    const startCol = Math.floor(FIELD_COLS / 2);
    const segments = [];
    for (let i = 0; i < count; i++) {
      segments.push({ col: startCol - i, row: 0 });
    }
    chains.push(makeChainFromSegments(segments, 1));
  }

  function difficultyFactor() {
    return 1 + (destroyedTotal / TARGET_DESTROYED) * 0.9 + waveCount * 0.12;
  }

  function stepChain(chain) {
    const nextCol = chain.headCol + chain.dir;
    const blocked = nextCol < 0 || nextCol >= FIELD_COLS || mushroomAt(chain.headRow, nextCol);
    if (blocked) {
      chain.headRow += 1;
      chain.dir *= -1;
    } else {
      chain.headCol = nextCol;
    }
    chain.path.unshift({ col: chain.headCol, row: chain.headRow });
    if (chain.path.length > chain.segments.length) chain.path.length = chain.segments.length;
    for (let i = 0; i < chain.segments.length; i++) {
      chain.segments[i].col = chain.path[i].col;
      chain.segments[i].row = chain.path[i].row;
    }
  }

  function burst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 130;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.32, color });
    }
  }

  function splitChainAt(chainIdx, segIdx) {
    const chain = chains[chainIdx];
    const front = chain.segments.slice(0, segIdx);
    const back = chain.segments.slice(segIdx + 1);
    chains.splice(chainIdx, 1);
    const replacements = [];
    if (front.length) replacements.push(makeChainFromSegments(front, chain.dir));
    if (back.length) replacements.push(makeChainFromSegments(back, chain.dir));
    chains.splice(chainIdx, 0, ...replacements);
  }

  return {
    init() {
      player = { x: W / 2 - PLAYER_W / 2, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H };
      bullets = [];
      prevKeys = {};
      shotCooldown = 0;
      destroyedTotal = 0;
      waveCount = 0;
      particles = [];
      popups = [];
      hitFlash = 0;
      spawnMushroomField();
      chains = [];
      spawnChain(SEGMENT_COUNT);
    },

    update(dt) {
      shotCooldown = Math.max(0, shotCooldown - dt);
      hitFlash = Math.max(0, hitFlash - dt);

      if (isDown('ArrowLeft', 'a')) player.x -= PLAYER_SPEED * dt;
      if (isDown('ArrowRight', 'd')) player.x += PLAYER_SPEED * dt;
      player.x = Math.max(0, Math.min(W - player.w, player.x));

      if (isDown('Space') && shotCooldown <= 0) {
        bullets.push({ x: player.x + player.w / 2 - 2, y: player.y - 6, w: 4, h: 10 });
        shotCooldown = SHOT_COOLDOWN;
        sfx('shoot');
      }

      bullets.forEach((b) => (b.y -= BULLET_SPEED * dt));
      bullets = bullets.filter((b) => b.y + b.h > 0 && !b.hit);

      // bullets vs mushrooms
      bullets.forEach((b) => {
        if (b.hit) return;
        for (const m of mushrooms) {
          const c = cellCenter(m.col, m.row);
          const rect = { x: c.x - CELL_W / 2 + 3, y: c.y - CELL_H / 2 + 2, w: CELL_W - 6, h: CELL_H - 4 };
          if (rectsOverlap(b, rect)) {
            b.hit = true;
            m.hp -= 1;
            addScore(2);
            sfx('hit');
            burst(c.x, c.y, MUSHROOM_COLOR);
            if (m.hp <= 0) {
              m.dead = true;
              addScore(3);
            }
            break;
          }
        }
      });
      mushrooms = mushrooms.filter((m) => !m.dead);
      bullets = bullets.filter((b) => !b.hit);

      // bullets vs centipede segments
      outer:
      for (const b of bullets) {
        for (let ci = 0; ci < chains.length; ci++) {
          const chain = chains[ci];
          for (let si = 0; si < chain.segments.length; si++) {
            const seg = chain.segments[si];
            const c = cellCenter(seg.col, seg.row);
            const rect = { x: c.x - CELL_W / 2 + 4, y: c.y - CELL_H / 2 + 3, w: CELL_W - 8, h: CELL_H - 6 };
            if (rectsOverlap(b, rect)) {
              b.hit = true;
              const isHead = si === 0;
              destroyedTotal += 1;
              addScore(isHead ? 100 : 10);
              sfx(isHead ? 'explosion' : 'hit');
              if (isHead) shake(0.1, 3);
              burst(c.x, c.y, isHead ? HEAD_COLOR : BODY_COLORS[chain.colorSeed]);
              popups.push({ x: c.x, y: c.y, text: `+${isHead ? 100 : 10}`, life: 0.8 });
              if (!mushroomAt(seg.row, seg.col)) {
                mushrooms.push({ row: seg.row, col: seg.col, hp: 2 });
              }
              splitChainAt(ci, si);
              break outer;
            }
          }
        }
      }
      bullets = bullets.filter((b) => !b.hit);

      // advance centipede chains
      const speedFactor = difficultyFactor();
      chains.forEach((chain) => {
        chain.timer += dt * speedFactor;
        if (chain.timer >= BASE_STEP) {
          chain.timer = 0;
          stepChain(chain);
        }
      });

      // centipede vs player
      for (const chain of chains) {
        for (const seg of chain.segments) {
          const c = cellCenter(seg.col, seg.row);
          const rect = { x: c.x - CELL_W / 2 + 4, y: c.y - CELL_H / 2 + 3, w: CELL_W - 8, h: CELL_H - 6 };
          if (rectsOverlap(rect, player)) {
            hitFlash = 0.4;
            loseLife();
            return;
          }
        }
      }

      if (chains.length === 0 && destroyedTotal < TARGET_DESTROYED) {
        waveCount += 1;
        spawnChain(Math.min(14, SEGMENT_COUNT + waveCount));
      }

      if (destroyedTotal >= TARGET_DESTROYED) {
        winLevel(100);
        return;
      }

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);
      popups.forEach((p) => { p.y -= 26 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, '#173a1a', '#0a2410');

      // faint soil rows for texture
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= FIELD_ROWS; r++) {
        const y = FIELD_TOP + r * CELL_H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // mushrooms
      mushrooms.forEach((m) => {
        const c = cellCenter(m.col, m.row);
        const w = CELL_W - 8, h = CELL_H - 6;
        const x = c.x - w / 2, y = c.y - h / 2;
        const color = m.hp >= 2 ? MUSHROOM_COLOR : MUSHROOM_DAMAGED;
        FX.shadow(ctx, c.x, c.y + h / 2 + 1, w / 2, 3, 0.25);
        FX.bevelBlock(ctx, x, y, w, h, color, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        FX.roundRectPath(ctx, x, y, w, h, 4);
        ctx.stroke();
        // spots for texture
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(c.x - w * 0.18, c.y - h * 0.12, 1.6, 0, Math.PI * 2);
        ctx.arc(c.x + w * 0.2, c.y + h * 0.08, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      // centipede chains
      chains.forEach((chain) => {
        for (let i = chain.segments.length - 1; i >= 0; i--) {
          const seg = chain.segments[i];
          const c = cellCenter(seg.col, seg.row);
          const isHead = i === 0;
          const r = isHead ? 11 : 9;
          const color = isHead ? HEAD_COLOR : BODY_COLORS[(i + chain.colorSeed) % BODY_COLORS.length];
          FX.shadow(ctx, c.x, c.y + r * 0.7, r * 0.9, 2.5, 0.25);
          FX.sphere(ctx, c.x, c.y, r, color);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.stroke();
          if (isHead) {
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(c.x - 4, c.y - 2, 1.6, 0, Math.PI * 2);
            ctx.arc(c.x + 4, c.y - 2, 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(c.x - 4.5, c.y - 2.6, 0.7, 0, Math.PI * 2);
            ctx.arc(c.x + 3.5, c.y - 2.6, 0.7, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // player turret
      const turretColor = hitFlash > 0 && Math.floor(hitFlash * 20) % 2 === 0 ? '#ff5c5c' : '#4fe3d0';
      FX.shadow(ctx, player.x + player.w / 2, player.y + player.h + 3, player.w / 2, 3, 0.3);
      FX.bevelBlock(ctx, player.x, player.y, player.w, player.h, turretColor, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      FX.roundRectPath(ctx, player.x, player.y, player.w, player.h, 3);
      ctx.stroke();
      ctx.fillStyle = FX.shade(turretColor, -20);
      ctx.fillRect(player.x + player.w / 2 - 2, player.y - 6, 4, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeRect(player.x + player.w / 2 - 2, player.y - 6, 4, 8);

      // bullets
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(255,210,79,0.9)';
      ctx.fillStyle = '#ffd24f';
      bullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
      ctx.restore();

      particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 0.32);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffd24f';
        ctx.globalAlpha = Math.max(0, p.life / 0.8);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`SEGMENTS ${destroyedTotal}/${TARGET_DESTROYED}`, 8, H - 6);
    },
  };
}
