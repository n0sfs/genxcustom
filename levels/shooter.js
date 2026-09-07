function createShooterLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ENEMY_W = 32, ENEMY_H = 20, GAP = 12;

  // Created once per level instance (not per frame/stage) — cheap shared
  // juice systems for hit sparks, debris and floating score text.
  const particles = FX.makeParticles(140);
  const floatText = FX.makeFloatText(24);

  let player, bullets, enemyBullets, enemies, enemyDir, enemyStepTimer;
  let shotCooldown, hitFlash, screenFlash, invuln, ufo, ufoTimer, ufoAlert, bunkers, stars, starsFar, combo, comboTimer;
  let muzzleFlash, engineTrailTimer;
  let lastMouseX;
  let cfg, rows, cols, gridW, startX, totalEnemies;
  const UFO_SCORES = [50, 50, 100, 100, 150, 300];

  // Ten hand-built stages: each escalates formation size, descent speed, UFO
  // frequency, fire rate and bunker toughness over the last. From stage 5 on,
  // `shape` swaps the plain rectangle for a different formation silhouette
  // (a gap down the middle, a diamond, two flanking squads) so the later
  // stages read as genuinely different waves, not just "more of the same
  // rectangle." Stage 10 is the boss-tier wave: dense, fast, relentless.
  // Stage 11+ ("endless mode") scales stage 10's setup smoothly with `stage`,
  // capped so it stays winnable. Each stage also tints the background nebula
  // a different hue (cheap, just gradient stops) so a new stage reads as "a
  // new sector" the way racing.js shifts day->dusk->night; endless mode keeps
  // stage 10's tint.
  const STAGE_CONFIGS = {
    1: { rows: 4, cols: 8, stepInterval: 0.5, dropDy: 14, ufoMin: 6, ufoMax: 11, fireRateMult: 1, bunkerHp: 1, theme: 'void', shape: 'rect' },
    2: { rows: 5, cols: 9, stepInterval: 0.42, dropDy: 16, ufoMin: 4, ufoMax: 8, fireRateMult: 1.3, bunkerHp: 1, theme: 'crimson', shape: 'rect' },
    3: { rows: 6, cols: 10, stepInterval: 0.34, dropDy: 18, ufoMin: 3, ufoMax: 6, fireRateMult: 1.6, bunkerHp: 2, theme: 'venom', shape: 'rect' },
    4: { rows: 6, cols: 11, stepInterval: 0.31, dropDy: 19, ufoMin: 2.6, ufoMax: 5.5, fireRateMult: 1.9, bunkerHp: 2, theme: 'amber', shape: 'rect' },
    5: { rows: 7, cols: 11, stepInterval: 0.28, dropDy: 20, ufoMin: 2.3, ufoMax: 5.0, fireRateMult: 2.15, bunkerHp: 2, theme: 'azure', shape: 'gap' },
    6: { rows: 7, cols: 12, stepInterval: 0.26, dropDy: 21, ufoMin: 2.1, ufoMax: 4.6, fireRateMult: 2.4, bunkerHp: 3, theme: 'violet', shape: 'diamond' },
    7: { rows: 8, cols: 12, stepInterval: 0.24, dropDy: 22, ufoMin: 1.9, ufoMax: 4.2, fireRateMult: 2.65, bunkerHp: 3, theme: 'solar', shape: 'flanks' },
    8: { rows: 8, cols: 13, stepInterval: 0.22, dropDy: 23, ufoMin: 1.7, ufoMax: 3.8, fireRateMult: 2.9, bunkerHp: 3, theme: 'frost', shape: 'rect' },
    9: { rows: 9, cols: 13, stepInterval: 0.20, dropDy: 24, ufoMin: 1.55, ufoMax: 3.4, fireRateMult: 3.2, bunkerHp: 4, theme: 'inferno', shape: 'diamond' },
    10: { rows: 9, cols: 14, stepInterval: 0.18, dropDy: 26, ufoMin: 1.4, ufoMax: 3.0, fireRateMult: 3.6, bunkerHp: 4, theme: 'apex', shape: 'rect' },
  };

  const NEBULA_THEMES = {
    void: ['#0a0a1e', '#120a1c', '#05060a'],
    crimson: ['#1e0a12', '#220a1e', '#06050a'],
    venom: ['#07160f', '#0a1e2a', '#05080a'],
    amber: ['#1e1608', '#2a1a06', '#0a0704'],
    azure: ['#071626', '#0a1e3a', '#040a14'],
    violet: ['#160a26', '#1e0a3a', '#0a0514'],
    solar: ['#261007', '#3a1206', '#140603'],
    frost: ['#0a1e26', '#0a2e3a', '#040e14'],
    inferno: ['#260a05', '#3a0f06', '#140503'],
    apex: ['#260a1e', '#3a0a2a', '#14050f'],
  };

  function getStageConfig(stage) {
    const s = Math.max(1, Math.floor(stage) || 1);
    if (s <= 10) return STAGE_CONFIGS[s];
    const scale = Math.min(2.6, 1 + (s - 10) * 0.12);
    const s10 = STAGE_CONFIGS[10];
    return {
      rows: s10.rows,
      cols: s10.cols,
      stepInterval: Math.max(0.14, s10.stepInterval / scale),
      dropDy: s10.dropDy * Math.min(1.6, scale),
      ufoMin: Math.max(1.2, s10.ufoMin / scale),
      ufoMax: Math.max(2.5, s10.ufoMax / scale),
      fireRateMult: s10.fireRateMult * scale,
      bunkerHp: s10.bunkerHp,
      theme: s10.theme,
      shape: s10.shape,
    };
  }

  const BUNKER_PATTERN = ['.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XX...XX'];
  const BLOCK = 6;
  const BUNKER_XS = [60, 220, 380, 540];
  const BUNKER_Y = 366;

  function spawnBunkers() {
    const hp = cfg.bunkerHp;
    bunkers = BUNKER_XS.map((x) => ({
      x, y: BUNKER_Y, w: BUNKER_PATTERN[0].length * BLOCK, h: BUNKER_PATTERN.length * BLOCK,
      blocks: BUNKER_PATTERN.map((row) => row.split('').map((ch) => (ch === 'X' ? hp : 0))),
    }));
  }

  // Destroys every bunker block overlapping `rect`; returns true if any block was hit.
  function hitBunkers(rect) {
    for (const bk of bunkers) {
      if (!(rect.x < bk.x + bk.w && rect.x + rect.w > bk.x && rect.y < bk.y + bk.h && rect.y + rect.h > bk.y)) continue;
      const c0 = Math.max(0, Math.floor((rect.x - bk.x) / BLOCK));
      const c1 = Math.min(BUNKER_PATTERN[0].length - 1, Math.floor((rect.x + rect.w - 1 - bk.x) / BLOCK));
      const r0 = Math.max(0, Math.floor((rect.y - bk.y) / BLOCK));
      const r1 = Math.min(BUNKER_PATTERN.length - 1, Math.floor((rect.y + rect.h - 1 - bk.y) / BLOCK));
      let hit = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (bk.blocks[r][c] > 0) { bk.blocks[r][c] -= 1; hit = true; }
        }
      }
      if (hit) return true;
    }
    return false;
  }

  function spawnStars() {
    stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * W,
        y0: Math.random() * H,
        speed: 15 + Math.random() * 45,
        r: Math.random() < 0.75 ? 0.8 : 1.6,
        tw: Math.random() * Math.PI * 2,
      });
    }
    // Slower, dimmer, bigger far layer drawn beneath `stars` for a cheap
    // sense of parallax depth in the nebula.
    starsFar = [];
    for (let i = 0; i < 18; i++) {
      starsFar.push({
        x: Math.random() * W,
        y0: Math.random() * H,
        speed: 4 + Math.random() * 10,
        r: 1 + Math.random() * 1.4,
      });
    }
  }

  function drawStarfield(ctx) {
    const t = Date.now() / 1000;
    // faint nebula wash behind the stars
    const palette = NEBULA_THEMES[cfg.theme] || NEBULA_THEMES.void;
    const neb = ctx.createLinearGradient(0, 0, 0, H);
    neb.addColorStop(0, palette[0]);
    neb.addColorStop(0.5, palette[1]);
    neb.addColorStop(1, palette[2]);
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);
    starsFar.forEach((s) => {
      const y = (s.y0 + t * s.speed) % H;
      ctx.fillStyle = 'rgba(180,190,230,0.28)';
      ctx.fillRect(s.x, y, s.r, s.r);
    });
    stars.forEach((s) => {
      const y = (s.y0 + t * s.speed) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + s.tw);
      ctx.fillStyle = `rgba(220,230,255,${0.35 + tw * 0.5})`;
      ctx.fillRect(s.x, y, s.r, s.r);
    });
  }

  const INVADER_PATTERNS = [
    ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'X.X.X.X'],
    ['X.....X', '..XXX..', '.XXXXX.', 'XXXXXXX', 'X.X.X.X'],
    ['.XXXXX.', 'XXXXXXX', 'XX.X.XX', '.X...X.', 'X.....X'],
  ];

  // Masks out grid cells so higher stages can read as a genuinely different
  // formation silhouette instead of just a bigger rectangle: 'gap' opens a
  // short canyon through the middle rows, 'diamond' rounds the whole block
  // into a diamond, 'flanks' splits it into two separated squads.
  function isCellActive(shape, r, c, rows, cols) {
    switch (shape) {
      case 'gap': {
        const midRow0 = Math.floor((rows - 1) / 2) - 1;
        const midRow1 = midRow0 + 2;
        const gapCol0 = Math.floor(cols / 2) - 1;
        const gapCol1 = gapCol0 + 1;
        return !(r >= midRow0 && r <= midRow1 && c >= gapCol0 && c <= gapCol1);
      }
      case 'diamond': {
        const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
        const nx = cx > 0 ? Math.abs(c - cx) / cx : 0;
        const ny = cy > 0 ? Math.abs(r - cy) / cy : 0;
        return nx + ny <= 1.08;
      }
      case 'flanks': {
        const gapStart = Math.floor(cols * 0.38);
        const gapEnd = Math.ceil(cols * 0.62) - 1;
        return c < gapStart || c > gapEnd;
      }
      default:
        return true;
    }
  }

  function spawnEnemies() {
    gridW = cols * (ENEMY_W + GAP) - GAP;
    startX = (W - gridW) / 2;
    enemies = [];
    const shape = cfg.shape || 'rect';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isCellActive(shape, r, c, rows, cols)) continue;
        enemies.push({
          x: startX + c * (ENEMY_W + GAP),
          y: 40 + r * (ENEMY_H + GAP),
          w: ENEMY_W, h: ENEMY_H,
          alive: true,
          color: r === 0 ? '#ff4fa3' : r === 1 ? '#ffd24f' : r === 2 ? '#4fe3d0' : '#6bff6b',
          pattern: INVADER_PATTERNS[Math.min(r, 2)],
          bobSeed: Math.random() * Math.PI * 2,
        });
      }
    }
    totalEnemies = enemies.length;
  }

  function drawInvader(ctx, e) {
    const rows = e.pattern;
    const cols = rows[0].length;
    const cw = e.w / cols, ch = e.h / rows.length;
    // Purely visual idle bob so the formation never looks frozen even
    // between step ticks — does not touch e.y, which drives collision/logic.
    const bob = Math.sin(Date.now() / 260 + e.bobSeed) * 1.1;
    const ex = e.x, ey = e.y + bob;
    // soft glow behind the sprite, then shade rows light-to-dark for a lit, chunky pixel-art look
    FX.shadow(ctx, ex + e.w / 2, e.y + e.h + 2, e.w / 2.4, 3, 0.25);
    for (let r = 0; r < rows.length; r++) {
      ctx.fillStyle = FX.shade(e.color, 22 - r * 14);
      for (let c = 0; c < cols; c++) {
        if (rows[r][c] === 'X') ctx.fillRect(ex + c * cw, ey + r * ch, cw + 0.5, ch + 0.5);
      }
    }
    // bright top-edge highlight strip for a raised, lit-from-above look
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let c = 0; c < cols; c++) {
      if (rows[0][c] === 'X') ctx.fillRect(ex + c * cw, ey, cw + 0.5, Math.max(1, ch * 0.25));
    }
    // dark rim shadow along the bottom edge for depth
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    const lastRow = rows.length - 1;
    for (let c = 0; c < cols; c++) {
      if (rows[lastRow][c] === 'X') ctx.fillRect(ex + c * cw, ey + lastRow * ch + ch * 0.7, cw + 0.5, ch * 0.3);
    }
    // dark silhouette outline around the whole sprite footprint
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ex + 0.5, ey + 0.5, e.w - 1, e.h - 1);
  }

  return {
    init(stage = 1) {
      cfg = getStageConfig(stage);
      rows = cfg.rows;
      cols = cfg.cols;
      player = { x: W / 2 - 16, y: H - 40, w: 32, h: 16, speed: 220 };
      bullets = [];
      enemyBullets = [];
      spawnEnemies();
      enemyDir = 1;
      enemyStepTimer = 0;
      shotCooldown = 0;
      invuln = 1.2;
      hitFlash = 0;
      screenFlash = 0;
      muzzleFlash = 0;
      engineTrailTimer = 0;
      lastMouseX = api.mouseX;
      particles.clear();
      ufo = null;
      ufoTimer = cfg.ufoMin + Math.random() * (cfg.ufoMax - cfg.ufoMin);
      ufoAlert = 0;
      floatText.clear();
      combo = 0;
      comboTimer = 0;
      spawnBunkers();
      spawnStars();
    },

    update(dt) {
      invuln = Math.max(0, invuln - dt);
      hitFlash = Math.max(0, hitFlash - dt);
      screenFlash = Math.max(0, screenFlash - dt);
      muzzleFlash = Math.max(0, muzzleFlash - dt);
      comboTimer = Math.max(0, comboTimer - dt);
      ufoAlert = Math.max(0, ufoAlert - dt);
      shotCooldown = Math.max(0, shotCooldown - dt);

      const keyLeft = isDown('ArrowLeft', 'a');
      const keyRight = isDown('ArrowRight', 'd');
      if (keyLeft) player.x -= player.speed * dt;
      if (keyRight) player.x += player.speed * dt;

      // Mouse control: only kicks in on frames where the mouse actually
      // moved (so a stationary cursor never fights keyboard/touch input),
      // and keyboard/touch always wins outright on any frame they're held —
      // this lets the player swap control schemes instantly in either
      // direction. Moves the ship toward the cursor using the same max
      // speed as keyboard movement, so it eases rather than teleports.
      const mouseMoved = typeof api.mouseX === 'number' && api.mouseX !== lastMouseX;
      if (typeof api.mouseX === 'number') lastMouseX = api.mouseX;
      if (!keyLeft && !keyRight && mouseMoved) {
        const targetX = api.mouseX - player.w / 2;
        const dx = targetX - player.x;
        const maxStep = player.speed * dt;
        if (Math.abs(dx) <= maxStep) player.x = targetX;
        else player.x += Math.sign(dx) * maxStep;
      }

      player.x = Math.max(0, Math.min(W - player.w, player.x));

      // Continuous engine exhaust trail behind both nacelles, even when idle,
      // so the ship never looks static while sat on the pad.
      engineTrailTimer -= dt;
      if (engineTrailTimer <= 0) {
        engineTrailTimer = 0.03;
        [player.x + 4, player.x + player.w - 4].forEach((fx) => {
          particles.spawn(fx, player.y + player.h + 2, {
            vx: (Math.random() - 0.5) * 12,
            vy: 60 + Math.random() * 40,
            life: 0.22,
            size: 2 + Math.random() * 1.5,
            color: Math.random() < 0.5 ? '#ffd28a' : '#ff9a4f',
          });
        });
      }

      if (isDown('Space') && shotCooldown <= 0) {
        bullets.push({ x: player.x + player.w / 2 - 2, y: player.y, w: 4, h: 10 });
        shotCooldown = 0.28;
        muzzleFlash = 0.06;
        particles.burst(player.x + player.w / 2, player.y - 2, 4, {
          colors: ['#fff6c8', '#ffd24f'], speedMin: 30, speedMax: 90, lifeMin: 0.08, lifeMax: 0.16,
          sizeMin: 1.5, sizeMax: 3, angle: -Math.PI / 2, spread: 0.9,
        });
        sfx('shoot');
      }

      bullets.forEach((b) => (b.y -= 420 * dt));
      bullets = bullets.filter((b) => b.y + b.h > 0);
      bullets.forEach((b) => {
        if (hitBunkers(b)) {
          b.hit = true;
          sfx('bounce');
          particles.burst(b.x + b.w / 2, b.y, 5, { colors: ['#9be89b', '#6bff6b'], speedMin: 20, speedMax: 70, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 1.5, sizeMax: 3 });
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      const aliveEnemies = enemies.filter((e) => e.alive);
      // Aggression ramps as the ranks thin — both movement speed and firing
      // rate scale off the same curve, so the last few invaders stay tense
      // instead of the fight fizzling out once most of the wave is dead. This
      // within-stage ramp layers on top of the stage's own baseline pace.
      const pressureFactor = 1 + (1 - aliveEnemies.length / totalEnemies) * 2.2;
      enemyStepTimer += dt * pressureFactor;
      const stepInterval = cfg.stepInterval;
      let edgeHit = false;
      if (enemyStepTimer >= stepInterval) {
        enemyStepTimer = 0;
        const dx = enemyDir * 10;
        aliveEnemies.forEach((e) => (e.x += dx));
        aliveEnemies.forEach((e) => {
          if (e.x < 4 || e.x + e.w > W - 4) edgeHit = true;
        });
        if (edgeHit) {
          enemyDir *= -1;
          aliveEnemies.forEach((e) => (e.y += cfg.dropDy));
        }
        aliveEnemies.forEach((e) => hitBunkers(e));
      }

      if (aliveEnemies.length && Math.random() < 0.5 * dt * pressureFactor * cfg.fireRateMult) {
        const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        enemyBullets.push({ x: shooter.x + shooter.w / 2 - 2, y: shooter.y + shooter.h, w: 4, h: 10 });
      }
      enemyBullets.forEach((b) => (b.y += 260 * dt));
      enemyBullets = enemyBullets.filter((b) => b.y < H);
      enemyBullets.forEach((b) => {
        if (hitBunkers(b)) {
          b.hit = true;
          sfx('bounce');
          particles.burst(b.x + b.w / 2, b.y, 5, { colors: ['#9be89b', '#6bff6b'], speedMin: 20, speedMax: 70, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 1.5, sizeMax: 3 });
        }
      });
      enemyBullets = enemyBullets.filter((b) => !b.hit);

      bullets.forEach((b) => {
        if (b.hit) return;
        for (const e of aliveEnemies) {
          if (rectsOverlap(b, e)) {
            e.alive = false;
            b.hit = true;
            combo++;
            comboTimer = 1.6;
            const bonus = 10 + Math.min(30, (combo - 1) * 4);
            addScore(bonus);
            // debris burst breaking apart in the enemy's own colors, plus a
            // few bright white sparks so the pop reads against dark hulls too
            particles.burst(e.x + e.w / 2, e.y + e.h / 2, 12, {
              colors: [e.color, FX.shade(e.color, -30), '#ffffff'],
              speedMin: 50, speedMax: 200, lifeMin: 0.25, lifeMax: 0.5,
              sizeMin: 2, sizeMax: 5, gravity: 90,
            });
            // milestone kills in a streak get a bigger, punchier boom
            sfx(combo > 1 && combo % 5 === 0 ? 'explosion' : 'hit');
            shake(0.08, 2);
            floatText.spawn(e.x + e.w / 2, e.y, combo > 1 ? `+${bonus} x${combo}` : `+${bonus}`, '#ffd24f', { life: 0.6, size: 11 });
            break;
          }
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      if (!ufo) {
        ufoTimer -= dt;
        if (ufoTimer <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          ufo = { x: dir > 0 ? -36 : W + 36, y: 20, w: 36, h: 14, dir, alive: true };
          // brief screen-edge glow to call out the bonus target arriving
          ufoAlert = 0.6;
        }
      } else {
        ufo.x += ufo.dir * 90 * dt;
        if (ufo.x < -60 || ufo.x > W + 60) {
          // Missed it: re-arm the normal min/max wait. Without this, ufoTimer
          // (last set to a <=0 trigger value) stays <=0 forever, so the very
          // next frame's `if (!ufo)` check spawns another UFO immediately —
          // one dodge of a UFO would otherwise chain into a nonstop stream.
          ufo = null;
          ufoTimer = cfg.ufoMin + Math.random() * (cfg.ufoMax - cfg.ufoMin);
        }
      }

      if (ufo) {
        bullets.forEach((b) => {
          if (b.hit || !ufo) return;
          if (rectsOverlap(b, ufo)) {
            b.hit = true;
            combo++;
            comboTimer = 1.6;
            const bonus = UFO_SCORES[Math.floor(Math.random() * UFO_SCORES.length)];
            addScore(bonus);
            particles.burst(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, 16, {
              colors: ['#ff4fa3', '#ffe3ee', '#ffffff'], speedMin: 60, speedMax: 220,
              lifeMin: 0.3, lifeMax: 0.55, sizeMin: 2, sizeMax: 5, gravity: 60,
            });
            floatText.spawn(ufo.x + ufo.w / 2, ufo.y, `+${bonus}`, '#ff9fd0', { life: 0.9, size: 13 });
            sfx('explosion');
            shake(0.1, 3);
            ufo = null;
            ufoTimer = (cfg.ufoMin + 3) + Math.random() * (cfg.ufoMax - cfg.ufoMin + 3);
          }
        });
        bullets = bullets.filter((b) => !b.hit);
      }

      particles.update(dt);
      floatText.update(dt);

      if (invuln <= 0) {
        for (const b of enemyBullets) {
          if (rectsOverlap(b, player)) {
            b.hit = true;
            hitFlash = 0.5;
            screenFlash = 0.35;
            invuln = 1.2;
            particles.burst(player.x + player.w / 2, player.y + player.h / 2, 14, {
              colors: ['#ff5c5c', '#ffb347', '#ffffff'], speedMin: 50, speedMax: 200,
              lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 5, gravity: 70,
            });
            shake(0.18, 5);
            sfx('hurt');
            loseLife();
            return;
          }
        }
      }
      enemyBullets = enemyBullets.filter((b) => !b.hit);

      if (aliveEnemies.some((e) => e.y + e.h >= player.y)) {
        screenFlash = 0.35;
        shake(0.18, 5);
        sfx('hurt');
        loseLife();
        return;
      }

      if (aliveEnemies.length === 0) {
        winLevel(50);
      }
    },

    draw(ctx) {
      drawStarfield(ctx);

      // Screen-edge alert glow when the bonus UFO shows up — a cheap way to
      // sell "something big just entered" without touching gameplay.
      if (ufoAlert > 0) {
        const a = (ufoAlert / 0.6) * 0.5;
        const edgeGrad = ctx.createLinearGradient(0, 0, 0, H);
        edgeGrad.addColorStop(0, `rgba(255,79,163,${a})`);
        edgeGrad.addColorStop(0.15, 'rgba(255,79,163,0)');
        edgeGrad.addColorStop(0.85, 'rgba(255,79,163,0)');
        edgeGrad.addColorStop(1, `rgba(255,79,163,${a})`);
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, W, H);
      }

      const shipColor = hitFlash > 0 && Math.floor(hitFlash * 20) % 2 === 0 ? '#ff5c5c' : '#4fe3d0';
      FX.shadow(ctx, player.x + player.w / 2, player.y + player.h + 4, player.w / 2, 4, 0.3);

      // engine thruster glow, drawn under the hull
      const flicker = 0.7 + 0.3 * Math.sin(Date.now() / 45);
      [player.x + 4, player.x + player.w - 4].forEach((fx) => {
        const flameGrad = ctx.createRadialGradient(fx, player.y + player.h + 3, 0, fx, player.y + player.h + 3, 8 * flicker);
        flameGrad.addColorStop(0, 'rgba(255,240,180,0.9)');
        flameGrad.addColorStop(0.5, 'rgba(255,150,60,0.5)');
        flameGrad.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.ellipse(fx, player.y + player.h + 3, 4 * flicker, 8 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      const shipGrad = ctx.createLinearGradient(player.x, player.y - 8, player.x, player.y + player.h);
      shipGrad.addColorStop(0, FX.shade(shipColor, 55));
      shipGrad.addColorStop(0.5, shipColor);
      shipGrad.addColorStop(1, FX.shade(shipColor, -25));
      ctx.fillStyle = shipGrad;
      ctx.beginPath();
      ctx.moveTo(player.x + player.w / 2, player.y - 8);
      ctx.lineTo(player.x + player.w - 3, player.y + player.h);
      ctx.lineTo(player.x + 3, player.y + player.h);
      ctx.closePath();
      ctx.fill();
      // silhouette outline
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // chrome engine nacelles
      FX.chrome(ctx, player.x, player.y + player.h - 6, 8, 6);
      FX.chrome(ctx, player.x + player.w - 8, player.y + player.h - 6, 8, 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.x + 0.5, player.y + player.h - 5.5, 7, 5);
      ctx.strokeRect(player.x + player.w - 7.5, player.y + player.h - 5.5, 7, 5);

      // nav lights on the wingtips
      const navBlink = Math.sin(Date.now() / 200) > 0;
      if (navBlink) {
        ctx.fillStyle = '#ff5c5c';
        ctx.fillRect(player.x, player.y + player.h - 1, 2, 2);
        ctx.fillStyle = '#6bff6b';
        ctx.fillRect(player.x + player.w - 2, player.y + player.h - 1, 2, 2);
      }

      // glassy cockpit canopy with a bright reflection streak
      const canopyGrad = ctx.createRadialGradient(
        player.x + player.w / 2 - 1, player.y + 4, 0.5,
        player.x + player.w / 2, player.y + 6, 4
      );
      canopyGrad.addColorStop(0, '#cdeeff');
      canopyGrad.addColorStop(0.4, '#3a6a8a');
      canopyGrad.addColorStop(1, '#0a2a3a');
      ctx.fillStyle = canopyGrad;
      ctx.beginPath();
      ctx.arc(player.x + player.w / 2, player.y + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // brief muzzle flash glow at the nose when firing
      if (muzzleFlash > 0) {
        const mzX = player.x + player.w / 2, mzY = player.y - 6;
        const mzGrad = ctx.createRadialGradient(mzX, mzY, 0, mzX, mzY, 9);
        mzGrad.addColorStop(0, `rgba(255,246,200,${muzzleFlash / 0.06})`);
        mzGrad.addColorStop(1, 'rgba(255,210,79,0)');
        ctx.fillStyle = mzGrad;
        ctx.beginPath();
        ctx.arc(mzX, mzY, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      bunkers.forEach((bk) => {
        ctx.fillStyle = '#123a20';
        bk.blocks.forEach((row, r) => {
          row.forEach((alive, c) => {
            if (alive) ctx.fillRect(bk.x + c * BLOCK + 2, bk.y + r * BLOCK + 2, BLOCK, BLOCK);
          });
        });
        bk.blocks.forEach((row, r) => {
          ctx.fillStyle = FX.shade('#6bff6b', 10 - r * 12);
          row.forEach((alive, c) => {
            if (alive) {
              ctx.fillRect(bk.x + c * BLOCK, bk.y + r * BLOCK, BLOCK, BLOCK);
              if (r === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(bk.x + c * BLOCK, bk.y + r * BLOCK, BLOCK, 1.5);
                ctx.fillStyle = FX.shade('#6bff6b', 10 - r * 12);
              }
            }
          });
        });
      });

      enemies.filter((e) => e.alive).forEach((e) => drawInvader(ctx, e));

      if (ufo) {
        const ucx = ufo.x + ufo.w / 2, ucy = ufo.y + ufo.h / 2;
        const ufoGrad = ctx.createLinearGradient(ucx, ufo.y, ucx, ufo.y + ufo.h);
        ufoGrad.addColorStop(0, FX.shade('#ff4fa3', 45));
        ufoGrad.addColorStop(0.5, '#ff4fa3');
        ufoGrad.addColorStop(1, FX.shade('#ff4fa3', -30));
        ctx.fillStyle = ufoGrad;
        ctx.beginPath();
        ctx.ellipse(ucx, ucy, ufo.w / 2, ufo.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // canopy highlight
        ctx.fillStyle = '#ffe3ee';
        ctx.beginPath();
        ctx.ellipse(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2 - 3, ufo.w / 4, ufo.h / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // blinking hull lights along the rim
        for (let i = 0; i < 4; i++) {
          const lx = ufo.x + (ufo.w / 4) * i + ufo.w / 8;
          const lit = Math.sin(Date.now() / 120 + i * 1.5) > 0.2;
          ctx.fillStyle = lit ? '#fff6a8' : 'rgba(255,246,168,0.25)';
          ctx.beginPath();
          ctx.arc(lx, ufo.y + ufo.h * 0.75, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(255,210,79,0.9)';
      ctx.fillStyle = '#ffd24f';
      bullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
      ctx.shadowColor = 'rgba(255,92,92,0.9)';
      ctx.fillStyle = '#ff5c5c';
      enemyBullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
      ctx.restore();

      // particles and floating score text render as an overlay above sprites
      particles.draw(ctx);
      floatText.draw(ctx);
      ctx.textAlign = 'left';

      // combo callout while a kill streak is still "hot"
      if (comboTimer > 0 && combo > 1) {
        const a = Math.min(1, comboTimer / 1.6);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = combo % 5 === 0 ? '#ff4fa3' : '#ffd24f';
        ctx.fillText(`COMBO x${combo}`, W / 2, 24);
        ctx.restore();
        ctx.textAlign = 'left';
      }

      // hit-stun flash wash, then a light CRT cabinet finish
      if (screenFlash > 0) FX.flash(ctx, W, H, '#ff5c5c', (screenFlash / 0.35) * 0.35);
      FX.vignette(ctx, W, H, 0.3);
      FX.scanlines(ctx, W, H, 0.04);
    },
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
