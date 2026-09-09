// GRIDIRON DASH - fast arcade broken-field-running football.
// Horizontal field with a real formation: QB takes the snap behind an
// offensive line, a running back is available for an instant handoff, and
// a wide receiver + tight end run routes downfield. Tap Space to hand off
// and take off running (juke/spin from there); hold Space to plant the QB
// in the pocket and survey - d-pad up/down (or mouse Y) cycles which
// receiver is highlighted, release to throw to him. A defensive front
// rushes the QB (the O-line blocks for you); linebackers/secondary read
// run-or-pass and converge on whoever ends up with the ball.
function createGridironLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const HAND_BUILT_STAGES = 10;

  // Field geometry: sidelines fixed on screen (top/bottom), drive runs
  // "right" across the world (increasing x) toward the goal line at
  // world-x = fieldLength. Everything is measured in pixels; YARD_PX
  // converts a yard count to world pixels.
  const FIELD_TOP = 58, FIELD_BOTTOM = 422;
  const FIELD_H = FIELD_BOTTOM - FIELD_TOP;
  const FIELD_CY = (FIELD_TOP + FIELD_BOTTOM) / 2;
  const YARD_PX = 9;
  const ENDZONE_DEPTH = 46;

  const PLAYER_SPEED = 170;
  const PLAYER_R = 9;
  const DEFENDER_R = 10;
  const TACKLE_DIST = PLAYER_R + DEFENDER_R - 4;
  const CLOSE_CALL_DIST = TACKLE_DIST + 10;
  const JUKE_SPEED_MULT = 1.8;
  const JUKE_DURATION = 0.3;
  const JUKE_COOLDOWN = 1.4;
  const POST_TACKLE_GRACE = 0.75;
  const WIND_PUSH = 16;
  const QB_SCRAMBLE_MULT = 0.55; // QBs aren't burners - a real reason to get rid of the ball

  // ---- Passing/handoff: tap Space to hand off to the RB and start
  // running (juke from there, unchanged); hold Space to survey the field
  // instead - a single button can't cycle receivers the way a real NES
  // pad's separate A/B could, so cycling moves to the d-pad (which the QB
  // doesn't need for movement while he's planted anyway) or mouse Y.
  // Coverage/interception logic mirrors Tecmo Bowl: receivers are always
  // caught when open, covered throws risk a pick. ----
  const RECEIVER_R = 8.5;
  const RB_R = 8.5;
  const OL_R = 10;
  const OL_COUNT = 5;
  const ROUTE_SPEED = 132;
  const COVERAGE_RADIUS = 42;
  const PASS_HOLD_THRESHOLD = 0.16;
  const PASS_FLIGHT_SPEED = 400;
  const INTERCEPT_CHANCE_COVERED = 0.7;
  const OL_SEEK_RANGE = 90; // how far a lineman will actively chase down a defender to block
  const OL_SEEK_SPEED = 90;
  const OL_ENGAGE_DIST = 15;

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
  let cameraX, elapsed, standPulse, screenFlash, dustTimer, celebrating;
  let receivers, rb, ol, ball, passCharging, spaceHoldTimer, highlightIdx;
  let prevUp, prevDown;

  function popup(x, y, text, color, size) {
    floatText.spawn(x, y, text, color, { life: 0.9, vy: -30, size: size || 11 });
  }

  function spawnOffensiveLine() {
    const list = [];
    for (let i = 0; i < OL_COUNT; i++) {
      const t = (i + 0.5) / OL_COUNT;
      list.push({
        x: currentLOS + 4,
        y: FIELD_TOP + 20 + t * (FIELD_H - 40),
        homeX: currentLOS + 4,
        homeY: FIELD_TOP + 20 + t * (FIELD_H - 40),
        facing: { dx: 1, dy: 0 },
        bob: Math.random() * Math.PI * 2,
        engaged: false,
        engagedWith: null,
      });
    }
    return list;
  }

  function spawnDefense() {
    const list = [];
    // A few defenders line up tight to the LOS and always rush whoever has
    // the ball (the D-line); the rest spawn further out and dynamically
    // cover the ball carrier or an active receiver, whichever is closer.
    // Real research note: Tecmo Bowl's O-line doesn't slow rushers down on
    // contact - it fully walls off every blocked defender for the play,
    // predetermining (via play selection) that exactly a handful of
    // "read-key" defenders stay unblocked. This game has no play-calling to
    // predetermine that split, so a small fixed number of defenders are
    // just marked unblockable up front and always stay live threats -
    // everyone else is fair game for the O-line to fully neutralize once a
    // lineman reaches them (see updateFieldActors).
    const lineCount = Math.min(3, Math.max(1, Math.floor(cfg.defenderCount / 2)));
    const unblockableCoverage = Math.min(2, cfg.defenderCount - lineCount);
    for (let i = 0; i < cfg.defenderCount; i++) {
      const isLine = i < lineCount;
      const isUnblockable = !isLine && (i - lineCount) < unblockableCoverage;
      let x, y, tries = 0;
      do {
        y = FIELD_TOP + 24 + Math.random() * (FIELD_H - 48);
        x = isLine
          ? currentLOS + 14 + Math.random() * 14
          : currentLOS + (50 + Math.random() * Math.max(60, fieldLength - currentLOS - 40));
        tries++;
      } while (Math.hypot(x - player.x, y - player.y) < 50 && tries < 8);
      x = Math.min(fieldLength - 20, x);
      list.push({
        x, y,
        isLine,
        blockable: !isUnblockable,
        angle: Math.atan2(player.y - y, player.x - x),
        speed: cfg.defenderSpeed * theme.slow * (isLine ? 0.85 : 1),
        turnRate: cfg.turnRate,
        reaction: isLine ? 0.35 + Math.random() * 0.3 : 0.2 + Math.random() * 0.45,
        bob: Math.random() * Math.PI * 2,
        alive: true,
        blocked: false,
      });
    }
    return list;
  }

  // Runs the O-line's idle shuffle, the RB/receivers' routes, and the
  // defenders' pursuit AI - shared by the normal live-play path and the
  // ball-in-flight path, so a thrown ball's coverage keeps evolving for the
  // ~0.2-0.4s it's actually in the air instead of being locked in at the
  // moment of release.
  function updateFieldActors(dt) {
    // O-line: each unengaged lineman seeks out the nearest still-blockable,
    // not-yet-engaged defender within reach and moves to seal him off; once
    // he arrives, that defender is walled out of the play (fully held, not
    // just slowed) for the rest of the down - see spawnDefense() for why a
    // couple of defenders are marked unblockable and never eligible here.
    ol.forEach((o) => {
      if (o.engaged) {
        o.bob += dt * 10; // faster jitter reads as an active push, not idle standing
        return;
      }
      o.bob += dt * 2;
      let target = null, bestDist = OL_SEEK_RANGE;
      defenders.forEach((d) => {
        if (!d.alive || !d.blockable || d.blocked) return;
        const dist = Math.hypot(d.x - o.homeX, d.y - o.homeY);
        if (dist < bestDist) { bestDist = dist; target = d; }
      });
      if (target) {
        const toT = normalize(target.x - o.x, target.y - o.y);
        o.facing = toT;
        const engageDist = Math.hypot(target.x - o.x, target.y - o.y);
        if (engageDist < OL_ENGAGE_DIST) {
          o.engaged = true;
          o.engagedWith = target;
          target.blocked = true;
          hitFx.burst(target.x, target.y, 7, {
            colors: ['#d9d9d9', '#8a8a8a', '#e8ecf4'], speedMin: 30, speedMax: 90, lifeMin: 0.15, lifeMax: 0.3,
            sizeMin: 1.5, sizeMax: 3, gravity: 0,
          });
        } else {
          o.x += toT.dx * OL_SEEK_SPEED * dt;
          o.y += toT.dy * OL_SEEK_SPEED * dt;
        }
      } else {
        // nobody left to block right now - drift back toward the line
        const toHome = normalize(o.homeX - o.x, o.homeY - o.y);
        if (Math.hypot(o.homeX - o.x, o.homeY - o.y) > 2) {
          o.x += toHome.dx * OL_SEEK_SPEED * 0.6 * dt;
          o.y += toHome.dy * OL_SEEK_SPEED * 0.6 * dt;
        }
      }
    });

    if (rb && rb.active) {
      rb.x += 26 * theme.slow * dt;
      rb.runPhase += dt * 6;
    }

    receivers.forEach((r) => {
      if (!r.active) return;
      r.x += r.routeSpeed * theme.slow * dt;
      r.x = clamp(r.x, currentLOS - 10, fieldLength + ENDZONE_DEPTH - 10);
      r.runPhase += dt * 12;
    });

    // Defenders: a blocked defender is fully held by his O-lineman (see
    // above) - he doesn't pursue at all, just shows a bit of struggle.
    // Everyone else pursues as before: D-line always rushes whoever
    // currently has the ball; coverage defenders dynamically peel toward
    // whichever eligible target (ball carrier or an active receiver) is
    // currently closest - simple emergent coverage without dedicated
    // man-assignment logic.
    defenders.forEach((d) => {
      if (!d.alive) return;
      d.bob += dt * (d.blocked ? 9 : 6);
      if (d.blocked) return;

      if (d.reaction > 0) {
        d.reaction -= dt;
        d.x += Math.cos(d.angle) * d.speed * 0.25 * dt;
        d.y += Math.sin(d.angle) * d.speed * 0.25 * dt;
        return;
      }
      let targetX = player.x, targetY = player.y;
      if (!d.isLine) {
        let bestDist = Math.hypot(player.x - d.x, player.y - d.y);
        receivers.forEach((r) => {
          if (!r.active) return;
          const rd = Math.hypot(r.x - d.x, r.y - d.y);
          if (rd < bestDist) { bestDist = rd; targetX = r.x; targetY = r.y; }
        });
      }
      const desired = Math.atan2(targetY - d.y, targetX - d.x);
      const diff = angleDiff(desired, d.angle);
      const maxTurn = d.turnRate * dt;
      d.angle += clamp(diff, -maxTurn, maxTurn);
      d.x += Math.cos(d.angle) * d.speed * dt;
      d.y += Math.sin(d.angle) * d.speed * dt;
      d.y = clamp(d.y, FIELD_TOP + DEFENDER_R, FIELD_BOTTOM - DEFENDER_R);
    });

    receivers.forEach((r) => {
      if (!r.active) return;
      let openNow = true;
      for (const d of defenders) {
        if (!d.alive) continue;
        if (Math.hypot(d.x - r.x, d.y - r.y) < COVERAGE_RADIUS) { openNow = false; break; }
      }
      r.open = openNow;
    });
  }

  function startDown() {
    player.x = currentLOS;
    player.y = FIELD_CY + (Math.random() - 0.5) * 30;
    player.role = 'qb';
    player.jukeTimer = 0;
    player.jukeCooldown = 0;
    player.jukeCloseCall = false;
    player.grace = POST_TACKLE_GRACE;
    player.hitFlash = 0;
    player.facing = { dx: 1, dy: 0 };
    trail = [];
    ol = spawnOffensiveLine();
    defenders = spawnDefense();
    const wideY = player.y > FIELD_CY ? FIELD_TOP + 24 : FIELD_BOTTOM - 24;
    const shortY = player.y > FIELD_CY ? FIELD_BOTTOM - 60 : FIELD_TOP + 60;
    receivers = [
      { x: currentLOS, y: wideY, w: RECEIVER_R, active: true, open: true, runPhase: 0, routeSpeed: ROUTE_SPEED, label: 'WR', number: 84 },
      { x: currentLOS, y: shortY, w: RECEIVER_R, active: true, open: true, runPhase: Math.PI, routeSpeed: ROUTE_SPEED * 0.8, label: 'TE', number: 87 },
    ];
    rb = { x: currentLOS - 14, y: clamp(player.y + 20, FIELD_TOP + 10, FIELD_BOTTOM - 10), w: RB_R, active: true, runPhase: 0 };
    highlightIdx = 0;
    ball = { mode: 'carried', t: 0, duration: 0, fromX: 0, fromY: 0, arc: 0, targetIdx: 0 };
    passCharging = false;
    spaceHoldTimer = 0;
    prevUp = false;
    prevDown = false;
    sfx('select');
  }

  // Ball leaves the QB's hands immediately and flies toward wherever the
  // highlighted receiver is RIGHT NOW, but the actual completion/coverage
  // check happens when it arrives (resolvePass), not at the moment of
  // release - exactly like a real pass, the receiver (and his coverage)
  // keeps moving during the ball's flight.
  function startPass(idx) {
    const r = receivers[idx];
    if (!r || !r.active) return;
    const dist = Math.hypot(r.x - player.x, r.y - player.y);
    ball.mode = 'inflight';
    ball.targetIdx = idx;
    ball.t = 0;
    ball.duration = Math.max(0.18, dist / PASS_FLIGHT_SPEED);
    ball.fromX = player.x; ball.fromY = player.y;
    ball.arc = 14 + dist * 0.12;
    sfx('bounce');
  }

  // Called the instant the in-flight ball arrives. Coverage is judged at
  // THIS moment (not at release), and a completion always finds the
  // receiver wherever his route has taken him since the throw.
  function resolvePass() {
    const r = receivers[ball.targetIdx];
    if (!r || !r.active) { ball.mode = 'carried'; return; }
    const yardsGained = Math.max(0, Math.round((r.x - ball.fromX) / YARD_PX));
    if (r.open) {
      sfx('coin');
      shake(0.1, 2);
      const bonus = yardsGained * 3;
      addScore(bonus);
      popup(r.x, r.y - 16, `PASS COMPLETE! +${bonus}`, '#4fe3d0', 12);
      hitFx.burst(r.x, r.y, 18, {
        colors: ['#4fe3d0', '#ffffff', '#ffd24f'], speedMin: 60, speedMax: 200, lifeMin: 0.25, lifeMax: 0.5,
        sizeMin: 1.5, sizeMax: 3.5, gravity: 80,
      });
      player.x = r.x;
      player.y = r.y;
      player.role = 'runner';
      player.grace = POST_TACKLE_GRACE;
      player.facing = { dx: 1, dy: 0 };
      receivers.forEach((rr) => { rr.active = false; });
      if (rb) rb.active = false;
      ball.mode = 'carried';
    } else if (Math.random() < INTERCEPT_CHANCE_COVERED) {
      sfx('hit');
      shake(0.28, 6);
      popup(r.x, r.y - 16, 'INTERCEPTED!', '#ff5c5c', 13);
      hitFx.burst(r.x, r.y, 22, {
        colors: ['#ff5c5c', '#ffffff', '#3a3a42'], speedMin: 70, speedMax: 220, lifeMin: 0.25, lifeMax: 0.5,
        sizeMin: 1.5, sizeMax: 3.5, gravity: 100,
      });
      r.active = false;
      loseLife();
      return;
    } else {
      sfx('bounce');
      popup(r.x, r.y - 16, 'INCOMPLETE', '#e8ecff', 11);
      r.active = false;
      downsLeft--;
      if (downsLeft <= 0) {
        loseLife();
        return;
      }
      popup(player.x, player.y - 30, `DOWN ${totalDowns - downsLeft + 1}/${totalDowns}`, '#e8ecff', 10);
      startDown();
    }
  }

  // A quick tap (instead of a hold) hands off to the RB: control switches
  // to him immediately and the rest of the down plays out exactly like a
  // normal run (juke/tackle/touchdown, unchanged).
  function doHandoff() {
    if (!rb || !rb.active) return;
    sfx('select');
    dustFx.burst(player.x, player.y, 6, {
      colors: ['#d8c090', '#c8a870'], speedMin: 20, speedMax: 70, lifeMin: 0.15, lifeMax: 0.3,
      sizeMin: 1.5, sizeMax: 3, gravity: 40,
    });
    popup(rb.x, rb.y - 14, 'HANDOFF', '#e8ecff', 9);
    player.x = rb.x;
    player.y = rb.y;
    player.role = 'runner';
    player.facing = { dx: 1, dy: 0 };
    player.grace = POST_TACKLE_GRACE * 0.6;
    rb.active = false;
    receivers.forEach((r) => { r.active = false; });
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
      currentLOS = 0;
      elapsed = 0;
      standPulse = 0;
      screenFlash = 0;
      dustTimer = 0;
      celebrating = 0;
      prevSpace = false;
      player = { x: currentLOS, y: FIELD_CY, w: PLAYER_R, role: 'qb', jukeTimer: 0, jukeCooldown: 0, jukeCloseCall: false, grace: 0, hitFlash: 0, facing: { dx: 1, dy: 0 }, runPhase: 0 };
      dustFx.clear();
      hitFx.clear();
      floatText.clear();
      initWeather();
      startDown();
      cameraX = player.x - W * 0.38;
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

      // While the ball is in the air, everyone but the receivers/defenders
      // is frozen (you released the throw, now watch it resolve) - coverage
      // is judged the instant the ball arrives, not at the moment it left
      // your hands.
      if (ball.mode === 'inflight') {
        updateFieldActors(dt);
        prevSpace = isDown('Space'); // keep tracking so releasing mid-flight can't fire a phantom action once control resumes
        ball.t += dt / ball.duration;
        if (ball.t >= 1) {
          ball.t = 1;
          resolvePass();
        }
        return;
      }

      const charging = player.role === 'qb' && passCharging;
      const upPressed = isDown('ArrowUp', 'w');
      const downPressed = isDown('ArrowDown', 's');

      let mvx = 0, mvy = 0;
      if (!charging) {
        if (isDown('ArrowLeft', 'a')) mvx -= 1;
        if (isDown('ArrowRight', 'd')) mvx += 1;
        if (upPressed) mvy -= 1;
        if (downPressed) mvy += 1;
        const keyboardActive = mvx !== 0 || mvy !== 0;
        if (keyboardActive) {
          const n = normalize(mvx, mvy);
          player.facing = n;
          mvx = n.dx; mvy = n.dy;
        } else if (api.mouseDown) {
          // Click-and-hold: steer toward the cursor. Mouse coords are canvas-
          // space (0-640 x 0-480); the world is only scrolled horizontally
          // (ctx.translate(-cameraX, 0)), so undo that on x to get world-space,
          // then feed the same normalize()/facing pipeline the keyboard uses.
          const targetX = api.mouseX + cameraX;
          const targetY = api.mouseY;
          const toTarget = normalize(targetX - player.x, targetY - player.y);
          const dist = Math.hypot(targetX - player.x, targetY - player.y);
          if (dist > 2) {
            player.facing = toTarget;
            mvx = toTarget.dx; mvy = toTarget.dy;
          }
        }
      } else {
        // Surveying the field: the QB is planted, so the d-pad's up/down
        // cycles which active receiver is highlighted instead of moving him
        // (left/right could still nudge him in the pocket, but simplest and
        // clearest is to freeze entirely while reading coverage). Mouse
        // users highlight by Y position instead, no button-cycling needed.
        const activeIdxs = receivers.map((r, i) => (r.active ? i : -1)).filter((i) => i >= 0);
        if (activeIdxs.length > 1) {
          if (upPressed && !prevUp) {
            const pos = activeIdxs.indexOf(highlightIdx);
            highlightIdx = activeIdxs[(pos - 1 + activeIdxs.length) % activeIdxs.length];
          } else if (downPressed && !prevDown) {
            const pos = activeIdxs.indexOf(highlightIdx);
            highlightIdx = activeIdxs[(pos + 1) % activeIdxs.length];
          } else if (api.mouseActive) {
            let best = highlightIdx, bestDist = Infinity;
            activeIdxs.forEach((i) => {
              const d = Math.abs(receivers[i].y - api.mouseY);
              if (d < bestDist) { bestDist = d; best = i; }
            });
            highlightIdx = best;
          }
        }
      }
      prevUp = upPressed;
      prevDown = downPressed;

      // Tap Space to hand off; hold it and release to throw instead (only
      // while still the QB - once the ball's been handed off or caught,
      // Space goes back to being a plain juke). Both live on the same
      // button across keyboard/mouse/touch - a quick tap never has time to
      // cross PASS_HOLD_THRESHOLD, so the handoff still feels instant.
      const spacePressed = isDown('Space');
      if (spacePressed && !prevSpace) {
        passCharging = player.role === 'qb';
        spaceHoldTimer = 0;
      }
      if (spacePressed && passCharging) {
        spaceHoldTimer += dt;
      }
      if (!spacePressed && prevSpace) {
        if (player.role === 'qb' && passCharging) {
          passCharging = false;
          if (spaceHoldTimer >= PASS_HOLD_THRESHOLD && receivers[highlightIdx] && receivers[highlightIdx].active) {
            startPass(highlightIdx);
          } else {
            doHandoff();
          }
        } else if (player.role !== 'qb' && player.jukeCooldown <= 0) {
          player.jukeTimer = JUKE_DURATION;
          player.jukeCooldown = JUKE_COOLDOWN;
          player.jukeCloseCall = false;
          sfx('coin');
          shake(0.08, 1.5);
          dustFx.burst(player.x, player.y + 6, 10, {
            colors: ['#d8c090', '#c8a870'], speedMin: 40, speedMax: 140, lifeMin: 0.2, lifeMax: 0.4,
            sizeMin: 2, sizeMax: 4, gravity: 60,
          });
        }
      }
      prevSpace = spacePressed;
      player.jukeTimer = Math.max(0, player.jukeTimer - dt);

      // the pass/handoff may have just resolved - stop this frame's
      // movement/tackle processing immediately so it isn't applied twice.
      if (ball.mode === 'inflight') return;

      const juking = player.role !== 'qb' && player.jukeTimer > 0;
      const roleMul = player.role === 'qb' ? QB_SCRAMBLE_MULT : 1;
      const speedMul = (juking ? JUKE_SPEED_MULT : 1) * theme.slow * roleMul;
      player.x += mvx * PLAYER_SPEED * speedMul * dt;
      player.y += mvy * PLAYER_SPEED * speedMul * dt + theme.wind * dt;
      player.y = clamp(player.y, FIELD_TOP + PLAYER_R, FIELD_BOTTOM - PLAYER_R);
      player.x = clamp(player.x, -30, fieldLength + ENDZONE_DEPTH - PLAYER_R);

      // turf trail while moving; juking leaves a heavier, longer afterimage.
      dustTimer -= dt;
      const moving = mvx !== 0 || mvy !== 0;
      if (moving) player.runPhase += dt * (juking ? 20 : 12);
      if (moving && dustTimer <= 0) {
        dustTimer = juking ? 0.02 : 0.06;
        dustFx.spawn(player.x - mvx * 6, player.y - mvy * 6 + 6, {
          vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 15, life: 0.3 + Math.random() * 0.15,
          size: juking ? 3 + Math.random() * 2 : 2 + Math.random() * 1.5,
          color: theme.ambient === 'snow' ? 'rgba(255,255,255,0.55)' : 'rgba(120,90,50,0.4)',
        });
      }
      if (juking) {
        trail.push({ x: player.x, y: player.y, facing: player.facing, life: 0.22, runPhase: player.runPhase });
        if (trail.length > 8) trail.shift();
      }
      trail.forEach((t) => { t.life -= dt; });
      trail = trail.filter((t) => t.life > 0);

      // O-line/D-line/RB/receiver updates (shared with the ball-in-flight
      // path above, so coverage keeps evolving during a pass too).
      updateFieldActors(dt);

      // reward a well-timed juke: slipping a defender at close range while
      // immune is the signature "nasty move" moment, so call it out with its
      // own small bonus - distinct from the tackle/touchdown feedback.
      if (juking && !player.jukeCloseCall) {
        for (const d of defenders) {
          if (!d.alive) continue;
          if (Math.hypot(d.x - player.x, d.y - player.y) < CLOSE_CALL_DIST) {
            player.jukeCloseCall = true;
            const bonus = 15 + Math.round(cfg.defenderSpeed * 0.15);
            addScore(bonus);
            popup(player.x, player.y - 18, `JUKED OUT! +${bonus}`, '#4fe3d0', 10);
            hitFx.burst(player.x, player.y, 8, {
              colors: ['#4fe3d0', '#ffffff'], speedMin: 40, speedMax: 120, lifeMin: 0.15, lifeMax: 0.3,
              sizeMin: 1.5, sizeMax: 3, gravity: 0,
            });
            break;
          }
        }
      }

      // tackle check (a sack, if the QB still has the ball)
      if (player.grace <= 0 && !juking) {
        for (const d of defenders) {
          if (!d.alive) continue;
          if (Math.hypot(d.x - player.x, d.y - player.y) < TACKLE_DIST) {
            const wasQb = player.role === 'qb';
            const yardsGained = Math.max(0, Math.round((player.x - currentLOS) / YARD_PX));
            player.hitFlash = 0.4;
            screenFlash = 0.4;
            shake(0.22, 5);
            sfx('hit');
            hitFx.burst(player.x, player.y, 14, {
              colors: ['#ffffff', '#ffd24f', '#ff9a4f'], speedMin: 60, speedMax: 200, lifeMin: 0.2, lifeMax: 0.4,
              sizeMin: 1.5, sizeMax: 3.5, gravity: 140,
            });
            popup(player.x, player.y - 14, wasQb ? 'SACKED!' : `+${yardsGained} YDS`, wasQb ? '#ff9a4f' : '#ffe08a', 11);
            addScore(yardsGained * 2);
            downsLeft--;
            currentLOS = Math.min(fieldLength, Math.max(0, player.x));
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
      if (player.x >= fieldLength + ENDZONE_DEPTH * 0.55) {
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

      cameraX = clamp(player.x - W * 0.38, -30, Math.max(-30, fieldLength + ENDZONE_DEPTH - W * 0.62));
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, theme.sky[0], theme.sky[1]);

      if (theme.lights) {
        [H * 0.08, H * 0.92].forEach((ly) => {
          const grad = ctx.createRadialGradient(10, ly, 4, 10, ly, 220);
          grad.addColorStop(0, 'rgba(255,244,210,0.5)');
          grad.addColorStop(1, 'rgba(255,244,210,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(10, ly, 220, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // stands (fixed screen space, flanking the field top/bottom)
      [{ y0: 0, y1: FIELD_TOP }, { y0: FIELD_BOTTOM, y1: H }].forEach((band) => {
        FX.gradientRect(ctx, 0, band.y0, W, band.y1 - band.y0, FX.shade(theme.crowd, -10), FX.shade(theme.crowd, -35));
        const pulse = standPulse > 0 ? Math.sin(elapsed * 24) * 2 * standPulse : 0;
        ctx.fillStyle = standPulse > 0 ? FX.shade(theme.crowd, 45) : FX.shade(theme.crowd, 15);
        for (let cx = 8; cx < W; cx += 26) {
          const colOffset = Math.round(cx / 26) % 2 === 0 ? 0 : 6;
          for (let cy = band.y0 + 8 + colOffset; cy < band.y1 - 6; cy += 13) {
            const bob = Math.sin(elapsed * 3 + cx * 0.4 + cy) * 1.2 + pulse;
            ctx.beginPath();
            ctx.arc(cx + bob, cy, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, FIELD_TOP, W, FIELD_H);
      ctx.clip();
      ctx.translate(-cameraX, 0);

      // grass, with a proper goal-to-back turf gradient running along the
      // play direction (x) rather than sideline-to-sideline.
      const grassGrad = ctx.createLinearGradient(-20, 0, fieldLength + ENDZONE_DEPTH + 40, 0);
      grassGrad.addColorStop(0, theme.grass[1]);
      grassGrad.addColorStop(1, theme.grass[0]);
      ctx.fillStyle = grassGrad;
      ctx.fillRect(-20, FIELD_TOP, fieldLength + ENDZONE_DEPTH + 60, FIELD_H);
      // subtle mown stripes every 2 yards
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let x = 0; x < fieldLength; x += YARD_PX * 4) ctx.fillRect(x, FIELD_TOP, YARD_PX * 2, FIELD_H);

      // end zone
      const ez = ctx.createLinearGradient(fieldLength, 0, fieldLength + ENDZONE_DEPTH, 0);
      ez.addColorStop(0, FX.shade(theme.grass[0], -20));
      ez.addColorStop(1, FX.shade(theme.grass[0], 10));
      ctx.fillStyle = ez;
      ctx.fillRect(fieldLength, FIELD_TOP, ENDZONE_DEPTH, FIELD_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fieldLength, FIELD_TOP); ctx.lineTo(fieldLength, FIELD_BOTTOM);
      ctx.stroke();
      ctx.save();
      ctx.translate(fieldLength + ENDZONE_DEPTH / 2, FIELD_CY);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('END ZONE', 0, 5);
      ctx.restore();

      // yard lines + numbers
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (let yardsFromGoal = 0; yardsFromGoal <= cfg.driveYards + 2; yardsFromGoal += 5) {
        const x = fieldLength - yardsFromGoal * YARD_PX;
        const major = yardsFromGoal % 10 === 0;
        ctx.globalAlpha = major ? 0.5 : 0.28;
        ctx.beginPath();
        ctx.moveTo(x, FIELD_TOP); ctx.lineTo(x, FIELD_BOTTOM);
        ctx.stroke();
        if (major && yardsFromGoal > 0) {
          const label = String(Math.min(yardsFromGoal, Math.abs(cfg.driveYards - yardsFromGoal)));
          ctx.fillText(label, x, FIELD_TOP + 13);
          ctx.fillText(label, x, FIELD_BOTTOM - 5);
        }
      }
      ctx.globalAlpha = 1;

      // current line of scrimmage marker
      ctx.strokeStyle = '#ffd24f';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(currentLOS, FIELD_TOP); ctx.lineTo(currentLOS, FIELD_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);

      dustFx.draw(ctx);

      // juke afterimage trail
      trail.forEach((t) => {
        const a = Math.max(0, t.life / 0.22) * 0.35;
        drawRunner(ctx, t.x, t.y, t.facing, a, '#7fb8d8', '#d9b98a', t.runPhase, PLAYER_R, 20);
      });

      // offensive line: faces whoever they're seeking/engaging, with a
      // faster struggle-jitter while actively holding a block
      ol.forEach((o, i) => {
        const bob = Math.sin(o.bob) * (o.engaged ? 1.1 : 0.6);
        drawRunner(ctx, o.x, o.y + bob, o.facing, 1, '#1e5a8a', '#e8ecf4', o.bob, OL_R, 60 + i * 4);
      });

      // defenders (D-line + coverage) - a small flash marks anyone
      // currently blocked/engaged by the O-line
      defenders.forEach((d) => {
        if (!d.alive) return;
        const bob = Math.sin(d.bob) * 1.2;
        const facing = { dx: Math.cos(d.angle), dy: Math.sin(d.angle) };
        drawRunner(ctx, d.x, d.y + bob, facing, 1, '#a83a3a', '#3a2a24', d.bob * 2.2, DEFENDER_R, d.isLine ? 90 : 55);
        if (d.reaction > 0 || d.blocked) {
          ctx.fillStyle = d.blocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,220,120,0.85)';
          ctx.beginPath();
          ctx.arc(d.x, d.y + bob - 16, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // running back - available for an instant handoff until the QB
      // commits to a pass (or already has)
      if (rb && rb.active) {
        const rbob = Math.sin(rb.runPhase * 0.5) * 1;
        drawRunner(ctx, rb.x, rb.y + rbob, { dx: 1, dy: 0 }, 1, '#3a7ec8', '#e8ecf4', rb.runPhase, RB_R, 28);
      }

      // receivers - a ring shows open (green) vs covered (red); the
      // currently-highlighted target (while surveying) gets a thicker ring
      // and a small marker above him so the read is unambiguous.
      receivers.forEach((r, i) => {
        if (!r.active) return;
        const rbob = Math.sin(r.runPhase * 0.5) * 1;
        drawRunner(ctx, r.x, r.y + rbob, { dx: 1, dy: 0 }, 1, '#3a7ec8', '#e8ecf4', r.runPhase, RECEIVER_R, r.number);
        const isHi = player.role === 'qb' && passCharging && i === highlightIdx;
        ctx.strokeStyle = r.open ? 'rgba(107,255,107,0.85)' : 'rgba(255,92,92,0.85)';
        ctx.lineWidth = isHi ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.arc(r.x, r.y + rbob, RECEIVER_R + (isHi ? 7 : 5), 0, Math.PI * 2);
        ctx.stroke();
        if (isHi) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(r.x, r.y + rbob - RECEIVER_R - 11);
          ctx.lineTo(r.x - 3, r.y + rbob - RECEIVER_R - 16);
          ctx.lineTo(r.x + 3, r.y + rbob - RECEIVER_R - 16);
          ctx.closePath();
          ctx.fill();
        }
      });

      // player (whoever currently has the ball - QB, RB, or a receiver
      // after a catch)
      const flashOn = player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0;
      const jukeGlow = player.jukeTimer > 0;
      drawRunner(ctx, player.x, player.y, player.facing, 1, flashOn ? '#ff5c5c' : (jukeGlow ? '#ffe08a' : '#2a6fa8'), '#e8ecf4', player.runPhase, PLAYER_R, player.role === 'qb' ? 12 : 20);

      // the football itself: a spinning dot arcing between passer and
      // receiver while thrown, or tucked at the carrier's side otherwise.
      if (ball.mode === 'inflight' && receivers[ball.targetIdx]) {
        const target = receivers[ball.targetIdx];
        const t = ball.t;
        const bx = ball.fromX + (target.x - ball.fromX) * t;
        const by = ball.fromY + (target.y - ball.fromY) * t;
        const lift = Math.sin(Math.PI * t) * ball.arc;
        FX.shadow(ctx, bx, by + 4, 3, 1.5, 0.3);
        ctx.save();
        ctx.translate(bx, by - lift);
        ctx.rotate(elapsed * 16);
        ctx.fillStyle = '#7a4020';
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0);
        ctx.stroke();
        ctx.restore();
      } else {
        const bx = player.x - player.facing.dy * 6 + player.facing.dx * 2;
        const by = player.y + player.facing.dx * 6 + player.facing.dy * 2;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.atan2(player.facing.dy, player.facing.dx));
        ctx.fillStyle = '#7a4020';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-2, 0); ctx.lineTo(2, 0);
        ctx.stroke();
        ctx.restore();
      }

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
      const toGo = Math.max(0, Math.ceil((fieldLength - player.x) / YARD_PX));
      ctx.fillText(`TO GO: ${toGo} YDS`, W - 8, 14);
      ctx.textAlign = 'left';

      if (ball.mode === 'inflight') {
        ctx.fillStyle = 'rgba(79,227,208,0.85)';
        ctx.font = '8px monospace';
        ctx.fillText('BALL IN THE AIR...', 8, H - 8);
      } else if (player.role === 'qb' && passCharging) {
        const hi = receivers[highlightIdx];
        const label = hi ? `${hi.label} (${hi.open ? 'OPEN' : 'COVERED'})` : '';
        ctx.fillStyle = hi && hi.open ? 'rgba(107,255,107,0.9)' : 'rgba(255,146,79,0.9)';
        ctx.font = '8px monospace';
        ctx.fillText(`▲▼ TARGET: ${label}`, 8, H - 8);
      } else if (player.role === 'qb') {
        ctx.fillStyle = 'rgba(255,210,79,0.8)';
        ctx.font = '8px monospace';
        ctx.fillText('TAP: HANDOFF • HOLD: PASS', 8, H - 8);
      } else if (player.jukeTimer <= 0) {
        const jukeLabel = player.jukeCooldown > 0 ? 'JUKE RECHARGING' : 'TAP: JUKE';
        ctx.fillStyle = player.jukeCooldown > 0 ? 'rgba(232,236,255,0.5)' : 'rgba(255,210,79,0.8)';
        ctx.font = '8px monospace';
        ctx.fillText(jukeLabel, 8, H - 8);
      }

      FX.scanlines(ctx, W, H, 0.05);
      FX.vignette(ctx, W, H, 0.32);
    },
  };

  // Top-down football player sprite: shadow, striding legs, pumping arms,
  // padded shoulders, a rounded-rectangle (not oval/circle) torso with a
  // number, a neck, a hint of chin/jaw peeking out, and a helmet with a
  // facemask cage - oriented toward `facing`. Shared by every position on
  // the field (their own jersey/helmet colors and numbers).
  function drawRunner(ctx, x, y, facing, alpha, bodyColor, helmetColor, runPhase, radius, number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = radius || PLAYER_R;
    const dx = facing ? facing.dx : 0, dy = facing ? facing.dy : -1;
    const perpX = -dy, perpY = dx;
    const stride = Math.sin(runPhase || 0);
    const skin = '#d9a978';
    const ang = Math.atan2(dy, dx);

    FX.shadow(ctx, x, y + 8, r * 0.95, 3, 0.35 * alpha);

    // striding legs, alternating fore/aft along the facing direction
    ctx.fillStyle = 'rgba(28,24,20,0.85)';
    [-1, 1].forEach((side) => {
      const legT = stride * side;
      const lx = x + perpX * r * 0.29 * side - dx * (r * 0.28 + legT * 2.5) * 0.6;
      const ly = y + perpY * r * 0.29 * side - dy * (r * 0.28 + legT * 2.5) * 0.6 + r * 0.6;
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.22, r * 0.36, ang, 0, Math.PI * 2);
      ctx.fill();
    });

    // shoulder pads, wider than the torso for a padded silhouette
    const padColor = FX.shade(bodyColor, -18);
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(x + perpX * r * 0.71 * side, y + perpY * r * 0.71 * side, r * 0.4, r * 0.51, ang, 0, Math.PI * 2);
      ctx.fillStyle = padColor;
      ctx.fill();
    });

    // jersey torso: a rounded rectangle (not a circle/oval), for a less
    // "blobby" and more human silhouette, still lit like a real surface.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const tw = r * 2.0, th = r * 1.55;
    const torsoGrad = ctx.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2);
    torsoGrad.addColorStop(0, FX.shade(bodyColor, 45));
    torsoGrad.addColorStop(0.5, bodyColor);
    torsoGrad.addColorStop(1, FX.shade(bodyColor, -30));
    ctx.fillStyle = torsoGrad;
    FX.roundRectPath(ctx, -tw / 2, -th / 2, tw, th, r * 0.45);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    if (number != null) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(6, Math.round(r * 0.58))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), x, y + r * 0.05);
    }

    // pumping arms: drawn on top of the torso/pads so they clearly read as
    // reaching out from the shoulders, swinging opposite-phase to the
    // same-side leg (like an actual running gait) and reaching well past
    // the torso's own silhouette so they never get swallowed by it.
    ctx.strokeStyle = skin;
    ctx.lineWidth = Math.max(1.4, r * 0.22);
    ctx.lineCap = 'round';
    [-1, 1].forEach((side) => {
      const armSwing = -stride * side;
      const shoulderX = x + perpX * r * 0.66 * side + dx * r * 0.08;
      const shoulderY = y + perpY * r * 0.66 * side + dy * r * 0.08;
      const handX = shoulderX + dx * r * (0.85 + armSwing * 0.55) + perpX * r * 0.2 * side * armSwing;
      const handY = shoulderY + dy * r * (0.85 + armSwing * 0.55) + perpY * r * 0.2 * side * armSwing;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handX, handY);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';

    // neck: a short skin-toned strap connecting the torso to the helmet
    ctx.strokeStyle = skin;
    ctx.lineWidth = Math.max(1.5, r * 0.3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dx * r * 0.12, y + dy * r * 0.12);
    ctx.lineTo(x + dx * r * 0.3, y + dy * r * 0.3 - r * 0.18);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // helmet with a facemask cage and a center stripe
    const hx = x + dx * r * 0.33, hy = y + dy * r * 0.33 - r * 0.56;
    // a hint of chin/jaw peeking out below the facemask - the clearest
    // "there's a person in there" cue at this scale.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(hx + dx * r * 0.2, hy + dy * r * 0.2 + r * 0.32, r * 0.2, r * 0.15, ang, 0, Math.PI * 2);
    ctx.fill();
    FX.sphere(ctx, hx, hy, r * 0.54, helmetColor || '#d9b98a');
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx - dy * r * 0.47, hy + dx * r * 0.47);
    ctx.lineTo(hx + dy * r * 0.47, hy - dx * r * 0.47);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,18,16,0.8)';
    ctx.beginPath();
    ctx.arc(hx + dx * r * 0.27, hy + dy * r * 0.27, r * 0.22, Math.PI * 0.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(hx + dx * r * 0.56, hy + dy * r * 0.56, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
