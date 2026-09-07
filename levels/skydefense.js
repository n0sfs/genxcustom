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
  let TARGET_KILLS = 25;
  const SURVIVAL_BONUS_STEP = 5;

  function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

  // Cheap per-stage sky tint — same trick as racing.js's day/dusk/night, just two
  // gradient stops swapped in draw(). The barrage getting visibly redder as stages
  // climb sells "the siege is worsening" without touching any sprite.
  const SKY_THEMES = [
    { max: 1, colors: ['#0a0a2a', '#04041a'] }, // stage 1: calm night
    { max: 2, colors: ['#1c1030', '#100819'] }, // stage 2: tense, faint alert-purple
    { max: 3, colors: ['#2a0f16', '#180810'] }, // stage 3: under siege, warm red undertone
    { max: 5, colors: ['#3a0e12', '#20070a'] }, // stages 4-5: deepening crimson, sky nearly gone
    { max: 7, colors: ['#4a0d0f', '#260608'] }, // stages 6-7: heavy siege, embers on black
    { max: 9, colors: ['#5a0c0c', '#2c0505'] }, // stages 8-9: blood-red, sky almost extinguished
    { max: Infinity, colors: ['#6a0b09', '#330404'] }, // stage 10+ (and endless): full conflagration
  ];
  function skyTheme(stage) {
    const s = Math.max(1, Math.floor(stage));
    for (const theme of SKY_THEMES) {
      if (s <= theme.max) return theme.colors;
    }
    return SKY_THEMES[SKY_THEMES.length - 1].colors;
  }

  let cities, crosshair, fireCooldown, interceptors, blasts, groundBlasts, missiles, impacts, stars;
  let spawnTimer, elapsed, kills, nextSurvivalBonusAt;
  let currentStage = 1;
  let stageIntervalBase, stageIntervalFloor, stageSpeedBase, stageSpeedVar, stageSpeedRampCap, stageBurstChance;
  let flashTimer = 0, flashColor = '#ff3020';
  const FLASH_DURATION = 0.18;

  // Shared FX systems, created once per level instance (not per frame/stage) —
  // init() only clears them between stages/restarts. Pure visual polish: no
  // effect here reads or feeds back into spawn timing, scoring, or stage config.
  const fxParticles = FX.makeParticles(200);
  const fxFloatText = FX.makeFloatText(24);

  // Purely cosmetic missile color variety so later (visually more dangerous)
  // stages feel more chaotic, without touching spawn rate/speed/timing at all.
  // Each spawned missile just randomly picks one look from its stage's palette.
  const MISSILE_PALETTES = [
    { max: 2, looks: [{ head: '#ffb84f', glow: '#ff6a3a', trail: 'rgba(255,110,60,0.5)' }] },
    { max: 4, looks: [
      { head: '#ffb84f', glow: '#ff6a3a', trail: 'rgba(255,110,60,0.5)' },
      { head: '#ff8a3a', glow: '#ff4a1a', trail: 'rgba(255,80,40,0.5)' },
    ] },
    { max: 7, looks: [
      { head: '#ffb84f', glow: '#ff6a3a', trail: 'rgba(255,110,60,0.55)' },
      { head: '#ff6a3a', glow: '#ff2a10', trail: 'rgba(255,60,20,0.55)' },
      { head: '#ffdf6a', glow: '#ffd23a', trail: 'rgba(255,210,80,0.5)' },
    ] },
    { max: Infinity, looks: [
      { head: '#ffb84f', glow: '#ff6a3a', trail: 'rgba(255,110,60,0.6)' },
      { head: '#ff6a3a', glow: '#ff2a10', trail: 'rgba(255,60,20,0.6)' },
      { head: '#ffdf6a', glow: '#ffd23a', trail: 'rgba(255,210,80,0.55)' },
      { head: '#ff5ad0', glow: '#c020ff', trail: 'rgba(220,60,255,0.5)' },
    ] },
  ];
  function pickMissileLook(stage) {
    const s = Math.max(1, Math.floor(stage));
    for (const p of MISSILE_PALETTES) {
      if (s <= p.max) return p.looks[Math.floor(Math.random() * p.looks.length)];
    }
    const last = MISSILE_PALETTES[MISSILE_PALETTES.length - 1];
    return last.looks[Math.floor(Math.random() * last.looks.length)];
  }

  // Stage 1: baseline missile spawn rate (unchanged from the original tuning).
  // Stage 2: noticeably faster spawn rate, occasional simultaneous missiles, higher target.
  // Stage 3: faster/denser still, higher target. This is also where intervalFloor
  // (0.32) and burstChance (0.3) reach their sustainable ceiling — see the note
  // below stage 10 for the math.
  //
  // Stages 4-10 (hand-built): intervalFloor and burstChance are held at stage 3's
  // values on purpose — they do NOT keep climbing stage over stage. Only
  // intervalBase (how fast the within-level ramp reaches that frozen floor) and
  // missile speed keep escalating, plus a modest target bump. See the sustained-rate
  // note below stage 10 for why the floor/burst freeze can't be relaxed further.
  //
  // Stage 11+: endless mode — smoothly scale stage 10's baseline, capped so it never
  // becomes literally impossible. This baseline layers underneath the existing
  // within-stage ramp (elapsed/kills based) in difficultyInterval()/spawnMissile().
  function stageConfig(stage) {
    const s = Math.max(1, Math.floor(stage));
    if (s === 1) {
      return { intervalBase: 2.1, intervalFloor: 0.45, speedBase: 46, speedVar: 18, speedRampCap: 70, target: 25, burstChance: 0 };
    }
    if (s === 2) {
      return { intervalBase: 1.5, intervalFloor: 0.38, speedBase: 60, speedVar: 22, speedRampCap: 90, target: 35, burstChance: 0.15 };
    }
    if (s === 3) {
      return { intervalBase: 1.1, intervalFloor: 0.32, speedBase: 74, speedVar: 26, speedRampCap: 110, target: 45, burstChance: 0.3 };
    }
    if (s === 4) {
      return { intervalBase: 1.02, intervalFloor: 0.32, speedBase: 88, speedVar: 30, speedRampCap: 130, target: 52, burstChance: 0.3 };
    }
    if (s === 5) {
      return { intervalBase: 0.94, intervalFloor: 0.32, speedBase: 102, speedVar: 34, speedRampCap: 150, target: 59, burstChance: 0.3 };
    }
    if (s === 6) {
      return { intervalBase: 0.86, intervalFloor: 0.32, speedBase: 116, speedVar: 38, speedRampCap: 170, target: 66, burstChance: 0.3 };
    }
    if (s === 7) {
      return { intervalBase: 0.78, intervalFloor: 0.32, speedBase: 130, speedVar: 42, speedRampCap: 190, target: 73, burstChance: 0.3 };
    }
    if (s === 8) {
      return { intervalBase: 0.70, intervalFloor: 0.32, speedBase: 144, speedVar: 46, speedRampCap: 210, target: 80, burstChance: 0.3 };
    }
    if (s === 9) {
      return { intervalBase: 0.62, intervalFloor: 0.32, speedBase: 158, speedVar: 50, speedRampCap: 230, target: 87, burstChance: 0.3 };
    }
    if (s === 10) {
      return { intervalBase: 0.54, intervalFloor: 0.32, speedBase: 172, speedVar: 54, speedRampCap: 250, target: 94, burstChance: 0.3 };
    }
    const scale = Math.min(2.5, 1 + (s - 10) * 0.12);
    // intervalFloor and burstChance are deliberately frozen at stage 10's own values
    // (which are themselves unchanged from stage 3 — see above) rather than
    // following `scale` like everything else here. FIRE_COOLDOWN never changes, so
    // the player's max possible interception rate is fixed at ~1/0.35 ≈ 2.86/s.
    //
    // Sustained-rate math (same check the original stage-3 fix did, re-run at the
    // frozen values): once elapsed/kills decay difficultyInterval()'s base term
    // below intervalFloor, spawnTimer settles to intervalFloor + avg(random*0.35)
    // = 0.32 + 0.175 = 0.495s between spawn *events*. Each event throws a second
    // missile with probability burstChance (0.3), so the average missile count per
    // event is 1.3, giving a sustained rate of 1.3 / 0.495 ≈ 2.63 missiles/sec —
    // just under the 2.86/s interception ceiling, with the same margin stage 3 had.
    // That math is stage-count-independent (it only depends on intervalFloor and
    // burstChance), so freezing both at stage 10's values keeps this ~2.63/s
    // ceiling forever in endless mode, no matter how high `s` climbs. Letting
    // intervalFloor keep shrinking or burstChance keep climbing past this point
    // (as the pre-fix version did) would push the sustained rate past the
    // achievable maximum — exactly the bug this freeze exists to prevent.
    // intervalBase (faster ramp-up) and missile speed keep escalating instead, so
    // endless mode still gets meaningfully harder past stage 10.
    return {
      intervalBase: Math.max(0.35, 0.54 / scale),
      intervalFloor: 0.32,
      speedBase: Math.min(172 * 2.2, 172 * scale),
      speedVar: Math.min(54 * 2.2, 54 * scale),
      speedRampCap: Math.min(250 * 2.2, 250 * scale),
      target: Math.round(94 + (s - 10) * 10),
      burstChance: 0.3,
    };
  }

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
    const base = stageIntervalBase - elapsed * 0.014 - kills * 0.018;
    return Math.max(stageIntervalFloor, base) + Math.random() * 0.35;
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
    const speed = stageSpeedBase + Math.random() * stageSpeedVar + Math.min(stageSpeedRampCap, elapsed * 1.1 + kills * 0.6);
    const ang = Math.atan2(target.y - 0, target.x - startX);
    const look = pickMissileLook(currentStage);
    // Later stages get slightly longer visible trails — pure visual density,
    // does not affect collision, speed, or spawn timing.
    const trailMax = Math.min(16, 10 + Math.floor(Math.max(1, currentStage) / 2));
    missiles.push({
      x: startX, y: 0,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      targetX: target.x, targetY: target.y, cityIndex: target.cityIndex,
      trail: [], trailMax, alive: true,
      headColor: look.head, glowColor: look.glow, trailColor: look.trail,
      smokeTimer: Math.random() * 0.08,
    });
  }

  return {
    init(stage = 1) {
      currentStage = stage;
      const cfg = stageConfig(stage);
      stageIntervalBase = cfg.intervalBase;
      stageIntervalFloor = cfg.intervalFloor;
      stageSpeedBase = cfg.speedBase;
      stageSpeedVar = cfg.speedVar;
      stageSpeedRampCap = cfg.speedRampCap;
      stageBurstChance = cfg.burstChance;
      TARGET_KILLS = cfg.target;

      spawnCities();
      spawnStars();
      crosshair = { x: W / 2, y: H / 2 };
      fireCooldown = 0;
      interceptors = [];
      blasts = [];
      groundBlasts = [];
      missiles = [];
      impacts = [];
      spawnTimer = 1.2;
      elapsed = 0;
      kills = 0;
      nextSurvivalBonusAt = SURVIVAL_BONUS_STEP;
      flashTimer = 0;
      fxParticles.clear();
      fxFloatText.clear();
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

      // Mouse aim: directly overwrite the aim target with the live cursor
      // position whenever it's over the canvas. The d-pad nudges crosshair
      // incrementally each frame it's held, so the two inputs naturally
      // coexist without a fight — whichever was used most recently wins,
      // since a d-pad press on the very next frame will immediately move
      // the crosshair away from wherever the mouse last placed it.
      if (api.mouseActive && typeof api.mouseX === 'number' && typeof api.mouseY === 'number' &&
          api.mouseX >= 0 && api.mouseX <= W && api.mouseY >= 0 && api.mouseY <= H) {
        crosshair.x = Math.max(6, Math.min(W - 6, api.mouseX));
        crosshair.y = Math.max(6, Math.min(H - 6, api.mouseY));
      }

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
        // Higher stages sometimes throw a second missile in at the same moment.
        if (Math.random() < stageBurstChance) spawnMissile();
        spawnTimer = difficultyInterval();
      }

      missiles.forEach((ms) => {
        if (!ms.alive) return;
        ms.trail.push({ x: ms.x, y: ms.y });
        if (ms.trail.length > ms.trailMax) ms.trail.shift();
        ms.x += ms.vx * dt;
        ms.y += ms.vy * dt;
        // Thin fading smoke streak trailing every falling missile.
        ms.smokeTimer -= dt;
        if (ms.smokeTimer <= 0) {
          ms.smokeTimer = 0.09 + Math.random() * 0.06;
          fxParticles.spawn(ms.x, ms.y, {
            vx: -ms.vx * 0.06 + (Math.random() - 0.5) * 8,
            vy: -ms.vy * 0.06 + (Math.random() - 0.5) * 8,
            gravity: -8,
            life: 0.35 + Math.random() * 0.25,
            size: 2 + Math.random() * 2,
            color: 'rgba(170,170,180,0.4)',
          });
        }
      });

      // interception check
      missiles.forEach((ms) => {
        if (!ms.alive) return;
        for (const b of blasts) {
          if (dist(ms.x, ms.y, b.x, b.y) <= b.r) {
            ms.alive = false;
            kills++;
            const earlyBonus = Math.round((1 - Math.max(0, ms.y) / GROUND_Y) * 50);
            const gained = 100 + earlyBonus;
            addScore(gained);
            fxParticles.burst(ms.x, ms.y, 10, {
              colors: ['#fff2c0', '#ffe38a', '#ffb84f', '#ff6a3a'],
              speedMin: 60, speedMax: 220, lifeMin: 0.25, lifeMax: 0.55,
              sizeMin: 2, sizeMax: 4, gravity: 120,
            });
            fxFloatText.spawn(ms.x, ms.y - 6, `+${gained}`, '#ffe38a', { life: 0.7, vy: -46, size: 11 });
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
            const cx = city.x + city.w / 2, cy = city.y + city.h / 2;
            groundBlasts.push({ x: cx, y: cy, t: 0, life: 0.55, peak: BLAST_PEAK * 2.4 });
            fxParticles.burst(cx, cy, 16, {
              colors: ['#fff2c0', '#ffb84f', '#ff5c5c', '#55221a'],
              speedMin: 80, speedMax: 260, lifeMin: 0.4, lifeMax: 0.9,
              sizeMin: 3, sizeMax: 6, gravity: 200,
            });
            flashTimer = FLASH_DURATION;
            sfx('explosion');
            shake(0.35, 8);
            loseLife();
          } else {
            impacts.push({ x: ms.x, y: GROUND_Y, life: 0.35 });
            sfx('hit');
          }
        }
      });
      missiles = missiles.filter((ms) => ms.alive && ms.y < GROUND_Y + 4);

      impacts.forEach((p) => { p.life -= dt; });
      impacts = impacts.filter((p) => p.life > 0);

      // big ground-impact rings (city hits) grow then fade, same shape as the
      // interceptor blasts but bigger/longer-lived
      groundBlasts.forEach((b) => {
        b.t += dt;
        const frac = Math.min(1, b.t / b.life);
        b.r = b.peak * Math.sin(Math.PI * frac);
      });
      groundBlasts = groundBlasts.filter((b) => b.t < b.life);

      // faint embers drifting up from rubble — ambient life for dead cities
      cities.forEach((c) => {
        if (!c.alive && Math.random() < dt * 0.7) {
          fxParticles.spawn(c.x + Math.random() * c.w, c.y + c.h - 2, {
            vx: (Math.random() - 0.5) * 6,
            vy: -10 - Math.random() * 10,
            gravity: -6,
            life: 0.6 + Math.random() * 0.4,
            size: 1.5 + Math.random() * 1.5,
            color: 'rgba(255,140,60,0.5)',
          });
        }
      });

      fxParticles.update(dt);
      fxFloatText.update(dt);
      flashTimer = Math.max(0, flashTimer - dt);

      if (kills >= TARGET_KILLS) {
        const aliveCities = cities.filter((c) => c.alive).length;
        winLevel(150 + aliveCities * 50);
      }
    },

    draw(ctx) {
      // night sky (tints redder in later stages — see skyTheme)
      const sky = skyTheme(currentStage);
      FX.gradientRect(ctx, 0, 0, W, GROUND_Y, sky[0], sky[1]);
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
      FX.sphere(ctx, siloCx, siloTopY + 4, 7, '#7a8898');
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
              if (lit) {
                ctx.save();
                ctx.shadowBlur = 4;
                ctx.shadowColor = '#ffe38a';
              }
              ctx.fillStyle = lit ? '#ffe38a' : 'rgba(20,20,30,0.6)';
              ctx.fillRect(c.x + ww * (cc + 0.6), c.y + wh * (r + 0.7), ww * 0.6, wh * 0.6);
              if (lit) ctx.restore();
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

      // incoming missile trails + heads (color/variety picked per-missile at spawn)
      missiles.forEach((ms) => {
        ctx.save();
        ctx.strokeStyle = ms.trailColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ms.trail.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        });
        ctx.lineTo(ms.x, ms.y);
        ctx.stroke();
        ctx.shadowBlur = 8;
        ctx.shadowColor = ms.glowColor;
        ctx.fillStyle = ms.headColor;
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

      // groundBlasts: much bigger explosion rings for city hits — bright
      // white-hot core layered under a wider fireball skirt
      groundBlasts.forEach((b) => {
        if (b.r <= 0.5) return;
        const frac = Math.min(1, b.t / b.life);
        const alpha = Math.max(0, 1 - frac * 0.65);
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(0.25, `rgba(255,240,200,${alpha * 0.95})`);
        grad.addColorStop(0.55, `rgba(255,160,60,${alpha * 0.75})`);
        grad.addColorStop(0.8, `rgba(255,70,30,${alpha * 0.4})`);
        grad.addColorStop(1, 'rgba(200,20,10,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // shared particle/float-text FX (explosion debris, smoke, embers, score pops)
      fxParticles.draw(ctx);
      fxFloatText.draw(ctx);

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

      // hit-stun flash wash for a city loss — brief, on top of everything
      if (flashTimer > 0) {
        FX.flash(ctx, W, H, flashColor, (flashTimer / FLASH_DURATION) * 0.35);
      }
    },
  };
}
