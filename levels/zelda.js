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

  let player, enemies, projectiles, camX, camY, goal, goalActive, particles, hearts, boss, bossSpawned;

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
      ctx.fillStyle = '#1c1408';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(-camX, -camY);

      ctx.fillStyle = '#3a2f1c';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let x = 0; x < WORLD_W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
      }
      for (let y = 0; y < WORLD_H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
      }

      walls.forEach((w) => {
        ctx.fillStyle = '#6b4a2a';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = '#8a6238';
        ctx.fillRect(w.x, w.y, w.w, 4);
      });

      if (goalActive) {
        ctx.fillStyle = '#ffd24f';
        ctx.save();
        ctx.translate(goal.x + goal.w / 2, goal.y + goal.h / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-goal.w / 2, -goal.h / 2, goal.w, goal.h);
        ctx.restore();
      }

      hearts.forEach((h) => {
        const hcx = h.x + h.w / 2, hcy = h.y + h.h / 2;
        ctx.fillStyle = '#ff4fa3';
        ctx.beginPath();
        ctx.arc(hcx - 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.arc(hcx + 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.moveTo(hcx - 8, hcy - 1);
        ctx.lineTo(hcx, hcy + 8);
        ctx.lineTo(hcx + 8, hcy - 1);
        ctx.fill();
      });

      enemies.filter((e) => e.alive).forEach((e) => {
        const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
        if (e.type === 'chaser') {
          ctx.fillStyle = '#c93a7a';
          ctx.beginPath();
          ctx.ellipse(ecx, ecy + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff4fa3';
          ctx.beginPath();
          ctx.ellipse(ecx, ecy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
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
        } else {
          ctx.fillStyle = '#2a5a5a';
          ctx.fillRect(e.x, e.y, e.w, e.h);
          ctx.fillStyle = '#4fe3d0';
          ctx.fillRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
          ctx.fillStyle = '#0a2a2a';
          ctx.beginPath();
          ctx.arc(ecx, ecy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (boss && boss.alive) {
        const bcx = boss.x + boss.w / 2, bcy = boss.y + boss.h / 2;
        const flashing = boss.hitFlash > 0 && Math.floor(boss.hitFlash * 20) % 2 === 0;
        ctx.fillStyle = flashing ? '#fff' : '#5a1a3a';
        ctx.beginPath();
        ctx.ellipse(bcx, bcy + 3, boss.w / 2, boss.h / 2 - 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flashing ? '#fff' : '#8a2a5a';
        ctx.beginPath();
        ctx.ellipse(bcx, bcy, boss.w / 2 - 3, boss.h / 2 - 5, 0, 0, Math.PI * 2);
        ctx.fill();
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

        const barW = 50;
        ctx.fillStyle = '#2a0a1a';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW, 5);
        ctx.fillStyle = '#ff4fa3';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW * (boss.hp / BOSS_HP), 5);
      }

      ctx.fillStyle = '#ffd24f';
      projectiles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      particles.forEach((p) => {
        ctx.fillStyle = `rgba(255, 210, 79, ${Math.max(0, p.life / 0.4)})`;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });

      if (player.attackTimer > 0) {
        const reach = 26;
        ctx.fillStyle = 'rgba(232, 236, 255, 0.85)';
        ctx.fillRect(
          player.x + player.w / 2 - 14 + player.facing.dx * reach,
          player.y + player.h / 2 - 14 + player.facing.dy * reach,
          28, 28
        );
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
        ctx.fillStyle = bodyColor;
        ctx.fillRect(player.x, player.y + 9, player.w, player.h - 9);
        ctx.fillStyle = '#7a4a1a';
        ctx.fillRect(player.x, player.y + player.h - 8, player.w, 3);
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath();
        ctx.arc(pcx, player.y + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(pcx - 7, player.y + 4);
        ctx.lineTo(pcx + 7, player.y + 4);
        ctx.lineTo(pcx, player.y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e8b98a';
        ctx.fillRect(
          player.x + player.w / 2 - 3 + player.facing.dx * 10,
          player.y + player.h / 2 - 3 + player.facing.dy * 10,
          6, 6
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
