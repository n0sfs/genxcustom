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

  let SEGMENT_COUNT = 12;
  let TARGET_DESTROYED = 40;
  let BASE_STEP = 0.14;
  let MUSH_DENSITY_TOP = 0.15;
  let MUSH_DENSITY_BOTTOM = 0.05;
  let INITIAL_CHAINS = 1;
  let currentStage = 1;

  const MUSHROOM_COLOR = '#ff6f91';
  const MUSHROOM_DAMAGED = '#a8455f';
  const HEAD_COLOR = '#ffd24f';
  const BODY_COLORS = ['#6bff6b', '#3fd15a'];

  // Cheap per-stage backdrop shift (sky/soil gradient only — sprites stay put) so
  // the garden reads as a different place each stage, the same trick racing.js
  // uses for its day/dusk/night backdrops.
  const FIELD_THEMES = [
    ['#173a1a', '#0a2410'], // stage 1: lush garden
    ['#3a2f14', '#1c1508'], // stage 2: dry autumn field
    ['#1a1030', '#08051c'], // stage 3: toxic hive at night
    ['#123329', '#051911'], // stage 4: spore marsh
    ['#3a1f0e', '#1c0d04'], // stage 5: ember canyon
    ['#0e2a3a', '#04121c'], // stage 6: frostbite hollow
    ['#3a0e14', '#1c0308'], // stage 7: crimson thicket
    ['#1c0e3a', '#08041c'], // stage 8: voidbloom cavern
    ['#3a1408', '#1c0602'], // stage 9: molten hive
    ['#3a0e30', '#1c0416'], // stage 10+: swarm nexus
  ];
  function fieldTheme(stage) {
    return FIELD_THEMES[Math.min(FIELD_THEMES.length, Math.max(1, Math.floor(stage))) - 1];
  }

  let player, bullets, mushrooms, chains, prevKeys;
  let shotCooldown, destroyedTotal, waveCount, hitFlash;
  let levelTime = 0;
  let motes = [];

  // Level-instance-scoped juice systems — created once, cleared per stage.
  const fxParticles = FX.makeParticles(160);
  const fxFloatText = FX.makeFloatText(40);

  // Stage 1: baseline density/length/speed (unchanged from the original tuning).
  // Stage 2: denser field, longer centipede, faster stepping.
  // Stage 3: denser/longer/faster still, two centipede chains active from the start.
  // Stage 4: spore marsh — density and length creep up, chains stay at 2.
  // Stage 5: ember canyon — noticeably faster stepping, bigger target.
  // Stage 6: frostbite hollow — third simultaneous chain enters.
  // Stage 7: crimson thicket — dense field, longer centipedes, three chains.
  // Stage 8: voidbloom cavern — faster still, three chains, big segment target.
  // Stage 9: molten hive — fourth simultaneous chain enters.
  // Stage 10: swarm nexus — hand-built peak: densest field, longest/fastest
  // centipedes, four simultaneous chains, largest segment target.
  // Stage 11+: endless mode — smoothly scale stage 10's baseline, capped so it
  // never becomes literally impossible.
  function stageConfig(stage) {
    const s = Math.max(1, Math.floor(stage));
    if (s === 1) {
      return { densityTop: 0.15, densityBottom: 0.05, segmentCount: 12, baseStep: 0.14, target: 40, chains: 1 };
    }
    if (s === 2) {
      return { densityTop: 0.22, densityBottom: 0.08, segmentCount: 16, baseStep: 0.11, target: 55, chains: 1 };
    }
    if (s === 3) {
      return { densityTop: 0.28, densityBottom: 0.10, segmentCount: 18, baseStep: 0.09, target: 70, chains: 2 };
    }
    if (s === 4) {
      return { densityTop: 0.32, densityBottom: 0.12, segmentCount: 19, baseStep: 0.085, target: 80, chains: 2 };
    }
    if (s === 5) {
      return { densityTop: 0.35, densityBottom: 0.13, segmentCount: 20, baseStep: 0.08, target: 90, chains: 2 };
    }
    if (s === 6) {
      return { densityTop: 0.37, densityBottom: 0.14, segmentCount: 21, baseStep: 0.075, target: 100, chains: 3 };
    }
    if (s === 7) {
      return { densityTop: 0.39, densityBottom: 0.15, segmentCount: 22, baseStep: 0.07, target: 110, chains: 3 };
    }
    if (s === 8) {
      return { densityTop: 0.41, densityBottom: 0.16, segmentCount: 23, baseStep: 0.065, target: 120, chains: 3 };
    }
    if (s === 9) {
      return { densityTop: 0.43, densityBottom: 0.17, segmentCount: 24, baseStep: 0.06, target: 130, chains: 4 };
    }
    if (s === 10) {
      return { densityTop: 0.45, densityBottom: 0.18, segmentCount: 26, baseStep: 0.055, target: 145, chains: 4 };
    }
    const scale = Math.min(2.5, 1 + (s - 10) * 0.12);
    return {
      densityTop: Math.min(0.55, 0.45 * scale),
      densityBottom: Math.min(0.25, 0.18 * scale),
      segmentCount: Math.min(34, Math.round(26 + (s - 10) * 1.3)),
      baseStep: Math.max(0.045, 0.055 / scale),
      target: Math.round(145 + (s - 10) * 15),
      chains: 4,
    };
  }

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
      const density = row >= FIELD_ROWS - 2 ? MUSH_DENSITY_BOTTOM : MUSH_DENSITY_TOP;
      for (let col = 0; col < FIELD_COLS; col++) {
        if (Math.random() < density) {
          mushrooms.push({ row, col, hp: 2, squish: 0, swaySeed: Math.random() * Math.PI * 2 });
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

  function spawnChain(count, index = 0) {
    // Additional simultaneous chains (stage 3+) start offset from center and
    // head the opposite direction so they don't just stack on chain 0.
    const dir = index % 2 === 0 ? 1 : -1;
    const startCol = Math.max(0, Math.min(FIELD_COLS - 1, Math.floor(FIELD_COLS / 2) + index * 5 * dir));
    const segments = [];
    for (let i = 0; i < count; i++) {
      segments.push({ col: startCol - i * dir, row: 0 });
    }
    chains.push(makeChainFromSegments(segments, dir));
  }

  function difficultyFactor() {
    // waveCount is capped here because TARGET_DESTROYED (and therefore the number
    // of waves needed to reach it) grows without bound in endless mode — without
    // this cap the step speed keeps compounding forever even after baseStep itself
    // has hit its floor, eventually reaching near-instant stepping by stage ~15-20.
    return 1 + (destroyedTotal / TARGET_DESTROYED) * 0.9 + Math.min(waveCount, 5) * 0.12;
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

  // Ambient dust/pollen motes drifting through the garden — pure decoration.
  function spawnMotes() {
    const list = [];
    for (let i = 0; i < 22; i++) {
      list.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 8,
        vy: 6 + Math.random() * 10,
        r: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return list;
  }

  // Bug-guts debris burst when a centipede segment is shot — arcade-cute, not gory.
  function bugBurst(x, y, color) {
    fxParticles.burst(x, y, 9, {
      colors: [color, FX.shade(color, 30), '#eafcd8'],
      speedMin: 50, speedMax: 150, lifeMin: 0.25, lifeMax: 0.5,
      sizeMin: 2, sizeMax: 4, gravity: 90,
    });
  }

  // A brighter little spark marking the chain physically splitting in two.
  function splitPuff(x, y) {
    fxParticles.burst(x, y, 6, {
      colors: ['#ffffff', '#ffe89a'],
      speedMin: 90, speedMax: 190, lifeMin: 0.15, lifeMax: 0.3,
      sizeMin: 1.5, sizeMax: 3, gravity: 0,
    });
  }

  // Puff when a fresh mushroom pops up out of a killed segment's cell.
  function mushroomPopPuff(x, y) {
    fxParticles.burst(x, y, 7, {
      colors: [MUSHROOM_COLOR, '#ffd7e2'],
      speedMin: 20, speedMax: 70, lifeMin: 0.25, lifeMax: 0.45,
      sizeMin: 2, sizeMax: 3.5, gravity: -40,
    });
  }

  // Mushroom debris when hit by a bullet.
  function mushroomHitBurst(x, y, color) {
    fxParticles.burst(x, y, 6, {
      colors: [color, '#fff'],
      speedMin: 30, speedMax: 100, lifeMin: 0.2, lifeMax: 0.4,
      sizeMin: 1.5, sizeMax: 3, gravity: 60,
    });
  }

  // Quick spark at the gun tip when firing.
  function muzzleFlash(x, y) {
    fxParticles.burst(x, y, 4, {
      colors: ['#fff6c8', '#ffd24f'],
      speedMin: 40, speedMax: 90, lifeMin: 0.08, lifeMax: 0.14,
      sizeMin: 1.5, sizeMax: 3, angle: -Math.PI / 2, spread: 0.9, gravity: 0,
    });
  }

  // Sparks when a bug crashes into the player turret.
  function playerHitBurst(x, y) {
    fxParticles.burst(x, y, 12, {
      colors: ['#ff5c5c', '#ffae5c', '#fff'],
      speedMin: 60, speedMax: 200, lifeMin: 0.3, lifeMax: 0.6,
      sizeMin: 2, sizeMax: 4, gravity: 200,
    });
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
    init(stage = 1) {
      currentStage = stage;
      const cfg = stageConfig(stage);
      SEGMENT_COUNT = cfg.segmentCount;
      TARGET_DESTROYED = cfg.target;
      BASE_STEP = cfg.baseStep;
      MUSH_DENSITY_TOP = cfg.densityTop;
      MUSH_DENSITY_BOTTOM = cfg.densityBottom;
      INITIAL_CHAINS = cfg.chains;

      player = { x: W / 2 - PLAYER_W / 2, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H };
      bullets = [];
      prevKeys = {};
      shotCooldown = 0;
      destroyedTotal = 0;
      waveCount = 0;
      hitFlash = 0;
      levelTime = 0;
      fxParticles.clear();
      fxFloatText.clear();
      motes = spawnMotes();
      spawnMushroomField();
      chains = [];
      for (let i = 0; i < INITIAL_CHAINS; i++) {
        spawnChain(SEGMENT_COUNT, i);
      }
    },

    update(dt) {
      shotCooldown = Math.max(0, shotCooldown - dt);
      hitFlash = Math.max(0, hitFlash - dt);
      levelTime += dt;

      if (isDown('ArrowLeft', 'a')) player.x -= PLAYER_SPEED * dt;
      if (isDown('ArrowRight', 'd')) player.x += PLAYER_SPEED * dt;
      player.x = Math.max(0, Math.min(W - player.w, player.x));

      if (isDown('Space') && shotCooldown <= 0) {
        bullets.push({ x: player.x + player.w / 2 - 2, y: player.y - 6, w: 4, h: 10 });
        shotCooldown = SHOT_COOLDOWN;
        sfx('shoot');
        muzzleFlash(player.x + player.w / 2, player.y - 6);
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
            m.squish = 0.18;
            addScore(2);
            sfx('hit');
            mushroomHitBurst(c.x, c.y, m.hp >= 2 ? MUSHROOM_COLOR : MUSHROOM_DAMAGED);
            if (m.hp <= 0) {
              m.dead = true;
              addScore(3);
              fxFloatText.spawn(c.x, c.y - 4, '+3', '#ffd7e2', { size: 11, life: 0.6, vy: -30 });
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
              const points = isHead ? 100 : 10;
              addScore(points);
              sfx(isHead ? 'explosion' : 'hit');
              if (isHead) shake(0.1, 3);
              bugBurst(c.x, c.y, isHead ? HEAD_COLOR : BODY_COLORS[chain.colorSeed]);
              splitPuff(c.x, c.y);
              fxFloatText.spawn(c.x, c.y - 6, `+${points}`, isHead ? HEAD_COLOR : '#eafcd8', {
                size: isHead ? 20 : 13,
                life: isHead ? 1.0 : 0.7,
                vy: isHead ? -55 : -42,
              });
              if (!mushroomAt(seg.row, seg.col)) {
                mushrooms.push({ row: seg.row, col: seg.col, hp: 2, squish: 0.2, swaySeed: Math.random() * Math.PI * 2 });
                mushroomPopPuff(c.x, c.y);
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
            playerHitBurst(player.x + player.w / 2, player.y + player.h / 2);
            shake(0.18, 5);
            loseLife();
            return;
          }
        }
      }

      if (chains.length === 0 && destroyedTotal < TARGET_DESTROYED) {
        waveCount += 1;
        spawnChain(Math.min(SEGMENT_COUNT + 8, SEGMENT_COUNT + waveCount));
      }

      if (destroyedTotal >= TARGET_DESTROYED) {
        winLevel(100);
        return;
      }

      mushrooms.forEach((m) => { if (m.squish > 0) m.squish = Math.max(0, m.squish - dt); });

      motes.forEach((mo) => {
        mo.x += mo.vx * dt;
        mo.y += mo.vy * dt;
        if (mo.y > H + 4) { mo.y = -4; mo.x = Math.random() * W; }
        if (mo.x < -4) mo.x = W + 4;
        if (mo.x > W + 4) mo.x = -4;
      });

      fxParticles.update(dt);
      fxFloatText.update(dt);
    },

    draw(ctx) {
      const theme = fieldTheme(currentStage);
      FX.gradientRect(ctx, 0, 0, W, H, theme[0], theme[1]);

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

      // ambient drifting pollen/dust
      ctx.save();
      motes.forEach((mo) => {
        const tw = 0.5 + 0.5 * Math.sin(levelTime * 2 + mo.phase);
        ctx.globalAlpha = 0.15 + tw * 0.2;
        ctx.fillStyle = '#eaffb0';
        ctx.beginPath();
        ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // mushrooms
      mushrooms.forEach((m) => {
        const c = cellCenter(m.col, m.row);
        const sway = Math.sin(levelTime * 1.4 + (m.swaySeed || 0)) * 0.8;
        const squishT = m.squish > 0 ? m.squish / 0.2 : 0;
        const baseW = CELL_W - 8, baseH = CELL_H - 6;
        const w = baseW * (1 + squishT * 0.18);
        const h = baseH * (1 - squishT * 0.22);
        const x = c.x - w / 2 + sway, y = c.y - h / 2 + baseH * squishT * 0.11;
        const color = m.hp >= 2 ? MUSHROOM_COLOR : MUSHROOM_DAMAGED;
        FX.shadow(ctx, c.x, c.y + baseH / 2 + 1, w / 2, 3, 0.25);
        FX.bevelBlock(ctx, x, y, w, h, color, 4);
        // domed cap highlight for a rounder, more 3D read
        ctx.save();
        FX.roundRectPath(ctx, x, y, w, h, 4);
        ctx.clip();
        const cap = ctx.createRadialGradient(x + w * 0.35, y + h * 0.25, 1, x + w * 0.35, y + h * 0.25, w * 0.7);
        cap.addColorStop(0, 'rgba(255,255,255,0.5)');
        cap.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cap;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        FX.roundRectPath(ctx, x, y, w, h, 4);
        ctx.stroke();
        // spots for texture
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(c.x - w * 0.18 + sway, c.y - h * 0.12, 1.6, 0, Math.PI * 2);
        ctx.arc(c.x + w * 0.2 + sway, c.y + h * 0.08, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      // centipede chains
      chains.forEach((chain) => {
        // connective "shell" strokes drawn first so segments read as one linked
        // chain rather than loose floating balls.
        ctx.lineCap = 'round';
        for (let i = 1; i < chain.segments.length; i++) {
          const a = cellCenter(chain.segments[i - 1].col, chain.segments[i - 1].row);
          const b = cellCenter(chain.segments[i].col, chain.segments[i].row);
          const linkColor = FX.shade(BODY_COLORS[(i + chain.colorSeed) % BODY_COLORS.length], -45);
          ctx.strokeStyle = linkColor;
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        for (let i = chain.segments.length - 1; i >= 0; i--) {
          const seg = chain.segments[i];
          const c = cellCenter(seg.col, seg.row);
          const isHead = i === 0;
          const r = isHead ? 11 : 9;
          const baseColor = isHead ? HEAD_COLOR : BODY_COLORS[(i + chain.colorSeed) % BODY_COLORS.length];
          // subtle alternating plate shading so the body reads as segmented armor.
          const color = isHead ? baseColor : FX.shade(baseColor, i % 2 === 0 ? 6 : -8);
          FX.shadow(ctx, c.x, c.y + r * 0.7, r * 0.9, 2.5, 0.25);
          FX.sphere(ctx, c.x, c.y, r, color);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.stroke();
          if (!isHead) {
            // tiny leg ticks for that classic centipede silhouette
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(c.x - r * 0.8, c.y + r * 0.5);
            ctx.lineTo(c.x - r * 1.25, c.y + r * 0.95);
            ctx.moveTo(c.x + r * 0.8, c.y + r * 0.5);
            ctx.lineTo(c.x + r * 1.25, c.y + r * 0.95);
            ctx.stroke();
          }
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

      // player turret — small idle bob so it never sits perfectly still
      const idleBob = Math.sin(levelTime * 5) * 0.8;
      const turretColor = hitFlash > 0 && Math.floor(hitFlash * 20) % 2 === 0 ? '#ff5c5c' : '#4fe3d0';
      const turretY = player.y + idleBob * 0.4;
      FX.shadow(ctx, player.x + player.w / 2, player.y + player.h + 3, player.w / 2, 3, 0.3);
      FX.bevelBlock(ctx, player.x, turretY, player.w, player.h, turretColor, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      FX.roundRectPath(ctx, player.x, turretY, player.w, player.h, 3);
      ctx.stroke();
      const barrelY = turretY - 6 + idleBob;
      ctx.fillStyle = FX.shade(turretColor, -20);
      ctx.fillRect(player.x + player.w / 2 - 2, barrelY, 4, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeRect(player.x + player.w / 2 - 2, barrelY, 4, 8);
      // faint muzzle glow right after firing
      if (shotCooldown > SHOT_COOLDOWN * 0.6) {
        ctx.save();
        ctx.globalAlpha = (shotCooldown / SHOT_COOLDOWN - 0.6) / 0.4;
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.arc(player.x + player.w / 2, barrelY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // bullets
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(255,210,79,0.9)';
      ctx.fillStyle = '#ffd24f';
      bullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
      ctx.restore();

      fxParticles.draw(ctx);
      fxFloatText.draw(ctx);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`SEGMENTS ${destroyedTotal}/${TARGET_DESTROYED}`, 8, H - 6);

      // hit-stun wash + CRT cabinet finish
      if (hitFlash > 0) FX.flash(ctx, W, H, '#ff2b2b', Math.min(0.35, hitFlash * 0.6));
      FX.vignette(ctx, W, H, 0.32);
      FX.scanlines(ctx, W, H, 0.05);
    },
  };
}
