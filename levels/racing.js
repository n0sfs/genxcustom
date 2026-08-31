function createRacingLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ROAD_X = 70, ROAD_W = W - ROAD_X * 2;
  const PLAYER_W = 34, PLAYER_H = 52;
  const DISTANCE_TARGET = 1600;
  const BOOST_TIME = 2.5;
  const CAR_COLORS = ['#ff4fa3', '#ffd24f', '#8f8fff', '#ff9a4f'];

  let player, obstacles, pickups, distance, speed, spawnTimer, fuelTimer, boostTimer, dashOffset, scoreTick, particles;

  function burst(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 30 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.3, color });
    }
  }

  function drawFuel(ctx, x, y, w, h) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
    FX.shadow(ctx, x + w / 2, y + h + 3, w / 2, 3, 0.3);
    ctx.save();
    ctx.shadowColor = 'rgba(79,227,208,0.8)';
    ctx.shadowBlur = 4 + pulse * 4;
    FX.bevelBlock(ctx, x, y, w, h, '#4fe3d0', 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.2;
    FX.roundRectPath(ctx, x, y, w, h, 3);
    ctx.stroke();
    // glossy highlight streak
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.15})`;
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    ctx.fillStyle = '#0a2a2a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
  }

  function glowDot(ctx, x, y, r, colorCore, colorEdge) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colorCore);
    g.addColorStop(1, colorEdge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(ctx, x, y, w, h, body) {
    FX.shadow(ctx, x + w / 2, y + h + 4, w / 2 + 2, 4, 0.35);
    // tires
    ctx.fillStyle = '#161616';
    ctx.fillRect(x - 2, y + 5, 4, h - 10);
    ctx.fillRect(x + w - 2, y + 5, 4, h - 10);

    // body with beveled shading, then a dark silhouette outline (90s sprite look)
    FX.bevelBlock(ctx, x, y, w, h, body, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    FX.roundRectPath(ctx, x, y, w, h, 4);
    ctx.stroke();

    // thin chrome bumper trim, front and rear
    FX.chrome(ctx, x + 3, y, w - 6, 2);
    FX.chrome(ctx, x + 3, y + h - 2, w - 6, 2);

    // glassy windshield: multi-stop gradient + a bright diagonal reflection streak
    const wsY = y + h * 0.3, wsH = h * 0.32;
    const wsGrad = ctx.createLinearGradient(x, wsY, x + w, wsY + wsH);
    wsGrad.addColorStop(0, '#4a5d70');
    wsGrad.addColorStop(0.4, '#182430');
    wsGrad.addColorStop(0.6, '#233240');
    wsGrad.addColorStop(1, '#0c1218');
    ctx.fillStyle = wsGrad;
    ctx.fillRect(x + 4, wsY, w - 8, wsH);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + 6, wsY + wsH * 0.15);
    ctx.lineTo(x + w - 9, wsY + wsH * 0.7);
    ctx.stroke();

    // headlight glints (radial glow, not flat fill)
    glowDot(ctx, x + 4, y + 2, 3, '#fff8d8', 'rgba(255,227,138,0)');
    glowDot(ctx, x + w - 4, y + 2, 3, '#fff8d8', 'rgba(255,227,138,0)');
    // taillight glow
    glowDot(ctx, x + 4, y + h - 2, 2.5, '#ffb3b3', 'rgba(255,60,60,0)');
    glowDot(ctx, x + w - 4, y + h - 2, 2.5, '#ffb3b3', 'rgba(255,60,60,0)');
  }

  function drawGuardrail(ctx, x, w) {
    FX.chrome(ctx, x, 0, w, H);
    const blockH = 24;
    const offset = ((dashOffset % (blockH * 2)) + blockH * 2) % (blockH * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, H);
    ctx.clip();
    for (let y = -offset - blockH * 2; y < H + blockH * 2; y += blockH) {
      const idx = Math.round((y + offset) / blockH);
      ctx.fillStyle = idx % 2 === 0 ? '#ff3b3b' : '#f2f2f2';
      ctx.fillRect(x, y, w, blockH * 0.6);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 0, w - 1, H);
  }

  function spawnObstacle() {
    const w = 34, h = 52;
    const x = ROAD_X + 14 + Math.random() * (ROAD_W - w - 28);
    obstacles.push({ x, y: -h, w, h, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] });
  }

  return {
    init() {
      player = { x: W / 2 - PLAYER_W / 2, y: H - 90, w: PLAYER_W, h: PLAYER_H, vx: 0 };
      obstacles = [];
      pickups = [];
      particles = [];
      distance = 0;
      speed = 220;
      spawnTimer = 0.8;
      fuelTimer = 5 + Math.random() * 4;
      boostTimer = 0;
      dashOffset = 0;
      scoreTick = 0;
    },

    update(dt) {
      boostTimer = Math.max(0, boostTimer - dt);
      const boosting = boostTimer > 0;
      speed = (220 + Math.min(260, distance * 0.09)) * (boosting ? 1.5 : 1);

      const moveSpeed = boosting ? 340 : 260;
      player.vx = 0;
      if (isDown('ArrowLeft', 'a')) player.vx = -moveSpeed;
      if (isDown('ArrowRight', 'd')) player.vx = moveSpeed;
      player.x += player.vx * dt;
      player.x = Math.max(ROAD_X + 6, Math.min(ROAD_X + ROAD_W - player.w - 6, player.x));

      distance += speed * dt * 0.05;
      dashOffset = (dashOffset + speed * dt) % 40;

      if (boosting && Math.random() < 0.6) {
        particles.push({ x: player.x + player.w / 2 + (Math.random() - 0.5) * 10, y: player.y + player.h, vx: (Math.random() - 0.5) * 40, vy: 120, life: 0.3, color: '#4fe3d0' });
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnObstacle();
        spawnTimer = Math.max(0.45, 1.05 - distance / 6000);
      }

      fuelTimer -= dt;
      if (fuelTimer <= 0) {
        const w = 22, h = 26;
        const x = ROAD_X + 14 + Math.random() * (ROAD_W - w - 28);
        pickups.push({ x, y: -h, w, h });
        fuelTimer = 7 + Math.random() * 6;
      }

      obstacles.forEach((o) => (o.y += speed * dt));
      obstacles = obstacles.filter((o) => o.y < H + 60);
      pickups.forEach((p) => (p.y += speed * dt));
      pickups = pickups.filter((p) => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          boostTimer = BOOST_TIME;
          addScore(10);
          sfx('pickup');
          shake(0.08, 2);
          burst(p.x + p.w / 2, p.y + p.h / 2, '#4fe3d0');
          return false;
        }
        return p.y < H + 60;
      });

      particles.forEach((pt) => { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; });
      particles = particles.filter((pt) => pt.life > 0);

      if (!boosting) {
        for (const o of obstacles) {
          if (player.x < o.x + o.w && player.x + player.w > o.x && player.y < o.y + o.h && player.y + player.h > o.y) {
            loseLife();
            return;
          }
        }
      }

      scoreTick += dt;
      if (scoreTick >= 1) {
        scoreTick -= 1;
        addScore(2);
      }

      if (distance >= DISTANCE_TARGET) {
        winLevel(40);
      }
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, '#1e2a1e', '#141c14');

      // scrolling roadside scenery ticks (cheap parallax, reuses existing dash scroll)
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = -1; i < 8; i++) {
        const ty = ((i * 60 - dashOffset * 1.5) % (H + 60)) - 30;
        ctx.fillRect(18, ty, 10, 22);
        ctx.fillRect(W - 28, ty + 30, 10, 22);
      }

      FX.gradientRect(ctx, ROAD_X, 0, ROAD_W, H, '#3f3f4a', '#232328');

      // faint tire-wear streaks for road texture
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(ROAD_X + ROAD_W * 0.22, 0, 4, H);
      ctx.fillRect(ROAD_X + ROAD_W * 0.78, 0, 4, H);

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 18]);
      ctx.lineDashOffset = -dashOffset;
      for (let i = 1; i < 3; i++) {
        const x = ROAD_X + (ROAD_W / 3) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      drawGuardrail(ctx, ROAD_X - 6, 6);
      drawGuardrail(ctx, ROAD_X + ROAD_W, 6);

      obstacles.forEach((o) => drawCar(ctx, o.x, o.y, o.w, o.h, o.color));
      pickups.forEach((p) => drawFuel(ctx, p.x, p.y, p.w, p.h));

      particles.forEach((pt) => {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / 0.3);
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      if (boostTimer > 0) {
        ctx.strokeStyle = 'rgba(79, 227, 208, 0.6)';
        ctx.lineWidth = 3;
        ctx.strokeRect(player.x - 3, player.y - 3, player.w + 6, player.h + 6);
        // nitro exhaust glow beneath the car
        const flicker = 0.7 + 0.3 * Math.sin(Date.now() / 40);
        const flameGrad = ctx.createRadialGradient(
          player.x + player.w / 2, player.y + player.h + 6, 0,
          player.x + player.w / 2, player.y + player.h + 6, 16 * flicker
        );
        flameGrad.addColorStop(0, 'rgba(200,255,245,0.9)');
        flameGrad.addColorStop(0.5, 'rgba(79,227,208,0.5)');
        flameGrad.addColorStop(1, 'rgba(79,227,208,0)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.ellipse(player.x + player.w / 2, player.y + player.h + 6, 10 * flicker, 16 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCar(ctx, player.x, player.y, player.w, player.h, boostTimer > 0 ? '#8fffe0' : '#4fe3d0');

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`${Math.floor(distance)}m / ${DISTANCE_TARGET}m`, 8, 16);
      if (boostTimer > 0) {
        ctx.fillStyle = '#4fe3d0';
        ctx.fillText('NITRO!', W - 60, 16);
      }
    },
  };
}
