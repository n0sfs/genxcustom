// FOWL PLAY — Duck Hunt-style light-gun shooting gallery.
// D-pad steers a reticle over a marsh; Space fires (debounced, no full-auto).
// Ducks come in "flights" (small flocks); a comic dog reacts between flights.
function createFowlPlayLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const HAND_BUILT_STAGES = 10;
  const RETICLE_SPEED = 320;
  const HIT_RADIUS = 30; // generous — d-pad aiming is harder than a mouse
  const GROUND_Y = H - 46;
  const DOG_RISE = 0.4, DOG_HOLD = 1.3, DOG_FALL = 0.4;
  const DOG_TOTAL = DOG_RISE + DOG_HOLD + DOG_FALL;
  const FLASH_DURATION = 0.22;

  // ---- hand-built stage configs (exactly 10) ----------------------------
  const STAGE_CONFIGS = [
    { theme: 'dawn',   flights: 3, ducksMin: 1, ducksMax: 1, speed: 70,  shots: 3, patterns: ['glide'],                    quota: 0.5 },
    { theme: 'sunny',  flights: 3, ducksMin: 1, ducksMax: 2, speed: 85,  shots: 3, patterns: ['glide', 'zigzag'],          quota: 0.5 },
    { theme: 'dusk',   flights: 4, ducksMin: 1, ducksMax: 2, speed: 95,  shots: 4, patterns: ['glide', 'zigzag'],          quota: 0.5 },
    { theme: 'fog',    flights: 4, ducksMin: 2, ducksMax: 2, speed: 100, shots: 4, patterns: ['glide', 'zigzag'],          quota: 0.5 },
    { theme: 'winter', flights: 4, ducksMin: 2, ducksMax: 3, speed: 112, shots: 5, patterns: ['zigzag', 'dive'],           quota: 0.55 },
    { theme: 'storm',  flights: 5, ducksMin: 2, ducksMax: 3, speed: 125, shots: 5, patterns: ['dive', 'zigzag'],           quota: 0.55 },
    { theme: 'night',  flights: 5, ducksMin: 2, ducksMax: 3, speed: 130, shots: 5, patterns: ['glide', 'dive', 'zigzag'],  quota: 0.55 },
    { theme: 'sunny',  flights: 5, ducksMin: 3, ducksMax: 3, speed: 145, shots: 6, patterns: ['zigzag', 'dive'],           quota: 0.6 },
    { theme: 'dusk',   flights: 5, ducksMin: 3, ducksMax: 4, speed: 160, shots: 6, patterns: ['dive', 'zigzag'],           quota: 0.6 },
    { theme: 'storm',  flights: 6, ducksMin: 3, ducksMax: 4, speed: 175, shots: 7, patterns: ['dive', 'zigzag', 'glide'],  quota: 0.6 },
  ];

  // Endless mode (stage > 10): scale stage 10's config with a capped formula —
  // growth plateaus, never runs away. Mirrors the pattern used across the anthology
  // (see skydefense.js's stageConfig for the same "audited fairness" idea).
  function getStageConfig(stage) {
    const s = Math.max(1, Math.floor(stage) || 1);
    const idx = Math.min(Math.max(s, 1), HAND_BUILT_STAGES) - 1;
    const base = STAGE_CONFIGS[idx];
    if (s <= HAND_BUILT_STAGES) return base;
    const over = s - HAND_BUILT_STAGES;
    const scale = Math.min(1 + over * 0.05, 1.8); // capped speed growth
    return {
      theme: base.theme,
      patterns: base.patterns,
      flights: Math.min(base.flights + Math.floor(over / 3), base.flights + 4),
      ducksMin: base.ducksMin,
      ducksMax: Math.min(base.ducksMax + Math.floor(over / 4), base.ducksMax + 2),
      speed: Math.min(base.speed * scale, base.speed * 1.8),
      shots: Math.min(base.shots + Math.floor(over / 5), base.shots + 2),
      quota: base.quota,
    };
  }

  // ---- theme visuals -----------------------------------------------------
  const THEME_VISUALS = {
    dawn: {
      sky: ['#ffb87a', '#8fb8e0'], ground: ['#5a7a42', '#2f4a1e'],
      cloud: 'rgba(255,224,196,0.55)', reed: '#4a6a34', water: null,
      fog: 0, flashlight: false, storm: false,
      ducks: [{ body: '#3f6b34', head: '#1e3a12', belly: '#e8dcc0', beak: '#e0a020' },
              { body: '#7a5230', head: '#432b16', belly: '#d8c8a0', beak: '#d89020' }],
    },
    sunny: {
      sky: ['#6fc4ff', '#cdeeff'], ground: ['#5a9a3a', '#2e5c1c'],
      cloud: 'rgba(255,255,255,0.85)', reed: '#4f8a30', water: null,
      fog: 0, flashlight: false, storm: false,
      ducks: [{ body: '#2f7a5a', head: '#123a26', belly: '#f0ead0', beak: '#e8a820' },
              { body: '#3a5a8a', head: '#1a2c4a', belly: '#e8e4d8', beak: '#e89a20' }],
    },
    dusk: {
      sky: ['#7a3a6a', '#f0925a'], ground: ['#3a3a52', '#1c1c2c'],
      cloud: 'rgba(255,190,150,0.5)', reed: '#2c2c40', water: '#4a3a58',
      fog: 0, flashlight: false, storm: false,
      ducks: [{ body: '#2a2a3e', head: '#141420', belly: '#8a7a90', beak: '#c07020' },
              { body: '#402a44', head: '#1e1424', belly: '#7a6a84', beak: '#c86828' }],
    },
    fog: {
      sky: ['#c8ccd0', '#e8ebee'], ground: ['#7a8474', '#4a5244'],
      cloud: 'rgba(255,255,255,0.4)', reed: '#5a6450', water: null,
      fog: 0.42, flashlight: false, storm: false,
      ducks: [{ body: '#8a9088', head: '#565c52', belly: '#d4d8d0', beak: '#c8a050' },
              { body: '#767c72', head: '#484e46', belly: '#c8ccc4', beak: '#c89848' }],
    },
    winter: {
      sky: ['#b8d4ec', '#eef6fc'], ground: ['#eef4fa', '#c4d6e6'],
      cloud: 'rgba(255,255,255,0.75)', reed: '#8a9a80', water: '#a8c8dc',
      fog: 0.08, flashlight: false, storm: false,
      ducks: [{ body: '#e8ecf0', head: '#c8d0d8', belly: '#ffffff', beak: '#e08020' },
              { body: '#5a6470', head: '#343c46', belly: '#d8dce2', beak: '#d87820' }],
    },
    storm: {
      sky: ['#3a4048', '#5c6470'], ground: ['#404838', '#22281c'],
      cloud: 'rgba(60,66,74,0.8)', reed: '#2c3424', water: '#38424a',
      fog: 0.12, flashlight: false, storm: true,
      ducks: [{ body: '#242a22', head: '#101410', belly: '#5a6254', beak: '#a86818' },
              { body: '#2e2e3a', head: '#16161e', belly: '#666074', beak: '#a06018' }],
    },
    night: {
      sky: ['#0a0e22', '#050710'], ground: ['#141c14', '#080c08'],
      cloud: 'rgba(120,130,160,0.25)', reed: '#0e160e', water: '#0e1a28',
      fog: 0, flashlight: true, storm: false,
      ducks: [{ body: '#20242e', head: '#101218', belly: '#40485a', beak: '#907030' },
              { body: '#262a20', head: '#12140e', belly: '#484e3a', beak: '#887028' }],
    },
  };

  function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Shared FX systems — created once, cleared per init/attempt.
  const fxParticles = FX.makeParticles(220);
  const fxFloatText = FX.makeFloatText(30);

  let currentStage = 1, cfg = STAGE_CONFIGS[0], visuals = THEME_VISUALS.dawn;
  let flights, flightIdx, ducks, shotsRemaining, totalHits, totalDucks, quota;
  let zeroHitStreak, phase, wonCalled;
  let dogTimer, dogState, dogDucksHeld, dogTextSpawned, dogPerfect;
  let reticle, prevSpace;
  let flashTimer, flashColor;
  let clouds, reeds;
  let elapsedT = 0;

  function buildFlights() {
    const list = [];
    for (let i = 0; i < cfg.flights; i++) {
      list.push({
        duckCount: randInt(cfg.ducksMin, cfg.ducksMax),
        pattern: cfg.patterns[randInt(0, cfg.patterns.length - 1)],
      });
    }
    return list;
  }

  function makeDuck(pattern, speed, groupDir, x, y, delay, palette) {
    return {
      x, y,
      vx: groupDir * speed * rand(0.28, 0.42),
      vy: -speed * rand(0.65, 0.95),
      pattern,
      speed,
      delay,
      tAlive: 0,
      state: delay > 0 ? 'pending' : 'flying',
      flapPhase: Math.random() * Math.PI * 2,
      color: palette,
      w: 24, h: 17,
      rotation: 0,
      rotationSpeed: 0,
      fallVx: 0, fallVy: 0,
    };
  }

  function spawnFlightDucks(idx) {
    const f = flights[idx];
    shotsRemaining = cfg.shots;
    ducks = [];
    const groupDir = Math.random() < 0.5 ? -1 : 1;
    const baseX = clamp(rand(80, W - 80), 60, W - 60);
    for (let j = 0; j < f.duckCount; j++) {
      const x = clamp(baseX + (j - (f.duckCount - 1) / 2) * 46, 30, W - 30);
      const y = H - rand(28, 52);
      const delay = j * 0.18;
      const palette = visuals.ducks[j % visuals.ducks.length];
      ducks.push(makeDuck(f.pattern, cfg.speed, groupDir, x, y, delay, palette));
    }
  }

  function startStage() {
    flights = buildFlights();
    totalDucks = flights.reduce((s, f) => s + f.duckCount, 0);
    quota = Math.max(1, Math.ceil(totalDucks * cfg.quota));
    flightIdx = 0;
    totalHits = 0;
    zeroHitStreak = 0;
    phase = 'flying';
    wonCalled = false;
    spawnFlightDucks(0);
  }

  function beginDogShow(flightHits) {
    totalHits += flightHits;
    zeroHitStreak = flightHits === 0 ? zeroHitStreak + 1 : 0;
    phase = 'dogshow';
    dogState = flightHits > 0 ? 'proud' : 'laugh';
    dogDucksHeld = flightHits;
    dogPerfect = flightHits > 0 && flightHits === ducks.length;
    dogTimer = 0;
    dogTextSpawned = false;
    sfx('select');
  }

  function loseLifeFx() {
    loseLife();
    shake(0.3, 6);
    flashTimer = FLASH_DURATION;
    flashColor = '#ff2a2a';
    sfx('hurt');
  }

  function resolveDogShow() {
    let lifeLostThisBeat = false;
    if (zeroHitStreak >= 2) {
      loseLifeFx();
      zeroHitStreak = 0;
      lifeLostThisBeat = true;
    }
    flightIdx++;
    if (flightIdx >= flights.length) {
      if (totalHits >= quota) {
        wonCalled = true;
        phase = 'won';
        sfx('levelclear');
        winLevel(200 + (totalHits - quota) * 15 + currentStage * 5);
      } else {
        if (!lifeLostThisBeat) loseLifeFx();
        startStage();
      }
    } else {
      spawnFlightDucks(flightIdx);
      phase = 'flying';
    }
  }

  function generateAmbient() {
    clouds = Array.from({ length: 5 }, () => ({
      x: rand(0, W), y: rand(20, 110), w: rand(50, 110), speed: rand(6, 16),
    }));
    reeds = Array.from({ length: 22 }, (_, i) => ({
      x: (i / 21) * W + rand(-8, 8), h: rand(16, 34), phase: rand(0, Math.PI * 2),
    }));
  }

  function updateDuckMotion(d, dt) {
    d.tAlive += dt;
    d.flapPhase += dt * 11;
    if (d.pattern === 'glide') {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    } else if (d.pattern === 'zigzag') {
      d.x += (d.vx + Math.sin(d.tAlive * 4) * d.speed * 0.5) * dt;
      d.y += d.vy * dt;
    } else if (d.pattern === 'dive') {
      if (d.tAlive < 0.55) {
        d.x += d.vx * 0.4 * dt;
        d.y += d.vy * 1.3 * dt;
      } else {
        d.x += d.vx * 1.7 * dt;
        d.y += d.vy * 0.6 * dt;
      }
    } else {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    if (d.x < -50 || d.x > W + 50 || d.y < -50) d.state = 'escaped';
  }

  function updateFallingDuck(d, dt) {
    d.fallVy += 480 * dt;
    d.x += d.fallVx * dt;
    d.y += d.fallVy * dt;
    d.rotation += d.rotationSpeed * dt;
  }

  return {
    init(stage) {
      currentStage = Math.max(1, Math.floor(stage) || 1);
      cfg = getStageConfig(currentStage);
      visuals = THEME_VISUALS[cfg.theme] || THEME_VISUALS.dawn;
      reticle = { x: W / 2, y: H * 0.55 };
      prevSpace = false;
      flashTimer = 0;
      flashColor = '#ff2a2a';
      elapsedT = 0;
      fxParticles.clear();
      fxFloatText.clear();
      generateAmbient();
      startStage();
    },

    update(dt) {
      elapsedT += dt;

      // ambient motion always runs
      clouds.forEach((c) => {
        c.x += c.speed * dt;
        if (c.x > W + c.w) c.x = -c.w;
      });

      // reticle: continuous velocity-based d-pad movement, clamped to bounds
      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx -= 1;
      if (isDown('ArrowRight', 'd')) mvx += 1;
      if (isDown('ArrowUp', 'w')) mvy -= 1;
      if (isDown('ArrowDown', 's')) mvy += 1;
      if (mvx !== 0 && mvy !== 0) { mvx *= 0.7071; mvy *= 0.7071; }
      reticle.x = clamp(reticle.x + mvx * RETICLE_SPEED * dt, 8, W - 8);
      reticle.y = clamp(reticle.y + mvy * RETICLE_SPEED * dt, 8, H - 8);

      const spaceDown = isDown('Space');
      const freshFire = spaceDown && !prevSpace;
      prevSpace = spaceDown;

      if (phase === 'flying') {
        ducks.forEach((d) => {
          if (d.state === 'pending') {
            d.delay -= dt;
            if (d.delay <= 0) d.state = 'flying';
            return;
          }
          if (d.state === 'flying') updateDuckMotion(d, dt);
          else if (d.state === 'hit') updateFallingDuck(d, dt);
        });

        if (freshFire && shotsRemaining > 0) {
          shotsRemaining--;
          sfx('shoot');
          fxParticles.burst(reticle.x, reticle.y, 6, {
            colors: ['#fff8d8', '#ffe38a', '#ffb84f'],
            speedMin: 40, speedMax: 130, lifeMin: 0.12, lifeMax: 0.22,
            sizeMin: 2, sizeMax: 4, gravity: 0,
          });
          let best = null, bestD = Infinity;
          ducks.forEach((d) => {
            if (d.state !== 'flying') return;
            const dd = dist(d.x, d.y, reticle.x, reticle.y);
            if (dd <= HIT_RADIUS && dd < bestD) { best = d; bestD = dd; }
          });
          if (best) {
            best.state = 'hit';
            best.fallVx = best.vx * 0.25;
            best.fallVy = -90;
            best.rotationSpeed = rand(-7, 7);
            const gained = 120 + shotsRemaining * 18 + currentStage * 4;
            addScore(gained);
            fxParticles.burst(best.x, best.y, 14, {
              colors: [best.color.body, best.color.belly, best.color.beak, '#ffffff'],
              speedMin: 50, speedMax: 190, lifeMin: 0.3, lifeMax: 0.6,
              sizeMin: 2, sizeMax: 4, gravity: 140,
            });
            fxFloatText.spawn(best.x, best.y - 10, `+${gained}`, '#ffe38a', { life: 0.75, vy: -44, size: 11 });
            sfx('hit');
          }
        }

        const allResolved = ducks.length > 0 && ducks.every((d) => d.state === 'hit' || d.state === 'escaped');
        if (allResolved) {
          const flightHits = ducks.filter((d) => d.state === 'hit').length;
          beginDogShow(flightHits);
        }
      } else if (phase === 'dogshow') {
        dogTimer += dt;
        if (dogState === 'laugh' && !dogTextSpawned && dogTimer > DOG_RISE) {
          dogTextSpawned = true;
          fxFloatText.spawn(W / 2, H - 150, 'HA HA HA!', '#ffe38a', { life: 1.1, vy: -14, size: 13 });
        }
        if (dogState === 'proud' && !dogTextSpawned && dogTimer > DOG_RISE) {
          dogTextSpawned = true;
          if (dogPerfect) {
            const bonus = 60 + currentStage * 8 + dogDucksHeld * 20;
            addScore(bonus);
            fxFloatText.spawn(W / 2, H - 150, `PERFECT! +${bonus}`, '#ffd24f', { life: 1.2, vy: -16, size: 13 });
            fxParticles.burst(W / 2, H - 150, 22, {
              colors: ['#ffd24f', '#fff8d8', '#9cff9c', '#ffffff'],
              speedMin: 60, speedMax: 220, lifeMin: 0.3, lifeMax: 0.6,
              sizeMin: 2, sizeMax: 4, gravity: 60,
            });
            shake(0.12, 2);
          } else if (dogDucksHeld > 0) {
            fxFloatText.spawn(W / 2, H - 150, dogDucksHeld > 1 ? 'NICE SHOOTING!' : 'GOT ONE!', '#9cff9c', { life: 1.1, vy: -14, size: 12 });
          }
        }
        if (dogTimer >= DOG_TOTAL) resolveDogShow();
      }
      // phase === 'won': freeze gameplay logic, keep ambient/particles alive

      fxParticles.update(dt);
      fxFloatText.update(dt);
      flashTimer = Math.max(0, flashTimer - dt);
    },

    draw(ctx) {
      const t = elapsedT;
      // sky
      FX.gradientRect(ctx, 0, 0, W, GROUND_Y, visuals.sky[0], visuals.sky[1]);

      // clouds
      clouds.forEach((c) => {
        ctx.fillStyle = visuals.cloud;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w * 0.5, c.w * 0.22, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.w * 0.28, c.y + 4, c.w * 0.32, c.w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // stars for night theme
      if (visuals.flashlight) {
        for (let i = 0; i < 40; i++) {
          const sx = (i * 137.5) % W;
          const sy = (i * 71.3) % (GROUND_Y - 20);
          const tw = 0.4 + 0.4 * Math.sin(t * 2 + i);
          ctx.fillStyle = `rgba(220,228,255,${0.25 + tw * 0.4})`;
          ctx.fillRect(sx, sy, 1, 1);
        }
      }

      // pond band (themes that have water)
      if (visuals.water) {
        const wy = GROUND_Y - 26;
        FX.gradientRect(ctx, 0, wy, W, 26, visuals.water, FX.shade(visuals.water, -20));
        for (let i = 0; i < 6; i++) {
          const rx = ((i * 97 + t * 20) % (W + 60)) - 30;
          const ry = wy + 10 + (i % 3) * 5;
          const rr = 8 + 4 * Math.sin(t * 2 + i);
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(rx, ry, Math.max(1, rr), Math.max(0.5, rr * 0.3), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ground / marsh
      FX.gradientRect(ctx, 0, GROUND_Y, W, H - GROUND_Y, visuals.ground[0], visuals.ground[1]);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, GROUND_Y, W, 2);

      // swaying reeds along the bottom
      reeds.forEach((r) => {
        const sway = Math.sin(t * 1.6 + r.phase) * 5;
        ctx.strokeStyle = visuals.reed;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.x, H);
        ctx.quadraticCurveTo(r.x + sway * 0.5, H - r.h * 0.6, r.x + sway, H - r.h);
        ctx.stroke();
      });

      // storm rain streaks
      if (visuals.storm) {
        ctx.strokeStyle = 'rgba(200,210,220,0.35)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const rx = (i * 53 + t * 140) % (W + 40) - 20;
          const ry = (i * 37 + t * 260) % H;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 6, ry + 14);
          ctx.stroke();
        }
        // occasional lightning flash, purely time-driven (deterministic, no extra state)
        const flick = Math.sin(t * 1.7) * Math.sin(t * 0.53);
        if (flick > 0.965) {
          ctx.fillStyle = `rgba(255,255,255,${(flick - 0.965) * 8})`;
          ctx.fillRect(0, 0, W, GROUND_Y);
        }
      }

      // ducks
      ducks.forEach((d) => drawDuck(ctx, d, t));

      // dog character, between flights
      if (phase === 'dogshow') drawDog(ctx);

      // fog haze overlay (reduced visibility theme)
      if (visuals.fog > 0) {
        ctx.fillStyle = `rgba(235,238,242,${visuals.fog})`;
        ctx.fillRect(0, 0, W, GROUND_Y);
      }

      // night flashlight cone — visual darkening away from the reticle
      if (visuals.flashlight) {
        const grad = ctx.createRadialGradient(reticle.x, reticle.y, 40, reticle.x, reticle.y, 230);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // warm lamp glow
        const lamp = ctx.createRadialGradient(reticle.x, reticle.y, 0, reticle.x, reticle.y, 70);
        lamp.addColorStop(0, 'rgba(255,240,190,0.18)');
        lamp.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = lamp;
        ctx.fillRect(0, 0, W, H);
      }

      // shared FX (feather bursts, muzzle sparks, floating score text)
      fxParticles.draw(ctx);
      fxFloatText.draw(ctx);

      drawReticle(ctx, t);
      drawHud(ctx);

      // life-loss impact wash
      if (flashTimer > 0) FX.flash(ctx, W, H, flashColor, (flashTimer / FLASH_DURATION) * 0.4);

      // house CRT pass
      FX.scanlines(ctx, W, H, 0.05);
      FX.vignette(ctx, W, H, 0.35);
    },
  };

  function drawDuck(ctx, d, t) {
    if (d.state === 'pending') return;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.state === 'hit') ctx.rotate(d.rotation);
    else if (d.vx < 0) ctx.scale(-1, 1);

    const c = d.color;
    const flap = d.state === 'hit' ? 0.2 : Math.sin(d.flapPhase);

    // tail feather tuft, opposite the head
    ctx.fillStyle = FX.shade(c.body, -22);
    ctx.beginPath();
    ctx.moveTo(-d.w * 0.46, -d.h * 0.04);
    ctx.lineTo(-d.w * 0.72, -d.h * 0.2);
    ctx.lineTo(-d.w * 0.68, d.h * 0.06);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.5, d.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FX.shade(c.body, -18);
    ctx.beginPath();
    ctx.ellipse(0, d.h * 0.14, d.w * 0.46, d.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // belly highlight
    ctx.fillStyle = c.belly;
    ctx.beginPath();
    ctx.ellipse(-d.w * 0.05, d.h * 0.05, d.w * 0.26, d.h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // wing (flapping), with a couple of trailing flight-feather strokes
    ctx.fillStyle = FX.shade(c.body, -30);
    ctx.beginPath();
    ctx.ellipse(-d.w * 0.05, -flap * d.h * 0.32, d.w * 0.32, d.h * 0.16, -0.3 - flap * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = FX.shade(c.body, -42);
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) {
      const fx = -d.w * (0.22 + i * 0.09);
      const fy = -flap * d.h * 0.32 + d.h * (0.02 + i * 0.05);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - d.w * 0.1, fy + d.h * 0.14);
      ctx.stroke();
    }

    // neck curve connecting body to head
    ctx.strokeStyle = c.head;
    ctx.lineWidth = d.h * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(d.w * 0.16, -d.h * 0.02);
    ctx.quadraticCurveTo(d.w * 0.3, -d.h * 0.18, d.w * 0.34, -d.h * 0.18);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // head + beak
    ctx.fillStyle = c.head;
    ctx.beginPath();
    ctx.arc(d.w * 0.36, -d.h * 0.18, d.h * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.beak;
    ctx.beginPath();
    ctx.moveTo(d.w * 0.58, -d.h * 0.18);
    ctx.lineTo(d.w * 0.82, -d.h * 0.14);
    ctx.lineTo(d.w * 0.58, -d.h * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = FX.shade(c.beak, -35);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(d.w * 0.6, -d.h * 0.14);
    ctx.lineTo(d.w * 0.78, -d.h * 0.14);
    ctx.stroke();

    // eye: round, with a small highlight instead of a flat dot
    ctx.fillStyle = '#241c14';
    ctx.beginPath();
    ctx.arc(d.w * 0.42, -d.h * 0.24, d.h * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(d.w * 0.44, -d.h * 0.26, d.h * 0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawReticle(ctx, t) {
    const x = reticle.x, y = reticle.y;
    const pulse = 1 + 0.07 * Math.sin(t * 6);
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff3b3b';
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 15 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 22, y); ctx.lineTo(x - 10, y);
    ctx.moveTo(x + 10, y); ctx.lineTo(x + 22, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y - 10);
    ctx.moveTo(x, y + 10); ctx.lineTo(x, y + 22);
    ctx.stroke();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDog(ctx) {
    let dy;
    if (dogTimer < DOG_RISE) {
      const f = dogTimer / DOG_RISE;
      dy = H + 20 - f * 90;
    } else if (dogTimer < DOG_RISE + DOG_HOLD) {
      const f = (dogTimer - DOG_RISE) / DOG_HOLD;
      dy = H - 70 + Math.sin(f * Math.PI * 4) * 3;
    } else {
      const f = (dogTimer - DOG_RISE - DOG_HOLD) / DOG_FALL;
      dy = (H - 70) + f * 90;
    }
    const dx = W / 2;
    const laugh = dogState === 'laugh';
    const tilt = laugh ? Math.sin(elapsedT * 14) * 0.12 : 0;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(tilt);

    FX.shadow(ctx, 0, 46, 28, 6, 0.3);
    // body
    ctx.fillStyle = '#a8763c';
    ctx.beginPath();
    ctx.ellipse(0, 20, 24, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FX.shade('#a8763c', -20);
    ctx.beginPath();
    ctx.ellipse(0, 34, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = '#c08a48';
    ctx.beginPath();
    ctx.arc(0, -14, 18, 0, Math.PI * 2);
    ctx.fill();
    // ears
    ctx.fillStyle = '#7a5228';
    ctx.beginPath();
    ctx.ellipse(-15, -18, 6, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(15, -18, 6, 12, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // snout
    ctx.fillStyle = '#e8c898';
    ctx.beginPath();
    ctx.ellipse(0, -6, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath();
    ctx.ellipse(0, -8, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // mouth: grin (proud) or wide laugh
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (laugh) {
      ctx.fillStyle = '#5a1c1c';
      ctx.beginPath();
      ctx.ellipse(0, -2, 6, 5 + Math.sin(elapsedT * 14) * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(0, -4, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    // eyes
    ctx.fillStyle = '#241a10';
    const eyeY = laugh ? -14 : -16;
    ctx.beginPath();
    ctx.arc(-7, eyeY, laugh ? 1 : 1.8, 0, Math.PI * 2);
    ctx.arc(7, eyeY, laugh ? 1 : 1.8, 0, Math.PI * 2);
    ctx.fill();

    // held-up ducks (proud pose)
    if (dogState === 'proud' && dogDucksHeld > 0) {
      const bob = Math.sin(elapsedT * 5) * 2;
      for (let i = 0; i < Math.min(dogDucksHeld, 4); i++) {
        const hx = -12 + i * 8;
        ctx.save();
        ctx.translate(hx, -34 + bob);
        ctx.fillStyle = '#3f6b34';
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0a020';
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(10, -1); ctx.lineTo(5, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // arms raised
      ctx.strokeStyle = '#c08a48';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, 6); ctx.lineTo(-10, -26);
      ctx.moveTo(10, 6); ctx.lineTo(10, -26);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawHud(ctx) {
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = '#eafff0';
    ctx.textAlign = 'left';
    ctx.fillText(`STAGE ${currentStage}  FLIGHT ${Math.min(flightIdx + 1, flights.length)}/${flights.length}`, 8, 14);
    ctx.fillText(`DUCKS ${totalHits}/${quota}`, 8, 26);

    ctx.textAlign = 'right';
    const shotsLabel = 'SHOTS ' + '●'.repeat(Math.max(0, shotsRemaining)) + '○'.repeat(Math.max(0, cfg.shots - shotsRemaining));
    ctx.fillStyle = shotsRemaining > 0 ? '#ffe38a' : '#ff8a6a';
    ctx.fillText(shotsLabel, W - 8, 14);
    ctx.restore();
  }
}
