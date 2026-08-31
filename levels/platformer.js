function createPlatformerLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx } = api;

  const GRAVITY = 1500;
  const MOVE_SPEED = 200;
  const JUMP_VEL = -520;
  const GROUND_Y = H - 40;

  const platforms = [
    { x: 0, y: GROUND_Y, w: 300, h: 40 },
    { x: 380, y: GROUND_Y, w: 220, h: 40 },
    { x: 660, y: GROUND_Y - 70, w: 140, h: 20 },
    { x: 860, y: GROUND_Y, w: 260, h: 40 },
    { x: 1180, y: GROUND_Y - 100, w: 120, h: 20 },
    { x: 1360, y: GROUND_Y - 40, w: 120, h: 20 },
    { x: 1540, y: GROUND_Y, w: 260, h: 40 },
    { x: 1860, y: GROUND_Y - 60, w: 100, h: 20 },
    { x: 2020, y: GROUND_Y, w: 400, h: 40 },
  ];
  const WORLD_END = 2420;
  const flag = { x: WORLD_END - 40, y: GROUND_Y - 90, w: 12, h: 90 };
  const coins = [
    { x: 440, y: GROUND_Y - 40 }, { x: 500, y: GROUND_Y - 40 },
    { x: 700, y: GROUND_Y - 110 },
    { x: 920, y: GROUND_Y - 40 }, { x: 980, y: GROUND_Y - 40 }, { x: 1040, y: GROUND_Y - 40 },
    { x: 1210, y: GROUND_Y - 140 },
    { x: 1600, y: GROUND_Y - 40 }, { x: 1660, y: GROUND_Y - 40 },
    { x: 2100, y: GROUND_Y - 40 }, { x: 2160, y: GROUND_Y - 40 },
  ];
  const enemySpawns = [
    { x: 420, range: [400, 560] },
    { x: 900, range: [880, 1080] },
    { x: 1580, range: [1560, 1760] },
    { x: 2060, range: [2040, 2340] },
  ];

  let player, camX, enemies, coinList, onGround, spawnX, spawnY, particles, jumpKeyPrev;

  function drawHero(ctx, p) {
    const cx = p.x + p.w / 2;
    const stride = onGround && p.vx !== 0 ? Math.sin(p.animT) * 5 : 0;
    const legLift = !onGround ? 3 : 0;
    if (onGround) FX.shadow(ctx, cx, p.y + p.h + 2, p.w / 2, 3, 0.3);

    // legs — subtle gradient + outline
    const legGrad = ctx.createLinearGradient(0, p.y + 18, 0, p.y + 30);
    legGrad.addColorStop(0, '#2a5a6f');
    legGrad.addColorStop(1, '#12262f');
    ctx.fillStyle = legGrad;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    const leg1x = cx - 5 + stride * 0.3, leg2x = cx + 1 - stride * 0.3, legY = p.y + 20 - legLift, legH = 8 + legLift;
    ctx.fillRect(leg1x, legY, 4, legH);
    ctx.strokeRect(leg1x, legY, 4, legH);
    ctx.fillRect(leg2x, legY, 4, legH);
    ctx.strokeRect(leg2x, legY, 4, legH);

    // torso — gradient with a bright edge highlight and a dark belt shading band
    const bodyGrad = ctx.createLinearGradient(p.x, p.y + 9, p.x, p.y + 22);
    bodyGrad.addColorStop(0, '#7dffea');
    bodyGrad.addColorStop(0.45, '#4fe3d0');
    bodyGrad.addColorStop(1, '#297f74');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(p.x + 2, p.y + 9, p.w - 4, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(p.x + 3, p.y + 10, 2, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x + 2, p.y + 19, p.w - 4, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(p.x + 2, p.y + 9, p.w - 4, 13);

    // arm
    const armX = cx + (p.facing > 0 ? 2 : -6);
    ctx.fillStyle = '#e8b98a';
    ctx.fillRect(armX, p.y + 12, 4, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(armX, p.y + 12, 4, 7);

    // head — lit sphere with outline
    FX.sphere(ctx, cx, p.y + 6, 6, '#e8b98a');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, p.y + 6, 6, 0, Math.PI * 2);
    ctx.stroke();

    // hair with outline + tiny sheen
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(cx, p.y + 3, 6, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - 4, p.y, 3, 2);

    // eye + specular glint
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx + p.facing * 2, p.y + 5, 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(cx + p.facing * 2 + (p.facing > 0 ? 0.2 : 0.9), p.y + 5.2, 0.7, 0.7);
  }

  function resetPlayer() {
    player = { x: spawnX, y: spawnY, w: 22, h: 28, vx: 0, vy: 0, facing: 1, animT: 0, jumpsUsed: 0 };
  }

  function burst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.3, color });
    }
  }

  return {
    init() {
      spawnX = 20; spawnY = GROUND_Y - 28;
      resetPlayer();
      camX = 0;
      onGround = true;
      enemies = enemySpawns.map((s) => ({ x: s.x, y: GROUND_Y - 18, w: 20, h: 18, dir: 1, range: s.range, alive: true }));
      coinList = coins.map((c) => ({ ...c, taken: false }));
      particles = [];
      jumpKeyPrev = false;
    },

    update(dt) {
      player.vx = 0;
      if (isDown('ArrowLeft', 'a')) player.vx = -MOVE_SPEED;
      if (isDown('ArrowRight', 'd')) player.vx = MOVE_SPEED;
      if (player.vx > 0) player.facing = 1;
      else if (player.vx < 0) player.facing = -1;
      player.animT += dt * (player.vx !== 0 ? 10 : 3);
      const jumpKeyDown = isDown('ArrowUp', 'w', 'Space');
      const jumpPressed = jumpKeyDown && !jumpKeyPrev;
      jumpKeyPrev = jumpKeyDown;
      if (jumpPressed) {
        if (onGround) {
          player.vy = JUMP_VEL;
          onGround = false;
          player.jumpsUsed = 1;
          sfx('jump');
        } else if (player.jumpsUsed < 2) {
          player.vy = JUMP_VEL * 0.85;
          player.jumpsUsed = 2;
          sfx('jump');
          burst(player.x + player.w / 2, player.y + player.h, '#4fe3d0');
        }
      }

      player.vy += GRAVITY * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      onGround = false;
      for (const p of platforms) {
        if (player.x + player.w > p.x && player.x < p.x + p.w) {
          const feetPrev = player.y + player.h - player.vy * dt;
          if (player.vy >= 0 && feetPrev <= p.y && player.y + player.h >= p.y) {
            player.y = p.y - player.h;
            player.vy = 0;
            onGround = true;
            player.jumpsUsed = 0;
          }
        }
      }
      player.x = Math.max(0, Math.min(WORLD_END - player.w, player.x));

      particles.forEach((pt) => { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; });
      particles = particles.filter((pt) => pt.life > 0);

      if (player.y > H + 100) {
        loseLife();
        return;
      }

      enemies.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * 60 * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
      });

      for (const e of enemies) {
        if (!e.alive) continue;
        if (rectsOverlapP(player, e)) {
          const stomping = player.vy > 0 && player.y + player.h - e.h / 2 < e.y + e.h / 2;
          if (stomping) {
            e.alive = false;
            player.vy = JUMP_VEL * 0.6;
            player.jumpsUsed = 0;
            addScore(20);
            sfx('hit');
          } else {
            loseLife();
            return;
          }
        }
      }

      coinList.forEach((c) => {
        if (!c.taken && Math.hypot(player.x - c.x, player.y - c.y) < 24) {
          c.taken = true;
          addScore(5);
          sfx('pickup');
        }
      });

      if (rectsOverlapP(player, flag)) {
        winLevel(30);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_END - W, player.x - W / 2));
    },

    draw(ctx) {
      ctx.fillStyle = '#0c1424';
      ctx.fillRect(0, 0, W, H);

      const mtnGrad = ctx.createLinearGradient(0, H - 120, 0, H);
      mtnGrad.addColorStop(0, '#2a5f8a');
      mtnGrad.addColorStop(1, '#0e2438');
      ctx.fillStyle = mtnGrad;
      for (let i = 0; i < 6; i++) {
        const px = (i * 220 - camX * 0.3) % (W + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(px, H);
        ctx.lineTo(px + 60, H - 120);
        ctx.lineTo(px + 120, H);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(px + 60, H - 120);
        ctx.lineTo(px + 72, H - 96);
        ctx.lineTo(px + 48, H - 96);
        ctx.fill();
        ctx.fillStyle = mtnGrad;
      }

      ctx.save();
      ctx.translate(-camX, 0);

      platforms.forEach((p) => {
        FX.shadow(ctx, p.x + p.w / 2, p.y + p.h + 6, p.w / 2, 6, 0.3);
        FX.bevelRect(ctx, p.x, p.y, p.w, p.h, '#3a2f5a', 3);

        // grassy top with a lit gradient + rim-light edge
        const grassGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + 4);
        grassGrad.addColorStop(0, '#a8ff9a');
        grassGrad.addColorStop(1, '#4fcf4f');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(p.x, p.y, p.w, 1);

        // faint brick-coursing texture on the dirt body (cheap, few lines)
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        for (let lx = p.x + 14; lx < p.x + p.w - 2; lx += 26) {
          ctx.beginPath();
          ctx.moveTo(lx, p.y + 6);
          ctx.lineTo(lx, p.y + p.h - 4);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(p.x + 2, p.y + p.h * 0.55);
        ctx.lineTo(p.x + p.w - 2, p.y + p.h * 0.55);
        ctx.stroke();
      });

      coinList.forEach((c) => {
        if (c.taken) return;
        FX.sphere(ctx, c.x, c.y, 6, '#ffd24f');
      });

      enemies.filter((e) => e.alive).forEach((e) => {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        FX.shadow(ctx, cx, e.y + e.h + 2, e.w / 2, 3, 0.3);
        ctx.fillStyle = '#c93a7a';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI);
        ctx.fill();
        const bodyGrad = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, e.w / 2 + 3);
        bodyGrad.addColorStop(0, FX.shade('#ff4fa3', 40));
        bodyGrad.addColorStop(1, FX.shade('#ff4fa3', -15));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = '#2a1020';
        ctx.fillRect(e.x + 2, e.y + e.h - 4, 5, 4);
        ctx.fillRect(e.x + e.w - 7, e.y + e.h - 4, 5, 4);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0a10';
        ctx.beginPath();
        ctx.arc(cx - 4 + e.dir, cy - 2, 1.3, 0, Math.PI * 2);
        ctx.arc(cx + 4 + e.dir, cy - 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(cx - 4.6 + e.dir, cy - 2.8, 0.6, 0, Math.PI * 2);
        ctx.arc(cx + 3.4 + e.dir, cy - 2.8, 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      const poleGrad = ctx.createLinearGradient(flag.x, 0, flag.x + 3, 0);
      poleGrad.addColorStop(0, '#ffffff');
      poleGrad.addColorStop(1, '#a8b4d8');
      ctx.fillStyle = poleGrad;
      ctx.fillRect(flag.x, flag.y, 3, flag.h);
      const clothGrad = ctx.createLinearGradient(flag.x + 3, flag.y, flag.x + 27, flag.y + 16);
      clothGrad.addColorStop(0, '#7dffea');
      clothGrad.addColorStop(1, '#3ab8a8');
      ctx.fillStyle = clothGrad;
      ctx.fillRect(flag.x + 3, flag.y, 24, 16);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(flag.x + 3, flag.y, 24, 16);

      drawHero(ctx, player);

      particles.forEach((pt) => {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / 0.3);
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      ctx.restore();

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`COINS ${coinList.filter((c) => c.taken).length}/${coins.length}`, 8, 16);
    },
  };
}

function rectsOverlapP(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
