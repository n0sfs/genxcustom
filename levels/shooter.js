function createShooterLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ROWS = 4, COLS = 8;
  const ENEMY_W = 32, ENEMY_H = 20, GAP = 12;
  const gridW = COLS * (ENEMY_W + GAP) - GAP;
  const startX = (W - gridW) / 2;

  let player, bullets, enemyBullets, enemies, enemyDir, enemyStepTimer;
  let shotCooldown, hitFlash, invuln, particles, ufo, ufoTimer, popups, bunkers, stars;
  const UFO_SCORES = [50, 50, 100, 100, 150, 300];

  const BUNKER_PATTERN = ['.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XX...XX'];
  const BLOCK = 6;
  const BUNKER_XS = [60, 220, 380, 540];
  const BUNKER_Y = 366;

  function spawnBunkers() {
    bunkers = BUNKER_XS.map((x) => ({
      x, y: BUNKER_Y, w: BUNKER_PATTERN[0].length * BLOCK, h: BUNKER_PATTERN.length * BLOCK,
      blocks: BUNKER_PATTERN.map((row) => row.split('').map((ch) => ch === 'X')),
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
          if (bk.blocks[r][c]) { bk.blocks[r][c] = false; hit = true; }
        }
      }
      if (hit) return true;
    }
    return false;
  }

  function spawnStars() {
    stars = [];
    for (let i = 0; i < 45; i++) {
      stars.push({
        x: Math.random() * W,
        y0: Math.random() * H,
        speed: 15 + Math.random() * 45,
        r: Math.random() < 0.75 ? 0.8 : 1.6,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawStarfield(ctx) {
    const t = Date.now() / 1000;
    // faint nebula wash behind the stars
    const neb = ctx.createLinearGradient(0, 0, 0, H);
    neb.addColorStop(0, '#0a0a1e');
    neb.addColorStop(0.5, '#120a1c');
    neb.addColorStop(1, '#05060a');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);
    stars.forEach((s) => {
      const y = (s.y0 + t * s.speed) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + s.tw);
      ctx.fillStyle = `rgba(220,230,255,${0.35 + tw * 0.5})`;
      ctx.fillRect(s.x, y, s.r, s.r);
    });
  }

  function burst(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.35, color });
    }
  }

  const INVADER_PATTERNS = [
    ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'X.X.X.X'],
    ['X.....X', '..XXX..', '.XXXXX.', 'XXXXXXX', 'X.X.X.X'],
    ['.XXXXX.', 'XXXXXXX', 'XX.X.XX', '.X...X.', 'X.....X'],
  ];

  function spawnEnemies() {
    enemies = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        enemies.push({
          x: startX + c * (ENEMY_W + GAP),
          y: 40 + r * (ENEMY_H + GAP),
          w: ENEMY_W, h: ENEMY_H,
          alive: true,
          color: r === 0 ? '#ff4fa3' : r === 1 ? '#ffd24f' : r === 2 ? '#4fe3d0' : '#6bff6b',
          pattern: INVADER_PATTERNS[Math.min(r, 2)],
        });
      }
    }
  }

  function drawInvader(ctx, e) {
    const rows = e.pattern;
    const cols = rows[0].length;
    const cw = e.w / cols, ch = e.h / rows.length;
    // soft glow behind the sprite, then shade rows light-to-dark for a lit, chunky pixel-art look
    FX.shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w / 2.4, 3, 0.25);
    for (let r = 0; r < rows.length; r++) {
      ctx.fillStyle = FX.shade(e.color, 22 - r * 14);
      for (let c = 0; c < cols; c++) {
        if (rows[r][c] === 'X') ctx.fillRect(e.x + c * cw, e.y + r * ch, cw + 0.5, ch + 0.5);
      }
    }
    // dark silhouette outline around the whole sprite footprint
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
  }

  return {
    init() {
      player = { x: W / 2 - 16, y: H - 40, w: 32, h: 16, speed: 220 };
      bullets = [];
      enemyBullets = [];
      spawnEnemies();
      enemyDir = 1;
      enemyStepTimer = 0;
      shotCooldown = 0;
      invuln = 1.2;
      hitFlash = 0;
      particles = [];
      ufo = null;
      ufoTimer = 6 + Math.random() * 5;
      popups = [];
      spawnBunkers();
      spawnStars();
    },

    update(dt) {
      invuln = Math.max(0, invuln - dt);
      hitFlash = Math.max(0, hitFlash - dt);
      shotCooldown = Math.max(0, shotCooldown - dt);

      if (isDown('ArrowLeft', 'a')) player.x -= player.speed * dt;
      if (isDown('ArrowRight', 'd')) player.x += player.speed * dt;
      player.x = Math.max(0, Math.min(W - player.w, player.x));

      if (isDown('Space') && shotCooldown <= 0) {
        bullets.push({ x: player.x + player.w / 2 - 2, y: player.y, w: 4, h: 10 });
        shotCooldown = 0.28;
        sfx('shoot');
      }

      bullets.forEach((b) => (b.y -= 420 * dt));
      bullets = bullets.filter((b) => b.y + b.h > 0);
      bullets.forEach((b) => { if (hitBunkers(b)) { b.hit = true; sfx('bounce'); } });
      bullets = bullets.filter((b) => !b.hit);

      const aliveEnemies = enemies.filter((e) => e.alive);
      const speedFactor = 1 + (1 - aliveEnemies.length / (ROWS * COLS)) * 2.2;
      enemyStepTimer += dt * speedFactor;
      const stepInterval = 0.5;
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
          aliveEnemies.forEach((e) => (e.y += 14));
        }
        aliveEnemies.forEach((e) => hitBunkers(e));
      }

      if (Math.random() < 0.55 * dt * (1 + aliveEnemies.length * 0.02) && aliveEnemies.length) {
        const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        enemyBullets.push({ x: shooter.x + shooter.w / 2 - 2, y: shooter.y + shooter.h, w: 4, h: 10 });
      }
      enemyBullets.forEach((b) => (b.y += 260 * dt));
      enemyBullets = enemyBullets.filter((b) => b.y < H);
      enemyBullets.forEach((b) => { if (hitBunkers(b)) { b.hit = true; sfx('bounce'); } });
      enemyBullets = enemyBullets.filter((b) => !b.hit);

      bullets.forEach((b) => {
        if (b.hit) return;
        for (const e of aliveEnemies) {
          if (rectsOverlap(b, e)) {
            e.alive = false;
            b.hit = true;
            addScore(10);
            burst(e.x + e.w / 2, e.y + e.h / 2, e.color);
            sfx('explosion');
            shake(0.08, 2);
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
        }
      } else {
        ufo.x += ufo.dir * 90 * dt;
        if (ufo.x < -60 || ufo.x > W + 60) ufo = null;
      }

      if (ufo) {
        bullets.forEach((b) => {
          if (b.hit || !ufo) return;
          if (rectsOverlap(b, ufo)) {
            b.hit = true;
            const bonus = UFO_SCORES[Math.floor(Math.random() * UFO_SCORES.length)];
            addScore(bonus);
            burst(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, '#ff4fa3');
            popups.push({ x: ufo.x + ufo.w / 2, y: ufo.y, text: `+${bonus}`, life: 0.9 });
            sfx('explosion');
            shake(0.1, 3);
            ufo = null;
            ufoTimer = 9 + Math.random() * 7;
          }
        });
        bullets = bullets.filter((b) => !b.hit);
      }

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);
      popups.forEach((p) => { p.y -= 30 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);

      if (invuln <= 0) {
        for (const b of enemyBullets) {
          if (rectsOverlap(b, player)) {
            b.hit = true;
            hitFlash = 0.5;
            invuln = 1.2;
            loseLife();
            return;
          }
        }
      }
      enemyBullets = enemyBullets.filter((b) => !b.hit);

      if (aliveEnemies.some((e) => e.y + e.h >= player.y)) {
        loseLife();
        return;
      }

      if (aliveEnemies.length === 0) {
        winLevel(50);
      }
    },

    draw(ctx) {
      drawStarfield(ctx);

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

      particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 0.35);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffd24f';
        ctx.globalAlpha = Math.max(0, p.life / 0.9);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';
    },
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
