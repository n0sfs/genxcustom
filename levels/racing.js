function createRacingLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ROAD_X = 70, ROAD_W = W - ROAD_X * 2;
  const PLAYER_W = 34, PLAYER_H = 52;
  const BOOST_TIME = 2.5;
  const MOVE_SPEED = 260;
  const NEAR_MISS_GAP = 14;
  const CAR_COLORS = ['#ff4fa3', '#ffd24f', '#8f8fff', '#ff9a4f'];

  // Per-theme traffic palettes so each leg of the trip has its own visual
  // personality, not just a re-tinted sky. Falls back to CAR_COLORS.
  const CAR_COLOR_THEMES = {
    day: ['#ff4fa3', '#ffd24f', '#8f8fff', '#ff9a4f'],
    dusk: ['#ff8fc6', '#ffd24f', '#c39bff', '#ff7a4f'],
    night: ['#7fd7ff', '#c9c9ff', '#ff6b6b', '#8f8fff'],
    storm: ['#7fd7ff', '#a0aab8', '#ff6b6b', '#c9c9ff'],
    dawn: ['#ffb385', '#ffd8a8', '#ff8fa3', '#ffe27a'],
    fog: ['#c9d2d6', '#a8b6ba', '#8f9a9d', '#d8dde0'],
    neon: ['#00ffdc', '#ff3cdc', '#ffe600', '#7a4fff'],
    desert: ['#ff9a4f', '#ffce6b', '#c96a3a', '#ffb385'],
    blizzard: ['#8fd0ff', '#dbe8ff', '#a0b8cc', '#ffffff'],
    overdrive: ['#ff2b2b', '#ff8a2b', '#ffe14f', '#ff5fa3'],
  };

  // Themes dark enough that headlight/taillight glow cones make sense.
  const NIGHT_THEMES = new Set(['night', 'storm', 'fog', 'neon', 'blizzard', 'overdrive']);

  // Ten hand-built stages: each is a real jump in traffic density/speed, not a
  // tweak, and each leg of the road trip swaps the theme to sell "somewhere
  // new" (day -> dusk -> night -> storm -> dawn -> fog -> neon city -> desert
  // -> blizzard -> a final rain-slicked neon redline run). Stage 11+
  // ("endless mode") scales stage 10's setup smoothly with `stage`.
  const STAGE_CONFIGS = {
    1: { baseSpeed: 220, firstSpawnDelay: 0.8, spawnMax: 1.05, spawnMin: 0.45, spawnDistDivisor: 2600, distanceTarget: 1600, reachMultiplier: 1.15, theme: 'day' },
    2: { baseSpeed: 300, firstSpawnDelay: 0.55, spawnMax: 0.75, spawnMin: 0.32, spawnDistDivisor: 2200, distanceTarget: 2000, reachMultiplier: 1.05, theme: 'dusk' },
    3: { baseSpeed: 360, firstSpawnDelay: 0.4, spawnMax: 0.55, spawnMin: 0.24, spawnDistDivisor: 1800, distanceTarget: 2400, reachMultiplier: 0.98, theme: 'night' },
    4: { baseSpeed: 410, firstSpawnDelay: 0.34, spawnMax: 0.46, spawnMin: 0.21, spawnDistDivisor: 1650, distanceTarget: 2800, reachMultiplier: 0.94, theme: 'storm' },
    5: { baseSpeed: 450, firstSpawnDelay: 0.30, spawnMax: 0.40, spawnMin: 0.19, spawnDistDivisor: 1550, distanceTarget: 3100, reachMultiplier: 0.91, theme: 'dawn' },
    6: { baseSpeed: 490, firstSpawnDelay: 0.27, spawnMax: 0.36, spawnMin: 0.17, spawnDistDivisor: 1450, distanceTarget: 3400, reachMultiplier: 0.89, theme: 'fog' },
    7: { baseSpeed: 530, firstSpawnDelay: 0.24, spawnMax: 0.32, spawnMin: 0.16, spawnDistDivisor: 1350, distanceTarget: 3700, reachMultiplier: 0.88, theme: 'neon' },
    8: { baseSpeed: 570, firstSpawnDelay: 0.22, spawnMax: 0.29, spawnMin: 0.15, spawnDistDivisor: 1250, distanceTarget: 4000, reachMultiplier: 0.87, theme: 'desert' },
    9: { baseSpeed: 610, firstSpawnDelay: 0.20, spawnMax: 0.27, spawnMin: 0.14, spawnDistDivisor: 1150, distanceTarget: 4300, reachMultiplier: 0.86, theme: 'blizzard' },
    10: { baseSpeed: 660, firstSpawnDelay: 0.18, spawnMax: 0.24, spawnMin: 0.13, spawnDistDivisor: 1050, distanceTarget: 4700, reachMultiplier: 0.85, theme: 'overdrive' },
  };

  const THEMES = {
    day: { sky: ['#1e2a1e', '#141c14'], road: ['#3f3f4a', '#232328'], lane: 'rgba(255,255,255,0.5)', weather: null, foliage: '#1e4a24', building: '#2a2e2a' },
    dusk: { sky: ['#3a2540', '#1a1020'], road: ['#4a3f4a', '#2a2028'], lane: 'rgba(255,220,160,0.55)', weather: null, foliage: '#3a2a4a', building: '#302838' },
    night: { sky: ['#0a0e1e', '#05060c'], road: ['#242a38', '#12151c'], lane: 'rgba(207,232,255,0.55)', weather: 'rain', foliage: '#101a2a', building: '#1a2030' },
    // Heavier storm rain on a slick, near-black highway.
    storm: { sky: ['#111a24', '#04070c'], road: ['#20262f', '#0e1116'], lane: 'rgba(160,200,255,0.5)', weather: 'rain', rainDensity: 30, foliage: '#141e28', building: '#1a2228' },
    // Sunrise breaking through a thin ground mist.
    dawn: { sky: ['#4a3a3a', '#1f1418'], road: ['#4a3f3a', '#2a201c'], lane: 'rgba(255,225,180,0.55)', weather: 'fog', fogAlpha: 0.10, foliage: '#4a3020', building: '#3a2c24' },
    // Thick countryside fog, low visibility.
    fog: { sky: ['#3a3f3d', '#1b1f1d'], road: ['#454a48', '#262a29'], lane: 'rgba(220,225,220,0.4)', weather: 'fog', fogAlpha: 0.22, foliage: '#2c3430', building: '#30352f' },
    // Neon-lit city night, magenta roadside signage.
    neon: { sky: ['#1a0a2e', '#05020a'], road: ['#2a1a3a', '#140a1e'], lane: 'rgba(0,255,220,0.6)', weather: null, roadsideColor: 'rgba(255,60,220,0.4)', foliage: '#2a1440', building: '#241a38' },
    // Amber desert sunset, heat-hazed blacktop.
    desert: { sky: ['#4a2a1a', '#1f0f0a'], road: ['#5a4030', '#2a1c14'], lane: 'rgba(255,210,140,0.55)', weather: null, roadsideColor: 'rgba(255,140,40,0.3)', foliage: '#5a4020', building: '#3a2c1c' },
    // Whiteout mountain-pass blizzard.
    blizzard: { sky: ['#3a4550', '#151a20'], road: ['#4a545c', '#242a30'], lane: 'rgba(230,240,255,0.6)', weather: 'snow', foliage: '#2a3a44', building: '#38424c' },
    // Final stretch: rain-slicked neon megahighway, redlining to the finish.
    overdrive: { sky: ['#2a0a0a', '#0a0303'], road: ['#3a1418', '#160608'], lane: 'rgba(255,80,80,0.6)', weather: 'rain', rainDensity: 34, roadsideColor: 'rgba(255,40,40,0.35)', foliage: '#3a1010', building: '#2c1414' },
  };

  function getStageConfig(stage) {
    const s = Math.max(1, Math.floor(stage) || 1);
    if (s <= 10) return STAGE_CONFIGS[s];
    // Endless mode: scale stage 10's baseline harder each stage, capped so it
    // never becomes literally impossible.
    const scale = Math.min(2.6, 1 + (s - 10) * 0.12);
    const s10 = STAGE_CONFIGS[10];
    return {
      baseSpeed: s10.baseSpeed * scale,
      firstSpawnDelay: s10.firstSpawnDelay / scale,
      spawnMax: s10.spawnMax / scale,
      spawnMin: Math.max(0.15, s10.spawnMin / scale),
      spawnDistDivisor: s10.spawnDistDivisor,
      // Same per-stage growth rate as before (250 per +0.12 of scale), but tied
      // to `scale`'s own cap so run length levels off together with speed and
      // spawn rate instead of growing forever while difficulty plateaus.
      distanceTarget: s10.distanceTarget + (scale - 1) * (250 / 0.12),
      reachMultiplier: Math.max(0.85, s10.reachMultiplier - (s - 10) * 0.02),
      theme: s10.theme,
    };
  }

  // Instantiated once per level instance (not per frame / not per init) —
  // cleared in init() so a fresh stage doesn't inherit stale effects.
  const particles = FX.makeParticles(140);
  const floatText = FX.makeFloatText(30);

  let player, obstacles, pickups, distance, speed, spawnTimer, fuelTimer, boostTimer, dashOffset, scoreTick;
  let lastSpawnX, lastSpawnInterval, nearMissStreak, cfg, flashTimer;

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

  // Soft forward-facing headlight cone, used on both the player and traffic
  // at night-themed stages. Drawn before the car body so the sprite sits on
  // top of its own light spill.
  function drawHeadlightCone(ctx, cx, topY, w) {
    const coneH = 68;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.28, topY);
    ctx.lineTo(cx - w * 1.5, topY - coneH);
    ctx.lineTo(cx + w * 1.5, topY - coneH);
    ctx.lineTo(cx + w * 0.28, topY);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(cx, topY, cx, topY - coneH);
    g.addColorStop(0, 'rgba(255,248,210,0.32)');
    g.addColorStop(1, 'rgba(255,248,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w * 1.5, topY - coneH, w * 3, coneH);
    ctx.restore();
  }

  // Faint rear glow spill from taillights onto wet/dark asphalt behind traffic.
  function drawTailGlow(ctx, cx, bottomY, w) {
    const g = ctx.createRadialGradient(cx, bottomY, 0, cx, bottomY, w * 1.1);
    g.addColorStop(0, 'rgba(255,70,70,0.28)');
    g.addColorStop(1, 'rgba(255,70,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, bottomY, w * 1.1, w * 0.5, 0, 0, Math.PI * 2);
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

    // glossy paint highlight streak — a soft diagonal specular pass over the
    // hood so the body reads as curved, glossy sheet metal rather than flat.
    const glossGrad = ctx.createLinearGradient(x, y, x + w, y + h * 0.3);
    glossGrad.addColorStop(0, 'rgba(255,255,255,0)');
    glossGrad.addColorStop(0.42, 'rgba(255,255,255,0.26)');
    glossGrad.addColorStop(0.58, 'rgba(255,255,255,0)');
    ctx.fillStyle = glossGrad;
    ctx.fillRect(x + 2, y + 2, w - 4, h * 0.24);

    // thin chrome bumper trim, front and rear, plus a chrome side-mirror nub
    FX.chrome(ctx, x + 3, y, w - 6, 2);
    FX.chrome(ctx, x + 3, y + h - 2, w - 6, 2);
    FX.chrome(ctx, x - 3, y + h * 0.32, 2, 4);
    FX.chrome(ctx, x + w + 1, y + h * 0.32, 2, 4);

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

  // Parallax roadside scenery: trees / lit buildings / signs cycling past on
  // both shoulders, purely procedural (no persistent state needed) so it
  // scrolls in lockstep with dashOffset like everything else on the road.
  function drawSceneryPiece(ctx, x, y, idx, theme) {
    const kind = idx % 3;
    if (kind === 0) {
      ctx.fillStyle = 'rgba(40,28,18,0.9)';
      ctx.fillRect(x - 1.5, y + 8, 3, 10);
      ctx.fillStyle = theme.foliage || '#1e4a24';
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x - 7, y + 9);
      ctx.lineTo(x + 7, y + 9);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 1) {
      const w = 14, h = 26;
      ctx.fillStyle = theme.building || '#2a2a34';
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = 'rgba(255,220,140,0.75)';
      for (let wy = 0; wy < 3; wy++) {
        if ((idx + wy) % 2 === 0) ctx.fillRect(x - w / 2 + 3, y - h / 2 + 4 + wy * 8, 3, 4);
        if ((idx + wy) % 3 === 0) ctx.fillRect(x + w / 2 - 6, y - h / 2 + 4 + wy * 8, 3, 4);
      }
    } else {
      ctx.fillStyle = 'rgba(150,150,150,0.9)';
      ctx.fillRect(x - 1, y - 2, 2, 16);
      ctx.fillStyle = theme.roadsideColor ? theme.roadsideColor.replace(/[\d.]+\)$/, '0.85)') : 'rgba(255,207,79,0.85)';
      ctx.fillRect(x - 6, y - 12, 12, 8);
    }
  }

  function drawRoadside(ctx, theme) {
    const spacing = 66;
    const scroll = dashOffset * 1.5;
    for (let i = -1; i < 9; i++) {
      const tyL = ((i * spacing - scroll) % (H + spacing)) - spacing / 2;
      const tyR = (((i + 0.5) * spacing - scroll) % (H + spacing)) - spacing / 2;
      drawSceneryPiece(ctx, 16, tyL, i, theme);
      drawSceneryPiece(ctx, W - 16, tyR, i + 1, theme);
    }
  }

  // Radiating speed-line streaks from a forward vanishing point — kicks in
  // at high speed, boosting, or hard lateral dodges, to sell velocity.
  function drawSpeedLines(ctx, intensity) {
    if (intensity <= 0) return;
    const cx = W / 2, cy = H * 0.12;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${(0.05 + 0.14 * intensity).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    const count = 10;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + dashOffset * 0.01;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const startR = 50;
      const len = 36 + 130 * intensity;
      ctx.beginPath();
      ctx.moveTo(cx + dx * startR, cy + dy * startR);
      ctx.lineTo(cx + dx * (startR + len), cy + dy * (startR + len));
      ctx.stroke();
    }
    ctx.restore();
  }

  function spawnObstacle() {
    const w = 34, h = 52;
    const minX = ROAD_X + 14, maxX = ROAD_X + ROAD_W - w - 14;
    let x;
    if (lastSpawnX === null) {
      x = minX + Math.random() * (maxX - minX);
    } else {
      // Clamp to a range the player can physically reach in the time since the
      // last obstacle spawned (using the un-boosted move speed as the safe floor),
      // so back-to-back spawns never demand an impossible cross-road dash. Higher
      // stages shrink the safety margin (reachMultiplier) for tighter gaps.
      const reach = MOVE_SPEED * lastSpawnInterval * cfg.reachMultiplier + player.w;
      let lo = Math.max(minX, lastSpawnX - reach);
      let hi = Math.min(maxX, lastSpawnX + reach);
      if (lo > hi) { lo = minX; hi = maxX; }
      x = lo + Math.random() * (hi - lo);
    }
    lastSpawnX = x;
    const palette = CAR_COLOR_THEMES[cfg.theme] || CAR_COLORS;
    obstacles.push({ x, y: -h, w, h, color: palette[Math.floor(Math.random() * palette.length)], scored: false, minGap: Infinity });
  }

  return {
    init(stage = 1) {
      cfg = getStageConfig(stage);
      player = { x: W / 2 - PLAYER_W / 2, y: H - 90, w: PLAYER_W, h: PLAYER_H, vx: 0 };
      obstacles = [];
      pickups = [];
      particles.clear();
      floatText.clear();
      distance = 0;
      speed = cfg.baseSpeed;
      spawnTimer = cfg.firstSpawnDelay;
      lastSpawnX = null;
      lastSpawnInterval = cfg.firstSpawnDelay;
      nearMissStreak = 0;
      fuelTimer = 5 + Math.random() * 4;
      boostTimer = 0;
      dashOffset = 0;
      scoreTick = 0;
      flashTimer = 0;
    },

    update(dt) {
      flashTimer = Math.max(0, flashTimer - dt);
      boostTimer = Math.max(0, boostTimer - dt);
      const boosting = boostTimer > 0;
      const rampCap = 260 * (cfg.baseSpeed / 220);
      speed = (cfg.baseSpeed + Math.min(rampCap, distance * 0.12)) * (boosting ? 1.5 : 1);

      const moveSpeed = boosting ? 340 : MOVE_SPEED;
      player.vx = 0;
      const keyLeft = isDown('ArrowLeft', 'a');
      const keyRight = isDown('ArrowRight', 'd');
      if (keyLeft) player.vx = -moveSpeed;
      if (keyRight) player.vx = moveSpeed;
      if (keyLeft || keyRight || !api.mouseActive) {
        // Active keyboard/touch input always wins for this frame — nudge the
        // player directly at the normal move speed, same as before. Also
        // falls back here (no-op, vx already 0) while the mouse has never
        // actually been touched, so a keyboard-only player never gets
        // yanked toward the default center-of-canvas mouse coordinate.
        player.x += player.vx * dt;
      } else {
        // No directional key/touch held: ease the car's center toward the
        // mouse cursor's X, at the exact same speed/step keyboard uses, so
        // mouse control can't out-turn the keyboard's normal turn rate.
        const targetCenter = api.mouseX;
        const dx = targetCenter - (player.x + player.w / 2);
        const step = moveSpeed * dt;
        if (Math.abs(dx) <= step) {
          player.x += dx;
          player.vx = dx / dt;
        } else {
          const dir = dx > 0 ? 1 : -1;
          player.x += dir * step;
          player.vx = dir * moveSpeed;
        }
      }
      player.x = Math.max(ROAD_X + 6, Math.min(ROAD_X + ROAD_W - player.w - 6, player.x));

      distance += speed * dt * 0.05;
      dashOffset = (dashOffset + speed * dt) % 40;

      // Exhaust / tire-smoke trail: always present, thicker with speed, and
      // livelier while boosting or actively dodging side to side.
      const dodging = Math.abs(player.vx) > 0;
      const speedFactor = Math.min(1, speed / (cfg.baseSpeed * 1.8));
      const trailChance = 0.12 + speedFactor * 0.3 + (dodging ? 0.2 : 0) + (boosting ? 0.35 : 0);
      if (Math.random() < trailChance) {
        particles.spawn(
          player.x + player.w / 2 + (Math.random() - 0.5) * player.w * 0.7,
          player.y + player.h - 2,
          {
            vx: (Math.random() - 0.5) * 30 - player.vx * 0.06,
            vy: 50 + Math.random() * 50,
            gravity: -20,
            life: 0.2 + Math.random() * 0.2,
            size: 2.5 + Math.random() * 2.5,
            color: boosting ? '#8fffe0' : 'rgba(210,210,210,0.5)',
          }
        );
      }
      // Tire smoke puffs from the trailing wheel while dodging hard.
      if (dodging && Math.random() < 0.35) {
        const wx = player.x + (player.vx < 0 ? player.w : 0);
        particles.spawn(wx, player.y + player.h - 3, {
          vx: (Math.random() - 0.5) * 24,
          vy: 20 + Math.random() * 20,
          gravity: 0,
          life: 0.25 + Math.random() * 0.15,
          size: 2 + Math.random() * 2,
          color: 'rgba(190,190,190,0.45)',
        });
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnObstacle();
        spawnTimer = Math.max(cfg.spawnMin, cfg.spawnMax - distance / cfg.spawnDistDivisor);
        lastSpawnInterval = spawnTimer;
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
          particles.burst(p.x + p.w / 2, p.y + p.h / 2, 10, {
            colors: ['#4fe3d0', '#c8fff5', '#8fffe0'],
            speedMin: 40, speedMax: 130, lifeMin: 0.25, lifeMax: 0.45, sizeMin: 2, sizeMax: 4,
          });
          floatText.spawn(p.x + p.w / 2, p.y, '+10', '#fff6a8', { life: 0.7, size: 11 });
          return false;
        }
        return p.y < H + 60;
      });

      particles.update(dt);
      floatText.update(dt);

      // Near-miss / boosted-through-traffic feedback: reward tight dodges instead
      // of just penalizing hits. Tracks the closest horizontal gap while an
      // obstacle shares the player's vertical band, then scores it once the
      // obstacle has fully passed without ever colliding.
      obstacles.forEach((o) => {
        if (o.scored) return;
        const vOverlap = player.y < o.y + o.h && player.y + player.h > o.y;
        if (vOverlap) {
          const hOverlap = player.x < o.x + o.w && player.x + player.w > o.x;
          if (hOverlap) {
            if (boosting) {
              o.scored = true;
              addScore(3);
              sfx('bounce');
              shake(0.05, 1.5);
              particles.burst(player.x + player.w / 2, player.y + player.h / 2, 9, {
                colors: ['#8fffe0', '#fff', '#4fe3d0'],
                speedMin: 50, speedMax: 150, lifeMin: 0.2, lifeMax: 0.4, sizeMin: 2, sizeMax: 4,
              });
              floatText.spawn(player.x + player.w / 2, player.y, '+3', '#8fffe0', { life: 0.6, size: 10 });
            }
          } else {
            const gap = o.x + o.w <= player.x ? player.x - (o.x + o.w) : o.x - (player.x + player.w);
            if (gap < o.minGap) o.minGap = gap;
          }
        } else if (o.y > player.y + player.h && o.minGap < NEAR_MISS_GAP) {
          o.scored = true;
          nearMissStreak++;
          const bonus = 5 + Math.min(20, nearMissStreak * 2);
          addScore(bonus);
          sfx('swing');
          shake(0.05, 1.5);
          // Quick directional "whoosh" streak on the side the car just cleared.
          const fromLeft = o.x < player.x;
          particles.burst(fromLeft ? o.x + o.w : o.x, player.y + player.h / 2, 6, {
            colors: ['#dfefff', '#9fd8ff'],
            angle: fromLeft ? 0 : Math.PI,
            spread: 0.5,
            speedMin: 120, speedMax: 220, lifeMin: 0.12, lifeMax: 0.22, sizeMin: 2, sizeMax: 4,
          });
          floatText.spawn(o.x + o.w / 2, player.y, `+${bonus}`, '#fff6a8', { life: 0.7, size: 11 });
        }
      });

      if (!boosting) {
        for (const o of obstacles) {
          if (player.x < o.x + o.w && player.x + player.w > o.x && player.y < o.y + o.h && player.y + player.h > o.y) {
            sfx('hit');
            shake(0.22, 6);
            flashTimer = 0.2;
            particles.burst(player.x + player.w / 2, player.y + player.h / 2, 14, {
              colors: ['#ffcf4f', '#ff6b3b', '#fff3c4', '#8a8a8a'],
              speedMin: 60, speedMax: 220, lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 5,
              gravity: 160,
            });
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

      if (distance >= cfg.distanceTarget) {
        winLevel(40);
      }
    },

    draw(ctx) {
      const theme = THEMES[cfg.theme] || THEMES.day;
      const nightTheme = NIGHT_THEMES.has(cfg.theme);
      FX.gradientRect(ctx, 0, 0, W, H, theme.sky[0], theme.sky[1]);

      // scrolling parallax roadside scenery: trees, lit buildings, signs
      drawRoadside(ctx, theme);

      FX.gradientRect(ctx, ROAD_X, 0, ROAD_W, H, theme.road[0], theme.road[1]);

      // faint tire-wear streaks for road texture
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(ROAD_X + ROAD_W * 0.22, 0, 4, H);
      ctx.fillRect(ROAD_X + ROAD_W * 0.78, 0, 4, H);

      // faint motion-blur echo of the lane dashes, offset further along the
      // scroll, to sell a sense of speed underneath the crisp main dashes
      ctx.strokeStyle = theme.lane.replace(/[\d.]+\)$/, '0.16)');
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 18]);
      ctx.lineDashOffset = -dashOffset * 1.6;
      for (let i = 1; i < 3; i++) {
        const x = ROAD_X + (ROAD_W / 3) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      ctx.strokeStyle = theme.lane;
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

      if (theme.weather === 'rain') {
        const dropCount = theme.rainDensity || 18;
        ctx.strokeStyle = 'rgba(180,200,255,0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < dropCount; i++) {
          const rx = ROAD_X + ((i * 53 + dashOffset * 2) % (ROAD_W + 40)) - 20;
          const ry = (i * 97 + dashOffset * 3) % (H + 40) - 20;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 6, ry + 16);
          ctx.stroke();
        }
      } else if (theme.weather === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 22; i++) {
          const sx = ROAD_X + ((i * 47 + dashOffset * 0.6 + i * 11) % (ROAD_W + 40)) - 20;
          const sy = (i * 83 + dashOffset * 1.1) % (H + 40) - 20;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (theme.weather === 'fog') {
        ctx.fillStyle = `rgba(230,235,235,${theme.fogAlpha || 0.15})`;
        for (let i = 0; i < 3; i++) {
          const fy = ((i * 150 + dashOffset * 0.3) % (H + 150)) - 75;
          ctx.fillRect(ROAD_X - 6, fy, ROAD_W + 12, 90);
        }
      }

      obstacles.forEach((o) => {
        if (nightTheme) {
          drawTailGlow(ctx, o.x + o.w / 2, o.y + o.h - 1, o.w * 0.5);
          drawHeadlightCone(ctx, o.x + o.w / 2, o.y, o.w);
        }
        drawCar(ctx, o.x, o.y, o.w, o.h, o.color);
      });
      pickups.forEach((p) => drawFuel(ctx, p.x, p.y, p.w, p.h));

      // speed-line overlay: kicks in above baseline speed, and gets an extra
      // push from nitro or a hard lateral dodge
      const speedIntensity = Math.max(0, Math.min(1, (speed - cfg.baseSpeed * 1.05) / (cfg.baseSpeed * 0.9)));
      const dodgeKick = Math.abs(player.vx) > MOVE_SPEED * 0.9 ? 0.25 : 0;
      const totalIntensity = Math.min(1, speedIntensity + (boostTimer > 0 ? 0.4 : 0) + dodgeKick);
      drawSpeedLines(ctx, totalIntensity);

      particles.draw(ctx);
      floatText.draw(ctx);

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
      if (nightTheme) drawHeadlightCone(ctx, player.x + player.w / 2, player.y, player.w);
      drawCar(ctx, player.x, player.y, player.w, player.h, boostTimer > 0 ? '#8fffe0' : '#4fe3d0');

      // full-screen impact wash on a fresh crash, fading out over flashTimer
      if (flashTimer > 0) FX.flash(ctx, W, H, '#ff3b3b', (flashTimer / 0.2) * 0.35);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`${Math.floor(distance)}m / ${cfg.distanceTarget}m`, 8, 16);
      if (boostTimer > 0) {
        ctx.fillStyle = '#4fe3d0';
        ctx.fillText('NITRO!', W - 60, 16);
      }
    },
  };
}
