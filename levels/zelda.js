function createZeldaLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ROOM_W = W, ROOM_H = H;
  const WORLD_W = ROOM_W * 2, WORLD_H = ROOM_H * 2;
  const WALL_T = 24;

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Outer border + room-dividing walls with doorway gaps, arranged as a
  // 2x2 loop of rooms so there is more than one route to the goal room.
  const walls = [
    { x: 0, y: 0, w: WORLD_W, h: WALL_T },
    { x: 0, y: WORLD_H - WALL_T, w: WORLD_W, h: WALL_T },
    { x: 0, y: 0, w: WALL_T, h: WORLD_H },
    { x: WORLD_W - WALL_T, y: 0, w: WALL_T, h: WORLD_H },

    { x: ROOM_W - WALL_T / 2, y: 0, w: WALL_T, h: 200 },
    { x: ROOM_W - WALL_T / 2, y: 280, w: WALL_T, h: WORLD_H - 280 - 200 - 80 },
    { x: ROOM_W - WALL_T / 2, y: WORLD_H - 200, w: WALL_T, h: 200 },

    { x: 0, y: ROOM_H - WALL_T / 2, w: 280, h: WALL_T },
    { x: 360, y: ROOM_H - WALL_T / 2, w: WORLD_W - 360 - 360, h: WALL_T },
    { x: WORLD_W - 280, y: ROOM_H - WALL_T / 2, w: 280, h: WALL_T },

    { x: 150, y: 130, w: 32, h: 32 },
    { x: ROOM_W + 420, y: 110, w: 32, h: 100 },
    { x: 110, y: ROOM_H + 300, w: 100, h: 32 },
    { x: ROOM_W + 220, y: ROOM_H + 220, w: 32, h: 32 },
    { x: ROOM_W + 460, y: ROOM_H + 320, w: 32, h: 32 },
  ];

  const ATTACK_DURATION = 0.22;
  const ATTACK_COOLDOWN = 0.35;
  const PLAYER_SPEED = 190;

  const HEART_DROP_CHANCE = 0.3;
  const POWER_TIME = 5;
  const BOSS_HP = 4;
  const BOSS_SPAWN = { x: ROOM_W + ROOM_W / 2 - 24, y: ROOM_H + ROOM_H / 2 - 90 };

  let player, enemies, projectiles, camX, camY, goal, goalActive, particles, hearts, boss, bossSpawned, torchTime;

  // Fixed decorative wall torches for dungeon atmosphere (purely cosmetic).
  const torches = [
    { x: 44, y: 44 }, { x: WORLD_W - 44, y: 44 },
    { x: 44, y: WORLD_H - 44 }, { x: WORLD_W - 44, y: WORLD_H - 44 },
    { x: ROOM_W, y: ROOM_H / 2 },
  ];

  function spawnBoss() {
    boss = {
      x: BOSS_SPAWN.x, y: BOSS_SPAWN.y, w: 48, h: 48,
      hp: BOSS_HP, alive: true, invuln: 0, hitFlash: 0,
      state: 'idle', stateTimer: 1.2, nextAction: 'charge', dir: { dx: 0, dy: 1 },
    };
  }

  function updateBoss(dt) {
    boss.invuln = Math.max(0, boss.invuln - dt);
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.stateTimer -= dt;

    if (boss.state === 'idle') {
      if (boss.stateTimer <= 0) {
        boss.state = boss.nextAction;
        if (boss.state === 'charge') {
          const dx = player.x - boss.x, dy = player.y - boss.y;
          const len = Math.hypot(dx, dy) || 1;
          boss.dir = { dx: dx / len, dy: dy / len };
          boss.stateTimer = 0.6;
          boss.nextAction = 'idle';
        } else {
          const dx = player.x - boss.x, dy = player.y - boss.y;
          const baseAng = Math.atan2(dy, dx);
          [-0.35, 0, 0.35].forEach((a) => {
            projectiles.push({
              x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
              vx: Math.cos(baseAng + a) * 170, vy: Math.sin(baseAng + a) * 170, w: 7, h: 7,
            });
          });
          sfx('shoot');
          boss.state = 'idle';
          boss.stateTimer = 1.3;
          boss.nextAction = 'charge';
        }
      }
    } else if (boss.state === 'charge') {
      moveAndCollide(boss, boss.dir.dx * 250, boss.dir.dy * 250, dt);
      if (boss.stateTimer <= 0) {
        boss.state = 'idle';
        boss.stateTimer = 0.9;
        boss.nextAction = 'shoot';
      }
    }
  }

  function moveAndCollide(e, vx, vy, dt) {
    e.x += vx * dt;
    for (const w of walls) {
      if (rectsOverlap(e, w)) {
        if (vx > 0) e.x = w.x - e.w;
        else if (vx < 0) e.x = w.x + w.w;
      }
    }
    e.y += vy * dt;
    for (const w of walls) {
      if (rectsOverlap(e, w)) {
        if (vy > 0) e.y = w.y - e.h;
        else if (vy < 0) e.y = w.y + w.h;
      }
    }
    e.x = Math.max(0, Math.min(WORLD_W - e.w, e.x));
    e.y = Math.max(0, Math.min(WORLD_H - e.h, e.y));
  }

  function spawnEnemies() {
    enemies = [
      { x: ROOM_W + 160, y: 140, w: 26, h: 26, type: 'chaser', alive: true, wanderDir: { dx: 1, dy: 0 }, wanderTimer: 1 },
      { x: ROOM_W + 480, y: 320, w: 26, h: 26, type: 'shooter', alive: true, fireTimer: 1.2 },
      { x: 150, y: ROOM_H + 160, w: 26, h: 26, type: 'shooter', alive: true, fireTimer: 1.8 },
      { x: 420, y: ROOM_H + 340, w: 26, h: 26, type: 'chaser', alive: true, wanderDir: { dx: 0, dy: 1 }, wanderTimer: 1 },
      { x: ROOM_W + 200, y: ROOM_H + 150, w: 26, h: 26, type: 'chaser', alive: true, wanderDir: { dx: -1, dy: 0 }, wanderTimer: 1 },
      { x: ROOM_W + 510, y: 620, w: 26, h: 26, type: 'shooter', alive: true, fireTimer: 0.8 },
    ];
  }

  return {
    init() {
      player = {
        x: 110, y: ROOM_H / 2 - 13, w: 24, h: 26,
        facing: { dx: 0, dy: 1 }, attackTimer: 0, attackCooldown: 0, hitSet: null,
        invuln: 1, hitFlash: 0, powerTimer: 0,
      };
      spawnEnemies();
      projectiles = [];
      particles = [];
      hearts = [];
      goal = { x: ROOM_W + ROOM_W / 2 - 14, y: ROOM_H + ROOM_H / 2 - 14, w: 28, h: 28 };
      goalActive = false;
      boss = null;
      bossSpawned = false;
      camX = 0; camY = 0;
      torchTime = 0;
    },

    update(dt) {
      player.invuln = Math.max(0, player.invuln - dt);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.attackCooldown = Math.max(0, player.attackCooldown - dt);
      player.attackTimer = Math.max(0, player.attackTimer - dt);
      player.powerTimer = Math.max(0, player.powerTimer - dt);

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx = -1;
      if (isDown('ArrowRight', 'd')) mvx = 1;
      if (isDown('ArrowUp', 'w')) mvy = -1;
      if (isDown('ArrowDown', 's')) mvy = 1;
      if (mvx || mvy) {
        const len = Math.hypot(mvx, mvy);
        const spd = player.powerTimer > 0 ? PLAYER_SPEED * 1.35 : PLAYER_SPEED;
        moveAndCollide(player, (mvx / len) * spd, (mvy / len) * spd, dt);
        player.facing = { dx: mvx, dy: mvy };
      }

      if (isDown('Space') && player.attackCooldown <= 0) {
        player.attackTimer = ATTACK_DURATION;
        player.attackCooldown = ATTACK_COOLDOWN;
        player.hitSet = new Set();
        sfx('swing');
      }

      let swordRect = null;
      if (player.attackTimer > 0) {
        const reach = 26;
        swordRect = {
          x: player.x + player.w / 2 - 14 + player.facing.dx * reach,
          y: player.y + player.h / 2 - 14 + player.facing.dy * reach,
          w: 28, h: 28,
        };
      }

      const aliveEnemies = enemies.filter((e) => e.alive);

      aliveEnemies.forEach((e, idx) => {
        if (e.type === 'chaser') {
          const dx = player.x - e.x, dy = player.y - e.y;
          const dist = Math.hypot(dx, dy);
          let vx = 0, vy = 0;
          if (dist > 0.01 && dist < 240) {
            vx = (dx / dist) * 90;
            vy = (dy / dist) * 90;
          } else if (dist <= 0.01) {
            vx = 0; vy = 0;
          } else {
            e.wanderTimer -= dt;
            if (e.wanderTimer <= 0) {
              e.wanderTimer = 1 + Math.random();
              const opts = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
              e.wanderDir = opts[Math.floor(Math.random() * opts.length)];
            }
            vx = e.wanderDir.dx * 45;
            vy = e.wanderDir.dy * 45;
          }
          moveAndCollide(e, vx, vy, dt);
        } else {
          e.fireTimer -= dt;
          if (e.fireTimer <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < 420) {
            e.fireTimer = 2.2;
            const dx = player.x - e.x, dy = player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            projectiles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (dx / len) * 150, vy: (dy / len) * 150, w: 6, h: 6 });
          }
        }

        const swordHit = swordRect && !player.hitSet.has(idx) && rectsOverlap(swordRect, e);
        const powerHit = player.powerTimer > 0 && rectsOverlap(player, e);
        if (swordHit || powerHit) {
          e.alive = false;
          if (swordHit) player.hitSet.add(idx);
          addScore(15);
          sfx('explosion');
          shake(0.1, 3);
          for (let i = 0; i < 6; i++) {
            particles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.4 });
          }
          if (Math.random() < HEART_DROP_CHANCE) {
            hearts.push({ x: e.x + e.w / 2 - 8, y: e.y + e.h / 2 - 8, w: 16, h: 16 });
          }
        }
      });

      hearts = hearts.filter((h) => {
        if (rectsOverlap(player, h)) {
          player.powerTimer = POWER_TIME;
          addScore(5);
          sfx('pickup');
          return false;
        }
        return true;
      });

      if (!bossSpawned && enemies.every((e) => !e.alive)) {
        bossSpawned = true;
        spawnBoss();
      }

      if (boss && boss.alive) {
        updateBoss(dt);

        const bossSwordHit = boss.invuln <= 0 && swordRect && rectsOverlap(swordRect, boss);
        const bossPowerHit = boss.invuln <= 0 && player.powerTimer > 0 && rectsOverlap(player, boss);
        if (bossSwordHit || bossPowerHit) {
          boss.hp--;
          boss.invuln = 0.4;
          boss.hitFlash = 0.3;
          addScore(30);
          sfx('hit');
          shake(0.1, 3);
          for (let i = 0; i < 8; i++) {
            particles.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, life: 0.4 });
          }
          if (boss.hp <= 0) {
            boss.alive = false;
            goalActive = true;
            addScore(150);
            sfx('explosion');
            shake(0.2, 5);
            for (let i = 0; i < 16; i++) {
              particles.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.5 });
            }
          }
        }
      }

      projectiles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        for (const w of walls) {
          if (rectsOverlap(p, w)) p.dead = true;
        }
      });
      projectiles = projectiles.filter((p) => !p.dead && p.x > 0 && p.x < WORLD_W && p.y > 0 && p.y < WORLD_H);

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);

      if (player.invuln <= 0 && player.powerTimer <= 0) {
        const touchedEnemy = aliveEnemies.some((e) => rectsOverlap(player, e));
        const touchedBoss = boss && boss.alive && rectsOverlap(player, boss);
        const touchedProjectile = projectiles.some((p) => rectsOverlap(player, p));
        if (touchedEnemy || touchedBoss || touchedProjectile) {
          player.invuln = 1.3;
          player.hitFlash = 0.4;
          loseLife();
          return;
        }
      }

      if (goalActive && rectsOverlap(player, goal)) {
        winLevel(70);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_W - W, player.x + player.w / 2 - W / 2));
      camY = Math.max(0, Math.min(WORLD_H - H, player.y + player.h / 2 - H / 2));
    },

    draw(ctx) {
      torchTime += 1 / 60;

      ctx.fillStyle = '#1c1408';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(-camX, -camY);

      FX.gradientRect(ctx, 0, 0, WORLD_W, WORLD_H, '#463824', '#2e2414');

      // stone-brick floor texture: coursing seams offset every other row,
      // limited to the visible viewport so cost stays flat regardless of world size
      const TILE = 40;
      const vx0 = Math.max(0, Math.floor(camX / TILE) - 1) * TILE;
      const vx1 = Math.min(WORLD_W, camX + W + TILE);
      const vy0 = Math.max(0, Math.floor(camY / TILE) - 1) * TILE;
      const vy1 = Math.min(WORLD_H, camY + H + TILE);
      ctx.lineWidth = 1;
      for (let y = vy0; y < vy1; y += TILE) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,160,0.05)';
        ctx.beginPath(); ctx.moveTo(vx0, y + 1); ctx.lineTo(vx1, y + 1); ctx.stroke();
        const rowIdx = Math.round(y / TILE);
        const offset = (rowIdx % 2) * (TILE / 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        for (let x = vx0 + offset; x < vx1; x += TILE) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); ctx.stroke();
        }
      }

      walls.forEach((w) => {
        FX.bevelRect(ctx, w.x, w.y, w.w, w.h, '#6b4a2a', 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
        // mortar coursing lines on corridor walls / obstacle blocks (skip the long world borders)
        const short = Math.min(w.w, w.h), long = Math.max(w.w, w.h);
        if (short <= 40 && long <= 320) {
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1;
          if (w.h >= w.w) {
            for (let yy = w.y + 16; yy < w.y + w.h - 4; yy += 16) {
              ctx.beginPath(); ctx.moveTo(w.x + 2, yy); ctx.lineTo(w.x + w.w - 2, yy); ctx.stroke();
            }
          } else {
            for (let xx = w.x + 16; xx < w.x + w.w - 4; xx += 16) {
              ctx.beginPath(); ctx.moveTo(xx, w.y + 2); ctx.lineTo(xx, w.y + w.h - 2); ctx.stroke();
            }
          }
        }
      });

      // wall-mounted torches for warm dungeon atmosphere
      torches.forEach((t, i) => {
        const flicker = 0.75 + Math.sin(torchTime * 9 + i * 2.3) * 0.15 + Math.sin(torchTime * 23 + i) * 0.06;
        const glow = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 46 * flicker);
        glow.addColorStop(0, `rgba(255, 200, 100, ${0.42 * flicker})`);
        glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 46 * flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(t.x - 3, t.y - 2, 6, 10);
        const flameGrad = ctx.createRadialGradient(t.x, t.y - 6, 1, t.x, t.y - 6, 8 * flicker);
        flameGrad.addColorStop(0, '#fff6c8');
        flameGrad.addColorStop(0.5, '#ffb347');
        flameGrad.addColorStop(1, '#c23c1a');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y - 6 - flicker, 4 * flicker, 7 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      if (goalActive) {
        const pulse = 0.7 + Math.sin(torchTime * 4) * 0.3;
        const gcx = goal.x + goal.w / 2, gcy = goal.y + goal.h / 2;
        const glow = ctx.createRadialGradient(gcx, gcy, 2, gcx, gcy, 30 * pulse);
        glow.addColorStop(0, `rgba(255,210,79,${0.5 * pulse})`);
        glow.addColorStop(1, 'rgba(255,210,79,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(gcx, gcy, 30 * pulse, 0, Math.PI * 2);
        ctx.fill();

        const diaGrad = ctx.createLinearGradient(goal.x, goal.y, goal.x + goal.w, goal.y + goal.h);
        diaGrad.addColorStop(0, '#fff3c0');
        diaGrad.addColorStop(0.5, '#ffd24f');
        diaGrad.addColorStop(1, '#c98f1a');
        ctx.fillStyle = diaGrad;
        ctx.save();
        ctx.translate(gcx, gcy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-goal.w / 2, -goal.h / 2, goal.w, goal.h);
        ctx.strokeStyle = 'rgba(90,50,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-goal.w / 2, -goal.h / 2, goal.w, goal.h);
        ctx.restore();
      }

      hearts.forEach((h) => {
        const hcx = h.x + h.w / 2, hcy = h.y + h.h / 2;
        const heartGrad = ctx.createRadialGradient(hcx - 2, hcy - 3, 1, hcx, hcy, 9);
        heartGrad.addColorStop(0, '#ffb3d9');
        heartGrad.addColorStop(1, '#ff4fa3');
        ctx.fillStyle = heartGrad;
        ctx.beginPath();
        ctx.arc(hcx - 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.arc(hcx + 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.moveTo(hcx - 8, hcy - 1);
        ctx.lineTo(hcx, hcy + 8);
        ctx.lineTo(hcx + 8, hcy - 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,0,40,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      enemies.filter((e) => e.alive).forEach((e) => {
        const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
        if (e.type === 'chaser') {
          FX.shadow(ctx, ecx, ecy + e.h / 2 + 2, e.w / 2, 3, 0.3);
          FX.sphere(ctx, ecx, ecy, e.w / 2, '#ff4fa3');
          ctx.strokeStyle = 'rgba(40,0,20,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ecx, ecy, e.w / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ecx - 4, ecy - 2, 3, 0, Math.PI * 2);
          ctx.arc(ecx + 4, ecy - 2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1a0a10';
          ctx.beginPath();
          ctx.arc(ecx - 4, ecy - 1, 1.4, 0, Math.PI * 2);
          ctx.arc(ecx + 4, ecy - 1, 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(ecx - 5, ecy - 3, 0.7, 0, Math.PI * 2);
          ctx.arc(ecx + 3, ecy - 3, 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          FX.shadow(ctx, ecx, e.y + e.h + 2, e.w / 2, 3, 0.3);
          FX.bevelRect(ctx, e.x, e.y, e.w, e.h, '#2a5a5a', 3);
          ctx.strokeStyle = 'rgba(0,15,15,0.5)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(e.x + 0.75, e.y + 0.75, e.w - 1.5, e.h - 1.5);
          const lensGrad = ctx.createRadialGradient(ecx - 2, ecy - 2, 1, ecx, ecy, e.w / 2 - 4);
          lensGrad.addColorStop(0, '#9dfff0');
          lensGrad.addColorStop(1, '#2a8a7a');
          ctx.fillStyle = lensGrad;
          ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
          ctx.fillStyle = '#0a2a2a';
          ctx.beginPath();
          ctx.arc(ecx, ecy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(ecx - 1.5, ecy - 1.5, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (boss && boss.alive) {
        const bcx = boss.x + boss.w / 2, bcy = boss.y + boss.h / 2;
        const flashing = boss.hitFlash > 0 && Math.floor(boss.hitFlash * 20) % 2 === 0;
        FX.shadow(ctx, bcx, bcy + boss.h / 2 + 3, boss.w / 2, 5, 0.4);
        if (flashing) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(bcx, bcy, boss.w / 2, boss.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // dramatic pulsing aura + multi-tone body for a final-boss feel
          const auraGrad = ctx.createRadialGradient(bcx, bcy, boss.w * 0.4, bcx, bcy, boss.w * 0.75);
          auraGrad.addColorStop(0, 'rgba(255,79,163,0)');
          auraGrad.addColorStop(1, `rgba(255,79,163,${0.15 + Math.sin(torchTime * 5) * 0.08})`);
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(bcx, bcy, boss.w * 0.75, 0, Math.PI * 2);
          ctx.fill();
          FX.sphere(ctx, bcx, bcy, boss.w / 2, '#8a2a5a');
          // spiked crown silhouette
          ctx.fillStyle = FX.shade('#8a2a5a', -22);
          [-0.6, -0.2, 0.2, 0.6].forEach((a) => {
            const sxp = bcx + Math.cos(-Math.PI / 2 + a) * boss.w * 0.42;
            const syp = bcy + Math.sin(-Math.PI / 2 + a) * boss.h * 0.42;
            ctx.beginPath();
            ctx.moveTo(sxp - 3, syp + 4);
            ctx.lineTo(sxp, syp - 8);
            ctx.lineTo(sxp + 3, syp + 4);
            ctx.closePath();
            ctx.fill();
          });
        }
        ctx.strokeStyle = 'rgba(30,0,15,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(bcx, bcy, boss.w / 2, boss.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd24f';
        ctx.beginPath();
        ctx.arc(bcx - 9, bcy - 4, 4, 0, Math.PI * 2);
        ctx.arc(bcx + 9, bcy - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a0a1a';
        ctx.beginPath();
        ctx.arc(bcx - 9 + boss.dir.dx * 2, bcy - 4 + boss.dir.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.arc(bcx + 9 + boss.dir.dx * 2, bcy - 4 + boss.dir.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(bcx - 10, bcy - 6, 0.9, 0, Math.PI * 2);
        ctx.arc(bcx + 8, bcy - 6, 0.9, 0, Math.PI * 2);
        ctx.fill();

        const barW = 50;
        ctx.fillStyle = '#2a0a1a';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW, 5);
        ctx.fillStyle = '#ff4fa3';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW * (boss.hp / BOSS_HP), 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bcx - barW / 2 + 0.5, boss.y - 11.5, barW - 1, 4);
      }

      projectiles.forEach((p) => {
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
        pg.addColorStop(0, '#fff6c8');
        pg.addColorStop(0.5, '#ffd24f');
        pg.addColorStop(1, 'rgba(255,140,20,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      particles.forEach((p) => {
        ctx.fillStyle = `rgba(255, 210, 79, ${Math.max(0, p.life / 0.4)})`;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });

      if (player.attackTimer > 0) {
        const reach = 26;
        const sx = player.x + player.w / 2 - 14 + player.facing.dx * reach;
        const sy = player.y + player.h / 2 - 14 + player.facing.dy * reach;
        const swingGrad = ctx.createLinearGradient(sx, sy, sx + 28, sy + 28);
        swingGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
        swingGrad.addColorStop(0.5, 'rgba(210,225,255,0.75)');
        swingGrad.addColorStop(1, 'rgba(140,170,255,0.35)');
        ctx.fillStyle = swingGrad;
        ctx.fillRect(sx, sy, 28, 28);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 4, sy + 4, 20, 20);
      }

      {
        if (player.powerTimer > 0) {
          ctx.strokeStyle = `rgba(255, 210, 79, ${0.4 + Math.sin(player.powerTimer * 12) * 0.3})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 22, 0, Math.PI * 2);
          ctx.stroke();
        }
        const bodyColor = player.powerTimer > 0
          ? '#ffd24f'
          : (player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0) ? '#ff5c5c' : '#3fae3f';
        const pcx = player.x + player.w / 2;
        FX.shadow(ctx, pcx, player.y + player.h + 3, player.w / 2, 3, 0.3);
        FX.bevelRect(ctx, player.x, player.y + 9, player.w, player.h - 9, bodyColor, 3);
        ctx.strokeStyle = 'rgba(20,20,10,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(player.x + 0.75, player.y + 9.75, player.w - 1.5, player.h - 10.5);
        // tunic highlight streak for a glossier, more lit look
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(player.x + 2, player.y + 11, 3, player.h - 13);
        ctx.fillStyle = '#7a4a1a';
        ctx.fillRect(player.x, player.y + player.h - 8, player.w, 3);
        ctx.strokeStyle = 'rgba(20,10,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(player.x + 0.5, player.y + player.h - 7.5, player.w - 1, 2);
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath();
        ctx.arc(pcx, player.y + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,50,20,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(pcx - 2, player.y + 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(pcx - 7, player.y + 4);
        ctx.lineTo(pcx + 7, player.y + 4);
        ctx.lineTo(pcx, player.y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,10,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // weapon glint
        ctx.fillStyle = '#e8b98a';
        ctx.fillRect(
          player.x + player.w / 2 - 3 + player.facing.dx * 10,
          player.y + player.h / 2 - 3 + player.facing.dy * 10,
          6, 6
        );
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(
          player.x + player.w / 2 - 3 + player.facing.dx * 10,
          player.y + player.h / 2 - 3 + player.facing.dy * 10,
          2, 2
        );
      }

      ctx.restore();

      const remaining = enemies.filter((e) => e.alive).length;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      let hint = 'FIND THE TRIFORCE SHARD';
      if (remaining > 0) hint = `ENEMIES LEFT: ${remaining}`;
      else if (boss && boss.alive) hint = 'DEFEAT THE OVERLORD';
      ctx.fillText(hint, 8, 16);
    },
  };
}
