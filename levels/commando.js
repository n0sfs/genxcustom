function createCommandoLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const WORLD_W = 2600;
  const GROUND_Y = H - 50;
  const PLAYER_SPEED = 180;
  const SHOT_COOLDOWN = 0.16;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const CRATE_DEFS = [
    { x: 260, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 520, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 900, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 1260, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 1620, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 1980, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 2280, y: GROUND_Y - 26, w: 44, h: 26 },
  ];
  const RAPID_TIME = 6;
  const RAPID_DROP_CHANCE = 0.35;

  const gruntSpawns = [
    { x: 380, range: [320, 480] },
    { x: 760, range: [700, 900] },
    { x: 1180, range: [1100, 1320] },
    { x: 1720, range: [1650, 1850] },
    { x: 2140, range: [2060, 2280] },
  ];
  const turretSpawns = [{ x: 540, y: GROUND_Y - 40 }, { x: 2000, y: GROUND_Y - 40 }];
  const chopperSpawns = [
    { range: [200, 900], y: 80 },
    { range: [1300, 2100], y: 110 },
  ];

  const extraction = { x: WORLD_W - 70, y: GROUND_Y - 90, w: 50, h: 90 };

  let player, bullets, enemyBullets, grunts, turrets, choppers, crates, powerups, particles, popups, camX, extractionOpen;

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 180;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.35, color });
    }
  }

  function aliveEnemies() {
    return [...grunts.filter((e) => e.alive), ...turrets.filter((e) => e.alive), ...choppers.filter((e) => e.alive)];
  }

  return {
    init() {
      player = {
        x: 40, y: GROUND_Y - 40, w: 20, h: 40,
        facing: { dx: 1, dy: 0 }, shotCooldown: 0, invuln: 1, hitFlash: 0, rapidTimer: 0,
        killStreak: 0, killStreakTimer: 0,
      };
      bullets = [];
      enemyBullets = [];
      particles = [];
      popups = [];
      powerups = [];
      camX = 0;
      extractionOpen = false;
      crates = CRATE_DEFS.map((c) => ({ ...c, alive: true }));

      grunts = gruntSpawns.map((s) => ({
        x: s.x, y: GROUND_Y - 34, w: 20, h: 34, range: s.range, dir: 1, alive: true, fireTimer: 1 + Math.random(),
      }));
      turrets = turretSpawns.map((s) => ({ x: s.x, y: s.y, w: 26, h: 40, alive: true, fireTimer: 1.5 + Math.random() }));
      choppers = chopperSpawns.map((s) => ({
        x: s.range[0], y: s.y, w: 58, h: 22, range: s.range, dir: 1, alive: true, fireTimer: 1.2 + Math.random(),
      }));
    },

    update(dt) {
      player.invuln = Math.max(0, player.invuln - dt);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.shotCooldown = Math.max(0, player.shotCooldown - dt);
      player.rapidTimer = Math.max(0, player.rapidTimer - dt);
      player.killStreakTimer = Math.max(0, player.killStreakTimer - dt);
      if (player.killStreakTimer <= 0) player.killStreak = 0;

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx = -1;
      if (isDown('ArrowRight', 'd')) mvx = 1;
      if (isDown('ArrowUp', 'w')) mvy = -1;
      if (isDown('ArrowDown', 's')) mvy = 1;
      if (mvx || mvy) player.facing = normalize(mvx, mvy);
      player.x += mvx * PLAYER_SPEED * dt;
      player.x = Math.max(0, Math.min(WORLD_W - player.w, player.x));
      // difficulty ramps gently the deeper the player pushes into the level
      const progress = Math.max(0, Math.min(1, player.x / WORLD_W));

      if (isDown('Space') && player.shotCooldown <= 0) {
        player.shotCooldown = player.rapidTimer > 0 ? SHOT_COOLDOWN * 0.4 : SHOT_COOLDOWN;
        const mx = player.x + player.w / 2 + player.facing.dx * 16;
        const my = player.y + player.h / 2 + player.facing.dy * 16 - 4;
        bullets.push({ x: mx, y: my, vx: player.facing.dx * 640, vy: player.facing.dy * 640, w: 6, h: 3 });
        sfx('shoot');
        particles.push({ x: mx, y: my, vx: player.facing.dx * -40, vy: player.facing.dy * -40, life: 0.06, color: '#ffd24f' });
      }

      bullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
      bullets = bullets.filter((b) => b.x > camX - 20 && b.x < camX + W + 20 && b.y > -20 && b.y < H + 20);

      grunts.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * 40 * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 420) {
          e.fireTimer = (1.4 + Math.random() * 0.6) * (1 - 0.3 * progress);
          const dir = player.x < e.x ? -1 : 1;
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: dir * 260, vy: 0, w: 6, h: 3 });
        }
      });

      turrets.filter((e) => e.alive).forEach((e) => {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 520) {
          e.fireTimer = (1.7 + Math.random() * 0.6) * (1 - 0.3 * progress);
          const dir = player.x < e.x ? -1 : 1;
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + 10, vx: dir * 240, vy: 0, w: 6, h: 3 });
        }
      });

      choppers.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * 32 * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 260) {
          e.fireTimer = (1.1 + Math.random() * 0.6) * (1 - 0.3 * progress);
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: 220, w: 4, h: 8 });
        }
      });

      enemyBullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
      enemyBullets = enemyBullets.filter((b) => b.x > camX - 20 && b.x < camX + W + 20 && b.y > -20 && b.y < H + 20);

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);

      popups.forEach((p) => { p.y -= 20 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);

      const targets = aliveEnemies();
      bullets.forEach((b) => {
        if (b.hit) return;
        for (const e of targets) {
          // guard against a single enemy already killed earlier this same frame
          // (by another bullet) from being scored a second time
          if (!e.alive || !rectsOverlap(b, e)) continue;
          e.alive = false;
          b.hit = true;
          const isChopper = choppers.includes(e);
          const isTurret = turrets.includes(e);
          const bigTarget = isChopper || isTurret;
          const baseScore = isChopper ? 25 : isTurret ? 20 : 15;
          player.killStreak = player.killStreakTimer > 0 ? player.killStreak + 1 : 1;
          player.killStreakTimer = 2.2;
          const streakBonus = Math.min(player.killStreak - 1, 6) * 5;
          addScore(baseScore + streakBonus);
          burst(e.x + e.w / 2, e.y + e.h / 2, '#ff9a4f', bigTarget ? 14 : 9);
          sfx('explosion');
          shake(bigTarget ? 0.14 : 0.08, bigTarget ? 3.5 : 2);
          if (player.killStreak > 1) {
            popups.push({ x: e.x + e.w / 2, y: e.y - 6, life: 0.7, text: `+${baseScore + streakBonus} x${player.killStreak}` });
          }
          if (player.killStreak > 0 && player.killStreak % 3 === 0) sfx('pickup');
          break;
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      bullets.forEach((b) => {
        if (b.hit) return;
        for (const c of crates) {
          if (c.alive && rectsOverlap(b, c)) {
            c.alive = false;
            b.hit = true;
            addScore(10);
            burst(c.x + c.w / 2, c.y + c.h / 2, '#8a6238', 7);
            sfx('hit');
            if (Math.random() < RAPID_DROP_CHANCE) {
              powerups.push({ x: c.x + c.w / 2 - 8, y: c.y - 4, w: 16, h: 16 });
            }
            break;
          }
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      powerups = powerups.filter((p) => {
        if (rectsOverlap(player, p)) {
          player.rapidTimer = RAPID_TIME;
          addScore(5);
          sfx('pickup');
          return false;
        }
        return true;
      });

      if (player.invuln <= 0) {
        const hitByBullet = enemyBullets.some((b) => rectsOverlap(b, player));
        const hitByGrunt = grunts.some((e) => e.alive && rectsOverlap(e, player));
        if (hitByBullet || hitByGrunt) {
          player.invuln = 1.3;
          player.hitFlash = 0.4;
          loseLife();
          return;
        }
      }

      if (!extractionOpen && aliveEnemies().length === 0) {
        extractionOpen = true;
        sfx('select');
      }

      if (extractionOpen && rectsOverlap(player, extraction)) {
        sfx('launch');
        winLevel(60);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_W - W, player.x + player.w / 2 - W / 2));
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, '#15301f', '#0a1610');

      for (let i = 0; i < 8; i++) {
        const px = (i * 260 - camX * 0.3) % (W + 260) - 130;
        const dark = i % 2 === 0;
        ctx.fillStyle = dark ? '#132419' : '#1a2e1e';
        ctx.beginPath();
        ctx.moveTo(px, GROUND_Y);
        ctx.lineTo(px + 40, GROUND_Y - 160);
        ctx.lineTo(px + 80, GROUND_Y);
        ctx.fill();
        // canopy foliage texture clumps
        ctx.fillStyle = dark ? '#1e3624' : '#25402a';
        ctx.beginPath();
        ctx.arc(px + 28, GROUND_Y - 96, 13, 0, Math.PI * 2);
        ctx.arc(px + 54, GROUND_Y - 118, 11, 0, Math.PI * 2);
        ctx.arc(px + 42, GROUND_Y - 58, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(px + 37, GROUND_Y - 20, 6, 20);
      }

      ctx.save();
      ctx.translate(-camX, 0);

      FX.gradientRect(ctx, 0, GROUND_Y, WORLD_W, H - GROUND_Y, '#3a4e30', '#1a2416');
      ctx.fillStyle = '#3a4e30';
      ctx.fillRect(0, GROUND_Y, WORLD_W, 4);

      // ground texture: scattered dirt/grass tufts along the visible strip
      const tuftSpacing = 70;
      const tuftStart = Math.floor(camX / tuftSpacing) * tuftSpacing;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let x = tuftStart; x < camX + W + tuftSpacing; x += tuftSpacing) {
        ctx.fillRect(x, GROUND_Y + 3, 3, 6);
        ctx.fillRect(x + 24, GROUND_Y + 6, 3, 5);
      }

      powerups.forEach((p) => {
        FX.bevelBlock(ctx, p.x, p.y, p.w, p.h, '#ffd24f', 2);
        ctx.fillStyle = '#2a2a2a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('R', p.x + p.w / 2, p.y + p.h / 2 + 3);
        ctx.textAlign = 'left';
      });

      crates.filter((c) => c.alive).forEach((c) => {
        FX.shadow(ctx, c.x + c.w / 2, c.y + c.h + 2, c.w / 2, 3, 0.3);
        FX.bevelBlock(ctx, c.x, c.y, c.w, c.h, '#7a5a34', 3);
        ctx.strokeStyle = '#4a3620';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + 4, c.y + c.h * 0.4);
        ctx.lineTo(c.x + c.w - 4, c.y + c.h * 0.4);
        ctx.moveTo(c.x + 4, c.y + c.h * 0.68);
        ctx.lineTo(c.x + c.w - 4, c.y + c.h * 0.68);
        ctx.stroke();
      });

      if (extractionOpen) {
        ctx.fillStyle = '#4fe3d0';
        ctx.beginPath();
        ctx.ellipse(extraction.x + extraction.w / 2, extraction.y + extraction.h - 4, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8ecff';
        ctx.fillRect(extraction.x + 10, extraction.y + 20, 30, 16);
        ctx.fillRect(extraction.x + 22, extraction.y + 4, 4, 20);
        ctx.strokeStyle = '#e8ecff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(extraction.x, extraction.y + 6);
        ctx.lineTo(extraction.x + 50, extraction.y + 6);
        ctx.stroke();
      }

      grunts.filter((e) => e.alive).forEach((e) => {
        FX.shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w / 2, 3, 0.3);
        FX.bevelRect(ctx, e.x, e.y + 10, e.w, e.h - 10, '#8a3a3a', 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x, e.y + 10, e.w, e.h - 10);
        ctx.fillStyle = '#d9b98a';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + 6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2 + e.dir * 2, e.y + 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(e.x - e.dir * 4, e.y + 14, 12, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(e.x - e.dir * 4, e.y + 14, 12, 1);
      });

      turrets.filter((e) => e.alive).forEach((e) => {
        FX.shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w / 2, 4, 0.3);
        FX.bevelRect(ctx, e.x, e.y, e.w, e.h, '#4a4a52', 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(e.x + e.w / 2 - 3, e.y - 10, 16, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x + e.w / 2 - 3, e.y - 10, 16, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(e.x + e.w / 2 - 3, e.y - 10, 16, 1.5);
      });

      choppers.filter((e) => e.alive).forEach((e) => {
        const chx = e.x + e.w / 2, chy = e.y + e.h / 2;
        FX.shadow(ctx, chx, GROUND_Y, e.w / 2, 6, 0.2);
        const chopGrad = ctx.createLinearGradient(chx, e.y, chx, e.y + e.h);
        chopGrad.addColorStop(0, FX.shade('#3a3a44', 35));
        chopGrad.addColorStop(1, FX.shade('#3a3a44', -25));
        ctx.fillStyle = chopGrad;
        ctx.beginPath();
        ctx.ellipse(chx, chy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // rotor blade motion-blur streaks
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - 10, e.y + e.h / 2);
        ctx.lineTo(e.x + e.w + 10, e.y + e.h / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x - 6, e.y + e.h / 2 - 3);
        ctx.lineTo(e.x + e.w + 6, e.y + e.h / 2 - 3);
        ctx.moveTo(e.x - 6, e.y + e.h / 2 + 3);
        ctx.lineTo(e.x + e.w + 6, e.y + e.h / 2 + 3);
        ctx.stroke();
        ctx.fillStyle = '#1a1a1e';
        ctx.beginPath();
        ctx.arc(chx, chy, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.save();
      ctx.shadowColor = '#ffd24f';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#ffd24f';
      bullets.forEach((b) => ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
      ctx.shadowColor = '#ff5c5c';
      ctx.fillStyle = '#ff5c5c';
      enemyBullets.forEach((b) => ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
      ctx.restore();

      particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 0.35);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      popups.forEach((p) => {
        ctx.fillStyle = '#ffd24f';
        ctx.globalAlpha = Math.max(0, p.life / 0.7);
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = 'left';

      const flip = player.facing.dx < 0;
      FX.shadow(ctx, player.x + player.w / 2, player.y + player.h + 3, player.w / 2, 3, 0.3);
      const playerBody = (player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0) ? '#ff5c5c' : '#2a5a7a';
      FX.bevelRect(ctx, player.x, player.y + 12, player.w, player.h - 12, playerBody, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(player.x, player.y + 12, player.w, player.h - 12);
      ctx.fillStyle = '#d9b98a';
      ctx.beginPath();
      ctx.arc(player.x + player.w / 2, player.y + 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const gunX = player.x + player.w / 2 + player.facing.dx * 6 - (flip ? 14 : 0);
      const gunY = player.y + player.h / 2 - 2 + player.facing.dy * 6;
      const gunGrad = ctx.createLinearGradient(gunX, gunY, gunX, gunY + 3);
      gunGrad.addColorStop(0, '#6a6a6a');
      gunGrad.addColorStop(0.5, '#2a2a2a');
      gunGrad.addColorStop(1, '#161616');
      ctx.fillStyle = gunGrad;
      ctx.fillRect(gunX, gunY, 14, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(gunX, gunY, 14, 1);

      const activeCooldown = player.rapidTimer > 0 ? SHOT_COOLDOWN * 0.4 : SHOT_COOLDOWN;
      if (player.shotCooldown > activeCooldown * 0.6) {
        const mfx = player.x + player.w / 2 + player.facing.dx * 20;
        const mfy = player.y + player.h / 2 + player.facing.dy * 6 - 2;
        const flashGrad = ctx.createRadialGradient(mfx, mfy, 0, mfx, mfy, 10);
        flashGrad.addColorStop(0, 'rgba(255,224,140,0.9)');
        flashGrad.addColorStop(1, 'rgba(255,224,140,0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(mfx, mfy, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      const remaining = aliveEnemies().length;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(remaining > 0 ? `HOSTILES: ${remaining}` : 'EXTRACTION POINT AHEAD', 8, 16);
      if (player.rapidTimer > 0) {
        ctx.fillStyle = '#ffd24f';
        ctx.fillText('RAPID FIRE!', W - 80, 16);
      }
      if (player.killStreak > 1 && player.killStreakTimer > 0) {
        ctx.fillStyle = '#ff9a4f';
        ctx.fillText(`STREAK x${player.killStreak}`, 8, 28);
      }
    },
  };
}
