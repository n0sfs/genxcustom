function createFroggerLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const CELL = 40;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const FROG_SIZE = 28;
  const FROG_OFF = (CELL - FROG_SIZE) / 2;
  const HOP_COOLDOWN = 0.13;
  const START_COL = 8, START_ROW = 11;
  const GOAL_ROW = 1;
  let GOAL_COLS = [2, 8, 13];

  const SPAN = W + 400;

  // --- Per-stage layouts -------------------------------------------------
  // Stage 1 keeps the original default lane speeds/layout. Stage 2 rearranges
  // lane widths/gaps and speeds things up with a tighter clock. Stage 3 goes
  // faster still and opens up an extra hazard lane on the median strip that
  // used to be a safe resting row. Stages 4-10 keep escalating speed,
  // density, goal-pad count and time pressure by hand, each with its own
  // time-of-day/weather palette, culminating in stage 10's fast multi-lane
  // finale. Stage 11+ ("endless") reuses stage 10's layout as a base and
  // smoothly scales speed/density/time with a cap so it never becomes
  // literally impossible.
  //
  // Safety invariant for every road/hazard lane in every stage below: a car
  // lane is a hard rects-overlap hazard, so the frog needs a real gap
  // (gap - w) at least as wide as itself to have any surviving spot at all.
  // We keep (gap - w) >= FROG_SIZE + 14 for every road/hazard lane (the same
  // per-lane-floor margin the endless-mode formula enforces below), so no
  // hand-built lane can ever be mathematically uncrossable.
  const STAGE_1 = {
    road: [
      { row: 10, speed: 70, dir: 1, gap: 170, w: 44 },
      { row: 9, speed: 100, dir: -1, gap: 200, w: 36 },
      { row: 8, speed: 60, dir: 1, gap: 150, w: 50 },
      { row: 7, speed: 130, dir: -1, gap: 220, w: 34 },
    ],
    river: [
      { row: 5, speed: 50, dir: 1, gap: 200, w: 110 },
      { row: 4, speed: 80, dir: -1, gap: 180, w: 70 },
      { row: 3, speed: 40, dir: 1, gap: 230, w: 140 },
      { row: 2, speed: 65, dir: -1, gap: 190, w: 90 },
    ],
    hazard: null,
    goalCols: [2, 8, 13],
    timeLimit: 25,
    theme: 'day',
  };
  const STAGE_2 = {
    road: [
      { row: 10, speed: 100, dir: -1, gap: 140, w: 40 },
      { row: 9, speed: 140, dir: 1, gap: 160, w: 40 },
      { row: 8, speed: 90, dir: -1, gap: 130, w: 56 },
      { row: 7, speed: 170, dir: 1, gap: 180, w: 30 },
    ],
    river: [
      { row: 5, speed: 75, dir: -1, gap: 170, w: 90 },
      { row: 4, speed: 110, dir: 1, gap: 150, w: 56 },
      { row: 3, speed: 60, dir: -1, gap: 190, w: 120 },
      { row: 2, speed: 95, dir: 1, gap: 160, w: 70 },
    ],
    hazard: null,
    goalCols: [1, 6, 10, 14],
    timeLimit: 20,
    theme: 'dusk',
  };
  const STAGE_3 = {
    road: [
      { row: 10, speed: 130, dir: 1, gap: 120, w: 40 },
      { row: 9, speed: 170, dir: -1, gap: 140, w: 38 },
      { row: 8, speed: 110, dir: 1, gap: 110, w: 54 },
      { row: 7, speed: 200, dir: -1, gap: 160, w: 28 },
    ],
    river: [
      { row: 5, speed: 95, dir: 1, gap: 150, w: 80 },
      { row: 4, speed: 140, dir: -1, gap: 130, w: 50 },
      { row: 3, speed: 80, dir: 1, gap: 170, w: 110 },
      { row: 2, speed: 120, dir: -1, gap: 140, w: 64 },
    ],
    // The median strip (row 6), a safe resting lane in stages 1-2, becomes a
    // fast single-direction hazard lane from stage 3 onward.
    hazard: { row: 6, speed: 160, dir: 1, gap: 130, w: 30 },
    goalCols: [1, 5, 8, 11, 14],
    timeLimit: 16,
    theme: 'night',
  };
  const STAGE_4 = {
    road: [
      { row: 10, speed: 150, dir: -1, gap: 127, w: 42 },
      { row: 9, speed: 190, dir: 1, gap: 123, w: 38 },
      { row: 8, speed: 128, dir: -1, gap: 141, w: 56 },
      { row: 7, speed: 218, dir: 1, gap: 115, w: 30 },
    ],
    river: [
      { row: 5, speed: 105, dir: -1, gap: 146, w: 82 },
      { row: 4, speed: 150, dir: 1, gap: 126, w: 52 },
      { row: 3, speed: 90, dir: -1, gap: 166, w: 112 },
      { row: 2, speed: 130, dir: 1, gap: 136, w: 66 },
    ],
    hazard: { row: 6, speed: 180, dir: -1, gap: 117, w: 32 },
    goalCols: [1, 4, 7, 10, 13],
    timeLimit: 15,
    theme: 'storm',
  };
  const STAGE_5 = {
    road: [
      { row: 10, speed: 165, dir: 1, gap: 122, w: 44 },
      { row: 9, speed: 205, dir: -1, gap: 118, w: 40 },
      { row: 8, speed: 142, dir: 1, gap: 136, w: 58 },
      { row: 7, speed: 232, dir: -1, gap: 110, w: 32 },
    ],
    river: [
      { row: 5, speed: 115, dir: 1, gap: 142, w: 84 },
      { row: 4, speed: 160, dir: -1, gap: 122, w: 54 },
      { row: 3, speed: 100, dir: 1, gap: 162, w: 114 },
      { row: 2, speed: 140, dir: -1, gap: 132, w: 68 },
    ],
    hazard: { row: 6, speed: 195, dir: 1, gap: 112, w: 34 },
    goalCols: [0, 3, 6, 9, 12, 15],
    timeLimit: 14,
    theme: 'dawn',
  };
  const STAGE_6 = {
    road: [
      { row: 10, speed: 180, dir: -1, gap: 118, w: 46 },
      { row: 9, speed: 220, dir: 1, gap: 114, w: 42 },
      { row: 8, speed: 155, dir: -1, gap: 132, w: 60 },
      { row: 7, speed: 248, dir: 1, gap: 106, w: 34 },
    ],
    river: [
      { row: 5, speed: 125, dir: -1, gap: 138, w: 86 },
      { row: 4, speed: 170, dir: 1, gap: 118, w: 56 },
      { row: 3, speed: 110, dir: -1, gap: 158, w: 116 },
      { row: 2, speed: 150, dir: 1, gap: 128, w: 70 },
    ],
    hazard: { row: 6, speed: 210, dir: -1, gap: 108, w: 36 },
    goalCols: [1, 4, 6, 9, 11, 14],
    timeLimit: 13,
    theme: 'blizzard',
  };
  const STAGE_7 = {
    road: [
      { row: 10, speed: 195, dir: 1, gap: 114, w: 48 },
      { row: 9, speed: 235, dir: -1, gap: 110, w: 44 },
      { row: 8, speed: 168, dir: 1, gap: 128, w: 62 },
      { row: 7, speed: 262, dir: -1, gap: 102, w: 36 },
    ],
    river: [
      { row: 5, speed: 135, dir: 1, gap: 134, w: 88 },
      { row: 4, speed: 180, dir: -1, gap: 114, w: 58 },
      { row: 3, speed: 120, dir: 1, gap: 154, w: 118 },
      { row: 2, speed: 160, dir: -1, gap: 124, w: 72 },
    ],
    hazard: { row: 6, speed: 225, dir: 1, gap: 104, w: 38 },
    goalCols: [0, 2, 5, 7, 10, 12, 15],
    timeLimit: 12.5,
    theme: 'neon',
  };
  const STAGE_8 = {
    road: [
      { row: 10, speed: 210, dir: -1, gap: 110, w: 50 },
      { row: 9, speed: 250, dir: 1, gap: 106, w: 46 },
      { row: 8, speed: 182, dir: -1, gap: 124, w: 64 },
      { row: 7, speed: 278, dir: 1, gap: 98, w: 38 },
    ],
    river: [
      { row: 5, speed: 145, dir: -1, gap: 130, w: 90 },
      { row: 4, speed: 190, dir: 1, gap: 110, w: 60 },
      { row: 3, speed: 130, dir: -1, gap: 150, w: 120 },
      { row: 2, speed: 170, dir: 1, gap: 120, w: 74 },
    ],
    hazard: { row: 6, speed: 240, dir: -1, gap: 100, w: 40 },
    goalCols: [1, 3, 6, 8, 10, 13, 15],
    timeLimit: 12,
    theme: 'aurora',
  };
  const STAGE_9 = {
    road: [
      { row: 10, speed: 225, dir: 1, gap: 107, w: 52 },
      { row: 9, speed: 265, dir: -1, gap: 103, w: 48 },
      { row: 8, speed: 195, dir: 1, gap: 121, w: 66 },
      { row: 7, speed: 292, dir: -1, gap: 95, w: 40 },
    ],
    river: [
      { row: 5, speed: 155, dir: 1, gap: 126, w: 92 },
      { row: 4, speed: 200, dir: -1, gap: 106, w: 62 },
      { row: 3, speed: 140, dir: 1, gap: 146, w: 122 },
      { row: 2, speed: 180, dir: -1, gap: 116, w: 76 },
    ],
    hazard: { row: 6, speed: 255, dir: 1, gap: 97, w: 42 },
    goalCols: [0, 2, 4, 6, 9, 11, 13, 15],
    timeLimit: 11.5,
    theme: 'eclipse',
  };
  const STAGE_10 = {
    road: [
      { row: 10, speed: 240, dir: -1, gap: 104, w: 54 },
      { row: 9, speed: 280, dir: 1, gap: 100, w: 50 },
      { row: 8, speed: 208, dir: -1, gap: 118, w: 68 },
      { row: 7, speed: 308, dir: 1, gap: 92, w: 42 },
    ],
    river: [
      { row: 5, speed: 165, dir: -1, gap: 122, w: 94 },
      { row: 4, speed: 210, dir: 1, gap: 102, w: 64 },
      { row: 3, speed: 150, dir: -1, gap: 142, w: 124 },
      { row: 2, speed: 190, dir: 1, gap: 112, w: 78 },
    ],
    // Fastest, tightest hazard lane of the hand-built run; still holds the
    // same comfortable-above-the-floor margin as every other stage below.
    hazard: { row: 6, speed: 270, dir: -1, gap: 94, w: 44 },
    goalCols: [0, 2, 4, 6, 7, 9, 11, 13, 15],
    timeLimit: 11,
    theme: 'inferno',
  };

  function getStageConfig(stage) {
    if (stage <= 1) return STAGE_1;
    if (stage === 2) return STAGE_2;
    if (stage === 3) return STAGE_3;
    if (stage === 4) return STAGE_4;
    if (stage === 5) return STAGE_5;
    if (stage === 6) return STAGE_6;
    if (stage === 7) return STAGE_7;
    if (stage === 8) return STAGE_8;
    if (stage === 9) return STAGE_9;
    if (stage === 10) return STAGE_10;

    // Endless mode: stage 10's layout (the hardest hand-built stage) scaled
    // smoothly harder still, capped so it never becomes unfair even deep
    // into a long run.
    const scale = Math.min(2.6, 1 + (stage - 10) * 0.12);
    // Road/hazard lanes are a hard rects-overlap hazard: the frog needs a
    // real gap (gap - w) at least as wide as itself to have any surviving
    // spot at all. A flat gap floor (independent of car width) used to let
    // wide-car lanes shrink below that threshold at high endless stages,
    // making the lane mathematically uncrossable forever after (the
    // "free" pocket between cars was narrower than the frog itself, so no
    // position/timing could ever avoid overlap). Floor the gap relative to
    // each lane's own car width instead, so a genuinely passable pocket
    // always exists no matter how deep the run goes.
    const scaleRoadLane = (l) => {
      const natural = l.gap / Math.sqrt(scale);
      const minGap = l.w + FROG_SIZE + 14;
      return { ...l, speed: l.speed * scale, gap: Math.max(minGap, natural) };
    };
    const scaleRiverLane = (l) => ({
      ...l,
      speed: l.speed * scale,
      gap: Math.max(70, l.gap / Math.sqrt(scale)),
    });
    return {
      road: STAGE_10.road.map(scaleRoadLane),
      river: STAGE_10.river.map(scaleRiverLane),
      hazard: STAGE_10.hazard ? scaleRoadLane(STAGE_10.hazard) : null,
      goalCols: STAGE_10.goalCols,
      timeLimit: Math.max(10, STAGE_10.timeLimit - (stage - 10) * 0.6),
      theme: STAGE_10.theme,
    };
  }

  // Cheap per-stage lighting pass: same terrain layout, different palette,
  // so each stage reads as "somewhere new" without redrawing anything.
  // Endless mode reuses stage 10's (inferno) theme since it reuses stage
  // 10's layout wholesale.
  const THEMES = {
    day: {
      sky: ['#0f4a20', '#08260f'],
      bank: ['#25804a', '#164e2c'],
      water: ['#2a6aba', '#123a6a'],
      median: ['#357d3a', '#1c4a20'],
      road: ['#3a3a3a', '#1c1c1c'],
      start: ['#357d3a', '#1c4a20'],
    },
    dusk: {
      sky: ['#4a3420', '#24170d'],
      bank: ['#7a5a2a', '#4a3418'],
      water: ['#4a3a7a', '#221a3e'],
      median: ['#6a4a24', '#3a2712'],
      road: ['#4a3a3a', '#241c1c'],
      start: ['#6a4a24', '#3a2712'],
    },
    night: {
      sky: ['#0a1a2a', '#050d14'],
      bank: ['#123a4a', '#0a1c24'],
      water: ['#0a1a3a', '#04091c'],
      median: ['#123018', '#08170c'],
      road: ['#1c1c2a', '#0c0c14'],
      start: ['#123a24', '#081c12'],
    },
    storm: {
      sky: ['#3a4a5a', '#1c242c'],
      bank: ['#4a5a6a', '#242c34'],
      water: ['#2a3a5a', '#12182a'],
      median: ['#3a4a3a', '#1c241c'],
      road: ['#2a2a32', '#141418'],
      start: ['#3a4a3a', '#1c241c'],
    },
    dawn: {
      sky: ['#ff8a5a', '#7a2a4a'],
      bank: ['#c47a4a', '#6a3a20'],
      water: ['#3a5a9a', '#1a2a4a'],
      median: ['#5a7a3a', '#2a3a1a'],
      road: ['#3a2a3a', '#1a121a'],
      start: ['#5a7a3a', '#2a3a1a'],
    },
    blizzard: {
      sky: ['#c8dced', '#7a9ab0'],
      bank: ['#d8e8f5', '#a0c0d5'],
      water: ['#7aa8d0', '#3a5a80'],
      median: ['#c8e0e8', '#8aa8b5'],
      road: ['#5a6a75', '#2a343c'],
      start: ['#c8e0e8', '#8aa8b5'],
    },
    neon: {
      sky: ['#0a0a2a', '#050514'],
      bank: ['#2a0a4a', '#12051e'],
      water: ['#0a2a4a', '#03101e'],
      median: ['#3a0a4a', '#170520'],
      road: ['#1a0a2a', '#0a0512'],
      start: ['#3a0a4a', '#170520'],
    },
    aurora: {
      sky: ['#0a2a2a', '#03100f'],
      bank: ['#0a3a2a', '#031c14'],
      water: ['#123a5a', '#08182a'],
      median: ['#123a2a', '#061c14'],
      road: ['#1a2a2a', '#0a1414'],
      start: ['#123a2a', '#061c14'],
    },
    eclipse: {
      sky: ['#2a0a0a', '#0f0303'],
      bank: ['#3a1414', '#180606'],
      water: ['#1a0a2a', '#0a040f'],
      median: ['#2a1414', '#100808'],
      road: ['#1a0a0a', '#0a0404'],
      start: ['#2a1414', '#100808'],
    },
    inferno: {
      sky: ['#5a1a0a', '#2a0a03'],
      bank: ['#7a2a0a', '#3a1204'],
      water: ['#3a0a1a', '#18040c'],
      median: ['#5a2a0a', '#2a1204'],
      road: ['#2a1010', '#120606'],
      start: ['#5a2a0a', '#2a1204'],
    },
  };

  function wrap(x) {
    let v = (x + 200) % SPAN;
    if (v < 0) v += SPAN;
    return v - 200;
  }

  function makeLaneEntities(lanes) {
    return lanes.map((lane) => {
      const count = Math.ceil(SPAN / lane.gap) + 1;
      const items = [];
      for (let i = 0; i < count; i++) {
        items.push({ x: -200 + i * lane.gap, y: lane.row * CELL + 6, w: lane.w, h: CELL - 12 });
      }
      return { ...lane, items };
    });
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  let TIME_LIMIT = 25;
  let frog, prevKeys, hopTimer, roads, rivers, goalsFilled, bestRow, timeLeft, fly, flyTimer, flyLife, waterTime, speedMul, nearMissTimer, hasHazardLane, theme;

  function drawFrog(ctx, f) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    FX.shadow(ctx, cx, f.y + f.h + 2, f.w / 2, 3, 0.25);
    ctx.fillStyle = '#2a6a2a';
    ctx.beginPath();
    ctx.ellipse(f.x + 3, f.y + f.h - 3, 4, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(f.x + f.w - 3, f.y + f.h - 3, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,30,10,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#3aa33a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, f.w / 2, f.h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    const frogGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, f.w / 2);
    frogGrad.addColorStop(0, FX.shade('#5fd45f', 30));
    frogGrad.addColorStop(0.7, '#5fd45f');
    frogGrad.addColorStop(1, FX.shade('#5fd45f', -18));
    ctx.fillStyle = frogGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, f.w / 2 - 1, f.h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,30,10,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // pale belly highlight patch for extra roundness
    ctx.fillStyle = 'rgba(210,255,190,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, f.w / 2 - 6, f.h / 2 - 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5fd45f';
    ctx.beginPath();
    ctx.arc(cx - 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,30,10,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx - 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, f.y + 4, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#0f2a0f';
    ctx.beginPath();
    ctx.arc(cx - 6, f.y + 4, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + 6, f.y + 4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // eye-shine specular glint
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx - 7, f.y + 2.5, 0.9, 0, Math.PI * 2);
    ctx.arc(cx + 5, f.y + 2.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(ctx, c, dir) {
    FX.bevelBlock(ctx, c.x, c.y + 2, c.w, c.h - 4, '#ff4fa3', 3);
    FX.roundRectPath(ctx, c.x, c.y + 2, c.w, c.h - 4, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // glassy windshield with a lit-glass gradient + highlight streak
    const glassGrad = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
    glassGrad.addColorStop(0, '#6a8aa8');
    glassGrad.addColorStop(0.45, '#1a2430');
    glassGrad.addColorStop(1, '#0a1218');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(c.x + c.w * 0.2, c.y + 3, c.w * 0.6, c.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(c.x + c.w * 0.24, c.y + 4, c.w * 0.1, c.h - 8);

    // chrome trim on the leading edge (direction of travel)
    const frontX = dir >= 0 ? c.x + c.w - 3 : c.x;
    FX.chrome(ctx, frontX, c.y + 2, 3, c.h - 4);

    ctx.fillStyle = '#ffe38a';
    ctx.fillRect(c.x, c.y + 1, 3, 2);
    ctx.fillRect(c.x + c.w - 3, c.y + 1, 3, 2);
  }

  return {
    init(stage = 1) {
      const cfg = getStageConfig(stage);
      GOAL_COLS = cfg.goalCols;
      TIME_LIMIT = cfg.timeLimit;
      hasHazardLane = !!cfg.hazard;
      theme = THEMES[cfg.theme] || THEMES.day;

      frog = { col: START_COL, row: START_ROW, x: START_COL * CELL + FROG_OFF, y: START_ROW * CELL + FROG_OFF, w: FROG_SIZE, h: FROG_SIZE };
      prevKeys = {};
      hopTimer = 0;
      roads = makeLaneEntities(cfg.hazard ? [...cfg.road, cfg.hazard] : cfg.road);
      rivers = makeLaneEntities(cfg.river);
      goalsFilled = GOAL_COLS.map(() => false);
      bestRow = START_ROW;
      timeLeft = TIME_LIMIT;
      fly = null;
      flyTimer = 3 + Math.random() * 4;
      flyLife = 0;
      waterTime = 0;
      speedMul = 1;
      nearMissTimer = 0;
    },

    update(dt) {
      hopTimer = Math.max(0, hopTimer - dt);

      timeLeft -= dt;
      if (timeLeft <= 0) {
        loseLife();
        return;
      }

      if (!fly) {
        flyTimer -= dt;
        if (flyTimer <= 0) {
          fly = { col: 1 + Math.floor(Math.random() * (COLS - 2)), row: 6 };
          flyLife = 4.5;
        }
      } else {
        flyLife -= dt;
        if (flyLife <= 0) {
          fly = null;
          flyTimer = 5 + Math.random() * 5;
        }
      }

      roads.forEach((lane) => lane.items.forEach((c) => { c.x = wrap(c.x + lane.dir * lane.speed * speedMul * dt); }));
      rivers.forEach((lane) => lane.items.forEach((l) => { l.x = wrap(l.x + lane.dir * lane.speed * speedMul * dt); }));

      const keyMap = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
      const justPressed = {};
      Object.keys(keyMap).forEach((k) => {
        const down = isDown(k);
        justPressed[keyMap[k]] = justPressed[keyMap[k]] || (down && !prevKeys[k]);
        prevKeys[k] = down;
      });

      if (hopTimer <= 0) {
        let dcol = 0, drow = 0;
        if (justPressed.up) drow = -1;
        else if (justPressed.down) drow = 1;
        else if (justPressed.left) dcol = -1;
        else if (justPressed.right) dcol = 1;
        if (dcol || drow) {
          const newCol = Math.max(0, Math.min(COLS - 1, frog.col + dcol));
          const newRow = Math.max(GOAL_ROW, Math.min(START_ROW, frog.row + drow));
          // Hopping onto an already-filled goal pad used to be an instant death,
          // which felt cheap after a long, careful crossing. Just bounce back instead;
          // only landing between pads (the water gap) still kills you.
          let blockedByFilledPad = false;
          if (newRow === GOAL_ROW) {
            const targetCenterX = newCol * CELL + CELL / 2;
            const slotIdx = GOAL_COLS.findIndex((gc) => Math.abs(targetCenterX - (gc * CELL + CELL / 2)) < CELL * 0.4);
            if (slotIdx !== -1 && goalsFilled[slotIdx]) blockedByFilledPad = true;
          }
          if (blockedByFilledPad) {
            hopTimer = HOP_COOLDOWN;
            sfx('bounce');
          } else {
            frog.col = newCol;
            frog.row = newRow;
            frog.x = frog.col * CELL + FROG_OFF;
            frog.y = frog.row * CELL + FROG_OFF;
            hopTimer = HOP_COOLDOWN;
            sfx('hop');
            if (frog.row < bestRow) {
              bestRow = frog.row;
              addScore(2);
            }
            if (fly && fly.col === frog.col && fly.row === frog.row) {
              fly = null;
              flyTimer = 5 + Math.random() * 5;
              addScore(15);
              sfx('pickup');
            }
          }
        }
      }

      nearMissTimer = Math.max(0, nearMissTimer - dt);
      const roadLane = roads.find((l) => l.row === frog.row);
      if (roadLane) {
        for (const c of roadLane.items) {
          if (rectsOverlap(frog, c)) {
            loseLife();
            return;
          }
        }
        // Juice: a little screen-shake + sfx when a car whizzes past within a
        // hair of the frog but doesn't connect, to sell the near-miss.
        if (nearMissTimer <= 0) {
          for (const c of roadLane.items) {
            const gap = c.x >= frog.x ? c.x - (frog.x + frog.w) : frog.x - (c.x + c.w);
            if (gap >= 0 && gap < 6) {
              shake(0.06, 2);
              sfx('bounce');
              nearMissTimer = 0.5;
              break;
            }
          }
        }
      }

      const riverLane = rivers.find((l) => l.row === frog.row);
      if (riverLane) {
        const log = riverLane.items.find((l) => frog.x + frog.w / 2 > l.x && frog.x + frog.w / 2 < l.x + l.w);
        if (!log) {
          loseLife();
          return;
        }
        frog.x += riverLane.dir * riverLane.speed * speedMul * dt;
        if (frog.x < -frog.w || frog.x > W) {
          loseLife();
          return;
        }
      }

      if (frog.row === GOAL_ROW) {
        const centerX = frog.x + frog.w / 2;
        const slotIdx = GOAL_COLS.findIndex((gc) => Math.abs(centerX - (gc * CELL + CELL / 2)) < CELL * 0.4);
        if (slotIdx === -1 || goalsFilled[slotIdx]) {
          loseLife();
          return;
        }
        goalsFilled[slotIdx] = true;
        // Base pad score plus a classic Frogger-style quick-crossing time bonus
        // so racing across is rewarded, not just surviving.
        const timeBonus = Math.round(Math.max(0, timeLeft));
        addScore(20 + timeBonus);
        sfx('pickup');
        frog.col = START_COL; frog.row = START_ROW;
        frog.x = frog.col * CELL + FROG_OFF; frog.y = frog.row * CELL + FROG_OFF;
        bestRow = START_ROW;
        timeLeft = TIME_LIMIT;
        // Escalating difficulty: traffic and river currents pick up pace with
        // each pad filled, capped so the final pad stays fair, not brutal.
        speedMul = Math.min(1.5, speedMul + 0.08);
        if (goalsFilled.every(Boolean)) {
          winLevel(50);
        }
      }
    },

    draw(ctx) {
      waterTime += 1 / 60;

      FX.gradientRect(ctx, 0, 0, W, GOAL_ROW * CELL + CELL, theme.sky[0], theme.sky[1]);

      FX.gradientRect(ctx, 0, GOAL_ROW * CELL, W, CELL, theme.bank[0], theme.bank[1]);
      GOAL_COLS.forEach((gc, i) => {
        const gcx = gc * CELL + CELL / 2, gcy = GOAL_ROW * CELL + CELL / 2;
        FX.shadow(ctx, gcx, gcy + 12, 15, 3, 0.2);
        const padGrad = ctx.createRadialGradient(gcx - 4, gcy - 4, 2, gcx, gcy, 15);
        if (goalsFilled[i]) {
          padGrad.addColorStop(0, '#c8ffc8'); padGrad.addColorStop(1, '#3fae3f');
        } else {
          padGrad.addColorStop(0, '#4a7ecf'); padGrad.addColorStop(1, '#123a6a');
        }
        ctx.fillStyle = padGrad;
        ctx.beginPath();
        ctx.arc(gcx, gcy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      FX.gradientRect(ctx, 0, 2 * CELL, W, 4 * CELL, theme.water[0], theme.water[1]);
      // water-ripple texture: a handful of drifting highlight arcs, cheap per frame
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      for (let ry = 2; ry < 6; ry++) {
        const rowY = ry * CELL;
        for (let i = 0; i < 3; i++) {
          const phase = waterTime * 22 + i * 47 + ry * 31;
          const rx = (phase % (W + 60)) - 30;
          ctx.beginPath();
          ctx.moveTo(rx, rowY + 10 + i * 9);
          ctx.quadraticCurveTo(rx + 15, rowY + 6 + i * 9, rx + 30, rowY + 10 + i * 9);
          ctx.stroke();
        }
      }
      rivers.forEach((lane) => {
        lane.items.forEach((l) => {
          FX.shadow(ctx, l.x + l.w / 2, l.y + l.h - 2, l.w / 2, 4, 0.2);
          FX.bevelBlock(ctx, l.x, l.y, l.w, l.h, '#8a5a2a', 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          FX.roundRectPath(ctx, l.x, l.y, l.w, l.h, 3);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let gx = l.x + 6; gx < l.x + l.w - 4; gx += 10) ctx.fillRect(gx, l.y + 3, 2, l.h - 6);
        });
      });

      if (hasHazardLane) {
        // Fast hazard strip replacing the usual safe median resting row.
        FX.gradientRect(ctx, 0, 6 * CELL, W, CELL, '#4a3a1a', '#241c0c');
        ctx.fillStyle = 'rgba(255,200,40,0.3)';
        for (let tx = 4; tx < W; tx += 16) ctx.fillRect(tx, 6 * CELL + CELL / 2 - 1, 8, 3);
      } else {
        FX.gradientRect(ctx, 0, 6 * CELL, W, CELL, theme.median[0], theme.median[1]);
      }

      FX.gradientRect(ctx, 0, 7 * CELL, W, 4 * CELL, theme.road[0], theme.road[1]);
      // dashed lane-divider markings between the four road rows
      ctx.strokeStyle = 'rgba(255,220,120,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      for (let ry = 8; ry <= 10; ry++) {
        ctx.beginPath();
        ctx.moveTo(0, ry * CELL);
        ctx.lineTo(W, ry * CELL);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      roads.forEach((lane) => {
        lane.items.forEach((c) => drawCar(ctx, c, lane.dir));
      });

      FX.gradientRect(ctx, 0, 11 * CELL, W, CELL, theme.start[0], theme.start[1]);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let tx = 6; tx < W; tx += 22) ctx.fillRect(tx, 11 * CELL + CELL - 5, 2, 4);

      if (fly) {
        const fx = fly.col * CELL + CELL / 2, fy = fly.row * CELL + CELL / 2;
        const bob = Math.sin(flyLife * 12) * 2;
        ctx.fillStyle = flyLife < 1.2 && Math.floor(flyLife * 8) % 2 === 0 ? 'transparent' : '#3a2a1a';
        ctx.beginPath();
        ctx.ellipse(fx, fy + bob, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(fx - 5, fy + bob - 3, 4, 2, -0.4, 0, Math.PI * 2);
        ctx.ellipse(fx + 5, fy + bob - 3, 4, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      drawFrog(ctx, frog);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`PADS ${goalsFilled.filter(Boolean).length}/${GOAL_COLS.length}`, 8, 16);
      ctx.fillStyle = timeLeft < 6 ? '#ff5c5c' : '#e8ecff';
      ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, W - 60, 16);
    },
  };
}
