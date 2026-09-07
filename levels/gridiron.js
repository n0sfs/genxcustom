// GRIDIRON DASH - fast arcade broken-field-running football.
// Top-down field, 8-directional running back control, single juke/spin
// special move on Space. No passing, no play-calling: just find the seam,
// break the tackle, get to the end zone before the downs run out.
function createGridironLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const HAND_BUILT_STAGES = 10;

  // Field geometry: sidelines fixed on screen, drive runs "up" the world
  // (decreasing y) toward the goal line at world-y 0. Everything below that
  // is measured in pixels; YARD_PX converts a yard count to world pixels.
  const FIELD_LEFT = 76, FIELD_RIGHT = 564;
  const FIELD_W = FIELD_RIGHT - FIELD_LEFT;
  const FIELD_CX = (FIELD_LEFT + FIELD_RIGHT) / 2;
  const YARD_PX = 9;
  const ENDZONE_DEPTH = 46;

  const PLAYER_SPEED = 170;
  const PLAYER_R = 9;
  const DEFENDER_R = 10;
  const TACKLE_DIST = PLAYER_R + DEFENDER_R - 4;
  const JUKE_SPEED_MULT = 1.8;
  const JUKE_DURATION = 0.3;
  const JUKE_COOLDOWN = 1.4;
  const POST_TACKLE_GRACE = 0.75;
  const WIND_PUSH = 16;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { dx: x / len, dy: y / len };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

  // ---- Per-stage weather/stadium themes (visual only, plus a small honest
  // gameplay knob per theme: a field-condition speed multiplier, or a light
  // constant crosswind push). Never touches spawn counts/downs/speed tuning
  // below - those live entirely in STAGE_CONFIGS. ----
  const THEMES = {
    sunny:   { label: 'SEASON OPENER',    sky: ['#3a7bd5', '#8fd3f4'], grass: ['#2e7d32', '#1b5e20'], crowd: '#5a4a6a', ambient: 'none',   lights: false, slow: 1,    wind: 0 },
    breezy:  { label: 'HOMECOMING BREEZE', sky: ['#4a90c2', '#a7d8e8'], grass: ['#2f7a34', '#1c5a20'], crowd: '#5a5a4a', ambient: 'wind',   lights: false, slow: 1,    wind: 0 },
    mud:     { label: 'MUD BOWL',          sky: ['#5a6a70', '#7a8a8e'], grass: ['#5a5638', '#3a3722'], crowd: '#3a3a40', ambient: 'rain',   lights: false, slow: 0.94, wind: 0 },
    lights:  { label: 'FRIDAY NIGHT LIGHTS', sky: ['#0c1330', '#050a1c'], grass: ['#1c5a28', '#123a1a'], crowd: '#3a4a6a', ambient: 'none',   lights: true,  slow: 1,    wind: 0 },
    fog:     { label: 'FOG DELAY',         sky: ['#7a8590', '#9aa4ac'], grass: ['#2a5e34', '#1a3e22'], crowd: '#5a5a5e', ambient: 'fog',    lights: false, slow: 0.97, wind: 0 },
    snow:    { label: 'SNOW BOWL',         sky: ['#aab8c8', '#dbe4ec'], grass: ['#c8d4dc', '#a8bac6'], crowd: '#4a4a52', ambient: 'snow',   lights: false, slow: 0.92, wind: 0 },
    windy:   { label: 'GALE FORCE PLAYOFF', sky: ['#3a6a8a', '#8ab4c8'], grass: ['#2e7d32', '#1b5e20'], crowd: '#5a4a4a', ambient: 'wind',   lights: false, slow: 1,    wind: WIND_PUSH },
    monsoon: { label: 'MONSOON NIGHT',     sky: ['#0a1420', '#101c2c'], grass: ['#123018', '#0a2010'], crowd: '#2a3a4a', ambient: 'rain',   lights: true,  slow: 0.9,  wind: 0 },
    blizzard:{ label: 'BLIZZARD SEMIFINAL', sky: ['#8090a0', '#b8c4cc'], grass: ['#d8e0e6', '#b8c4cc'], crowd: '#3a3a42', ambient: 'snow',   lights: false, slow: 0.85, wind: -WIND_PUSH * 0.6 },
    finale:  { label: 'CHAMPIONSHIP NIGHT', sky: ['#160a26', '#0a0416'], grass: ['#173a20', '#0e2414'], crowd: '#6a3a7a', ambient: 'embers', lights: true,  slow: 1,    wind: 0 },
  };

  // ---- Ten hand-built stages: drive length, downs allowed, defender count
  // /speed/aggressiveness, all ramping up gently and fairly. Player base
  // speed (170) always stays above every defender's tuned speed cap below,
  // so a clean read-and-cut always beats a straight foot race - the
  // difficulty comes from numbers, angles and field width, not omniscience. ----
  const STAGE_CONFIGS = [
    { driveYards: 30, downs: 5, defenderCount: 3, defenderSpeed: 76,  turnRate: 1.9, theme: 'sunny' },
    { driveYards: 34, downs: 5, defenderCount: 4, defenderSpeed: 82,  turnRate: 2.0, theme: 'breezy' },
    { driveYards: 38, downs: 4, defenderCount: 4, defenderSpeed: 88,  turnRate: 2.1, theme: 'mud' },
    { driveYards: 42, downs: 4, defenderCount: 5, defenderSpeed: 94,  turnRate: 2.2, theme: 'lights' },
    { driveYards: 46, downs: 4, defenderCount: 5, defenderSpeed: 100, turnRate: 2.35, theme: 'fog' },
    { driveYards: 50, downs: 4, defenderCount: 6, defenderSpeed: 106, turnRate: 2.5, theme: 'snow' },
    { driveYards: 53, downs: 3, defenderCount: 6, defenderSpeed: 112, turnRate: 2.65, theme: 'windy' },
    { driveYards: 57, downs: 3, defenderCount: 7, defenderSpeed: 118, turnRate: 2.8, theme: 'monsoon' },
    { driveYards: 61, downs: 3, defenderCount: 7, defenderSpeed: 124, turnRate: 2.95, theme: 'blizzard' },
    { driveYards: 65, downs: 3, defenderCount: 8, defenderSpeed: 130, turnRate: 3.1, theme: 'finale' },
  ];

  function getStageConfig(stage) {
    const idx = Math.min(Math.max(stage, 1), HAND_BUILT_STAGES) - 1;
    const base = STAGE_CONFIGS[idx];
    if (stage <= HAND_BUILT_STAGES) return base;
    // Endless mode: stage 10's layout is the seed, scaled up but hard-capped
    // so it plateaus into "very tough" instead of ever becoming unfair.
    const t = stage - HAND_BUILT_STAGES;
    const scale = Math.min(1 + t * 0.08, 1.5);
    return {
      driveYards: Math.min(72, base.driveYards + t),
      downs: Math.max(3, base.downs),
      defenderCount: Math.min(12, Math.round(base.defenderCount * scale)),
      defenderSpeed: Math.min(152, Math.round(base.defenderSpeed * scale)),
      turnRate: Math.min(3.6, base.turnRate * scale),
      theme: base.theme,
    };
  }

  // Shared FX systems - created once, cleared per stage/down in init().
  const dustFx = FX.makeParticles(120);
  const hitFx = FX.makeParticles(160);
  const floatText = FX.makeFloatText(24);

  let cfg, theme, fieldLength, totalDowns, downsLeft, currentLOS;
  let player, defenders, trail, prevSpace, weatherParticles;
  let cameraY, elapsed, standPulse, screenFlash, dustTimer, celebrating;

  function popup(x, y, text, color, size) {
    floatText.spawn(x, y, text, color, { life: 0.9, vy: -30, size: size || 11 });
  }

  function spawnDefenders() {
    const list = [];
    for (let i = 0; i < cfg.defenderCount; i++) {
      let x, y, tries = 0;
      do {
        x = FIELD_LEFT + 24 + Math.random() * (FIELD_W - 48);
        y = currentLOS - (50 + Math.random() * Math.max(60, currentLOS - 40));
        tries++;
      } while (Math.hypot(x - player.x, y - player.y) < 70 && tries < 8);
      y = Math.max(20, y);
      list.push({
        x, y,
        angle: Math.atan2(player.y - y, player.x - x),
        speed: cfg.defenderSpeed * theme.slow,
        turnRate: cfg.turnRate,
        reaction: 0.2 + Math.random() * 0.45,
        bob: Math.random() * Math.PI * 2,
        alive: true,
      });
    }
    return list;
  }

  function startDown() {
    player.x = FIELD_CX + (Math.random() - 0.5) * 40;
    player.y = currentLOS;
    player.jukeTimer = 0;
    player.jukeCooldown = 0;
    player.grace = POST_TACKLE_GRACE;
    player.hitFlash = 0;
    player.facing = { dx: 0, dy: -1 };
    trail = [];
    defenders = spawnDefenders();
    sfx('select');
  }

  // Self-contained, wrapping weather system (own array, not FX.makeParticles -
  // these need to loop forever rather than expire, so they're driven and
  // drawn directly here, the same way commando.js drives its rain).
  function initWeather() {
    weatherParticles = [];
    const kind = theme.ambient;
    if (kind === 'none') return;
    const n = 28;
    for (let i = 0; i < n; i++) {
      if (kind === 'rain') {
        weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 10, speed: 420 + Math.random() * 220 });
      } else if (kind === 'snow') {
        weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, r: 1.5 + Math.random() * 2, speed: 30 + Math.random() * 34, phase: Math.random() * Math.PI * 2, drift: 10 + Math.random() * 14 });
      } else if (kind === 'fog') {
        weatherParticles.push({ x: Math.random() * W, y: H * 0.15 + Math.random() * H * 0.6, r: 40 + Math.random() * 40, speed: 6 + Math.random() * 10 });
      } else if (kind === 'wind') {
        weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, len: 14 + Math.random() * 20, speed: 140 + Math.random() * 100 });
      } else if (kind === 'embers') {
        weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, r: 1.5 + Math.random() * 2, speed: 20 + Math.random() * 30, phase: Math.random() * Math.PI * 2, color: Math.random() < 0.5 ? '#ffb454' : '#7ac8ff' });
      }
    }
  }

  function updateWeather(dt) {
    const kind = theme.ambient;
    weatherParticles.forEach((p) => {
      if (kind === 'rain') {
        p.y += p.speed * dt; p.x -= 40 * dt;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10;
      } else if (kind === 'snow') {
        p.y += p.speed * dt; p.phase += dt * 1.5; p.x += Math.sin(p.phase) * p.drift * dt;
        if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W; }
        if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
      } else if (kind === 'fog') {
        p.x += p.speed * dt;
        if (p.x - p.r > W) p.x = -p.r;
      } else if (kind === 'wind') {
        p.x -= p.speed * dt;
        if (p.x < -20) { p.x = W + 20; p.y = Math.random() * H; }
      } else if (kind === 'embers') {
        p.y -= p.speed * dt; p.phase += dt * 2; p.x += Math.sin(p.phase) * 8 * dt;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      }
    });
  }

  return {
    init(stage = 1) {
      cfg = getStageConfig(stage);
      theme = THEMES[cfg.theme] || THEMES.sunny;
      fieldLength = cfg.driveYards * YARD_PX;
      totalDowns = cfg.downs;
      downsLeft = totalDowns;
      currentLOS = fieldLength;
      elapsed = 0;
      standPulse = 0;
      screenFlash = 0;
      dustTimer = 0;
      celebrating = 0;
      prevSpace = false;
      player = { x: FIELD_CX, y: currentLOS, w: PLAYER_R, jukeTimer: 0, jukeCooldown: 0, grace: 0, hitFlash: 0, facing: { dx: 0, dy: -1 } };
      dustFx.clear();
      hitFx.clear();
      floatText.clear();
      initWeather();
      startDown();
      cameraY = player.y - H * 0.62;
    },

    update(dt) {
      elapsed += dt;
      standPulse = Math.max(0, standPulse - dt);
      screenFlash = Math.max(0, screenFlash - dt * 1.8);
      celebrating = Math.max(0, celebrating - dt);
      player.grace = Math.max(0, player.grace - dt);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.jukeCooldown = Math.max(0, player.jukeCooldown - dt);
      dustFx.update(dt);
      hitFx.update(dt);
      floatText.update(dt);
      updateWeather(dt);

      if (celebrating > 0) {
        // hold on the touchdown moment; engine will switch screens shortly.
        return;
      }

      // If we were tackled and downs remain, the next down is already primed
      // by startDown() below at the moment of the tackle - update() just runs
      // the current live down.

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx -= 1;
      if (isDown('ArrowRight', 'd')) mvx += 1;
      if (isDown('ArrowUp', 'w')) mvy -= 1;
      if (isDown('ArrowDown', 's')) mvy += 1;
      if (mvx || mvy) {
        const n = normalize(mvx, mvy);
        player.facing = n;
        mvx = n.dx; mvy = n.dy;
      }

      const spacePressed = isDown('Space');
      if (spacePressed && !prevSpace && player.jukeCooldown <= 0) {
        player.jukeTimer = JUKE_DURATION;
        player.jukeCooldown = JUKE_COOLDOWN;
        sfx('coin');
        shake(0.08, 1.5);
        dustFx.burst(player.x, player.y + 6, 10, {
          colors: ['#d8c090', '#c8a870'], speedMin: 40, speedMax: 140, lifeMin: 0.2, lifeMax: 0.4,
          sizeMin: 2, sizeMax: 4, gravity: 60,
        });
      }
      prevSpace = spacePressed;
      player.jukeTimer = Math.max(0, player.jukeTimer - dt);

      const juking = player.jukeTimer > 0;
      const speedMul = (juking ? JUKE_SPEED_MULT : 1) * theme.slow;
      player.x += mvx * PLAYER_SPEED * speedMul * dt + theme.wind * dt;
      player.y += mvy * PLAYER_SPEED * speedMul * dt;
      player.x = clamp(player.x, FIELD_LEFT + PLAYER_R, FIELD_RIGHT - PLAYER_R);
      player.y = clamp(player.y, -ENDZONE_DEPTH + PLAYER_R, fieldLength + 30);

      // turf trail while moving; juking leaves a heavier, longer afterimage.
      dustTimer -= dt;
      const moving = mvx !== 0 || mvy !== 0;
      if (moving && dustTimer <= 0) {
        dustTimer = juking ? 0.02 : 0.06;
        dustFx.spawn(player.x - mvx * 6, player.y - mvy * 6 + 6, {
          vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 15, life: 0.3 + Math.random() * 0.15,
          size: juking ? 3 + Math.random() * 2 : 2 + Math.random() * 1.5,
          color: theme.ambient === 'snow' ? 'rgba(255,255,255,0.55)' : 'rgba(120,90,50,0.4)',
        });
      }
      if (juking) {
        trail.push({ x: player.x, y: player.y, facing: player.facing, life: 0.22 });
        if (trail.length > 8) trail.shift();
      }
      trail.forEach((t) => { t.life -= dt; });
      trail = trail.filter((t) => t.life > 0);

      // defender pursuit AI: limited turn rate + brief reaction lag keeps
      // gaps readable instead of homing perfectly onto the player.
      defenders.forEach((d) => {
        if (!d.alive) return;
        d.bob += dt * 6;
        if (d.reaction > 0) {
          d.reaction -= dt;
          d.x += Math.cos(d.angle) * d.speed * 0.25 * dt;
          d.y += Math.sin(d.angle) * d.speed * 0.25 * dt;
          return;
        }
        const desired = Math.atan2(player.y - d.y, player.x - d.x);
        const diff = angleDiff(desired, d.angle);
        const maxTurn = d.turnRate * dt;
        d.angle += clamp(diff, -maxTurn, maxTurn);
        d.x += Math.cos(d.angle) * d.speed * dt;
        d.y += Math.sin(d.angle) * d.speed * dt;
        d.x = clamp(d.x, FIELD_LEFT + DEFENDER_R, FIELD_RIGHT - DEFENDER_R);
      });

      // tackle check
      if (player.grace <= 0 && !juking) {
        for (const d of defenders) {
          if (!d.alive) continue;
          if (Math.hypot(d.x - player.x, d.y - player.y) < TACKLE_DIST) {
            const yardsGained = Math.max(0, Math.round((currentLOS - player.y) / YARD_PX));
            player.hitFlash = 0.4;
            screenFlash = 0.4;
            shake(0.22, 5);
            sfx('hit');
            hitFx.burst(player.x, player.y, 14, {
              colors: ['#ffffff', '#ffd24f', '#ff9a4f'], speedMin: 60, speedMax: 200, lifeMin: 0.2, lifeMax: 0.4,
              sizeMin: 1.5, sizeMax: 3.5, gravity: 140,
            });
            popup(player.x, player.y - 14, `+${yardsGained} YDS`, '#ffe08a', 11);
            addScore(yardsGained * 2);
            downsLeft--;
            currentLOS = Math.max(0, player.y);
            if (downsLeft <= 0) {
              loseLife();
              return;
            }
            popup(player.x, player.y - 30, `DOWN ${totalDowns - downsLeft + 1}/${totalDowns}`, '#e8ecff', 10);
            startDown();
            break;
          }
        }
      }

      // touchdown
      if (player.y <= -ENDZONE_DEPTH * 0.55) {
        celebrating = 1.1;
        standPulse = 1.4;
        sfx('levelclear');
        shake(0.3, 6);
        hitFx.burst(player.x, player.y, 40, {
          colors: ['#ffd24f', '#ff9a4f', '#4fe3d0', '#ffffff', '#ff5ad0'], speedMin: 80, speedMax: 260,
          lifeMin: 0.4, lifeMax: 0.9, sizeMin: 2, sizeMax: 4, gravity: 90, spread: Math.PI * 2,
        });
        const bonus = 100 + downsLeft * 40 + Math.round(cfg.driveYards * 1.5);
        popup(player.x, player.y - 10, `TOUCHDOWN! +${bonus}`, '#ffd24f', 16);
        winLevel(bonus);
        return;
      }

      cameraY = clamp(player.y - H * 0.62, -ENDZONE_DEPTH - 20, Math.max(0, fieldLength - H * 0.3));
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, theme.sky[0], theme.sky[1]);

      if (theme.lights) {
        [W * 0.06, W * 0.94].forEach((lx) => {
          const grad = ctx.createRadialGradient(lx, 10, 4, lx, 10, 220);
          grad.addColorStop(0, 'rgba(255,244,210,0.5)');
          grad.addColorStop(1, 'rgba(255,244,210,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(lx, 10, 220, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // stands (fixed screen space, flanking the field)
      [{ x0: 0, x1: FIELD_LEFT }, { x0: FIELD_RIGHT, x1: W }].forEach((band) => {
        FX.gradientRect(ctx, band.x0, 0, band.x1 - band.x0, H, FX.shade(theme.crowd, -10), FX.shade(theme.crowd, -35));
        const pulse = standPulse > 0 ? Math.sin(elapsed * 24) * 2 * standPulse : 0;
        ctx.fillStyle = standPulse > 0 ? FX.shade(theme.crowd, 45) : FX.shade(theme.crowd, 15);
        for (let row = 0; row < 9; row++) {
          const ry = row * 26 + 14 + (row % 2 === 0 ? 0 : 8);
          for (let cx = band.x0 + 8; cx < band.x1 - 6; cx += 13) {
            const bob = Math.sin(elapsed * 3 + cx * 0.4 + row) * 1.2 + pulse;
            ctx.beginPath();
            ctx.arc(cx, ry + bob, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(FIELD_LEFT, 0, FIELD_W, H);
      ctx.clip();
      ctx.translate(0, -cameraY);

      // grass
      FX.gradientRect(ctx, FIELD_LEFT, -ENDZONE_DEPTH - 20, FIELD_W, fieldLength + ENDZONE_DEPTH + 60, theme.grass[0], theme.grass[1]);
      // subtle mown stripes every 2 yards
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = 0; y < fieldLength; y += YARD_PX * 4) ctx.fillRect(FIELD_LEFT, y, FIELD_W, YARD_PX * 2);

      // end zone
      const ez = ctx.createLinearGradient(FIELD_LEFT, -ENDZONE_DEPTH, FIELD_LEFT, 0);
      ez.addColorStop(0, FX.shade(theme.grass[0], -20));
      ez.addColorStop(1, FX.shade(theme.grass[0], 10));
      ctx.fillStyle = ez;
      ctx.fillRect(FIELD_LEFT, -ENDZONE_DEPTH, FIELD_W, ENDZONE_DEPTH);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(FIELD_LEFT, 0); ctx.lineTo(FIELD_RIGHT, 0);
      ctx.stroke();
      ctx.save();
      ctx.translate(FIELD_CX, -ENDZONE_DEPTH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('END ZONE', 0, 5);
      ctx.restore();

      // yard lines + hash marks + numbers
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (let yardsFromGoal = 0; yardsFromGoal <= cfg.driveYards + 2; yardsFromGoal += 5) {
        const y = yardsFromGoal * YARD_PX;
        const major = yardsFromGoal % 10 === 0;
        ctx.globalAlpha = major ? 0.5 : 0.28;
        ctx.beginPath();
        ctx.moveTo(FIELD_LEFT, y); ctx.lineTo(FIELD_RIGHT, y);
        ctx.stroke();
        if (major && yardsFromGoal > 0) {
          const label = String(Math.min(yardsFromGoal, Math.abs(cfg.driveYards - yardsFromGoal)));
          ctx.fillText(label, FIELD_LEFT + 16, y - 4);
          ctx.fillText(label, FIELD_RIGHT - 16, y - 4);
        }
      }
      ctx.globalAlpha = 1;

      // current line of scrimmage marker
      ctx.strokeStyle = '#ffd24f';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(FIELD_LEFT, currentLOS); ctx.lineTo(FIELD_RIGHT, currentLOS);
      ctx.stroke();
      ctx.setLineDash([]);

      dustFx.draw(ctx);

      // juke afterimage trail
      trail.forEach((t, i) => {
        const a = Math.max(0, t.life / 0.22) * 0.35;
        drawRunner(ctx, t.x, t.y, t.facing, a, '#7fb8d8');
      });

      // defenders
      defenders.forEach((d) => {
        if (!d.alive) return;
        const bob = Math.sin(d.bob) * 1.2;
        FX.shadow(ctx, d.x, d.y + 8, DEFENDER_R * 0.9, 3, 0.3);
        FX.sphere(ctx, d.x, d.y + bob, DEFENDER_R, '#a83a3a');
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(d.x, d.y + bob, DEFENDER_R, 0, Math.PI * 2);
        ctx.stroke();
        FX.sphere(ctx, d.x + Math.cos(d.angle) * 3, d.y + bob - 6 + Math.sin(d.angle) * 1, 5, '#e0c090');
        if (d.reaction > 0) {
          ctx.fillStyle = 'rgba(255,220,120,0.85)';
          ctx.beginPath();
          ctx.arc(d.x, d.y + bob - 16, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // player
      const flashOn = player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0;
      const jukeGlow = player.jukeTimer > 0;
      drawRunner(ctx, player.x, player.y, player.facing, 1, flashOn ? '#ff5c5c' : (jukeGlow ? '#ffe08a' : '#2a6fa8'));

      hitFx.draw(ctx);
      floatText.draw(ctx);
      ctx.textAlign = 'left';

      ctx.restore();
      ctx.restore();

      // weather overlay (screen space, drawn after the camera transform is undone)
      const wKind = theme.ambient;
      if (wKind !== 'none') {
        ctx.save();
        if (wKind === 'rain') {
          ctx.strokeStyle = 'rgba(190,205,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          weatherParticles.forEach((p) => { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 4, p.y + p.len); });
          ctx.stroke();
        } else if (wKind === 'snow') {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          weatherParticles.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); });
        } else if (wKind === 'fog') {
          weatherParticles.forEach((p) => {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, 'rgba(230,236,240,0.12)');
            g.addColorStop(1, 'rgba(230,236,240,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          });
        } else if (wKind === 'wind') {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          weatherParticles.forEach((p) => { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y); });
          ctx.stroke();
        } else if (wKind === 'embers') {
          weatherParticles.forEach((p) => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      if (screenFlash > 0) FX.flash(ctx, W, H, '#ff3030', Math.min(0.5, screenFlash * 0.55));
      if (celebrating > 0) FX.flash(ctx, W, H, '#ffe08a', Math.min(0.35, celebrating * 0.3));

      // HUD readout
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      ctx.fillRect(0, 0, W, 20);
      ctx.fillStyle = '#e8ecff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`DOWN ${totalDowns - downsLeft + 1}/${totalDowns}`, 8, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd24f';
      ctx.fillText(theme.label, W / 2, 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8ecff';
      const toGo = Math.max(0, Math.ceil(player.y / YARD_PX));
      ctx.fillText(`TO GO: ${toGo} YDS`, W - 8, 14);
      ctx.textAlign = 'left';

      if (player.jukeCooldown > 0 && player.jukeTimer <= 0) {
        ctx.fillStyle = 'rgba(232,236,255,0.5)';
        ctx.font = '8px monospace';
        ctx.fillText('JUKE RECHARGING', 8, H - 8);
      } else if (player.jukeTimer <= 0) {
        ctx.fillStyle = 'rgba(255,210,79,0.8)';
        ctx.font = '8px monospace';
        ctx.fillText('SPACE: JUKE', 8, H - 8);
      }

      FX.scanlines(ctx, W, H, 0.05);
      FX.vignette(ctx, W, H, 0.32);
    },
  };

  // Simple top-down runner sprite: shadow + jersey torso + helmet, oriented
  // toward `facing`. Shared by the live player and the juke afterimage trail.
  function drawRunner(ctx, x, y, facing, alpha, bodyColor) {
    ctx.save();
    ctx.globalAlpha = alpha;
    FX.shadow(ctx, x, y + 8, PLAYER_R * 0.9, 3, 0.35 * alpha);
    const dx = facing ? facing.dx : 0, dy = facing ? facing.dy : -1;
    FX.sphere(ctx, x, y, PLAYER_R, bodyColor);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R, 0, Math.PI * 2);
    ctx.stroke();
    FX.sphere(ctx, x + dx * 3, y + dy * 3 - 5, 5, '#d9b98a');
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x + dx * 5, y + dy * 5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
