function createSkyDefenseLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GROUND_Y = H - 40;
  const CITY_W = 58, CITY_H = 34;
  const CITY_XS = [46, 218, 428]; // left edges, kept clear of the center silo
  const SILO_W = 44;
  const SILO_X = W / 2 - SILO_W / 2;

  const CROSS_SPEED = 260;
  const FIRE_COOLDOWN = 0.35;
  const INTERCEPTOR_SPEED = 950;
  const BLAST_PEAK = 40;
  const BLAST_LIFE = 0.35;
  const TARGET_KILLS = 25;
  const SURVIVAL_BONUS_STEP = 5;

  function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

  let cities, crosshair, fireCooldown, interceptors, blasts, missiles, particles, impacts, stars;
  let spawnTimer, elapsed, kills, nextSurvivalBonusAt;

  function spawnCities() {
    cities = CITY_XS.map((x) => ({
      x, y: GROUND_Y - CITY_H, w: CITY_W, h: CITY_H, alive: true,
      windows: Array.from({ length: 6 }, () => Math.random() < 0.6),
      rubble: Array.from({ length: 5 }, () => ({
        dx: Math.random() * CITY_W * 0.8,
        dw: 6 + Math.random() * 10,
        dh: 3 + Math.random() * 8,
      })),
    }));
  }

  function spawnStars() {
    stars = [];
    for (let i = 0; i < 50; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y - 10),
        r: Math.random() < 0.8 ? 0.8 : 1.5,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function difficultyInterval() {
    const base = 2.1 - elapsed * 0.014 - kills * 0.018;
    return Math.max(0.45, base) + Math.random() * 0.35;
  }

  function pickMissileTarget() {
    if (Math.random() < 0.72) {
      const idx = Math.floor(Math.random() * cities.length);
      return { x: cities[idx].x + cities[idx].w / 2, y: GROUND_Y, cityIndex: idx };
    }
    return { x: 20 + Math.random() * (W - 40), y: GROUND_Y, cityIndex: -1 };
  }

  function spawnMissile() {
    const startX = 10 + Math.random() * (W - 20);
    const target = pickMissileTarget();
    const speed = 46 + Math.random() * 18 + Math.min(70, elapsed * 1.1 + kills * 0.6);
    const ang = Math.atan2(target.y - 0, target.x - startX);
    missiles.push({
      x: startX, y: 0,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      targetX: target.x, targetY: target.y, cityIndex: target.cityIndex,
      trail: [], alive: true,
    });
  }

  function burst(list, x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = spread * (0.4 + Math.random() * 0.9);
      list.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5, color });
    }
  }

  return {
    init() {
      spawnCities();
      spawnStars();
      crosshair = { x: W / 2, y: H / 2 };
      fireCooldown = 0;
      interceptors = [];
      blasts = [];
      missiles = [];
      particles = [];
      impacts = [];
      spawnTimer = 1.2;
      elapsed = 0;
      kills = 0;
      nextSurvivalBonusAt = SURVIVAL_BONUS_STEP;
    },

    update(dt) {
      elapsed += dt;
      fireCooldown = Math.max(0, fireCooldown - dt);

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx = -1;
      if (isDown('ArrowRight', 'd')) mvx = 1;
      if (isDown('ArrowUp', 'w')) mvy = -1;
      if (isDown('ArrowDown', 's')) mvy = 1;
      crosshair.x += mvx * CROSS_SPEED * dt;
      crosshair.y += mvy * CROSS_SPEED * dt;
      crosshair.x = Math.max(6, Math.min(W - 6, crosshair.x));
      crosshair.y = Math.max(6, Math.min(H - 6, crosshair.y));

      if (isDown('Space') && fireCooldown <= 0) {
        fireCooldown = FIRE_COOLDOWN;
        const sx = W / 2, sy = GROUND_Y - 18;
        const d = dist(sx, sy, crosshair.x, crosshair.y);
        const dur = Math.max(0.35, Math.min(0.6, d / INTERCEPTOR_SPEED));
        interceptors.push({ sx, sy, tx: crosshair.x, ty: crosshair.y, t: 0, dur });
        sfx('launch');
      }

      // interceptors travel toward their frozen target, then detonate
      interceptors.forEach((m) => { m.t += dt; });
      interceptors.forEach((m) => {
        if (m.t >= m.dur) {
          blasts.push({ x: m.tx, y: m.ty, t: 0, life: BLAST_LIFE });
          sfx('bounce');
        }
      });
      interceptors = interceptors.filter((m) => m.t < m.dur);

      // blasts grow then shrink; anything caught inside is destroyed
      blasts.forEach((b) => {
        b.t += dt;
        const frac = Math.min(1, b.t / b.life);
        b.r = BLAST_PEAK * Math.sin(Math.PI * frac);
      });
      blasts = blasts.filter((b) => b.t < b.life);

      // spawn incoming missiles, ramping up over time
      spawnTimer -= dt;
      if (spawnTimer <= 0 && kills < TARGET_KILLS) {
        spawnMissile();
        spawnTimer = difficultyInterval();
      }

      missiles.forEach((ms) => {
        if (!ms.alive) return;
        ms.trail.push({ x: ms.x, y: ms.y });
        if (ms.trail.length > 10) ms.trail.shift();
        ms.x += ms.vx * dt;
        ms.y += ms.vy * dt;
      });

      // interception check
      missiles.forEach((ms) => {
        if (!ms.alive) return;
        for (const b of blasts) {
          if (dist(ms.x, ms.y, b.x, b.y) <= b.r) {
            ms.alive = false;
            kills++;
            const earlyBonus = Math.round((1 - Math.max(0, ms.y) / GROUND_Y) * 50);
            addScore(100 + earlyBonus);
            burst(particles, ms.x, ms.y, '#ffb84f', 10, 140);
            sfx('explosion');
            shake(0.12, 3);
            if (kills >= nextSurvivalBonusAt) {
              if (cities.every((c) => c.alive)) {
                addScore(50);
                sfx('pickup');
              }
              nextSurvivalBonusAt += SURVIVAL_BONUS_STEP;
            }
            break;
          }
        }
      });

      // missiles reaching the ground
      missiles.forEach((ms) => {
        if (!ms.alive) return;
        if (ms.y >= GROUND_Y) {
          ms.alive = false;
          const city = ms.cityIndex >= 0 ? cities[ms.cityIndex] : null;
          if (city && city.alive) {
            city.alive = false;
            burst(particles, city.x + city.w / 2, city.y + city.h / 2, '#ff5c5c', 16, 180);
            sfx('explosion');
            shake(0.3, 6);
            loseLife();
          } else {
            impacts.push({ x: ms.x, y: GROUND_Y, life: 0.35 });
            sfx('hit');
          }
        }
      });
      missiles = missiles.filter((ms) => ms.alive && ms.y < GROUND_Y + 4);

      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);
      impacts.forEach((p) => { p.life -= dt; });
      impacts = impacts.filter((p) => p.life > 0);

      if (kills >= TARGET_KILLS) {
        const aliveCities = cities.filter((c) => c.alive).length;
        winLevel(150 + aliveCities * 50);
      }
    },

    draw(ctx) {
      // night sky
      FX.gradientRect(ctx, 0, 0, W, GROUND_Y, '#0a0a2a', '#04041a');
      const t = Date.now() / 1000;
      stars.forEach((s) => {
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
        ctx.fillStyle = `rgba(220,230,255,${0.3 + tw * 0.5})`;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      });

      // ground strip
      FX.gradientRect(ctx, 0, GROUND_Y, W, H - GROUND_Y, '#4a4038', '#221c18');
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, GROUND_Y, W, 3);

      // silo, centered at the bottom
      const siloTopY = GROUND_Y - 18;
      const siloCx = SILO_X + SILO_W / 2;
      FX.shadow(ctx, siloCx, GROUND_Y + 2, SILO_W / 2, 4, 0.35);
      FX.bevelBlock(ctx, SILO_X, siloTopY, SILO_W, 18 + (GROUND_Y - siloTopY), '#5a6a7a', 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(SILO_X + 0.5, siloTopY + 0.5, SILO_W - 1, H - siloTopY - 1);
      ctx.save();
      ctx.translate(siloCx, siloTopY + 4);
      const barrelAng = Math.atan2(crosshair.y - (siloTopY + 4), crosshair.x - siloCx);
      ctx.rotate(barrelAng);
      const barrelGrad = ctx.createLinearGradient(0, -2, 0, 2);
      barrelGrad.addColorStop(0, '#8a94a4');
      barrelGrad.addColorStop(1, '#2a2e38');
      ctx.fillStyle = barrelGrad;
      ctx.fillRect(0, -2.5, 18, 5);
      ctx.restore();

      // cities
      cities.forEach((c) => {
        if (c.alive) {
          FX.shadow(ctx, c.x + c.w / 2, c.y + c.h + 2, c.w / 2, 3, 0.3);
          FX.bevelBlock(ctx, c.x, c.y, c.w, c.h, '#3a6a9a', 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
          const cols = 3, rows = 2;
          const ww = c.w / (cols + 1), wh = c.h / (rows + 2);
          let wi = 0;
          for (let r = 0; r < rows; r++) {
            for (let cc = 0; cc < cols; cc++) {
              const lit = c.windows[wi] && Math.sin(t * 3 + wi) > -0.3;
              ctx.fillStyle = lit ? '#ffe38a' : 'rgba(20,20,30,0.6)';
              ctx.fillRect(c.x + ww * (cc + 0.6), c.y + wh * (r + 0.7), ww * 0.6, wh * 0.6);
              wi++;
            }
          }
        } else {
          // flattened rubble silhouette
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(c.x, c.y + c.h - 6, c.w, 6);
          ctx.fillStyle = '#241c18';
          c.rubble.forEach((r) => {
            ctx.fillRect(c.x + r.dx, c.y + c.h - r.dh, r.dw, r.dh);
          });
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c.x, c.y + c.h - 6, c.w, 6);
        }
      });

      // ground impact puffs (missiles that hit dirt / dead cities)
      impacts.forEach((p) => {
        const a = Math.max(0, p.life / 0.35);
        ctx.fillStyle = `rgba(180,160,120,${a * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, GROUND_Y, 10 * (1 - a) + 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // incoming missile trails + heads
      missiles.forEach((ms) => {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,110,60,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ms.trail.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        });
        ctx.lineTo(ms.x, ms.y);
        ctx.stroke();
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff6a3a';
        ctx.fillStyle = '#ffb84f';
        ctx.beginPath();
        ctx.arc(ms.x, ms.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // interceptor trails + heads
      interceptors.forEach((m) => {
        const frac = Math.min(1, m.t / m.dur);
        const cx = m.sx + (m.tx - m.sx) * frac;
        const cy = m.sy + (m.ty - m.sy) * frac;
        ctx.save();
        ctx.strokeStyle = 'rgba(120,220,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.sx, m.sy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.shadowBlur = 9;
        ctx.shadowColor = '#7fe8ff';
        ctx.fillStyle = '#d8f8ff';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // blasts: layered radial-gradient explosions
      blasts.forEach((b) => {
        if (b.r <= 0.5) return;
        const frac = Math.min(1, b.t / b.life);
        const alpha = Math.max(0, 1 - frac * 0.7);
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(255,255,240,${alpha})`);
        grad.addColorStop(0.35, `rgba(255,210,90,${alpha * 0.9})`);
        grad.addColorStop(0.7, `rgba(255,110,40,${alpha * 0.55})`);
        grad.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // debris particles
      particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 0.5);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      });

      // crosshair reticle
      const pulse = 1 + 0.08 * Math.sin(t * 6);
      ctx.save();
      ctx.strokeStyle = '#39ff8f';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#39ff8f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(crosshair.x, crosshair.y, 9 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(crosshair.x - 14, crosshair.y);
      ctx.lineTo(crosshair.x - 4, crosshair.y);
      ctx.moveTo(crosshair.x + 4, crosshair.y);
      ctx.lineTo(crosshair.x + 14, crosshair.y);
      ctx.moveTo(crosshair.x, crosshair.y - 14);
      ctx.lineTo(crosshair.x, crosshair.y - 4);
      ctx.moveTo(crosshair.x, crosshair.y + 4);
      ctx.lineTo(crosshair.x, crosshair.y + 14);
      ctx.stroke();
      ctx.restore();

      // HUD
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`INTERCEPTS ${kills}/${TARGET_KILLS}`, 8, 16);
      const citiesAlive = cities.filter((c) => c.alive).length;
      ctx.fillStyle = citiesAlive === 3 ? '#6bff6b' : citiesAlive > 0 ? '#ffd24f' : '#ff5c5c';
      ctx.fillText(`CITIES ${citiesAlive}/3`, W - 70, 16);
    },
  };
}
