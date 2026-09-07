function createZeldaLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const ROOM_W = W, ROOM_H = H;
  const WORLD_W = ROOM_W * 2, WORLD_H = ROOM_H * 2;
  const WALL_T = 24;

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // --- Per-stage dungeon layouts ------------------------------------------
  // Each stage is a 2x2 room grid (same outer footprint) but with different
  // doorway gaps in the two dividing walls plus different obstacle clutter,
  // so the route to the boss room genuinely changes shape each stage.
  function outerBorder() {
    return [
      { x: 0, y: 0, w: WORLD_W, h: WALL_T },
      { x: 0, y: WORLD_H - WALL_T, w: WORLD_W, h: WALL_T },
      { x: 0, y: 0, w: WALL_T, h: WORLD_H },
      { x: WORLD_W - WALL_T, y: 0, w: WALL_T, h: WORLD_H },
    ];
  }
  // vGaps/hGaps: lists of [start, end] ranges (in world space) where the
  // divider wall should be open (a doorway) instead of solid.
  function vSegments(gaps) {
    const vx = ROOM_W - WALL_T / 2;
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    const rects = [];
    let cur = 0;
    sorted.forEach(([gs, ge]) => {
      if (gs > cur) rects.push({ x: vx, y: cur, w: WALL_T, h: gs - cur });
      cur = ge;
    });
    if (cur < WORLD_H) rects.push({ x: vx, y: cur, w: WALL_T, h: WORLD_H - cur });
    return rects;
  }
  function hSegments(gaps) {
    const hy = ROOM_H - WALL_T / 2;
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    const rects = [];
    let cur = 0;
    sorted.forEach(([gs, ge]) => {
      if (gs > cur) rects.push({ x: cur, y: hy, w: gs - cur, h: WALL_T });
      cur = ge;
    });
    if (cur < WORLD_W) rects.push({ x: cur, y: hy, w: WORLD_W - cur, h: WALL_T });
    return rects;
  }
  function buildWalls(vGaps, hGaps, obstacles) {
    return [...outerBorder(), ...vSegments(vGaps), ...hSegments(hGaps), ...obstacles];
  }

  const ATTACK_DURATION = 0.22;
  const ATTACK_COOLDOWN = 0.35;
  const PLAYER_SPEED = 190;

  const HEART_DROP_CHANCE = 0.3;
  const POWER_TIME = 5;
  const BOSS_SPAWN = { x: ROOM_W + ROOM_W / 2 - 24, y: ROOM_H + ROOM_H / 2 - 90 };

  // Stage 1: the original layout — a 2x2 loop of rooms with two doorways per
  // divider, so there is always more than one route to the goal room.
  const STAGE_1 = {
    walls: buildWalls(
      [[200, 280], [WORLD_H - 280, WORLD_H - 200]],
      [[280, 360], [WORLD_W - 360, WORLD_W - 280]],
      [
        { x: 150, y: 130, w: 32, h: 32 },
        { x: ROOM_W + 420, y: 110, w: 32, h: 100 },
        { x: 110, y: ROOM_H + 300, w: 100, h: 32 },
        { x: ROOM_W + 220, y: ROOM_H + 220, w: 32, h: 32 },
        { x: ROOM_W + 460, y: ROOM_H + 320, w: 32, h: 32 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: ROOM_W + 160, y: 140, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 480, y: 320, fireTimer: 1.2 },
      { type: 'shooter', x: 150, y: ROOM_H + 160, fireTimer: 1.8 },
      { type: 'chaser', x: 420, y: ROOM_H + 340, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 200, y: ROOM_H + 150, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 510, y: 620, fireTimer: 0.8 },
    ],
    bossHp: 4,
    bossChargeNormal: 250, bossChargeEnraged: 290,
    bossSpreadNormal: [-0.35, 0, 0.35],
    bossSpreadEnraged: [-0.5, -0.25, 0, 0.25, 0.5],
    bossExtraBurst: false, bossBurstCount: 0, bossShotSpeed: 170,
    enemySpeedMul: 1, enemyFireMul: 1,
    theme: 'stone',
  };

  // Stage 2: the loop collapses into a single central crossroads chokepoint
  // (one doorway per divider, both centered so they meet in the middle),
  // with more clutter and a tougher, faster-shooting boss that can also fire
  // a full radial burst.
  const STAGE_2 = {
    walls: buildWalls(
      [[WORLD_H / 2 - 55, WORLD_H / 2 + 55]],
      [[WORLD_W / 2 - 55, WORLD_W / 2 + 55]],
      [
        { x: 200, y: 150, w: 40, h: 40 },
        { x: 420, y: ROOM_H - 160, w: 100, h: 28 },
        { x: ROOM_W + 140, y: 140, w: 28, h: 120 },
        { x: ROOM_W + 460, y: 300, w: 40, h: 40 },
        { x: 150, y: ROOM_H + 280, w: 120, h: 28 },
        { x: ROOM_W + 480, y: ROOM_H + 140, w: 32, h: 32 },
        { x: ROOM_W + 220, y: ROOM_H + 380, w: 32, h: 32 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 250, y: 300, dx: 1, dy: 0 },
      { type: 'shooter', x: 480, y: 200, fireTimer: 1.0 },
      { type: 'chaser', x: ROOM_W + 500, y: 250, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 300, y: 350, fireTimer: 1.4 },
      { type: 'shooter', x: 250, y: ROOM_H + 200, fireTimer: 1.6 },
      { type: 'chaser', x: 450, y: ROOM_H + 350, dx: 0, dy: -1 },
      { type: 'chaser', x: ROOM_W + 400, y: ROOM_H + 180, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 550, y: ROOM_H + 400, fireTimer: 0.9 },
    ],
    bossHp: 6,
    bossChargeNormal: 280, bossChargeEnraged: 330,
    bossSpreadNormal: [-0.4, -0.13, 0.13, 0.4],
    bossSpreadEnraged: [-0.55, -0.3, -0.1, 0.1, 0.3, 0.55],
    bossExtraBurst: true, bossBurstCount: 8, bossShotSpeed: 185,
    enemySpeedMul: 1.25, enemyFireMul: 0.85,
    theme: 'moss',
  };

  // Stage 3: an asymmetric layout — a single off-center horizontal doorway
  // plus two narrow vertical doorways pinned near the top/bottom edges,
  // forcing a longer, more roundabout route; more enemies and the toughest
  // boss variant yet.
  const STAGE_3 = {
    walls: buildWalls(
      [
        [WORLD_H * 0.125, WORLD_H * 0.125 + 60],
        [WORLD_H * 0.875 - 60, WORLD_H * 0.875],
      ],
      [[ROOM_W * 0.55, ROOM_W * 0.55 + 70]],
      [
        { x: 220, y: 250, w: 36, h: 36 },
        { x: 420, y: 90, w: 36, h: 90 },
        { x: ROOM_W + 160, y: 260, w: 36, h: 36 },
        { x: ROOM_W + 420, y: 130, w: 100, h: 28 },
        { x: ROOM_W + 480, y: 340, w: 36, h: 36 },
        { x: 160, y: ROOM_H + 200, w: 100, h: 28 },
        { x: 420, y: ROOM_H + 320, w: 36, h: 36 },
        { x: ROOM_W + 300, y: ROOM_H + 260, w: 36, h: 36 },
        { x: ROOM_W + 480, y: ROOM_H + 380, w: 36, h: 36 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 200, y: 200, dx: 1, dy: 0 },
      { type: 'shooter', x: 480, y: 320, fireTimer: 1.1 },
      { type: 'chaser', x: 420, y: ROOM_H - 100, dx: 0, dy: -1 },
      { type: 'chaser', x: ROOM_W + 180, y: 200, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 480, y: 250, fireTimer: 1.3 },
      { type: 'shooter', x: ROOM_W + 350, y: 400, fireTimer: 1.7 },
      { type: 'shooter', x: 200, y: ROOM_H + 180, fireTimer: 1.5 },
      { type: 'chaser', x: 450, y: ROOM_H + 300, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 380, y: ROOM_H + 160, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 560, y: ROOM_H + 380, fireTimer: 0.9 },
    ],
    bossHp: 8,
    bossChargeNormal: 310, bossChargeEnraged: 360,
    bossSpreadNormal: [-0.5, -0.25, 0, 0.25, 0.5],
    bossSpreadEnraged: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6],
    bossExtraBurst: true, bossBurstCount: 12, bossShotSpeed: 200,
    enemySpeedMul: 1.5, enemyFireMul: 0.7,
    theme: 'ember',
  };

  // Stage 4: Frostbound Corridor — a single narrow winding path. Comb-style
  // teeth alternately jut from the top and bottom of each room, forcing an
  // S-shaped route instead of an open room, and both connecting doorways
  // are single narrow slits rather than the wider gaps of stages 1-3.
  const STAGE_4 = {
    walls: buildWalls(
      [[370, 450]],
      [[900, 980]],
      [
        { x: 170, y: 24, w: 24, h: 300 },
        { x: 340, y: 168, w: 24, h: 300 },
        { x: 500, y: 24, w: 24, h: 330 },
        { x: 800, y: 24, w: 24, h: 290 },
        { x: 980, y: 168, w: 24, h: 300 },
        { x: 300, y: ROOM_H + 60, w: 24, h: 260 },
        { x: 520, y: ROOM_H + 240, w: 220, h: 24 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 230, y: 120, dx: 1, dy: 0 },
      { type: 'shooter', x: 260, y: 380, fireTimer: 1.0 },
      { type: 'chaser', x: 420, y: 400, dx: 0, dy: -1 },
      { type: 'shooter', x: 560, y: 150, fireTimer: 1.4 },
      { type: 'chaser', x: ROOM_W + 120, y: 380, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 250, y: 120, fireTimer: 1.2 },
      { type: 'chaser', x: ROOM_W + 430, y: 200, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 560, y: 380, fireTimer: 0.9 },
      { type: 'chaser', x: 210, y: ROOM_H + 380, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 200, y: ROOM_H + 320, fireTimer: 1.1 },
      { type: 'chaser', x: ROOM_W + 480, y: ROOM_H + 180, dx: 0, dy: 1 },
    ],
    bossHp: 9,
    bossChargeNormal: 325, bossChargeEnraged: 375,
    bossSpreadNormal: [-0.55, -0.28, 0, 0.28, 0.55],
    bossSpreadEnraged: [-0.65, -0.43, -0.22, 0, 0.22, 0.43, 0.65],
    bossExtraBurst: true, bossBurstCount: 14, bossShotSpeed: 210,
    enemySpeedMul: 1.65, enemyFireMul: 0.62,
    theme: 'ice',
  };

  // Stage 5: Sunken Ruins — a multi-room layout with a small enclosed vault
  // chamber (four walls and a single narrow doorway slit) tucked off the
  // main route, guarded by its own pair of shooters, giving a simplified
  // "locked room" feel without an actual key/lock mechanic.
  const STAGE_5 = {
    walls: buildWalls(
      [[120, 180], [380, 440]],
      [[260, 320]],
      [
        { x: 900, y: 100, w: 200, h: 24 },
        { x: 900, y: 236, w: 200, h: 24 },
        { x: 1076, y: 100, w: 24, h: 160 },
        { x: 900, y: 100, w: 24, h: 50 },
        { x: 900, y: 210, w: 24, h: 50 },
        { x: 220, y: 150, w: 36, h: 36 },
        { x: 480, y: 350, w: 36, h: 36 },
        { x: 150, y: ROOM_H + 250, w: 36, h: 36 },
        { x: ROOM_W + 480, y: ROOM_H + 300, w: 36, h: 36 },
      ]
    ),
    enemies: [
      { type: 'shooter', x: 950, y: 140, fireTimer: 1.0 },
      { type: 'shooter', x: 1020, y: 190, fireTimer: 1.3 },
      { type: 'chaser', x: 220, y: 200, dx: 1, dy: 0 },
      { type: 'shooter', x: 480, y: 150, fireTimer: 1.5 },
      { type: 'chaser', x: 400, y: 380, dx: 0, dy: -1 },
      { type: 'chaser', x: ROOM_W + 200, y: 350, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 300, y: 250, fireTimer: 1.1 },
      { type: 'chaser', x: 200, y: ROOM_H + 200, dx: 1, dy: 0 },
      { type: 'shooter', x: 350, y: ROOM_H + 350, fireTimer: 1.4 },
      { type: 'chaser', x: ROOM_W + 250, y: ROOM_H + 180, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 420, y: ROOM_H + 380, fireTimer: 0.9 },
      { type: 'chaser', x: ROOM_W + 520, y: ROOM_H + 150, dx: 0, dy: -1 },
    ],
    bossHp: 10,
    bossChargeNormal: 335, bossChargeEnraged: 390,
    bossSpreadNormal: [-0.6, -0.36, -0.12, 0.12, 0.36, 0.6],
    bossSpreadEnraged: [-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7],
    bossExtraBurst: true, bossBurstCount: 16, bossShotSpeed: 218,
    enemySpeedMul: 1.8, enemyFireMul: 0.56,
    theme: 'ruins',
  };

  // Stage 6: Shadow Arena — the two dividing walls collapse to thin end-caps,
  // turning the whole 2x2 footprint into one big open arena, with scattered
  // pillars for cover instead of corridors. Long sightlines make the boss's
  // charge much more threatening here than in a corridor stage.
  const STAGE_6 = {
    walls: buildWalls(
      [[40, WORLD_H - 40]],
      [[40, WORLD_W - 40]],
      [
        { x: 260, y: 180, w: 36, h: 36 },
        { x: 460, y: 320, w: 36, h: 36 },
        { x: 200, y: 360, w: 36, h: 36 },
        { x: ROOM_W + 180, y: 160, w: 36, h: 36 },
        { x: ROOM_W + 380, y: 320, w: 36, h: 36 },
        { x: ROOM_W + 520, y: 200, w: 36, h: 36 },
        { x: 220, y: ROOM_H + 180, w: 36, h: 36 },
        { x: 420, y: ROOM_H + 340, w: 36, h: 36 },
        { x: ROOM_W + 260, y: ROOM_H + 200, w: 36, h: 36 },
        { x: ROOM_W + 460, y: ROOM_H + 380, w: 36, h: 36 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 220, y: 150, dx: 1, dy: 0 },
      { type: 'chaser', x: 380, y: 300, dx: 0, dy: 1 },
      { type: 'shooter', x: 500, y: 180, fireTimer: 1.2 },
      { type: 'chaser', x: 150, y: 380, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 150, y: 250, fireTimer: 1.0 },
      { type: 'chaser', x: ROOM_W + 300, y: 150, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 450, y: 350, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 560, y: 250, fireTimer: 1.5 },
      { type: 'chaser', x: 250, y: ROOM_H + 150, dx: 1, dy: 0 },
      { type: 'shooter', x: 400, y: ROOM_H + 300, fireTimer: 1.3 },
      { type: 'chaser', x: ROOM_W + 200, y: ROOM_H + 180, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 380, y: ROOM_H + 330, dx: 0, dy: -1 },
      { type: 'shooter', x: ROOM_W + 520, y: ROOM_H + 200, fireTimer: 0.9 },
    ],
    bossHp: 11,
    bossChargeNormal: 345, bossChargeEnraged: 400,
    bossSpreadNormal: [-0.62, -0.37, -0.12, 0.12, 0.37, 0.62],
    bossSpreadEnraged: [-0.72, -0.51, -0.3, -0.1, 0.1, 0.3, 0.51, 0.72],
    bossExtraBurst: true, bossBurstCount: 17, bossShotSpeed: 226,
    enemySpeedMul: 1.95, enemyFireMul: 0.52,
    theme: 'shadow',
  };

  // Stage 7: Twin Causeways — a long partial wall splits each top room into
  // an upper and a lower lane for most of its width (open only at the two
  // ends), so the two lanes visibly separate then reconverge before each
  // doorway, instead of a single shared route.
  const STAGE_7 = {
    walls: buildWalls(
      [[200, 280]],
      [[560, 640]],
      [
        { x: 60, y: 244, w: 480, h: 24 },
        { x: 700, y: 244, w: 480, h: 24 },
        { x: 300, y: 100, w: 32, h: 32 },
        { x: 300, y: 380, w: 32, h: 32 },
        { x: ROOM_W + 380, y: 100, w: 32, h: 32 },
        { x: ROOM_W + 380, y: 380, w: 32, h: 32 },
        { x: 200, y: ROOM_H + 200, w: 32, h: 32 },
        { x: ROOM_W + 450, y: ROOM_H + 300, w: 32, h: 32 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 150, y: 120, dx: 1, dy: 0 },
      { type: 'chaser', x: 150, y: 380, dx: 1, dy: 0 },
      { type: 'shooter', x: 350, y: 120, fireTimer: 1.1 },
      { type: 'shooter', x: 350, y: 380, fireTimer: 1.3 },
      { type: 'chaser', x: ROOM_W + 150, y: 120, dx: -1, dy: 0 },
      { type: 'chaser', x: ROOM_W + 150, y: 380, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 450, y: 120, fireTimer: 1.0 },
      { type: 'shooter', x: ROOM_W + 450, y: 380, fireTimer: 1.4 },
      { type: 'chaser', x: 200, y: ROOM_H + 180, dx: 0, dy: 1 },
      { type: 'shooter', x: 400, y: ROOM_H + 350, fireTimer: 1.2 },
      { type: 'chaser', x: ROOM_W + 250, y: ROOM_H + 200, dx: 0, dy: -1 },
      { type: 'shooter', x: ROOM_W + 400, y: ROOM_H + 350, fireTimer: 0.9 },
      { type: 'chaser', x: ROOM_W + 500, y: ROOM_H + 150, dx: 0, dy: 1 },
      { type: 'chaser', x: 300, y: ROOM_H + 300, dx: 1, dy: 0 },
    ],
    bossHp: 12,
    bossChargeNormal: 355, bossChargeEnraged: 412,
    bossSpreadNormal: [-0.68, -0.45, -0.23, 0, 0.23, 0.45, 0.68],
    bossSpreadEnraged: [-0.78, -0.58, -0.39, -0.19, 0, 0.19, 0.39, 0.58, 0.78],
    bossExtraBurst: true, bossBurstCount: 18, bossShotSpeed: 234,
    enemySpeedMul: 2.1, enemyFireMul: 0.48,
    theme: 'toxic',
  };

  // Stage 8: Storm Bastion — two small enclosed vault chambers (one in the
  // starting room, one near the goal room) each with their own guardians,
  // plus a single winding tooth baffle, for the densest, most fortress-like
  // layout yet.
  const STAGE_8 = {
    walls: buildWalls(
      [[100, 160], [420, 480]],
      [[300, 360]],
      [
        { x: 460, y: 60, w: 140, h: 24 },
        { x: 460, y: 166, w: 140, h: 24 },
        { x: 576, y: 60, w: 24, h: 130 },
        { x: 460, y: 84, w: 24, h: 26 },
        { x: 460, y: 150, w: 24, h: 16 },
        { x: 680, y: ROOM_H + 300, w: 160, h: 24 },
        { x: 680, y: ROOM_H + 406, w: 160, h: 24 },
        { x: 680, y: ROOM_H + 300, w: 24, h: 130 },
        { x: 816, y: ROOM_H + 300, w: 24, h: 50 },
        { x: 816, y: ROOM_H + 390, w: 24, h: 16 },
        { x: 900, y: 24, w: 24, h: 280 },
      ]
    ),
    enemies: [
      { type: 'shooter', x: 500, y: 110, fireTimer: 1.0 },
      { type: 'shooter', x: 540, y: 140, fireTimer: 1.3 },
      { type: 'chaser', x: 720, y: ROOM_H + 320, dx: 1, dy: 0 },
      { type: 'chaser', x: 760, y: ROOM_H + 350, dx: 0, dy: -1 },
      { type: 'chaser', x: 200, y: 150, dx: 1, dy: 0 },
      { type: 'shooter', x: 300, y: 380, fireTimer: 1.2 },
      { type: 'chaser', x: 150, y: 380, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 150, y: 150, fireTimer: 1.1 },
      { type: 'chaser', x: ROOM_W + 300, y: 380, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 500, y: 250, fireTimer: 1.4 },
      { type: 'chaser', x: 200, y: ROOM_H + 180, dx: 1, dy: 0 },
      { type: 'shooter', x: 400, y: ROOM_H + 350, fireTimer: 0.9 },
      { type: 'chaser', x: ROOM_W + 250, y: ROOM_H + 180, dx: 0, dy: -1 },
      { type: 'shooter', x: ROOM_W + 500, y: ROOM_H + 150, fireTimer: 1.0 },
      { type: 'chaser', x: ROOM_W + 450, y: ROOM_H + 380, dx: 0, dy: 1 },
    ],
    bossHp: 13,
    bossChargeNormal: 365, bossChargeEnraged: 422,
    bossSpreadNormal: [-0.7, -0.47, -0.23, 0, 0.23, 0.47, 0.7],
    bossSpreadEnraged: [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8],
    bossExtraBurst: true, bossBurstCount: 19, bossShotSpeed: 242,
    enemySpeedMul: 2.25, enemyFireMul: 0.44,
    theme: 'storm',
  };

  // Stage 9: Crimson Sanctum — near-fully-open arena (like stage 6) but with
  // a deliberate hexagonal ring of six pillars surrounding the boss's throne
  // spot, so the final fight before the endgame stage has real cover to
  // break the boss's sightline instead of a bare room.
  const STAGE_9 = {
    walls: buildWalls(
      [[60, WORLD_H - 60]],
      [[60, WORLD_W - 60]],
      [
        { x: 800, y: 560, w: 32, h: 32 },
        { x: 800, y: 700, w: 32, h: 32 },
        { x: 1080, y: 560, w: 32, h: 32 },
        { x: 1080, y: 700, w: 32, h: 32 },
        { x: 940, y: 520, w: 32, h: 32 },
        { x: 940, y: 840, w: 32, h: 32 },
        { x: 250, y: 180, w: 36, h: 36 },
        { x: 450, y: 320, w: 36, h: 36 },
        { x: ROOM_W + 200, y: 200, w: 36, h: 36 },
        { x: ROOM_W + 420, y: 320, w: 36, h: 36 },
        { x: 250, y: ROOM_H + 180, w: 36, h: 36 },
        { x: 450, y: ROOM_H + 320, w: 36, h: 36 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 200, y: 150, dx: 1, dy: 0 },
      { type: 'chaser', x: 400, y: 300, dx: 0, dy: 1 },
      { type: 'shooter', x: 550, y: 180, fireTimer: 1.1 },
      { type: 'chaser', x: 150, y: 380, dx: 1, dy: 0 },
      { type: 'chaser', x: 350, y: 150, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 150, y: 250, fireTimer: 1.0 },
      { type: 'chaser', x: ROOM_W + 300, y: 150, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 450, y: 350, dx: -1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 560, y: 250, fireTimer: 1.4 },
      { type: 'chaser', x: 250, y: ROOM_H + 150, dx: 1, dy: 0 },
      { type: 'shooter', x: 400, y: ROOM_H + 300, fireTimer: 1.3 },
      { type: 'chaser', x: ROOM_W + 200, y: ROOM_H + 180, dx: 0, dy: 1 },
      { type: 'chaser', x: ROOM_W + 380, y: ROOM_H + 330, dx: 0, dy: -1 },
      { type: 'shooter', x: ROOM_W + 520, y: ROOM_H + 200, fireTimer: 0.9 },
      { type: 'chaser', x: 700, y: ROOM_H + 250, dx: 1, dy: 0 },
      { type: 'chaser', x: 1100, y: ROOM_H + 300, dx: -1, dy: 0 },
    ],
    bossHp: 14,
    bossChargeNormal: 375, bossChargeEnraged: 432,
    bossSpreadNormal: [-0.72, -0.51, -0.31, -0.1, 0.1, 0.31, 0.51, 0.72],
    bossSpreadEnraged: [-0.85, -0.66, -0.47, -0.28, -0.09, 0.09, 0.28, 0.47, 0.66, 0.85],
    bossExtraBurst: true, bossBurstCount: 19, bossShotSpeed: 250,
    enemySpeedMul: 2.4, enemyFireMul: 0.4,
    theme: 'crimson',
  };

  // Stage 10: Void Throne — the final hand-built dungeon. A two-lane winding
  // entrance (like stage 4, mirrored) feeds into a grand throne room ringed
  // by eight pillars (a denser version of stage 9's ring), with the largest
  // enemy roster and the richest boss pattern of the run: wide alternating
  // spreads, a big radial burst, and the fastest telegraphed charge.
  const STAGE_10 = {
    walls: buildWalls(
      [[150, 210], [380, 440]],
      [[520, 600]],
      [
        { x: 220, y: 168, w: 24, h: 300 },
        { x: 420, y: 24, w: 24, h: 300 },
        { x: 820, y: 168, w: 24, h: 300 },
        { x: 1020, y: 24, w: 24, h: 300 },
        { x: 1084, y: 638, w: 32, h: 32 },
        { x: 1043, y: 737, w: 32, h: 32 },
        { x: 944, y: 778, w: 32, h: 32 },
        { x: 845, y: 737, w: 32, h: 32 },
        { x: 804, y: 638, w: 32, h: 32 },
        { x: 845, y: 539, w: 32, h: 32 },
        { x: 944, y: 498, w: 32, h: 32 },
        { x: 1043, y: 539, w: 32, h: 32 },
        { x: 300, y: ROOM_H + 150, w: 36, h: 36 },
        { x: ROOM_W + 380, y: ROOM_H + 150, w: 36, h: 36 },
      ]
    ),
    enemies: [
      { type: 'chaser', x: 150, y: 340, dx: 1, dy: 0 },
      { type: 'shooter', x: 300, y: 120, fireTimer: 1.0 },
      { type: 'chaser', x: 480, y: 380, dx: 0, dy: -1 },
      { type: 'shooter', x: 560, y: 200, fireTimer: 1.3 },
      { type: 'chaser', x: ROOM_W + 150, y: 340, dx: 1, dy: 0 },
      { type: 'shooter', x: ROOM_W + 300, y: 120, fireTimer: 1.1 },
      { type: 'chaser', x: ROOM_W + 480, y: 380, dx: 0, dy: 1 },
      { type: 'shooter', x: ROOM_W + 560, y: 200, fireTimer: 1.4 },
      { type: 'chaser', x: 200, y: ROOM_H + 200, dx: 1, dy: 0 },
      { type: 'shooter', x: 400, y: ROOM_H + 350, fireTimer: 0.9 },
      { type: 'chaser', x: 750, y: ROOM_H + 200, dx: 1, dy: 0 },
      { type: 'shooter', x: 1120, y: ROOM_H + 250, fireTimer: 1.2 },
      { type: 'chaser', x: 820, y: ROOM_H + 400, dx: 0, dy: -1 },
      { type: 'shooter', x: 1080, y: ROOM_H + 420, fireTimer: 1.0 },
      { type: 'chaser', x: 900, y: ROOM_H + 80, dx: 1, dy: 0 },
      { type: 'chaser', x: 1150, y: ROOM_H + 380, dx: -1, dy: 0 },
      { type: 'shooter', x: 700, y: ROOM_H + 350, fireTimer: 1.5 },
      { type: 'chaser', x: 1000, y: ROOM_H + 430, dx: 0, dy: -1 },
    ],
    bossHp: 16,
    bossChargeNormal: 390, bossChargeEnraged: 445,
    bossSpreadNormal: [-0.75, -0.53, -0.32, -0.1, 0.1, 0.32, 0.53, 0.75],
    bossSpreadEnraged: [-0.9, -0.72, -0.54, -0.36, -0.18, 0, 0.18, 0.36, 0.54, 0.72, 0.9],
    bossExtraBurst: true, bossBurstCount: 20, bossShotSpeed: 260,
    enemySpeedMul: 2.55, enemyFireMul: 0.38,
    theme: 'void',
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
    if (stage >= 10 && stage <= 10) return STAGE_10;

    // Endless mode: reuse stage 10's dungeon and enemy layout untouched, and
    // smoothly scale the numbers instead. Speed-ish stats get a gentler,
    // separately-capped multiplier than counts/aggression so the arena never
    // turns into an unreadable bullet-storm, and boss HP grows slower still
    // so fights don't become endless damage-sponges. (Every hand-built stage
    // 4-10's own numbers were kept at or below these same caps, so the
    // transition into endless mode never dips below stage 10's toughness.)
    const scale = Math.min(2.5, 1 + (stage - 10) * 0.12);
    const speedScale = Math.min(1.6, scale);
    const hpScale = Math.min(1.8, 1 + (stage - 10) * 0.08);
    return {
      walls: STAGE_10.walls,
      enemies: STAGE_10.enemies,
      bossHp: Math.min(18, Math.round(STAGE_10.bossHp * hpScale)),
      bossChargeNormal: Math.min(420, STAGE_10.bossChargeNormal * speedScale),
      bossChargeEnraged: Math.min(480, STAGE_10.bossChargeEnraged * speedScale),
      bossSpreadNormal: STAGE_10.bossSpreadNormal,
      bossSpreadEnraged: STAGE_10.bossSpreadEnraged,
      bossExtraBurst: true,
      bossBurstCount: Math.min(20, Math.round(STAGE_10.bossBurstCount * Math.min(1.8, scale))),
      bossShotSpeed: Math.min(320, STAGE_10.bossShotSpeed * speedScale),
      enemySpeedMul: Math.min(2.6, STAGE_10.enemySpeedMul * scale),
      enemyFireMul: Math.max(0.35, STAGE_10.enemyFireMul / Math.min(1.8, scale)),
      theme: STAGE_10.theme,
    };
  }

  // Cheap per-stage lighting pass: same brick geometry, different palette,
  // so each stage's dungeon reads as "somewhere new" without redrawing
  // anything. Endless mode reuses stage 10's (void) theme since it reuses
  // stage 10's layout wholesale.
  const THEMES = {
    stone: { floor: ['#463824', '#2e2414'], wall: '#6b4a2a', torch: [255, 200, 100], flameCore: '#fff6c8', flameMid: '#ffb347', flameEdge: '#c23c1a' },
    moss: { floor: ['#39402a', '#20261a'], wall: '#5a6a3a', torch: [220, 235, 130], flameCore: '#f4ffc8', flameMid: '#b8d24f', flameEdge: '#4a7a1a' },
    ember: { floor: ['#442418', '#26120c'], wall: '#7a3d28', torch: [255, 150, 70], flameCore: '#fff0c8', flameMid: '#ff8a3a', flameEdge: '#c21a1a' },
    ice: { floor: ['#26384a', '#132030'], wall: '#3d6a8a', torch: [140, 220, 255], flameCore: '#eaffff', flameMid: '#7fd8ff', flameEdge: '#1a5a8a' },
    ruins: { floor: ['#4a4030', '#241f16'], wall: '#8a7a4a', torch: [255, 225, 150], flameCore: '#fff8d8', flameMid: '#e0b860', flameEdge: '#8a5a1a' },
    shadow: { floor: ['#241a30', '#120c1a'], wall: '#4a3a6a', torch: [180, 140, 255], flameCore: '#f0e0ff', flameMid: '#9a6adf', flameEdge: '#4a1a8a' },
    toxic: { floor: ['#2c3a1a', '#161f0c'], wall: '#5a7a2a', torch: [190, 255, 90], flameCore: '#f0ffc0', flameMid: '#a8e030', flameEdge: '#3a7a10' },
    storm: { floor: ['#22303a', '#101a20'], wall: '#3a5a6a', torch: [170, 190, 255], flameCore: '#e8f0ff', flameMid: '#7a90ff', flameEdge: '#2a2a8a' },
    crimson: { floor: ['#3a1418', '#1a0608'], wall: '#7a2030', torch: [255, 110, 110], flameCore: '#fff0d8', flameMid: '#ff6a4a', flameEdge: '#8a0a1a' },
    void: { floor: ['#160a24', '#08040f'], wall: '#4a1a6a', torch: [220, 140, 255], flameCore: '#ffffff', flameMid: '#c080ff', flameEdge: '#3a0a6a' },
  };

  let player, enemies, projectiles, camX, camY, goal, goalActive, hearts, boss, bossSpawned, torchTime, killStreak, tookDamage;
  let walls, BOSS_HP, enemySpeedMul, enemyFireMul, bossChargeNormal, bossChargeEnraged,
    bossSpreadNormal, bossSpreadEnraged, bossExtraBurst, bossBurstCount, bossShotSpeed, theme, themeKey;
  let flashTimer = 0, flashMax = 0.28, flashColor = '#ff3050', ambientTimer = 0, emberTimer = 0;

  // Shared particle/floating-text FX systems — created once for the whole
  // level instance (not per-frame, not per-stage) and simply cleared on
  // every stage init so their internal arrays don't churn the GC.
  const fxParticles = FX.makeParticles(220);
  const fxText = FX.makeFloatText(30);

  // Fixed decorative wall torches for dungeon atmosphere (purely cosmetic).
  const torches = [
    { x: 44, y: 44 }, { x: WORLD_W - 44, y: 44 },
    { x: 44, y: WORLD_H - 44 }, { x: WORLD_W - 44, y: WORLD_H - 44 },
    { x: ROOM_W, y: ROOM_H / 2 },
  ];

  function spawnBoss() {
    boss = {
      x: BOSS_SPAWN.x, y: BOSS_SPAWN.y, w: 48, h: 48,
      hp: BOSS_HP, alive: true, invuln: 0, hitFlash: 0,
      state: 'idle', stateTimer: 1.2, nextAction: 'charge', dir: { dx: 0, dy: 1 },
      telegraph: 0, shootCount: 0,
    };
  }

  function updateBoss(dt) {
    boss.invuln = Math.max(0, boss.invuln - dt);
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.stateTimer -= dt;
    // Enrage phase once the boss is at half health: attacks come a bit
    // faster and the shot pattern widens, giving the fight an escalating
    // second phase instead of one flat difficulty the whole time.
    const enraged = boss.hp <= Math.ceil(BOSS_HP / 2);

    // Telegraph the charge just before it fires so a fast lunge (which
    // outruns the player) is dodgeable on reaction rather than a cheap hit.
    boss.telegraph = boss.state === 'idle' && boss.nextAction === 'charge' && boss.stateTimer < 0.5
      ? 1 - boss.stateTimer / 0.5
      : 0;

    if (boss.state === 'idle') {
      if (boss.stateTimer <= 0) {
        boss.state = boss.nextAction;
        if (boss.state === 'charge') {
          const dx = player.x - boss.x, dy = player.y - boss.y;
          const len = Math.hypot(dx, dy) || 1;
          boss.dir = { dx: dx / len, dy: dy / len };
          boss.stateTimer = 0.6;
          boss.nextAction = 'idle';
        } else {
          const dx = player.x - boss.x, dy = player.y - boss.y;
          const baseAng = Math.atan2(dy, dx);
          // Stage 2+ bosses alternate a directional spread with a full
          // radial burst every other shot cycle, so the fight has a second,
          // genuinely different attack pattern instead of just more bullets.
          const useBurst = bossExtraBurst && (boss.shootCount % 2 === 1);
          boss.shootCount++;
          if (useBurst) {
            const count = enraged ? bossBurstCount + 4 : bossBurstCount;
            for (let i = 0; i < count; i++) {
              const a = (Math.PI * 2 * i) / count;
              projectiles.push({
                x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
                vx: Math.cos(a) * bossShotSpeed, vy: Math.sin(a) * bossShotSpeed, w: 7, h: 7,
              });
            }
          } else {
            const spread = enraged ? bossSpreadEnraged : bossSpreadNormal;
            spread.forEach((a) => {
              projectiles.push({
                x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
                vx: Math.cos(baseAng + a) * bossShotSpeed, vy: Math.sin(baseAng + a) * bossShotSpeed, w: 7, h: 7,
              });
            });
          }
          sfx('shoot');
          boss.state = 'idle';
          boss.stateTimer = enraged ? 0.9 : 1.3;
          boss.nextAction = 'charge';
        }
      }
    } else if (boss.state === 'charge') {
      const chargeSpeed = enraged ? bossChargeEnraged : bossChargeNormal;
      moveAndCollide(boss, boss.dir.dx * chargeSpeed, boss.dir.dy * chargeSpeed, dt);
      if (boss.stateTimer <= 0) {
        boss.state = 'idle';
        boss.stateTimer = enraged ? 0.6 : 0.9;
        boss.nextAction = 'shoot';
      }
    }
  }

  function moveAndCollide(e, vx, vy, dt) {
    e.x += vx * dt;
    for (const w of walls) {
      if (rectsOverlap(e, w)) {
        if (vx > 0) e.x = w.x - e.w;
        else if (vx < 0) e.x = w.x + w.w;
      }
    }
    e.y += vy * dt;
    for (const w of walls) {
      if (rectsOverlap(e, w)) {
        if (vy > 0) e.y = w.y - e.h;
        else if (vy < 0) e.y = w.y + w.h;
      }
    }
    e.x = Math.max(0, Math.min(WORLD_W - e.w, e.x));
    e.y = Math.max(0, Math.min(WORLD_H - e.h, e.y));
  }

  function spawnEnemies(cfg) {
    enemies = cfg.enemies.map((d) => (
      d.type === 'chaser'
        ? { x: d.x, y: d.y, w: 26, h: 26, type: 'chaser', alive: true, wanderDir: { dx: d.dx, dy: d.dy }, wanderTimer: 1 }
        : { x: d.x, y: d.y, w: 26, h: 26, type: 'shooter', alive: true, fireTimer: d.fireTimer }
    ));
  }

  // Cheap ambient life: a slow drift/ember/shimmer particle every so often,
  // flavored per dungeon theme, plus embers rising off the wall torches.
  // Purely cosmetic — never touches gameplay state.
  function spawnAmbient(dt) {
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      ambientTimer = 0.35 + Math.random() * 0.35;
      const rx = camX + Math.random() * W;
      if (themeKey === 'ice') {
        // Frostbound Corridor: fine snow/frost drifting down the screen.
        fxParticles.spawn(rx, camY - 6, {
          vx: (Math.random() - 0.5) * 12, vy: 26 + Math.random() * 24,
          life: 2.2 + Math.random() * 1.4, size: 1.5 + Math.random() * 2,
          color: '#eaffff', shrink: false, fade: true,
        });
      } else if (themeKey === 'ruins') {
        // Sunken Ruins: faint rising water shimmer/bubbles.
        const ry = camY + Math.random() * H;
        fxParticles.spawn(rx, ry, {
          vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 14,
          life: 1.4 + Math.random(), size: 1.5 + Math.random() * 1.5,
          color: '#8cd8d8', shrink: true, fade: true,
        });
      } else if (themeKey === 'crimson' || themeKey === 'ember') {
        // Crimson Sanctum / ember stages: heat haze embers drifting up.
        fxParticles.spawn(rx, camY + H + 4, {
          vx: (Math.random() - 0.5) * 8, vy: -34 - Math.random() * 26, gravity: -8,
          life: 1.1 + Math.random() * 0.8, size: 1.5 + Math.random() * 2,
          color: '#ff8a3a', shrink: true, fade: true,
        });
      }
    }
    emberTimer -= dt;
    if (emberTimer <= 0) {
      emberTimer = 0.5 + Math.random() * 0.4;
      const t = torches[Math.floor(Math.random() * torches.length)];
      const [tr, tg, tb] = theme.torch;
      fxParticles.spawn(t.x + (Math.random() - 0.5) * 4, t.y - 8, {
        vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 16, gravity: -10,
        life: 0.5 + Math.random() * 0.4, size: 1 + Math.random() * 1.5,
        color: `rgb(${tr},${tg},${tb})`, shrink: true, fade: true,
      });
    }
  }

  return {
    init(stage = 1) {
      const cfg = getStageConfig(stage);
      walls = cfg.walls;
      BOSS_HP = cfg.bossHp;
      bossChargeNormal = cfg.bossChargeNormal;
      bossChargeEnraged = cfg.bossChargeEnraged;
      bossSpreadNormal = cfg.bossSpreadNormal;
      bossSpreadEnraged = cfg.bossSpreadEnraged;
      bossExtraBurst = cfg.bossExtraBurst;
      bossBurstCount = cfg.bossBurstCount;
      bossShotSpeed = cfg.bossShotSpeed;
      enemySpeedMul = cfg.enemySpeedMul;
      enemyFireMul = cfg.enemyFireMul;
      theme = THEMES[cfg.theme] || THEMES.stone;
      themeKey = cfg.theme;

      player = {
        x: 110, y: ROOM_H / 2 - 13, w: 24, h: 26,
        facing: { dx: 0, dy: 1 }, attackTimer: 0, attackCooldown: 0, hitSet: null,
        invuln: 1, hitFlash: 0, powerTimer: 0,
      };
      spawnEnemies(cfg);
      projectiles = [];
      fxParticles.clear();
      fxText.clear();
      hearts = [];
      goal = { x: ROOM_W + ROOM_W / 2 - 14, y: ROOM_H + ROOM_H / 2 - 14, w: 28, h: 28 };
      goalActive = false;
      boss = null;
      bossSpawned = false;
      camX = 0; camY = 0;
      torchTime = 0;
      killStreak = 0;
      tookDamage = false;
      flashTimer = 0;
      flashMax = 0.28;
      ambientTimer = 0;
      emberTimer = 0;
    },

    update(dt) {
      player.invuln = Math.max(0, player.invuln - dt);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.attackCooldown = Math.max(0, player.attackCooldown - dt);
      player.attackTimer = Math.max(0, player.attackTimer - dt);
      player.powerTimer = Math.max(0, player.powerTimer - dt);

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx = -1;
      if (isDown('ArrowRight', 'd')) mvx = 1;
      if (isDown('ArrowUp', 'w')) mvy = -1;
      if (isDown('ArrowDown', 's')) mvy = 1;
      if (mvx || mvy) {
        const len = Math.hypot(mvx, mvy);
        const spd = player.powerTimer > 0 ? PLAYER_SPEED * 1.35 : PLAYER_SPEED;
        moveAndCollide(player, (mvx / len) * spd, (mvy / len) * spd, dt);
        player.facing = { dx: mvx, dy: mvy };
      }

      if (isDown('Space') && player.attackCooldown <= 0) {
        player.attackTimer = ATTACK_DURATION;
        player.attackCooldown = ATTACK_COOLDOWN;
        player.hitSet = new Set();
        sfx('swing');
        // Small blade-glint spark at the swing's leading edge so the swing
        // itself feels like it's cutting the air, even before it connects.
        const tipX = player.x + player.w / 2 + player.facing.dx * 22;
        const tipY = player.y + player.h / 2 + player.facing.dy * 22;
        fxParticles.burst(tipX, tipY, 5, {
          colors: ['#ffffff', '#cfe8ff'], speedMin: 40, speedMax: 90,
          lifeMin: 0.12, lifeMax: 0.22, sizeMin: 1.5, sizeMax: 3,
          angle: Math.atan2(player.facing.dy, player.facing.dx), spread: 1.1,
        });
      }

      let swordRect = null;
      if (player.attackTimer > 0) {
        const reach = 26;
        swordRect = {
          x: player.x + player.w / 2 - 14 + player.facing.dx * reach,
          y: player.y + player.h / 2 - 14 + player.facing.dy * reach,
          w: 28, h: 28,
        };
      }

      const aliveEnemies = enemies.filter((e) => e.alive);

      aliveEnemies.forEach((e, idx) => {
        if (e.type === 'chaser') {
          const dx = player.x - e.x, dy = player.y - e.y;
          const dist = Math.hypot(dx, dy);
          let vx = 0, vy = 0;
          if (dist > 0.01 && dist < 240) {
            vx = (dx / dist) * 90 * enemySpeedMul;
            vy = (dy / dist) * 90 * enemySpeedMul;
          } else if (dist <= 0.01) {
            vx = 0; vy = 0;
          } else {
            e.wanderTimer -= dt;
            if (e.wanderTimer <= 0) {
              e.wanderTimer = 1 + Math.random();
              const opts = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
              e.wanderDir = opts[Math.floor(Math.random() * opts.length)];
            }
            vx = e.wanderDir.dx * 45 * enemySpeedMul;
            vy = e.wanderDir.dy * 45 * enemySpeedMul;
          }
          moveAndCollide(e, vx, vy, dt);
        } else {
          e.fireTimer -= dt;
          if (e.fireTimer <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < 420) {
            e.fireTimer = 2.2 * enemyFireMul;
            const dx = player.x - e.x, dy = player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            projectiles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (dx / len) * 150, vy: (dy / len) * 150, w: 6, h: 6 });
          }
        }

        // Keyed on the enemy object itself, not its index in the alive-enemies
        // list: that list shrinks mid-swing as enemies die, which used to
        // shift indices and could make an untouched enemy wrongly read as
        // "already hit", causing legitimate sword swings to whiff.
        const swordHit = swordRect && !player.hitSet.has(e) && rectsOverlap(swordRect, e);
        const powerHit = player.powerTimer > 0 && rectsOverlap(player, e);
        if (swordHit || powerHit) {
          e.alive = false;
          if (swordHit) player.hitSet.add(e);
          addScore(15);
          sfx('explosion');
          shake(0.1, 3);
          const ecx2 = e.x + e.w / 2, ecy2 = e.y + e.h / 2;
          fxParticles.burst(ecx2, ecy2, 10, {
            colors: ['#ffe28a', '#ff8fc0', '#fff'], speedMin: 50, speedMax: 170,
            lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 4, gravity: 40,
          });
          fxText.spawn(ecx2, ecy2 - 10, '+15', '#ffe28a', { life: 0.7, vy: -36, size: 12 });
          if (Math.random() < HEART_DROP_CHANCE) {
            hearts.push({ x: e.x + e.w / 2 - 8, y: e.y + e.h / 2 - 8, w: 16, h: 16 });
          }
          // No-damage kill streak: every third consecutive kill without being
          // hit earns a bonus, rewarding clean, careful play.
          killStreak++;
          if (killStreak % 3 === 0) {
            addScore(20);
            sfx('pickup');
            fxText.spawn(ecx2, ecy2 - 26, '+20 STREAK', '#8cffb0', { life: 0.8, vy: -30, size: 11 });
          }
        }
      });

      hearts = hearts.filter((h) => {
        if (rectsOverlap(player, h)) {
          player.powerTimer = POWER_TIME;
          addScore(5);
          sfx('pickup');
          return false;
        }
        return true;
      });

      if (!bossSpawned && enemies.every((e) => !e.alive)) {
        bossSpawned = true;
        spawnBoss();
      }

      if (boss && boss.alive) {
        updateBoss(dt);

        const bossSwordHit = boss.invuln <= 0 && swordRect && rectsOverlap(swordRect, boss);
        const bossPowerHit = boss.invuln <= 0 && player.powerTimer > 0 && rectsOverlap(player, boss);
        if (bossSwordHit || bossPowerHit) {
          boss.hp--;
          boss.invuln = 0.4;
          boss.hitFlash = 0.3;
          addScore(30);
          sfx('hit');
          // Stronger shake than a regular enemy hit — landing a shot on the
          // boss should read as heavier and more consequential.
          shake(0.16, 6);
          killStreak++;
          const bcx2 = boss.x + boss.w / 2, bcy2 = boss.y + boss.h / 2;
          fxParticles.burst(bcx2, bcy2, 14, {
            colors: ['#ff4fa3', '#ffd24f', '#fff'], speedMin: 70, speedMax: 210,
            lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 5, gravity: 30,
          });
          fxText.spawn(bcx2, bcy2 - 14, '+30', '#ff9fd0', { life: 0.7, vy: -38, size: 13 });
          if (killStreak % 3 === 0) {
            addScore(20);
            sfx('pickup');
          }
          if (boss.hp <= 0) {
            boss.alive = false;
            goalActive = true;
            addScore(150);
            sfx('explosion');
            // Boss-defeat celebration: the emotional peak of the dungeon gets
            // the biggest shake, a gold screen flash, and a much bigger,
            // multi-color particle shower than a regular kill.
            shake(0.3, 8);
            flashColor = '#ffe28a';
            flashTimer = flashMax = 0.35;
            fxParticles.burst(bcx2, bcy2, 28, {
              colors: ['#ffe28a', '#ff4fa3', '#fff', '#ffd24f'], speedMin: 80, speedMax: 300,
              lifeMin: 0.35, lifeMax: 0.75, sizeMin: 2.5, sizeMax: 6, gravity: 50,
            });
            fxText.spawn(bcx2, bcy2 - 30, 'BOSS DEFEATED! +150', '#ffe28a', { life: 1.3, vy: -26, size: 14 });
          }
        }
      }

      projectiles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        for (const w of walls) {
          if (rectsOverlap(p, w)) p.dead = true;
        }
      });
      projectiles = projectiles.filter((p) => !p.dead && p.x > 0 && p.x < WORLD_W && p.y > 0 && p.y < WORLD_H);

      fxParticles.update(dt);
      fxText.update(dt);
      flashTimer = Math.max(0, flashTimer - dt);
      spawnAmbient(dt);

      if (player.invuln <= 0 && player.powerTimer <= 0) {
        const touchedEnemy = aliveEnemies.some((e) => rectsOverlap(player, e));
        const touchedBoss = boss && boss.alive && rectsOverlap(player, boss);
        const touchedProjectile = projectiles.some((p) => rectsOverlap(player, p));
        if (touchedEnemy || touchedBoss || touchedProjectile) {
          player.invuln = 1.3;
          player.hitFlash = 0.4;
          tookDamage = true;
          killStreak = 0;
          sfx('hurt');
          shake(0.18, 5);
          flashColor = '#ff3050';
          flashTimer = flashMax = 0.28;
          fxParticles.burst(player.x + player.w / 2, player.y + player.h / 2, 10, {
            colors: ['#ff5c5c', '#ffb3b3', '#fff'], speedMin: 60, speedMax: 160,
            lifeMin: 0.2, lifeMax: 0.4, sizeMin: 2, sizeMax: 4, gravity: 20,
          });
          loseLife();
          return;
        }
      }

      if (goalActive && rectsOverlap(player, goal)) {
        // A flawless run (never touched by an enemy, projectile, or the boss)
        // earns a much bigger clear bonus, on top of the escalating kill streak.
        winLevel(tookDamage ? 70 : 170);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_W - W, player.x + player.w / 2 - W / 2));
      camY = Math.max(0, Math.min(WORLD_H - H, player.y + player.h / 2 - H / 2));
    },

    draw(ctx) {
      torchTime += 1 / 60;

      ctx.fillStyle = '#1c1408';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(-camX, -camY);

      FX.gradientRect(ctx, 0, 0, WORLD_W, WORLD_H, theme.floor[0], theme.floor[1]);

      // stone-brick floor texture: coursing seams offset every other row,
      // limited to the visible viewport so cost stays flat regardless of world size
      const TILE = 40;
      const vx0 = Math.max(0, Math.floor(camX / TILE) - 1) * TILE;
      const vx1 = Math.min(WORLD_W, camX + W + TILE);
      const vy0 = Math.max(0, Math.floor(camY / TILE) - 1) * TILE;
      const vy1 = Math.min(WORLD_H, camY + H + TILE);
      ctx.lineWidth = 1;
      for (let y = vy0; y < vy1; y += TILE) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,160,0.05)';
        ctx.beginPath(); ctx.moveTo(vx0, y + 1); ctx.lineTo(vx1, y + 1); ctx.stroke();
        const rowIdx = Math.round(y / TILE);
        const offset = (rowIdx % 2) * (TILE / 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        for (let x = vx0 + offset; x < vx1; x += TILE) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); ctx.stroke();
        }
      }

      walls.forEach((w) => {
        FX.bevelRect(ctx, w.x, w.y, w.w, w.h, theme.wall, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
        // mortar coursing lines on corridor walls / obstacle blocks (skip the long world borders)
        const short = Math.min(w.w, w.h), long = Math.max(w.w, w.h);
        if (short <= 40 && long <= 320) {
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1;
          if (w.h >= w.w) {
            for (let yy = w.y + 16; yy < w.y + w.h - 4; yy += 16) {
              ctx.beginPath(); ctx.moveTo(w.x + 2, yy); ctx.lineTo(w.x + w.w - 2, yy); ctx.stroke();
            }
          } else {
            for (let xx = w.x + 16; xx < w.x + w.w - 4; xx += 16) {
              ctx.beginPath(); ctx.moveTo(xx, w.y + 2); ctx.lineTo(xx, w.y + w.h - 2); ctx.stroke();
            }
          }
        }
      });

      // wall-mounted torches for warm dungeon atmosphere
      torches.forEach((t, i) => {
        const flicker = 0.75 + Math.sin(torchTime * 9 + i * 2.3) * 0.15 + Math.sin(torchTime * 23 + i) * 0.06;
        const [tr, tg, tb] = theme.torch;
        const glow = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 46 * flicker);
        glow.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, ${0.42 * flicker})`);
        glow.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 46 * flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(t.x - 3, t.y - 2, 6, 10);
        const flameGrad = ctx.createRadialGradient(t.x, t.y - 6, 1, t.x, t.y - 6, 8 * flicker);
        flameGrad.addColorStop(0, theme.flameCore);
        flameGrad.addColorStop(0.5, theme.flameMid);
        flameGrad.addColorStop(1, theme.flameEdge);
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y - 6 - flicker, 4 * flicker, 7 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      if (goalActive) {
        const pulse = 0.7 + Math.sin(torchTime * 4) * 0.3;
        const gcx = goal.x + goal.w / 2, gcy = goal.y + goal.h / 2;
        const glow = ctx.createRadialGradient(gcx, gcy, 2, gcx, gcy, 30 * pulse);
        glow.addColorStop(0, `rgba(255,210,79,${0.5 * pulse})`);
        glow.addColorStop(1, 'rgba(255,210,79,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(gcx, gcy, 30 * pulse, 0, Math.PI * 2);
        ctx.fill();

        const diaGrad = ctx.createLinearGradient(goal.x, goal.y, goal.x + goal.w, goal.y + goal.h);
        diaGrad.addColorStop(0, '#fff3c0');
        diaGrad.addColorStop(0.5, '#ffd24f');
        diaGrad.addColorStop(1, '#c98f1a');
        ctx.fillStyle = diaGrad;
        ctx.save();
        ctx.translate(gcx, gcy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-goal.w / 2, -goal.h / 2, goal.w, goal.h);
        ctx.strokeStyle = 'rgba(90,50,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-goal.w / 2, -goal.h / 2, goal.w, goal.h);
        ctx.restore();
      }

      hearts.forEach((h) => {
        const hcx = h.x + h.w / 2, hcy = h.y + h.h / 2;
        const heartGrad = ctx.createRadialGradient(hcx - 2, hcy - 3, 1, hcx, hcy, 9);
        heartGrad.addColorStop(0, '#ffb3d9');
        heartGrad.addColorStop(1, '#ff4fa3');
        ctx.fillStyle = heartGrad;
        ctx.beginPath();
        ctx.arc(hcx - 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.arc(hcx + 4, hcy - 3, 5, 0, Math.PI * 2);
        ctx.moveTo(hcx - 8, hcy - 1);
        ctx.lineTo(hcx, hcy + 8);
        ctx.lineTo(hcx + 8, hcy - 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,0,40,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      enemies.filter((e) => e.alive).forEach((e) => {
        const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
        if (e.type === 'chaser') {
          FX.shadow(ctx, ecx, ecy + e.h / 2 + 2, e.w / 2, 3, 0.3);
          FX.sphere(ctx, ecx, ecy, e.w / 2, '#ff4fa3');
          ctx.strokeStyle = 'rgba(40,0,20,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ecx, ecy, e.w / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ecx - 4, ecy - 2, 3, 0, Math.PI * 2);
          ctx.arc(ecx + 4, ecy - 2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1a0a10';
          ctx.beginPath();
          ctx.arc(ecx - 4, ecy - 1, 1.4, 0, Math.PI * 2);
          ctx.arc(ecx + 4, ecy - 1, 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(ecx - 5, ecy - 3, 0.7, 0, Math.PI * 2);
          ctx.arc(ecx + 3, ecy - 3, 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          FX.shadow(ctx, ecx, e.y + e.h + 2, e.w / 2, 3, 0.3);
          FX.bevelRect(ctx, e.x, e.y, e.w, e.h, '#2a5a5a', 3);
          ctx.strokeStyle = 'rgba(0,15,15,0.5)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(e.x + 0.75, e.y + 0.75, e.w - 1.5, e.h - 1.5);
          const lensGrad = ctx.createRadialGradient(ecx - 2, ecy - 2, 1, ecx, ecy, e.w / 2 - 4);
          lensGrad.addColorStop(0, '#9dfff0');
          lensGrad.addColorStop(1, '#2a8a7a');
          ctx.fillStyle = lensGrad;
          ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
          ctx.fillStyle = '#0a2a2a';
          ctx.beginPath();
          ctx.arc(ecx, ecy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(ecx - 1.5, ecy - 1.5, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (boss && boss.alive) {
        const bcx = boss.x + boss.w / 2, bcy = boss.y + boss.h / 2;
        const flashing = boss.hitFlash > 0 && Math.floor(boss.hitFlash * 20) % 2 === 0;
        FX.shadow(ctx, bcx, bcy + boss.h / 2 + 3, boss.w / 2, 5, 0.4);

        // Charge wind-up telegraph: a growing red warning ring plus a
        // directional wedge toward the player, so the charge (which is
        // faster than the player) reads as a dodgeable threat, not a
        // cheap surprise hit.
        if (boss.telegraph > 0) {
          const t = boss.telegraph;
          ctx.strokeStyle = `rgba(255,60,60,${0.25 + t * 0.5})`;
          ctx.lineWidth = 2 + t * 2;
          ctx.beginPath();
          ctx.arc(bcx, bcy, boss.w / 2 + 6 + t * 8, 0, Math.PI * 2);
          ctx.stroke();
          const pdx = player.x + player.w / 2 - bcx, pdy = player.y + player.h / 2 - bcy;
          const ang = Math.atan2(pdy, pdx);
          const tipDist = boss.w / 2 + 14 + t * 10;
          ctx.fillStyle = `rgba(255,80,60,${0.35 + t * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(bcx + Math.cos(ang) * tipDist, bcy + Math.sin(ang) * tipDist);
          ctx.lineTo(bcx + Math.cos(ang + 2.6) * (boss.w / 2 + 4), bcy + Math.sin(ang + 2.6) * (boss.w / 2 + 4));
          ctx.lineTo(bcx + Math.cos(ang - 2.6) * (boss.w / 2 + 4), bcy + Math.sin(ang - 2.6) * (boss.w / 2 + 4));
          ctx.closePath();
          ctx.fill();
        }
        // Subtle idle breathing/pulsing so the boss reads as alive even when
        // it isn't mid-attack — a slow radius wobble, not a state change.
        const breathe = boss.state === 'idle' ? 1 + Math.sin(torchTime * 2.4) * 0.035 : 1;
        const bw = (boss.w / 2) * breathe, bh = (boss.h / 2) * breathe;
        if (flashing) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(bcx, bcy, bw, bh, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // dramatic pulsing aura + multi-tone body for a final-boss feel
          const auraGrad = ctx.createRadialGradient(bcx, bcy, boss.w * 0.4, bcx, bcy, boss.w * 0.75);
          auraGrad.addColorStop(0, 'rgba(255,79,163,0)');
          auraGrad.addColorStop(1, `rgba(255,79,163,${0.15 + Math.sin(torchTime * 5) * 0.08})`);
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(bcx, bcy, boss.w * 0.75 * breathe, 0, Math.PI * 2);
          ctx.fill();
          FX.sphere(ctx, bcx, bcy, bw, '#8a2a5a');
          // extra cast rim-shadow along the lower edge, for a heavier,
          // more grounded silhouette than a flat gradient sphere alone
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bcx, bcy, bw - 1.5, Math.PI * 0.12, Math.PI * 0.88);
          ctx.stroke();
          // spiked crown silhouette
          ctx.fillStyle = FX.shade('#8a2a5a', -22);
          [-0.6, -0.2, 0.2, 0.6].forEach((a) => {
            const sxp = bcx + Math.cos(-Math.PI / 2 + a) * boss.w * 0.42;
            const syp = bcy + Math.sin(-Math.PI / 2 + a) * boss.h * 0.42;
            ctx.beginPath();
            ctx.moveTo(sxp - 3, syp + 4);
            ctx.lineTo(sxp, syp - 8);
            ctx.lineTo(sxp + 3, syp + 4);
            ctx.closePath();
            ctx.fill();
          });
        }
        ctx.strokeStyle = 'rgba(30,0,15,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(bcx, bcy, bw, bh, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd24f';
        ctx.beginPath();
        ctx.arc(bcx - 9, bcy - 4, 4, 0, Math.PI * 2);
        ctx.arc(bcx + 9, bcy - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a0a1a';
        ctx.beginPath();
        ctx.arc(bcx - 9 + boss.dir.dx * 2, bcy - 4 + boss.dir.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.arc(bcx + 9 + boss.dir.dx * 2, bcy - 4 + boss.dir.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(bcx - 10, bcy - 6, 0.9, 0, Math.PI * 2);
        ctx.arc(bcx + 8, bcy - 6, 0.9, 0, Math.PI * 2);
        ctx.fill();

        const barW = 50;
        ctx.fillStyle = '#2a0a1a';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW, 5);
        ctx.fillStyle = '#ff4fa3';
        ctx.fillRect(bcx - barW / 2, boss.y - 12, barW * (boss.hp / BOSS_HP), 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bcx - barW / 2 + 0.5, boss.y - 11.5, barW - 1, 4);
      }

      projectiles.forEach((p) => {
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
        pg.addColorStop(0, '#fff6c8');
        pg.addColorStop(0.5, '#ffd24f');
        pg.addColorStop(1, 'rgba(255,140,20,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      fxParticles.draw(ctx);
      fxText.draw(ctx);

      if (player.attackTimer > 0) {
        const reach = 26;
        const sx = player.x + player.w / 2 - 14 + player.facing.dx * reach;
        const sy = player.y + player.h / 2 - 14 + player.facing.dy * reach;
        const swingGrad = ctx.createLinearGradient(sx, sy, sx + 28, sy + 28);
        swingGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
        swingGrad.addColorStop(0.5, 'rgba(210,225,255,0.75)');
        swingGrad.addColorStop(1, 'rgba(140,170,255,0.35)');
        ctx.fillStyle = swingGrad;
        ctx.fillRect(sx, sy, 28, 28);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 4, sy + 4, 20, 20);
        // A bright glint sweeps across the blade as the swing progresses,
        // peaking mid-swing, so the sword reads as catching the light.
        const swingT = 1 - player.attackTimer / ATTACK_DURATION;
        const glintA = Math.sin(Math.min(1, Math.max(0, swingT)) * Math.PI);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * glintA})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 3, sy + 25 - swingT * 20);
        ctx.lineTo(sx + 25, sy + 3 + swingT * 4);
        ctx.stroke();
      }

      {
        if (player.powerTimer > 0) {
          ctx.strokeStyle = `rgba(255, 210, 79, ${0.4 + Math.sin(player.powerTimer * 12) * 0.3})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 22, 0, Math.PI * 2);
          ctx.stroke();
        }
        const bodyColor = player.powerTimer > 0
          ? '#ffd24f'
          : (player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0) ? '#ff5c5c' : '#3fae3f';
        const pcx = player.x + player.w / 2;
        FX.shadow(ctx, pcx, player.y + player.h + 3, player.w / 2, 3, 0.3);
        FX.bevelRect(ctx, player.x, player.y + 9, player.w, player.h - 9, bodyColor, 3);
        ctx.strokeStyle = 'rgba(20,20,10,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(player.x + 0.75, player.y + 9.75, player.w - 1.5, player.h - 10.5);
        // soft rim-light over the torso for a rounder, less flat-shaded look
        const rimGrad = ctx.createRadialGradient(
          player.x + player.w * 0.3, player.y + 14, 2,
          pcx, player.y + 20, player.w
        );
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rimGrad;
        ctx.fillRect(player.x, player.y + 9, player.w, player.h - 9);
        // tunic highlight streak for a glossier, more lit look
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(player.x + 2, player.y + 11, 3, player.h - 13);
        ctx.fillStyle = '#7a4a1a';
        ctx.fillRect(player.x, player.y + player.h - 8, player.w, 3);
        ctx.strokeStyle = 'rgba(20,10,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(player.x + 0.5, player.y + player.h - 7.5, player.w - 1, 2);
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath();
        ctx.arc(pcx, player.y + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,50,20,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(pcx - 2, player.y + 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(pcx - 7, player.y + 4);
        ctx.lineTo(pcx + 7, player.y + 4);
        ctx.lineTo(pcx, player.y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,10,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // weapon glint
        ctx.fillStyle = '#e8b98a';
        ctx.fillRect(
          player.x + player.w / 2 - 3 + player.facing.dx * 10,
          player.y + player.h / 2 - 3 + player.facing.dy * 10,
          6, 6
        );
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(
          player.x + player.w / 2 - 3 + player.facing.dx * 10,
          player.y + player.h / 2 - 3 + player.facing.dy * 10,
          2, 2
        );
      }

      ctx.restore();

      // Full-screen hit-stun / celebration wash (drawn in screen space, after
      // the camera transform is restored, so it always covers the viewport).
      if (flashTimer > 0) {
        FX.flash(ctx, W, H, flashColor, (flashTimer / flashMax) * 0.35);
      }

      const remaining = enemies.filter((e) => e.alive).length;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      let hint = 'FIND THE TRIFORCE SHARD';
      if (remaining > 0) hint = `ENEMIES LEFT: ${remaining}`;
      else if (boss && boss.alive) hint = 'DEFEAT THE OVERLORD';
      ctx.fillText(hint, 8, 16);
    },
  };
}
