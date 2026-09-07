function createPinballLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GRAVITY_BASE = 900;
  const BALL_R = 9;
  const MAX_SPEED_BASE = 900;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // structural boundary + inlane guides - identical on every stage. Without
  // these, the gap between the outer rails and the flippers' resting reach
  // is so wide that a ball can roll straight down either side and drain
  // untouched. These funnel it back toward the flippers, like the plastic
  // guides on a real table, while still leaving a narrower "outlane" for risk.
  const BASE_WALLS = [
    { x: 14, y: 0, w: 10, h: 470 },
    { x: 616, y: 0, w: 10, h: 470 },
    { x: 14, y: 0, w: 612, h: 10 },
    { x: 170, y: 280, w: 8, h: 150 },
    { x: 462, y: 280, w: 8, h: 150 },
  ];

  // 10 hand-built stages, escalating together. stage 11+ ("endless mode")
  // scales continuously off stage 10's numbers instead of hand-tuning
  // forever - capped so it never turns into an unwinnable or
  // physics-breaking mess. Both physics and target score are driven off
  // the SAME endlessScale() so they always climb in lockstep - a fairness
  // audit flagged earlier bugs where one difficulty knob scaled
  // independently of another it should've been tied to.
  const HAND_BUILT_PHYSICS = [1.00, 1.00, 1.15, 1.28, 1.40, 1.52, 1.64, 1.76, 1.88, 2.00];
  const HAND_BUILT_TARGET_SCORE = [150, 220, 300, 380, 460, 550, 650, 760, 880, 1000];
  function endlessScale(stageNum) {
    return Math.min(1 + Math.max(0, stageNum - 10) * 0.12, 2.5);
  }
  function stagePhysicsMult(stageNum) {
    if (stageNum <= 10) return HAND_BUILT_PHYSICS[clamp(Math.round(stageNum), 1, 10) - 1];
    return Math.min(HAND_BUILT_PHYSICS[9] * endlessScale(stageNum), 2.6);
  }
  function stageTargetScore(stageNum) {
    if (stageNum <= 10) return HAND_BUILT_TARGET_SCORE[clamp(Math.round(stageNum), 1, 10) - 1];
    return Math.round(HAND_BUILT_TARGET_SCORE[9] * endlessScale(stageNum));
  }

  // ---- stage layouts ----

  function bumperLayoutStage1() {
    return [
      { x: 220, y: 150, r: 24, color: '#4fe3d0' },
      { x: 420, y: 150, r: 24, color: '#ff4fa3' },
      { x: 320, y: 235, r: 22, color: '#ffd24f' },
    ];
  }
  function bumperLayoutStage2() {
    // 4 bumpers in a wider diamond that opens a new lane straight down the middle
    return [
      { x: 320, y: 138, r: 22, color: '#ffd24f' },
      { x: 210, y: 195, r: 24, color: '#4fe3d0' },
      { x: 430, y: 195, r: 24, color: '#ff4fa3' },
      { x: 320, y: 270, r: 22, color: '#8f8fff' },
    ];
  }
  function bumperLayoutStage3() {
    // 5 bumpers in a tight central cluster - much less open space to coast through
    return [
      { x: 320, y: 140, r: 20, color: '#ffd24f' },
      { x: 250, y: 178, r: 22, color: '#4fe3d0' },
      { x: 390, y: 178, r: 22, color: '#ff4fa3' },
      { x: 288, y: 230, r: 20, color: '#8f8fff' },
      { x: 352, y: 230, r: 20, color: '#6bff6b' },
    ];
  }
  function bumperLayoutStage4() {
    // 6 bumpers in a zigzag - a staggered top row and a lower row that no
    // longer lines up with it, so there's no straight lane through the middle
    return [
      { x: 180, y: 130, r: 22, color: '#4fe3d0' },
      { x: 320, y: 118, r: 22, color: '#ffd24f' },
      { x: 460, y: 130, r: 22, color: '#ff4fa3' },
      { x: 250, y: 205, r: 20, color: '#8f8fff' },
      { x: 390, y: 205, r: 20, color: '#6bff6b' },
      { x: 320, y: 258, r: 18, color: '#ff9a4f' },
    ];
  }
  function bumperLayoutStage5() {
    // 6 bumpers in a wide hexagon ring with an open (but guarded) center
    return [
      { x: 320, y: 108, r: 20, color: '#ffd24f' },
      { x: 205, y: 150, r: 20, color: '#4fe3d0' },
      { x: 435, y: 150, r: 20, color: '#ff4fa3' },
      { x: 205, y: 232, r: 20, color: '#8f8fff' },
      { x: 435, y: 232, r: 20, color: '#6bff6b' },
      { x: 320, y: 268, r: 20, color: '#ff9a4f' },
    ];
  }
  function bumperLayoutStage6() {
    // 7 bumpers - dense 3/3 grid plus a center pip, tighter radii
    return [
      { x: 190, y: 120, r: 19, color: '#4fe3d0' },
      { x: 320, y: 105, r: 19, color: '#ffd24f' },
      { x: 450, y: 120, r: 19, color: '#ff4fa3' },
      { x: 250, y: 185, r: 19, color: '#8f8fff' },
      { x: 390, y: 185, r: 19, color: '#6bff6b' },
      { x: 320, y: 240, r: 19, color: '#ff9a4f' },
      { x: 320, y: 168, r: 15, color: '#ffffff' },
    ];
  }
  function bumperLayoutStage7() {
    // 7 bumpers, asymmetric - clustered left/center with a riskier open lane
    // down the right side
    return [
      { x: 170, y: 110, r: 20, color: '#4fe3d0' },
      { x: 260, y: 92, r: 20, color: '#ffd24f' },
      { x: 220, y: 175, r: 20, color: '#ff4fa3' },
      { x: 340, y: 150, r: 20, color: '#8f8fff' },
      { x: 300, y: 232, r: 18, color: '#6bff6b' },
      { x: 420, y: 200, r: 20, color: '#ff9a4f' },
      { x: 465, y: 262, r: 18, color: '#ffffff' },
    ];
  }
  function bumperLayoutStage8() {
    // 8 bumpers - even 4x2 grid, small radii, dense wall-to-wall coverage
    return [
      { x: 180, y: 110, r: 17, color: '#4fe3d0' },
      { x: 280, y: 100, r: 17, color: '#ffd24f' },
      { x: 380, y: 100, r: 17, color: '#ff4fa3' },
      { x: 460, y: 110, r: 17, color: '#8f8fff' },
      { x: 210, y: 190, r: 17, color: '#6bff6b' },
      { x: 310, y: 202, r: 17, color: '#ff9a4f' },
      { x: 410, y: 190, r: 17, color: '#ffffff' },
      { x: 320, y: 252, r: 17, color: '#4fe3d0' },
    ];
  }
  function bumperLayoutStage9() {
    // 8 bumpers, spread to the full rail-to-rail width - almost no clean gap left
    return [
      { x: 160, y: 120, r: 18, color: '#4fe3d0' },
      { x: 260, y: 104, r: 18, color: '#ffd24f' },
      { x: 380, y: 104, r: 18, color: '#ff4fa3' },
      { x: 480, y: 120, r: 18, color: '#8f8fff' },
      { x: 210, y: 200, r: 18, color: '#6bff6b' },
      { x: 320, y: 216, r: 18, color: '#ff9a4f' },
      { x: 430, y: 200, r: 18, color: '#ffffff' },
      { x: 320, y: 270, r: 16, color: '#ff4fa3' },
    ];
  }
  function bumperLayoutStage10() {
    // 9 bumpers - the top-tier table. Wide, deep, and dense: three staggered
    // rows spanning almost the full playfield width, leaving only narrow,
    // twisting corridors for the ball to thread
    return [
      { x: 150, y: 115, r: 17, color: '#4fe3d0' },
      { x: 250, y: 94, r: 17, color: '#ffd24f' },
      { x: 390, y: 94, r: 17, color: '#ff4fa3' },
      { x: 490, y: 115, r: 17, color: '#8f8fff' },
      { x: 200, y: 185, r: 17, color: '#6bff6b' },
      { x: 320, y: 170, r: 17, color: '#ff9a4f' },
      { x: 440, y: 185, r: 17, color: '#ffffff' },
      { x: 260, y: 250, r: 16, color: '#4fe3d0' },
      { x: 380, y: 250, r: 16, color: '#ff4fa3' },
    ];
  }

  function targetLayoutStage1() {
    return [
      { x: 240, y: 60, w: 34, h: 14 },
      { x: 304, y: 60, w: 34, h: 14 },
      { x: 368, y: 60, w: 34, h: 14 },
    ];
  }
  function targetLayoutStage2() {
    // the original top row, plus a second lower "ramp" group of targets
    return [
      { x: 240, y: 60, w: 34, h: 14 },
      { x: 304, y: 60, w: 34, h: 14 },
      { x: 368, y: 60, w: 34, h: 14 },
      { x: 268, y: 155, w: 30, h: 14 },
      { x: 342, y: 155, w: 30, h: 14 },
    ];
  }
  function targetLayoutStage3() {
    // both rows again, tighter spacing and a 4th top target - the hardest gauntlet
    return [
      { x: 226, y: 55, w: 28, h: 14 },
      { x: 262, y: 55, w: 28, h: 14 },
      { x: 350, y: 55, w: 28, h: 14 },
      { x: 386, y: 55, w: 28, h: 14 },
      { x: 268, y: 150, w: 28, h: 14 },
      { x: 344, y: 150, w: 28, h: 14 },
    ];
  }
  function targetLayoutStage4() {
    // top4 + mid3 (7 targets) - a wider top row than stage 3's plus a new
    // third-target middle row
    return [
      { x: 170, y: 50, w: 30, h: 14 },
      { x: 267, y: 50, w: 30, h: 14 },
      { x: 363, y: 50, w: 30, h: 14 },
      { x: 460, y: 50, w: 30, h: 14 },
      { x: 232, y: 145, w: 28, h: 14 },
      { x: 306, y: 145, w: 28, h: 14 },
      { x: 380, y: 145, w: 28, h: 14 },
    ];
  }
  function targetLayoutStage5() {
    // top4 + mid4 (8 targets) - both rows now fully populated, edge to edge
    return [
      { x: 175, y: 48, w: 28, h: 14 },
      { x: 260, y: 48, w: 28, h: 14 },
      { x: 345, y: 48, w: 28, h: 14 },
      { x: 430, y: 48, w: 28, h: 14 },
      { x: 195, y: 148, w: 26, h: 14 },
      { x: 275, y: 148, w: 26, h: 14 },
      { x: 355, y: 148, w: 26, h: 14 },
      { x: 435, y: 148, w: 26, h: 14 },
    ];
  }
  function targetLayoutStage6() {
    // top5 + mid4 (9 targets) - a 5th top target squeezed in, spacing tightens
    return [
      { x: 168, y: 48, w: 26, h: 14 },
      { x: 244, y: 48, w: 26, h: 14 },
      { x: 320, y: 48, w: 26, h: 14 },
      { x: 396, y: 48, w: 26, h: 14 },
      { x: 472, y: 48, w: 26, h: 14 },
      { x: 200, y: 148, w: 26, h: 14 },
      { x: 280, y: 148, w: 26, h: 14 },
      { x: 360, y: 148, w: 26, h: 14 },
      { x: 440, y: 148, w: 26, h: 14 },
    ];
  }
  function targetLayoutStage7() {
    // top5 + mid5 (10 targets) - both rows at 5-wide, near wall-to-wall
    return [
      { x: 165, y: 46, w: 25, h: 14 },
      { x: 240, y: 46, w: 25, h: 14 },
      { x: 315, y: 46, w: 25, h: 14 },
      { x: 390, y: 46, w: 25, h: 14 },
      { x: 465, y: 46, w: 25, h: 14 },
      { x: 165, y: 148, w: 25, h: 14 },
      { x: 240, y: 148, w: 25, h: 14 },
      { x: 315, y: 148, w: 25, h: 14 },
      { x: 390, y: 148, w: 25, h: 14 },
      { x: 465, y: 148, w: 25, h: 14 },
    ];
  }
  function targetLayoutStage8() {
    // top6 + mid5 (11 targets) - the top row gains a 6th target, tightest spacing yet
    return [
      { x: 160, y: 45, w: 22, h: 14 },
      { x: 226, y: 45, w: 22, h: 14 },
      { x: 292, y: 45, w: 22, h: 14 },
      { x: 358, y: 45, w: 22, h: 14 },
      { x: 424, y: 45, w: 22, h: 14 },
      { x: 490, y: 45, w: 22, h: 14 },
      { x: 165, y: 148, w: 25, h: 14 },
      { x: 240, y: 148, w: 25, h: 14 },
      { x: 315, y: 148, w: 25, h: 14 },
      { x: 390, y: 148, w: 25, h: 14 },
      { x: 465, y: 148, w: 25, h: 14 },
    ];
  }
  function targetLayoutStage9() {
    // top6 + mid6 (12 targets) - both rows full at 6-wide
    return [
      { x: 160, y: 45, w: 22, h: 14 },
      { x: 226, y: 45, w: 22, h: 14 },
      { x: 292, y: 45, w: 22, h: 14 },
      { x: 358, y: 45, w: 22, h: 14 },
      { x: 424, y: 45, w: 22, h: 14 },
      { x: 490, y: 45, w: 22, h: 14 },
      { x: 160, y: 148, w: 22, h: 14 },
      { x: 226, y: 148, w: 22, h: 14 },
      { x: 292, y: 148, w: 22, h: 14 },
      { x: 358, y: 148, w: 22, h: 14 },
      { x: 424, y: 148, w: 22, h: 14 },
      { x: 490, y: 148, w: 22, h: 14 },
    ];
  }
  function targetLayoutStage10() {
    // top7 + mid6 (13 targets) - the top-tier gauntlet: a 7-wide top row
    // shoulder to shoulder plus the full 6-wide mid row beneath it
    return [
      { x: 170, y: 44, w: 24, h: 14 },
      { x: 219, y: 44, w: 24, h: 14 },
      { x: 268, y: 44, w: 24, h: 14 },
      { x: 317, y: 44, w: 24, h: 14 },
      { x: 366, y: 44, w: 24, h: 14 },
      { x: 415, y: 44, w: 24, h: 14 },
      { x: 464, y: 44, w: 24, h: 14 },
      { x: 160, y: 148, w: 22, h: 14 },
      { x: 226, y: 148, w: 22, h: 14 },
      { x: 292, y: 148, w: 22, h: 14 },
      { x: 358, y: 148, w: 22, h: 14 },
      { x: 424, y: 148, w: 22, h: 14 },
      { x: 490, y: 148, w: 22, h: 14 },
    ];
  }

  // shared ramp guide, reused verbatim from stage 2 onward - a small
  // ramp-like ricochet feature the original table didn't have
  const RAMP_GUIDE = { x: 300, y: 100, w: 40, h: 8 };
  const SIDE_GUIDE_L = { x: 190, y: 165, w: 10, h: 65 };
  const SIDE_GUIDE_R = { x: 440, y: 165, w: 10, h: 65 };
  const SIDE_GUIDE_L_TALL = { x: 190, y: 160, w: 10, h: 70 };
  const SIDE_GUIDE_R_TALL = { x: 440, y: 160, w: 10, h: 70 };
  const LOWER_CROSS_GUIDE = { x: 260, y: 210, w: 100, h: 8 };
  const LOWER_CROSS_GUIDE_WIDE = { x: 260, y: 205, w: 120, h: 8 };
  const LOW_RAMP = { x: 300, y: 245, w: 40, h: 8 };
  const TOP_SPIKE = { x: 320, y: 60, w: 8, h: 40 };
  const TOP_SPIKE_TALL = { x: 320, y: 55, w: 8, h: 35 };

  // stage 10's full wall set is also the endless-mode base (stage 11+ reuses
  // it verbatim, same as stage 3 used to before it was superseded)
  const STAGE10_WALLS = [
    RAMP_GUIDE, SIDE_GUIDE_L_TALL, SIDE_GUIDE_R_TALL,
    LOWER_CROSS_GUIDE_WIDE, LOW_RAMP, TOP_SPIKE_TALL,
  ];

  function extraWallsForStage(stageNum) {
    if (stageNum <= 1) return [];
    if (stageNum === 2) return [RAMP_GUIDE];
    if (stageNum === 3) return [RAMP_GUIDE];
    if (stageNum === 4) return [RAMP_GUIDE, SIDE_GUIDE_R];
    if (stageNum === 5) return [RAMP_GUIDE, SIDE_GUIDE_L];
    if (stageNum === 6) return [RAMP_GUIDE, SIDE_GUIDE_L, SIDE_GUIDE_R];
    if (stageNum === 7) return [RAMP_GUIDE, SIDE_GUIDE_L, SIDE_GUIDE_R, TOP_SPIKE];
    if (stageNum === 8) return [RAMP_GUIDE, SIDE_GUIDE_L, SIDE_GUIDE_R, LOWER_CROSS_GUIDE];
    if (stageNum === 9) return [RAMP_GUIDE, SIDE_GUIDE_L, SIDE_GUIDE_R, LOWER_CROSS_GUIDE, LOW_RAMP];
    // stage 10 AND every endless stage beyond it reuse this wall set verbatim
    return STAGE10_WALLS;
  }

  function layoutForStage(stageNum) {
    if (stageNum <= 1) return { bumpers: bumperLayoutStage1(), targets: targetLayoutStage1() };
    if (stageNum === 2) return { bumpers: bumperLayoutStage2(), targets: targetLayoutStage2() };
    if (stageNum === 3) return { bumpers: bumperLayoutStage3(), targets: targetLayoutStage3() };
    if (stageNum === 4) return { bumpers: bumperLayoutStage4(), targets: targetLayoutStage4() };
    if (stageNum === 5) return { bumpers: bumperLayoutStage5(), targets: targetLayoutStage5() };
    if (stageNum === 6) return { bumpers: bumperLayoutStage6(), targets: targetLayoutStage6() };
    if (stageNum === 7) return { bumpers: bumperLayoutStage7(), targets: targetLayoutStage7() };
    if (stageNum === 8) return { bumpers: bumperLayoutStage8(), targets: targetLayoutStage8() };
    if (stageNum === 9) return { bumpers: bumperLayoutStage9(), targets: targetLayoutStage9() };
    // stage 10 AND every endless stage beyond it reuse this layout verbatim
    return { bumpers: bumperLayoutStage10(), targets: targetLayoutStage10() };
  }

  const flippers = {
    left: {
      pivot: { x: 240, y: 420 }, length: 62,
      restDir: normalize(-0.55, 0.75), activeDir: normalize(0.9, -0.25),
      raise: 0,
    },
    right: {
      pivot: { x: 400, y: 420 }, length: 62,
      restDir: normalize(0.55, 0.75), activeDir: normalize(-0.9, -0.25),
      raise: 0,
    },
  };

  const START_POS = { x: 590, y: 430 };
  const COMBO_WINDOW = 1.3;

  // cheap per-stage felt tint so each table reads as "somewhere new" without
  // touching bumper/target colors or any physics - stage 10's tint carries
  // into endless mode, same as the layout it reuses
  const PLAYFIELD_THEMES = {
    1: ['#1e2038', '#12121e'], // cool blue-violet (original)
    2: ['#182a2c', '#0e1818'], // teal-green
    3: ['#2a1420', '#160810'], // deep red
    4: ['#2a1e10', '#180f08'], // burnt orange
    5: ['#2a2410', '#181408'], // amber-gold
    6: ['#241030', '#12081c'], // violet
    7: ['#300f18', '#1a0810'], // crimson
    8: ['#141030', '#0a0818'], // deep indigo
    9: ['#301008', '#180a04'], // molten orange-red
    10: ['#200008', '#0c0004'], // obsidian red-black - the top-tier table
  };
  function playfieldTheme(stageNum) {
    return PLAYFIELD_THEMES[clamp(Math.round(stageNum), 1, 10)];
  }

  // shared juice systems - created once per level instance (not per-frame),
  // fed on hits/drains/jackpots, updated+drawn every frame after sprites.
  const particles = FX.makeParticles(140);
  const floatText = FX.makeFloatText(24);

  let balls, score, comboCount, comboTimer, targets, bumpers, walls;
  let wallCooldown = 0;
  let plungerCharge = 0;
  let curStage = 1;
  let targetScore = stageTargetScore(1);
  let timeAccum = 0;
  let drainFlash = 0;
  let jackpotFlash = 0;

  function targetBounce(b) {
    for (const t of targets) {
      if (!t.alive) continue;
      const cx = clamp(b.x, t.x, t.x + t.w);
      const cy = clamp(b.y, t.y, t.y + t.h);
      const dx = b.x - cx, dy = b.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < BALL_R * BALL_R) {
        const dist = Math.sqrt(distSq) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        b.x += nx * (BALL_R - dist);
        b.y += ny * (BALL_R - dist);
        const vDotN = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        t.alive = false;
        score += 20;
        addScore(20);
        sfx('hit');
        shake(0.06, 2);
        const tcx = t.x + t.w / 2, tcy = t.y + t.h / 2;
        particles.burst(tcx, tcy, 8, {
          colors: ['#ff9a4f', '#ffd24f', '#ffffff'],
          speedMin: 50, speedMax: 170, lifeMin: 0.25, lifeMax: 0.5,
          sizeMin: 1.5, sizeMax: 3.5, gravity: 60,
        });
        floatText.spawn(tcx, t.y - 6, '+20', '#ffd24f', { life: 0.7, vy: -42, size: 12 });
        if (targets.every((tt) => !tt.alive)) triggerMultiball(b);
      }
    }
  }

  function triggerMultiball(source) {
    sfx('explosion');
    shake(0.15, 4);
    jackpotFlash = 0.4;
    floatText.spawn(320, 210, 'MULTIBALL!', '#ffd24f', { life: 1.3, vy: -18, size: 20 });
    particles.burst(source.x, source.y, 16, {
      colors: ['#ffd24f', '#ff4fa3', '#4fe3d0', '#ffffff'],
      speedMin: 90, speedMax: 260, lifeMin: 0.35, lifeMax: 0.8,
      sizeMin: 2, sizeMax: 4.5, gravity: 70,
    });
    for (let i = 0; i < 2; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
      balls.push({ x: source.x, y: source.y, vx: Math.cos(ang) * 350, vy: Math.sin(ang) * 350, launched: true });
    }
    targets.forEach((t) => { t.alive = true; });
  }

  function circleRectBounce(b, dt) {
    wallCooldown = Math.max(0, wallCooldown - dt);
    for (const w of walls) {
      const cx = clamp(b.x, w.x, w.x + w.w);
      const cy = clamp(b.y, w.y, w.y + w.h);
      const dx = b.x - cx, dy = b.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < BALL_R * BALL_R) {
        const dist = Math.sqrt(distSq) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        b.x += nx * (BALL_R - dist);
        b.y += ny * (BALL_R - dist);
        const vDotN = b.vx * nx + b.vy * ny;
        const impactSpeed = Math.abs(vDotN);
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        b.vx *= 0.97; b.vy *= 0.97;
        // only a real, fast impact gets a sound/rumble - a ball resting or
        // rolling along a rail would otherwise spam the same sfx every frame
        if (impactSpeed > 160 && wallCooldown <= 0) {
          wallCooldown = 0.1;
          sfx('bounce');
          if (impactSpeed > 500) shake(0.05, 1.5);
        }
      }
    }
  }

  function bumperBounce(b, dt) {
    bumpers.forEach((bp) => {
      bp.cooldown = Math.max(0, bp.cooldown - dt);
      const dx = b.x - bp.x, dy = b.y - bp.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_R + bp.r) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        b.x = bp.x + nx * (BALL_R + bp.r);
        b.y = bp.y + ny * (BALL_R + bp.r);
        const vDotN = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vDotN * nx;
        b.vy -= 2 * vDotN * ny;
        const speed = Math.max(Math.hypot(b.vx, b.vy), 380 * stagePhysicsMult(curStage));
        const dir = normalize(b.vx, b.vy);
        b.vx = dir.x * speed;
        b.vy = dir.y * speed;
        bp.flash = 0.15;
        bp.glow = 1;
        if (bp.cooldown <= 0) {
          bp.cooldown = 0.15;
          comboCount = comboTimer > 0 ? comboCount + 1 : 1;
          comboTimer = COMBO_WINDOW;
          // bonus escalates with the streak but is capped so one lucky bumper
          // rally can't blow past the stage's target score and trivialize the table
          const bonus = 10 + Math.min(comboCount - 1, 6) * 5;
          score += bonus;
          addScore(bonus);
          sfx('bumper');
          shake(0.08, 2.5);
          particles.burst(bp.x, bp.y, comboCount > 1 ? 12 : 9, {
            colors: [bp.color, '#ffffff'],
            speedMin: 70, speedMax: 210, lifeMin: 0.2, lifeMax: 0.45,
            sizeMin: 1.5, sizeMax: 3.5, gravity: 50,
          });
          floatText.spawn(
            bp.x, bp.y - bp.r - 6,
            comboCount > 1 ? `COMBO x${comboCount}  +${bonus}` : `+${bonus}`,
            comboCount > 1 ? '#ff9a4f' : '#ffd24f',
            { life: 0.8, vy: -45, size: comboCount > 1 ? 13 : 12 }
          );
        }
      }
    });
  }

  function flipperState(flip, key, mouseHeld, dt) {
    const target = (isDown(key) || mouseHeld) ? 1 : 0;
    const rate = 11;
    const delta = clamp(target - flip.raise, -rate * dt, rate * dt);
    flip.raise = clamp(flip.raise + delta, 0, 1);
    flip.raiseVel = delta / dt;
    flip.dir = normalize(
      lerp(flip.restDir.x, flip.activeDir.x, flip.raise),
      lerp(flip.restDir.y, flip.activeDir.y, flip.raise)
    );
    flip.tip = { x: flip.pivot.x + flip.dir.x * flip.length, y: flip.pivot.y + flip.dir.y * flip.length };
  }

  // ---- draw helpers (cosmetic only) ----

  function drawWall(ctx, w) {
    FX.chrome(ctx, w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
    // rivet studs along the rail
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const vertical = w.h > w.w;
    const span = vertical ? w.h : w.w;
    const count = Math.max(1, Math.floor(span / 42));
    for (let i = 1; i <= count; i++) {
      const t = (i * span) / (count + 1);
      const rx = vertical ? w.x + w.w / 2 : w.x + t;
      const ry = vertical ? w.y + t : w.y + w.h / 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(rx - 0.4, ry - 0.4, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
    }
  }

  function drawBumper(ctx, bp) {
    FX.shadow(ctx, bp.x, bp.y + bp.r * 0.7, bp.r * 0.9, bp.r * 0.3, 0.3);

    // lingering hit-glow halo, separate from the instant white flash below -
    // decays over ~0.5s so a hit bumper keeps "breathing" light after impact
    if (bp.glow > 0) {
      ctx.save();
      ctx.globalAlpha = bp.glow * 0.55;
      const glowR = bp.r * (1.3 + (1 - bp.glow) * 1.1);
      const glowGrad = ctx.createRadialGradient(bp.x, bp.y, bp.r * 0.7, bp.x, bp.y, glowR);
      glowGrad.addColorStop(0, bp.color);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // idle breathing pulse so bumpers never look fully dead between hits
    const idlePulse = 0.5 + 0.5 * Math.sin(timeAccum * 2.2 + bp.x * 0.05 + bp.y * 0.05);

    // metallic base rim
    const rim = ctx.createRadialGradient(bp.x, bp.y, bp.r * 0.75, bp.x, bp.y, bp.r * 1.2);
    rim.addColorStop(0, 'rgba(255,255,255,0.1)');
    rim.addColorStop(0.7, 'rgba(200,205,220,0.55)');
    rim.addColorStop(1, 'rgba(50,54,70,0.9)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r * 1.2, 0, Math.PI * 2);
    ctx.fill();

    FX.sphere(ctx, bp.x, bp.y, bp.r, bp.flash > 0 ? '#ffffff' : bp.color);

    // faint idle sheen ring riding the breathing pulse
    ctx.save();
    ctx.globalAlpha = 0.15 + idlePulse * 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(bp.x - bp.r * 0.3, bp.y - bp.r * 0.35, bp.r * 0.28, bp.r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlipper(ctx, f) {
    ctx.lineCap = 'round';

    // dark outline pass (wider, drawn under)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x, f.pivot.y);
    ctx.lineTo(f.tip.x, f.tip.y);
    ctx.stroke();

    // glossy metallic body
    const grad = ctx.createLinearGradient(f.pivot.x, f.pivot.y, f.tip.x, f.tip.y);
    grad.addColorStop(0, '#c4c9e4');
    grad.addColorStop(0.5, '#f8faff');
    grad.addColorStop(1, '#ced3ec');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x, f.pivot.y);
    ctx.lineTo(f.tip.x, f.tip.y);
    ctx.stroke();

    // specular streak along one edge
    const px = -f.dir.y * 3.2, py = f.dir.x * 3.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x - px, f.pivot.y - py);
    ctx.lineTo(f.tip.x - px, f.tip.y - py);
    ctx.stroke();

    // pivot rivet cap
    FX.sphere(ctx, f.pivot.x, f.pivot.y, 6, '#9098b8');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.pivot.x, f.pivot.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBall(ctx, ball) {
    // subtle motion trail - fading ghost circles along the ball's recent path
    if (ball.trail && ball.trail.length) {
      for (let i = ball.trail.length - 1; i >= 0; i--) {
        const tp = ball.trail[i];
        const fade = 1 - (i + 1) / (ball.trail.length + 1);
        ctx.globalAlpha = fade * 0.3;
        ctx.fillStyle = '#b8bed4';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, BALL_R * (0.5 + fade * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    FX.shadow(ctx, ball.x, ball.y + BALL_R * 0.6, BALL_R * 0.9, BALL_R * 0.3, 0.25);

    // genuinely chrome body: cool-steel base sphere plus a clipped vertical
    // reflection band, like a real ball bearing catching the overhead lights
    FX.sphere(ctx, ball.x, ball.y, BALL_R, '#c6cbdc');

    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.clip();
    const refl = ctx.createLinearGradient(ball.x, ball.y - BALL_R, ball.x, ball.y + BALL_R);
    refl.addColorStop(0, 'rgba(255,255,255,0.75)');
    refl.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    refl.addColorStop(0.55, 'rgba(0,0,0,0.15)');
    refl.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = refl;
    ctx.fillRect(ball.x - BALL_R, ball.y - BALL_R, BALL_R * 2, BALL_R * 2);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(ball.x - BALL_R * 0.35, ball.y - BALL_R * 0.4, BALL_R * 0.3, BALL_R * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // tiny sharp specular pinpoint for that ball-bearing glint
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ball.x - BALL_R * 0.4, ball.y - BALL_R * 0.45, BALL_R * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function flipperBounce(b, flip) {
    const px = flip.pivot.x, py = flip.pivot.y;
    const tx = flip.tip.x, ty = flip.tip.y;
    const segX = tx - px, segY = ty - py;
    const segLenSq = segX * segX + segY * segY;
    let t = ((b.x - px) * segX + (b.y - py) * segY) / segLenSq;
    t = clamp(t, 0, 1);
    const cx = px + segX * t, cy = py + segY * t;
    const dx = b.x - cx, dy = b.y - cy;
    const dist = Math.hypot(dx, dy);
    const thickness = 9;
    if (dist < BALL_R + thickness) {
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      b.x = cx + nx * (BALL_R + thickness);
      b.y = cy + ny * (BALL_R + thickness);
      const vDotN = b.vx * nx + b.vy * ny;
      b.vx -= 2 * vDotN * nx;
      b.vy -= 2 * vDotN * ny;
      if (flip.raiseVel > 0.3) {
        const kick = flip.raiseVel * flip.length * 0.9 * stagePhysicsMult(curStage);
        b.vx += flip.dir.y * -kick * 0.4 + nx * kick * 0.6;
        b.vy += flip.dir.x * kick * 0.4 + ny * kick * 0.6;
        sfx('swing');
        shake(0.06, 2);
        particles.burst(cx, cy, 10, {
          colors: ['#ffffff', '#c4c9e4', '#ffd24f'],
          speedMin: 80, speedMax: 260, lifeMin: 0.15, lifeMax: 0.35,
          sizeMin: 1, sizeMax: 3, angle: Math.atan2(ny, nx), spread: 1.3, gravity: 40,
        });
      } else {
        sfx('bounce');
        particles.burst(cx, cy, 5, {
          colors: ['#ffffff', '#c4c9e4'],
          speedMin: 40, speedMax: 130, lifeMin: 0.12, lifeMax: 0.25,
          sizeMin: 1, sizeMax: 2.5, angle: Math.atan2(ny, nx), spread: 1.0, gravity: 30,
        });
      }
    }
  }

  return {
    init(stage = 1) {
      curStage = stage;
      targetScore = stageTargetScore(curStage);
      const layout = layoutForStage(curStage);
      bumpers = layout.bumpers.map((bp) => ({ ...bp, cooldown: 0, flash: 0, glow: 0 }));
      targets = layout.targets.map((t) => ({ ...t, alive: true }));
      walls = BASE_WALLS.concat(extraWallsForStage(curStage));

      balls = [{ x: START_POS.x, y: START_POS.y, vx: 0, vy: 0, launched: false, trail: [] }];
      flippers.left.raise = 0;
      flippers.right.raise = 0;
      score = 0;
      comboCount = 0;
      comboTimer = 0;
      wallCooldown = 0;
      plungerCharge = 0;
      timeAccum = 0;
      drainFlash = 0;
      jackpotFlash = 0;
      // stage/retry never carries over stray particles or floating text from before
      particles.clear();
      floatText.clear();
    },

    update(dt) {
      const physMult = stagePhysicsMult(curStage);
      const gravity = GRAVITY_BASE * physMult;
      const maxSpeed = MAX_SPEED_BASE * physMult;

      // zone-based mouse/touch flipper control, additive to the keyboard
      // bindings above: read mouseX/mouseDown fresh every frame (they're
      // live values on api, not a polling function like isDown) and drive
      // the SAME flip.raise state the arrow keys drive, based on which
      // half of the table the held mouse is currently over. Deliberately
      // NOT routed through isDown/Space - that generic click-dispatches-
      // Space wiring would fire both flippers together regardless of
      // cursor position, which isn't the independent left/right control
      // this table needs.
      const mouseHeld = !!api.mouseDown;
      const mouseX = api.mouseX;
      const leftMouseHeld = mouseHeld && mouseX < W / 2;
      const rightMouseHeld = mouseHeld && mouseX >= W / 2;

      flipperState(flippers.left, 'ArrowLeft', leftMouseHeld, dt);
      flipperState(flippers.right, 'ArrowRight', rightMouseHeld, dt);
      bumpers.forEach((bp) => {
        bp.flash = Math.max(0, (bp.flash || 0) - dt);
        bp.glow = Math.max(0, (bp.glow || 0) - dt / 0.5);
      });
      comboTimer = Math.max(0, comboTimer - dt);
      timeAccum += dt;
      drainFlash = Math.max(0, drainFlash - dt);
      jackpotFlash = Math.max(0, jackpotFlash - dt);
      particles.update(dt);
      floatText.update(dt);

      balls.forEach((ball) => {
        if (!ball.launched) {
          // hold Space to pull back the plunger, release to fire - a quick
          // tap still gives the old baseline launch, holding it gives a
          // stronger, slightly more forward shot
          if (isDown('Space')) {
            plungerCharge = Math.min(1, plungerCharge + dt / 0.6);
          } else if (plungerCharge > 0) {
            const power = (560 + plungerCharge * 160) * physMult;
            ball.launched = true;
            ball.vx = -90 - plungerCharge * 30;
            ball.vy = -power;
            sfx('launch');
            plungerCharge = 0;
          }
          return;
        }

        ball.vy += gravity * dt;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > maxSpeed) {
          const s = maxSpeed / speed;
          ball.vx *= s; ball.vy *= s;
        }
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // short motion trail - drawn oldest-first, most-recent last
        if (!ball.trail) ball.trail = [];
        ball.trail.unshift({ x: ball.x, y: ball.y });
        if (ball.trail.length > 6) ball.trail.length = 6;

        circleRectBounce(ball, dt);
        bumperBounce(ball, dt);
        targetBounce(ball);
        flipperBounce(ball, flippers.left);
        flipperBounce(ball, flippers.right);

        // anti-stuck safety net: a ball wedged in a corner where two
        // surfaces keep reflecting it back and forth can end up with almost
        // no net movement despite constant gravity/velocity churn. If that
        // happens for too long, give it a small nudge free rather than
        // leaving the player stuck watching a jittering ball forever.
        ball._stuckT = (ball._stuckT || 0) + dt;
        if (ball._stuckSX === undefined) { ball._stuckSX = ball.x; ball._stuckSY = ball.y; }
        if (ball._stuckT > 0.6) {
          const moved = Math.hypot(ball.x - ball._stuckSX, ball.y - ball._stuckSY);
          if (moved < 6) {
            ball.vx += (Math.random() - 0.5) * 300;
            ball.vy -= 260;
          }
          ball._stuckSX = ball.x;
          ball._stuckSY = ball.y;
          ball._stuckT = 0;
        }
      });

      // drain juice: burst + flash + shake for any ball that just fell off
      // the bottom of the table, before it's removed from play
      balls.forEach((ball) => {
        if (ball.launched && ball.y - BALL_R >= H) {
          particles.burst(ball.x, H - 6, 12, {
            colors: ['#ff5a4f', '#ff9a4f', '#ffffff'],
            speedMin: 70, speedMax: 220, lifeMin: 0.3, lifeMax: 0.6,
            sizeMin: 2, sizeMax: 4, angle: -Math.PI / 2, spread: 1.6, gravity: 220,
          });
          floatText.spawn(ball.x, H - 30, 'DRAIN', '#ff5a4f', { life: 0.8, vy: -30, size: 13 });
          shake(0.2, 5);
          drainFlash = 0.25;
        }
      });

      balls = balls.filter((ball) => !ball.launched || ball.y - BALL_R < H);

      if (balls.length === 0) {
        loseLife();
        return;
      }

      if (score >= targetScore) {
        const clearBonus = Math.round(30 + (curStage - 1) * 6);
        winLevel(clearBonus);
      }
    },

    draw(ctx) {
      // wood-grain cabinet apron surrounding the steel playfield - the wide
      // wooden cabinet edge of a real late-80s table peeking out around the glass
      const woodGrad = ctx.createLinearGradient(0, 0, W, H);
      woodGrad.addColorStop(0, '#3a2318');
      woodGrad.addColorStop(0.5, '#4f3120');
      woodGrad.addColorStop(1, '#331e14');
      ctx.fillStyle = woodGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const gy = 6 + i * 34 + Math.sin(i * 1.7) * 6;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(W * 0.3, gy + 10, W * 0.7, gy - 10, W, gy);
        ctx.stroke();
      }

      const [feltTop, feltBottom] = playfieldTheme(curStage);
      FX.gradientRect(ctx, 20, 8, 600, 462, feltTop, feltBottom);

      // faint brushed-felt streaks across the playfield
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const gx = 60 + i * 100;
        ctx.beginPath();
        ctx.moveTo(gx, 8);
        ctx.lineTo(gx - 40, 470);
        ctx.stroke();
      }

      // chrome bezel framing the playfield, like the metal trim on a real cabinet
      ctx.strokeStyle = 'rgba(230,235,250,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 8, 600, 462);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 8, 600, 462);

      walls.forEach((w) => {
        drawWall(ctx, w);
      });

      // decorative marquee chase lights riding the top rail - pure ambience,
      // not part of the walls[] collision set
      {
        const count = 14, x0 = 34, x1 = 606, ly = 6;
        for (let i = 0; i < count; i++) {
          const lx = x0 + ((x1 - x0) * i) / (count - 1);
          const b = 0.35 + 0.65 * Math.max(0, Math.sin(timeAccum * 3 - i * 0.55));
          ctx.fillStyle = i % 2 === 0 ? '#ffd24f' : '#ff9a4f';
          ctx.globalAlpha = b;
          ctx.beginPath();
          ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      bumpers.forEach((bp) => {
        drawBumper(ctx, bp);
      });

      [flippers.left, flippers.right].forEach((f) => {
        drawFlipper(ctx, f);
      });

      targets.forEach((t, ti) => {
        if (t.alive) {
          FX.bevelBlock(ctx, t.x, t.y, t.w, t.h, '#ff9a4f', 2);
          ctx.save();
          FX.roundRectPath(ctx, t.x, t.y, t.w, t.h, 2);
          ctx.clip();
          // idle pulse so live targets read as "armed" rather than static art
          const pulse = 0.35 + 0.15 * Math.sin(timeAccum * 3 + ti);
          const g = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
          g.addColorStop(0, `rgba(255,255,255,${pulse})`);
          g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
          g.addColorStop(1, 'rgba(0,0,0,0.2)');
          ctx.fillStyle = g;
          ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.restore();
        } else {
          FX.insetRect(ctx, t.x, t.y, t.w, t.h, '#3a2a20', 2);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(t.x + 0.75, t.y + 0.75, t.w - 1.5, t.h - 1.5);
      });

      if (balls.some((b) => !b.launched)) {
        ctx.fillStyle = '#7d86a3';
        ctx.font = '10px monospace';
        ctx.fillText(plungerCharge > 0 ? 'HOLD, THEN RELEASE!' : 'HOLD SPACE TO LAUNCH', 470, 400);
        // plunger charge meter
        const mx = 470, my = 410, mw = 90, mh = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
        if (plungerCharge > 0) {
          ctx.fillStyle = '#ffd24f';
          ctx.fillRect(mx + 1, my + 1, (mw - 2) * plungerCharge, mh - 2);
        }
      }

      balls.forEach((ball) => {
        drawBall(ctx, ball);
      });

      // juice systems draw after all sprites, before HUD/post-process
      particles.draw(ctx);
      floatText.draw(ctx);
      ctx.textAlign = 'left';

      // hit-stun screen washes: red for a drain, gold for a multiball jackpot
      if (drainFlash > 0) FX.flash(ctx, W, H, '#ff2a2a', (drainFlash / 0.25) * 0.35);
      if (jackpotFlash > 0) FX.flash(ctx, W, H, '#ffe08a', (jackpotFlash / 0.4) * 0.4);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px monospace';
      ctx.fillText(`SCORE ${score} / ${targetScore}`, 24, 24);
      ctx.fillStyle = '#7d86a3';
      ctx.font = '8px monospace';
      ctx.fillText('ARROWS = FLIPPERS (OR CLICK LEFT/RIGHT HALF)', 24, 40);
      ctx.fillText(`TARGETS ${targets.filter((t) => t.alive).length}/${targets.length} FOR MULTIBALL`, 24, 452);
      if (comboTimer > 0 && comboCount > 1) {
        ctx.fillStyle = '#ff9a4f';
        ctx.font = '9px monospace';
        ctx.fillText(`COMBO x${comboCount}`, 24, 54);
      }

      // CRT cabinet finish - kept subtle so it never fights HUD legibility
      FX.scanlines(ctx, W, H, 0.04);
      FX.vignette(ctx, W, H, 0.22);
    },
  };
}
