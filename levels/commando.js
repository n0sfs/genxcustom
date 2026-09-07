function createCommandoLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const WORLD_W = 2600;
  const GROUND_Y = H - 50;
  const PLAYER_SPEED = 180;
  const SHOT_COOLDOWN = 0.16;

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { dx: x / len, dy: y / len };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const CRATE_DEFS = [
    { x: 260, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 520, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 900, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 1260, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 1620, y: GROUND_Y - 26, w: 44, h: 26 },
    { x: 1980, y: GROUND_Y - 40, w: 44, h: 40 },
    { x: 2280, y: GROUND_Y - 26, w: 44, h: 26 },
  ];
  const RAPID_TIME = 6;
  const RAPID_DROP_CHANCE = 0.35;

  // Cheap per-stage palette shift (background/scenery only) to sell "deeper into
  // hostile territory" - mirrors the day/dusk/night approach used by racing.js.
  const THEMES = {
    day: {
      sky: ['#15301f', '#0a1610'],
      canopyDark: '#132419', canopyLight: '#1a2e1e',
      foliageDark: '#1e3624', foliageLight: '#25402a',
      ground: ['#3a4e30', '#1a2416'],
    },
    dusk: {
      sky: ['#3a2a18', '#160e08'],
      canopyDark: '#2a2014', canopyLight: '#332818',
      foliageDark: '#3a2c16', foliageLight: '#46351c',
      ground: ['#4a3c22', '#22190e'],
    },
    night: {
      sky: ['#0d1620', '#04080c'],
      canopyDark: '#0e1a16', canopyLight: '#16241c',
      foliageDark: '#122a1c', foliageLight: '#1a3624',
      ground: ['#1c2c1e', '#0a120c'],
    },
    // Stage 4: overcast river crossing.
    river: {
      sky: ['#1a3530', '#0a1815'],
      canopyDark: '#122820', canopyLight: '#1a3428',
      foliageDark: '#1e4030', foliageLight: '#2a4c38',
      ground: ['#2e4a3a', '#141f18'],
    },
    // Stage 5: murky dusk marsh.
    dusk2: {
      sky: ['#3a3020', '#160f08'],
      canopyDark: '#2a2818', canopyLight: '#34301c',
      foliageDark: '#3a3818', foliageLight: '#403c20',
      ground: ['#3a3822', '#1a1810'],
    },
    // Stage 6: ruined base at dusk.
    ruins: {
      sky: ['#3a2a2a', '#160e0e'],
      canopyDark: '#2e2626', canopyLight: '#3a2e2e',
      foliageDark: '#332828', foliageLight: '#3e3030',
      ground: ['#4a3e3a', '#201a18'],
    },
    // Stage 7: night thunderstorm.
    storm: {
      sky: ['#151030', '#05040c'],
      canopyDark: '#181430', canopyLight: '#221c3a',
      foliageDark: '#1c1834', foliageLight: '#26203e',
      ground: ['#221e34', '#0c0a16'],
    },
    // Stage 8: ruined base at night.
    ruinsNight: {
      sky: ['#12161e', '#04060a'],
      canopyDark: '#1a1a20', canopyLight: '#242428',
      foliageDark: '#1e1e26', foliageLight: '#28282e',
      ground: ['#26221e', '#0e0c0a'],
    },
    // Stage 9: deep night storm.
    storm2: {
      sky: ['#100c26', '#030209'],
      canopyDark: '#140f2a', canopyLight: '#1c1636',
      foliageDark: '#160f30', foliageLight: '#201840',
      ground: ['#1c1830', '#080614'],
    },
    // Stage 10: final gauntlet - blood-red skies over a burning perimeter.
    gauntlet: {
      sky: ['#2a0e10', '#0a0304'],
      canopyDark: '#280e10', canopyLight: '#341216',
      foliageDark: '#2c1012', foliageLight: '#38161a',
      ground: ['#3a1418', '#140506'],
    },
  };

  // Per-theme ambient flavor (weather/atmosphere touches only - never touches
  // spawns/pacing). Purely additive on top of THEMES above.
  const AMBIENT = {
    river: { type: 'shimmer' },
    dusk2: { type: 'fog' },
    ruins: { type: 'embers', intensity: 1 },
    storm: { type: 'rain', intensity: 1, lightning: true },
    ruinsNight: { type: 'embers', intensity: 1.25 },
    storm2: { type: 'rain', intensity: 1.3, lightning: true },
    gauntlet: { type: 'embers', intensity: 1.9, lightning: true },
  };

  // Stage 1: the original default layout/pace.
  const STAGE_CONFIGS = [
    {
      gruntSpawns: [
        { x: 380, range: [320, 480] },
        { x: 760, range: [700, 900] },
        { x: 1180, range: [1100, 1320] },
        { x: 1720, range: [1650, 1850] },
        { x: 2140, range: [2060, 2280] },
      ],
      turretSpawns: [{ x: 540, y: GROUND_Y - 40 }, { x: 2000, y: GROUND_Y - 40 }],
      chopperSpawns: [
        { range: [200, 900], y: 80 },
        { range: [1300, 2100], y: 110 },
      ],
      fireRateMul: 1,
      speedMul: 1,
      theme: 'day',
    },
    // Stage 2: more grunts, an extra turret and chopper, repositioned, faster fire.
    {
      gruntSpawns: [
        { x: 300, range: [240, 420] },
        { x: 620, range: [560, 760] },
        { x: 940, range: [860, 1080] },
        { x: 1300, range: [1220, 1440] },
        { x: 1650, range: [1580, 1780] },
        { x: 1980, range: [1900, 2120] },
        { x: 2280, range: [2200, 2400] },
      ],
      turretSpawns: [{ x: 460, y: GROUND_Y - 40 }, { x: 1300, y: GROUND_Y - 40 }, { x: 2100, y: GROUND_Y - 40 }],
      chopperSpawns: [
        { range: [200, 700], y: 80 },
        { range: [900, 1500], y: 100 },
        { range: [1700, 2300], y: 120 },
      ],
      fireRateMul: 1.25,
      speedMul: 1.15,
      theme: 'dusk',
    },
    // Stage 3: dense/fast, plus an extra wave guarding the extraction point.
    {
      gruntSpawns: [
        { x: 280, range: [220, 400] },
        { x: 560, range: [500, 700] },
        { x: 840, range: [780, 980] },
        { x: 1140, range: [1080, 1300] },
        { x: 1440, range: [1380, 1600] },
        { x: 1740, range: [1680, 1900] },
        { x: 2020, range: [1960, 2160] },
        { x: 2350, range: [2300, 2480] },
        { x: 2470, range: [2400, 2550] },
      ],
      turretSpawns: [
        { x: 420, y: GROUND_Y - 40 },
        { x: 1120, y: GROUND_Y - 40 },
        { x: 1860, y: GROUND_Y - 40 },
        { x: 2440, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 650], y: 80 },
        { range: [750, 1250], y: 100 },
        { range: [1350, 1900], y: 90 },
        { range: [2050, 2500], y: 120 },
      ],
      fireRateMul: 1.5,
      speedMul: 1.3,
      theme: 'night',
    },
    // Stage 4: river crossing - grunts bunch tightly at narrow crossing points,
    // turrets sit right on top of the crossings themselves.
    {
      gruntSpawns: [
        { x: 260, range: [220, 340] },
        { x: 340, range: [260, 420] },
        { x: 700, range: [640, 820] },
        { x: 820, range: [720, 860] },
        { x: 1150, range: [1100, 1220] },
        { x: 1550, range: [1480, 1650] },
        { x: 1650, range: [1560, 1700] },
        { x: 1950, range: [1880, 2060] },
        { x: 2300, range: [2240, 2380] },
        { x: 2380, range: [2300, 2450] },
      ],
      turretSpawns: [
        { x: 400, y: GROUND_Y - 40 },
        { x: 1180, y: GROUND_Y - 40 },
        { x: 1600, y: GROUND_Y - 40 },
        { x: 2340, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 750], y: 80 },
        { range: [850, 1400], y: 100 },
        { range: [1500, 2050], y: 90 },
        { range: [2150, 2500], y: 110 },
      ],
      fireRateMul: 1.62,
      speedMul: 1.36,
      theme: 'river',
    },
    // Stage 5: murky marsh - spread ambush groups building into a dense
    // gauntlet in the last quarter before extraction.
    {
      gruntSpawns: [
        { x: 260, range: [200, 380] },
        { x: 560, range: [500, 680] },
        { x: 820, range: [760, 920] },
        { x: 1080, range: [1000, 1180] },
        { x: 1350, range: [1280, 1460] },
        { x: 1600, range: [1520, 1700] },
        { x: 1850, range: [1780, 1950] },
        { x: 2100, range: [2040, 2200] },
        { x: 2220, range: [2140, 2300] },
        { x: 2340, range: [2260, 2420] },
        { x: 2440, range: [2380, 2520] },
      ],
      turretSpawns: [
        { x: 460, y: GROUND_Y - 40 },
        { x: 1000, y: GROUND_Y - 40 },
        { x: 1650, y: GROUND_Y - 40 },
        { x: 2150, y: GROUND_Y - 40 },
        { x: 2420, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 700], y: 80 },
        { range: [750, 1250], y: 100 },
        { range: [1300, 1800], y: 90 },
        { range: [1900, 2350], y: 110 },
        { range: [2200, 2500], y: 75 },
      ],
      fireRateMul: 1.78,
      speedMul: 1.44,
      theme: 'dusk2',
    },
    // Stage 6: ruined base - grunts cluster in pairs at rubble chokepoints,
    // turrets placed close together so their fire arcs overlap.
    {
      gruntSpawns: [
        { x: 240, range: [200, 320] },
        { x: 320, range: [240, 380] },
        { x: 600, range: [560, 680] },
        { x: 680, range: [600, 740] },
        { x: 960, range: [900, 1040] },
        { x: 1250, range: [1180, 1340] },
        { x: 1330, range: [1240, 1400] },
        { x: 1600, range: [1520, 1680] },
        { x: 1900, range: [1820, 1980] },
        { x: 1980, range: [1900, 2060] },
        { x: 2260, range: [2180, 2340] },
        { x: 2340, range: [2260, 2420] },
      ],
      turretSpawns: [
        { x: 420, y: GROUND_Y - 40 },
        { x: 500, y: GROUND_Y - 40 },
        { x: 1200, y: GROUND_Y - 40 },
        { x: 1850, y: GROUND_Y - 40 },
        { x: 2300, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 650], y: 80 },
        { range: [700, 1150], y: 105 },
        { range: [1200, 1700], y: 90 },
        { range: [1750, 2200], y: 115 },
        { range: [2100, 2500], y: 85 },
      ],
      fireRateMul: 1.94,
      speedMul: 1.52,
      theme: 'ruins',
    },
    // Stage 7: night thunderstorm - fewer ground changes, but six overlapping
    // chopper patrol lanes stacked over most of the map.
    {
      gruntSpawns: [
        { x: 260, range: [220, 360] },
        { x: 520, range: [460, 600] },
        { x: 780, range: [720, 880] },
        { x: 1020, range: [960, 1120] },
        { x: 1260, range: [1200, 1360] },
        { x: 1500, range: [1440, 1600] },
        { x: 1740, range: [1680, 1840] },
        { x: 1980, range: [1920, 2080] },
        { x: 2180, range: [2120, 2280] },
        { x: 2320, range: [2260, 2400] },
        { x: 2420, range: [2360, 2480] },
        { x: 2500, range: [2440, 2560] },
      ],
      turretSpawns: [
        { x: 440, y: GROUND_Y - 40 },
        { x: 1100, y: GROUND_Y - 40 },
        { x: 1700, y: GROUND_Y - 40 },
        { x: 2150, y: GROUND_Y - 40 },
        { x: 2450, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 600], y: 75 },
        { range: [500, 950], y: 105 },
        { range: [1000, 1450], y: 85 },
        { range: [1400, 1850], y: 115 },
        { range: [1900, 2300], y: 90 },
        { range: [2250, 2500], y: 120 },
      ],
      fireRateMul: 2.1,
      speedMul: 1.6,
      theme: 'storm',
    },
    // Stage 8: ruined base at night - chokepoint clusters and overlapping
    // turret pairs combined for the toughest ground fight yet.
    {
      gruntSpawns: [
        { x: 240, range: [200, 300] },
        { x: 300, range: [240, 360] },
        { x: 560, range: [500, 620] },
        { x: 640, range: [560, 700] },
        { x: 900, range: [840, 980] },
        { x: 1160, range: [1080, 1240] },
        { x: 1240, range: [1160, 1320] },
        { x: 1500, range: [1420, 1580] },
        { x: 1780, range: [1700, 1860] },
        { x: 1860, range: [1780, 1940] },
        { x: 2100, range: [2020, 2180] },
        { x: 2300, range: [2220, 2380] },
        { x: 2380, range: [2300, 2460] },
      ],
      turretSpawns: [
        { x: 400, y: GROUND_Y - 40 },
        { x: 480, y: GROUND_Y - 40 },
        { x: 1200, y: GROUND_Y - 40 },
        { x: 1750, y: GROUND_Y - 40 },
        { x: 1830, y: GROUND_Y - 40 },
        { x: 2320, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [200, 600], y: 80 },
        { range: [650, 1050], y: 110 },
        { range: [1100, 1550], y: 90 },
        { range: [1600, 2000], y: 115 },
        { range: [2000, 2400], y: 85 },
        { range: [2250, 2500], y: 105 },
      ],
      fireRateMul: 2.26,
      speedMul: 1.68,
      theme: 'ruinsNight',
    },
    // Stage 9: deep night storm - heavy overlapping chopper lanes end to end
    // plus the densest grunt count yet, moving fast.
    {
      gruntSpawns: [
        { x: 220, range: [180, 300] },
        { x: 300, range: [240, 360] },
        { x: 520, range: [460, 600] },
        { x: 760, range: [700, 840] },
        { x: 840, range: [760, 900] },
        { x: 1080, range: [1000, 1160] },
        { x: 1320, range: [1240, 1400] },
        { x: 1400, range: [1320, 1480] },
        { x: 1620, range: [1540, 1700] },
        { x: 1860, range: [1780, 1940] },
        { x: 2080, range: [2000, 2160] },
        { x: 2260, range: [2180, 2340] },
        { x: 2360, range: [2280, 2440] },
        { x: 2460, range: [2380, 2540] },
      ],
      turretSpawns: [
        { x: 420, y: GROUND_Y - 40 },
        { x: 1000, y: GROUND_Y - 40 },
        { x: 1500, y: GROUND_Y - 40 },
        { x: 1900, y: GROUND_Y - 40 },
        { x: 2150, y: GROUND_Y - 40 },
        { x: 2420, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [180, 550], y: 75 },
        { range: [500, 900], y: 110 },
        { range: [900, 1300], y: 85 },
        { range: [1300, 1700], y: 115 },
        { range: [1700, 2150], y: 90 },
        { range: [2100, 2500], y: 120 },
      ],
      fireRateMul: 2.42,
      speedMul: 1.76,
      theme: 'storm2',
    },
    // Stage 10: final gauntlet - everything at once: tight chokepoint clusters,
    // overlapping turret arcs, and a last dense wave guarding extraction.
    {
      gruntSpawns: [
        { x: 220, range: [180, 300] },
        { x: 300, range: [240, 360] },
        { x: 520, range: [460, 600] },
        { x: 600, range: [520, 660] },
        { x: 840, range: [780, 900] },
        { x: 1060, range: [1000, 1140] },
        { x: 1140, range: [1060, 1220] },
        { x: 1380, range: [1300, 1460] },
        { x: 1600, range: [1520, 1680] },
        { x: 1680, range: [1600, 1760] },
        { x: 1900, range: [1820, 1980] },
        { x: 2080, range: [2000, 2160] },
        { x: 2260, range: [2180, 2340] },
        { x: 2340, range: [2260, 2420] },
        { x: 2440, range: [2360, 2520] },
      ],
      turretSpawns: [
        { x: 400, y: GROUND_Y - 40 },
        { x: 480, y: GROUND_Y - 40 },
        { x: 1150, y: GROUND_Y - 40 },
        { x: 1650, y: GROUND_Y - 40 },
        { x: 2000, y: GROUND_Y - 40 },
        { x: 2280, y: GROUND_Y - 40 },
        { x: 2420, y: GROUND_Y - 40 },
      ],
      chopperSpawns: [
        { range: [180, 550], y: 75 },
        { range: [500, 900], y: 110 },
        { range: [850, 1250], y: 85 },
        { range: [1250, 1650], y: 115 },
        { range: [1650, 2050], y: 90 },
        { range: [2000, 2400], y: 120 },
        { range: [2250, 2500], y: 80 },
      ],
      fireRateMul: 2.6,
      speedMul: 1.85,
      theme: 'gauntlet',
    },
  ];

  function getStageConfig(stage) {
    const idx = Math.min(Math.max(stage, 1), 10) - 1;
    const base = STAGE_CONFIGS[idx];
    if (stage <= 10) return { ...base, fireRateMul: base.fireRateMul, speedMul: base.speedMul };
    // Endless mode: stage 10's layout is the base, scaled smoothly harder each stage.
    const scale = Math.min(1 + (stage - 10) * 0.12, 1.8);
    return {
      ...base,
      fireRateMul: Math.min(base.fireRateMul * scale, 3),
      speedMul: Math.min(base.speedMul * scale, 2),
    };
  }

  const extraction = { x: WORLD_W - 70, y: GROUND_Y - 90, w: 50, h: 90 };

  // Particle/text systems live once per level instance (not recreated per
  // stage/frame) - init() just clears them between stages.
  const hitFx = FX.makeParticles(140);
  const ambientFx = FX.makeParticles(70);
  const floatText = FX.makeFloatText(24);

  let player, bullets, enemyBullets, grunts, turrets, choppers, crates, powerups, rainDrops, camX, extractionOpen;
  let fireRateMul, speedMul, theme, ambientCfg, ambientTimer, lightningTimer, lightningFlash, screenFlash, elapsed;

  function popup(x, y, text, color, size) {
    floatText.spawn(x, y - 6, text, color, { life: 0.8, vy: -22, size: size || 10 });
  }

  function aliveEnemies() {
    return [...grunts.filter((e) => e.alive), ...turrets.filter((e) => e.alive), ...choppers.filter((e) => e.alive)];
  }

  return {
    init(stage = 1) {
      const cfg = getStageConfig(stage);
      fireRateMul = cfg.fireRateMul;
      speedMul = cfg.speedMul;
      theme = THEMES[cfg.theme] || THEMES.day;
      ambientCfg = AMBIENT[cfg.theme] || null;
      ambientTimer = 0;
      lightningTimer = 2 + Math.random() * 3;
      lightningFlash = 0;
      screenFlash = 0;
      elapsed = 0;
      rainDrops = ambientCfg && ambientCfg.type === 'rain'
        ? Array.from({ length: Math.round(36 * (ambientCfg.intensity || 1)) }, () => ({
            x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 10, speed: 420 + Math.random() * 260,
          }))
        : [];

      player = {
        x: 40, y: GROUND_Y - 40, w: 20, h: 40,
        facing: { dx: 1, dy: 0 }, shotCooldown: 0, invuln: 1, hitFlash: 0, rapidTimer: 0,
        killStreak: 0, killStreakTimer: 0,
      };
      bullets = [];
      enemyBullets = [];
      hitFx.clear();
      ambientFx.clear();
      floatText.clear();
      powerups = [];
      camX = 0;
      extractionOpen = false;
      crates = CRATE_DEFS.map((c) => ({ ...c, alive: true }));

      grunts = cfg.gruntSpawns.map((s) => ({
        x: s.x, y: GROUND_Y - 34, w: 20, h: 34, range: s.range, dir: 1, alive: true, fireTimer: (1 + Math.random()) / fireRateMul,
      }));
      turrets = cfg.turretSpawns.map((s) => ({ x: s.x, y: s.y, w: 26, h: 40, alive: true, fireTimer: (1.5 + Math.random()) / fireRateMul }));
      choppers = cfg.chopperSpawns.map((s) => ({
        x: s.range[0], y: s.y, w: 58, h: 22, range: s.range, dir: 1, alive: true, fireTimer: (1.2 + Math.random()) / fireRateMul,
      }));
    },

    update(dt) {
      elapsed += dt;
      player.invuln = Math.max(0, player.invuln - dt);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.shotCooldown = Math.max(0, player.shotCooldown - dt);
      player.rapidTimer = Math.max(0, player.rapidTimer - dt);
      player.killStreakTimer = Math.max(0, player.killStreakTimer - dt);
      if (player.killStreakTimer <= 0) player.killStreak = 0;
      screenFlash = Math.max(0, screenFlash - dt * 1.6);
      lightningFlash = Math.max(0, lightningFlash - dt * 3.5);

      // Ambient atmosphere: a small themed touch of life per stage - water
      // shimmer, drifting fog, rising embers, or driving rain + lightning.
      if (ambientCfg) {
        ambientTimer -= dt;
        const boost = ambientCfg.intensity || 1;
        if (ambientCfg.type === 'shimmer' && ambientTimer <= 0) {
          ambientTimer = 0.05;
          const sx = camX + Math.random() * W;
          ambientFx.spawn(sx, GROUND_Y + 2 + Math.random() * 2, {
            vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 6, life: 0.35, size: 1 + Math.random() * 1.5,
            color: Math.random() < 0.5 ? '#bfe8ff' : '#eafff2', gravity: 20,
          });
        } else if (ambientCfg.type === 'fog' && ambientTimer <= 0) {
          ambientTimer = 0.5;
          const fx2 = camX - 40 + Math.random() * (W + 80);
          ambientFx.spawn(fx2, GROUND_Y - 100 - Math.random() * 60, {
            vx: 6 + Math.random() * 10, vy: -2, life: 4 + Math.random() * 2, size: 26 + Math.random() * 22,
            color: 'rgba(150,170,140,0.16)', shrink: false,
          });
        } else if (ambientCfg.type === 'embers' && ambientTimer <= 0) {
          ambientTimer = 0.18 / boost;
          const ex = camX + Math.random() * W;
          ambientFx.spawn(ex, GROUND_Y + 4, {
            vx: (Math.random() - 0.5) * 18, vy: -30 - Math.random() * 40, life: 1.1 + Math.random() * 0.8,
            size: 1.5 + Math.random() * 2, color: Math.random() < 0.5 ? '#ff9a4f' : '#ffd24f', gravity: -6,
          });
        } else if (ambientCfg.type === 'rain') {
          rainDrops.forEach((d) => {
            d.y += d.speed * dt;
            d.x -= 40 * dt;
            if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
            if (d.x < -10) d.x = W + 10;
          });
        }
        if (ambientCfg.lightning) {
          lightningTimer -= dt;
          if (lightningTimer <= 0) {
            lightningTimer = 3 + Math.random() * 5;
            lightningFlash = 0.55;
            shake(0.08, 1.5);
          }
        }
      }
      hitFx.update(dt);
      ambientFx.update(dt);
      floatText.update(dt);

      let mvx = 0, mvy = 0;
      if (isDown('ArrowLeft', 'a')) mvx = -1;
      if (isDown('ArrowRight', 'd')) mvx = 1;
      if (isDown('ArrowUp', 'w')) mvy = -1;
      if (isDown('ArrowDown', 's')) mvy = 1;
      if (mvx || mvy) player.facing = normalize(mvx, mvy);
      player.x += mvx * PLAYER_SPEED * dt;
      player.x = Math.max(0, Math.min(WORLD_W - player.w, player.x));
      // difficulty ramps gently the deeper the player pushes into the level
      const progress = Math.max(0, Math.min(1, player.x / WORLD_W));

      if (isDown('Space') && player.shotCooldown <= 0) {
        player.shotCooldown = player.rapidTimer > 0 ? SHOT_COOLDOWN * 0.4 : SHOT_COOLDOWN;
        const mx = player.x + player.w / 2 + player.facing.dx * 16;
        const my = player.y + player.h / 2 + player.facing.dy * 16 - 4;
        bullets.push({ x: mx, y: my, vx: player.facing.dx * 640, vy: player.facing.dy * 640, w: 6, h: 3 });
        sfx('shoot');
        const muzzleAngle = Math.atan2(player.facing.dy, player.facing.dx);
        hitFx.burst(mx, my, 5, {
          colors: ['#fff2b0', '#ffd24f', '#ff9a4f'], angle: muzzleAngle, spread: 0.8,
          speedMin: 90, speedMax: 240, lifeMin: 0.05, lifeMax: 0.11, sizeMin: 1.5, sizeMax: 3,
        });
      }

      bullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
      bullets = bullets.filter((b) => b.x > camX - 20 && b.x < camX + W + 20 && b.y > -20 && b.y < H + 20);

      grunts.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * 40 * speedMul * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 420) {
          e.fireTimer = ((1.4 + Math.random() * 0.6) * (1 - 0.3 * progress)) / fireRateMul;
          const dir = player.x < e.x ? -1 : 1;
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: dir * 260, vy: 0, w: 6, h: 3 });
        }
      });

      turrets.filter((e) => e.alive).forEach((e) => {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 520) {
          e.fireTimer = ((1.7 + Math.random() * 0.6) * (1 - 0.3 * progress)) / fireRateMul;
          const dir = player.x < e.x ? -1 : 1;
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + 10, vx: dir * 240, vy: 0, w: 6, h: 3 });
        }
      });

      choppers.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * 32 * speedMul * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && Math.abs((e.x + e.w / 2) - (player.x + player.w / 2)) < 260) {
          e.fireTimer = ((1.1 + Math.random() * 0.6) * (1 - 0.3 * progress)) / fireRateMul;
          enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: 220, w: 4, h: 8 });
        }
      });

      enemyBullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
      enemyBullets = enemyBullets.filter((b) => {
        if (b.vy > 0 && b.y >= GROUND_Y) {
          // terrain impact puff where a dropped chopper round hits the ground
          hitFx.burst(b.x, GROUND_Y, 5, {
            colors: ['#8a6238', '#5a4020'], speedMin: 30, speedMax: 90, lifeMin: 0.15, lifeMax: 0.3,
            sizeMin: 1, sizeMax: 2.5, angle: -Math.PI / 2, spread: 1.6,
          });
          return false;
        }
        return b.x > camX - 20 && b.x < camX + W + 20 && b.y > -20 && b.y < H + 20;
      });

      const targets = aliveEnemies();
      bullets.forEach((b) => {
        if (b.hit) return;
        for (const e of targets) {
          // guard against a single enemy already killed earlier this same frame
          // (by another bullet) from being scored a second time
          if (!e.alive || !rectsOverlap(b, e)) continue;
          e.alive = false;
          b.hit = true;
          const isChopper = choppers.includes(e);
          const isTurret = turrets.includes(e);
          const bigTarget = isChopper || isTurret;
          const baseScore = isChopper ? 25 : isTurret ? 20 : 15;
          player.killStreak = player.killStreakTimer > 0 ? player.killStreak + 1 : 1;
          player.killStreakTimer = 2.2;
          const streakBonus = Math.min(player.killStreak - 1, 6) * 5;
          const total = baseScore + streakBonus;
          addScore(total);
          const gauntletBoost = ambientCfg ? (ambientCfg.intensity || 1) : 1;
          hitFx.burst(e.x + e.w / 2, e.y + e.h / 2, Math.min(18, Math.round((bigTarget ? 14 : 9) * Math.min(1.4, gauntletBoost))), {
            colors: ['#ff9a4f', '#ffd24f', '#5a4a3a'], speedMin: 60, speedMax: 220, lifeMin: 0.2, lifeMax: 0.45,
            sizeMin: 1.5, sizeMax: 3.5, gravity: 140,
          });
          sfx('explosion');
          shake(bigTarget ? 0.14 : 0.08, bigTarget ? 3.5 : 2);
          popup(e.x + e.w / 2, e.y, player.killStreak > 1 ? `+${total} x${player.killStreak}` : `+${total}`,
            player.killStreak > 1 ? '#ff9a4f' : '#ffd24f', player.killStreak > 1 ? 11 : 9);
          if (player.killStreak > 0 && player.killStreak % 3 === 0) sfx('pickup');
          break;
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      bullets.forEach((b) => {
        if (b.hit) return;
        for (const c of crates) {
          if (c.alive && rectsOverlap(b, c)) {
            c.alive = false;
            b.hit = true;
            addScore(10);
            hitFx.burst(c.x + c.w / 2, c.y + c.h / 2, 7, {
              colors: ['#8a6238', '#5a4020', '#c9a878'], speedMin: 50, speedMax: 160, lifeMin: 0.2, lifeMax: 0.4,
              sizeMin: 1.5, sizeMax: 3, gravity: 180,
            });
            popup(c.x + c.w / 2, c.y, '+10', '#eaffee', 8);
            sfx('hit');
            if (Math.random() < RAPID_DROP_CHANCE) {
              powerups.push({ x: c.x + c.w / 2 - 8, y: c.y - 4, w: 16, h: 16 });
            }
            break;
          }
        }
      });
      bullets = bullets.filter((b) => !b.hit);

      powerups = powerups.filter((p) => {
        if (rectsOverlap(player, p)) {
          player.rapidTimer = RAPID_TIME;
          addScore(5);
          sfx('pickup');
          return false;
        }
        return true;
      });

      if (player.invuln <= 0) {
        const hitByBullet = enemyBullets.some((b) => rectsOverlap(b, player));
        const hitByGrunt = grunts.some((e) => e.alive && rectsOverlap(e, player));
        if (hitByBullet || hitByGrunt) {
          player.invuln = 1.3;
          player.hitFlash = 0.4;
          screenFlash = 0.4;
          hitFx.burst(player.x + player.w / 2, player.y + player.h / 2, 12, {
            colors: ['#ff5c5c', '#ff9a4f', '#e8ecff'], speedMin: 70, speedMax: 220, lifeMin: 0.2, lifeMax: 0.4,
            sizeMin: 1.5, sizeMax: 3.5, gravity: 120,
          });
          sfx('hurt');
          shake(0.22, 5);
          loseLife();
          return;
        }
      }

      if (!extractionOpen && aliveEnemies().length === 0) {
        extractionOpen = true;
        sfx('select');
      }

      if (extractionOpen && rectsOverlap(player, extraction)) {
        sfx('launch');
        winLevel(60);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_W - W, player.x + player.w / 2 - W / 2));
    },

    draw(ctx) {
      FX.gradientRect(ctx, 0, 0, W, H, theme.sky[0], theme.sky[1]);

      for (let i = 0; i < 8; i++) {
        const px = (i * 260 - camX * 0.3) % (W + 260) - 130;
        const dark = i % 2 === 0;
        ctx.fillStyle = dark ? theme.canopyDark : theme.canopyLight;
        ctx.beginPath();
        ctx.moveTo(px, GROUND_Y);
        ctx.lineTo(px + 40, GROUND_Y - 160);
        ctx.lineTo(px + 80, GROUND_Y);
        ctx.fill();
        // canopy foliage texture clumps
        ctx.fillStyle = dark ? theme.foliageDark : theme.foliageLight;
        ctx.beginPath();
        ctx.arc(px + 28, GROUND_Y - 96, 13, 0, Math.PI * 2);
        ctx.arc(px + 54, GROUND_Y - 118, 11, 0, Math.PI * 2);
        ctx.arc(px + 42, GROUND_Y - 58, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(px + 37, GROUND_Y - 20, 6, 20);
      }

      ctx.save();
      ctx.translate(-camX, 0);

      FX.gradientRect(ctx, 0, GROUND_Y, WORLD_W, H - GROUND_Y, theme.ground[0], theme.ground[1]);
      ctx.fillStyle = theme.ground[0];
      ctx.fillRect(0, GROUND_Y, WORLD_W, 4);

      // ground texture: scattered dirt/grass tufts along the visible strip
      const tuftSpacing = 70;
      const tuftStart = Math.floor(camX / tuftSpacing) * tuftSpacing;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let x = tuftStart; x < camX + W + tuftSpacing; x += tuftSpacing) {
        ctx.fillRect(x, GROUND_Y + 3, 3, 6);
        ctx.fillRect(x + 24, GROUND_Y + 6, 3, 5);
      }

      powerups.forEach((p) => {
        FX.bevelBlock(ctx, p.x, p.y, p.w, p.h, '#ffd24f', 2);
        ctx.fillStyle = '#2a2a2a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('R', p.x + p.w / 2, p.y + p.h / 2 + 3);
        ctx.textAlign = 'left';
      });

      crates.filter((c) => c.alive).forEach((c) => {
        FX.shadow(ctx, c.x + c.w / 2, c.y + c.h + 2, c.w / 2, 3, 0.3);
        FX.bevelBlock(ctx, c.x, c.y, c.w, c.h, '#7a5a34', 3);
        ctx.strokeStyle = '#4a3620';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + 4, c.y + c.h * 0.4);
        ctx.lineTo(c.x + c.w - 4, c.y + c.h * 0.4);
        ctx.moveTo(c.x + 4, c.y + c.h * 0.68);
        ctx.lineTo(c.x + c.w - 4, c.y + c.h * 0.68);
        ctx.stroke();
      });

      if (extractionOpen) {
        ctx.fillStyle = '#4fe3d0';
        ctx.beginPath();
        ctx.ellipse(extraction.x + extraction.w / 2, extraction.y + extraction.h - 4, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8ecff';
        ctx.fillRect(extraction.x + 10, extraction.y + 20, 30, 16);
        ctx.fillRect(extraction.x + 22, extraction.y + 4, 4, 20);
        ctx.strokeStyle = '#e8ecff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(extraction.x, extraction.y + 6);
        ctx.lineTo(extraction.x + 50, extraction.y + 6);
        ctx.stroke();
      }

      grunts.filter((e) => e.alive).forEach((e) => {
        // idle patrol sway - a small vertical bob so marching grunts read as alive
        const bob = Math.sin(elapsed * 5 + e.x * 0.06) * 1.4;
        const ey = e.y + bob;
        FX.shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w / 2, 3, 0.3);
        FX.bevelRect(ctx, e.x, ey + 10, e.w, e.h - 10, '#8a3a3a', 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x, ey + 10, e.w, e.h - 10);
        // rim shadow along the base of the torso for extra roundness
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x + 2, ey + e.h - 2);
        ctx.lineTo(e.x + e.w - 2, ey + e.h - 2);
        ctx.stroke();
        FX.sphere(ctx, e.x + e.w / 2, ey + 6, 7, '#d9b98a');
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, ey + 6, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2 + e.dir * 2, ey + 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(e.x - e.dir * 4, ey + 14, 12, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(e.x - e.dir * 4, ey + 14, 12, 1);
      });

      turrets.filter((e) => e.alive).forEach((e) => {
        FX.shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w / 2, 4, 0.3);
        FX.bevelRect(ctx, e.x, e.y, e.w, e.h, '#4a4a52', 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(e.x + e.w / 2 - 3, e.y - 10, 16, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x + e.w / 2 - 3, e.y - 10, 16, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(e.x + e.w / 2 - 3, e.y - 10, 16, 1.5);
        // warm barrel glow telegraphs an imminent shot
        if (e.fireTimer < 0.15) {
          const glowA = 1 - e.fireTimer / 0.15;
          const bgx = e.x + e.w / 2 + 13, bgy = e.y - 7;
          const bgrad = ctx.createRadialGradient(bgx, bgy, 0, bgx, bgy, 6);
          bgrad.addColorStop(0, `rgba(255,200,140,${0.85 * glowA})`);
          bgrad.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = bgrad;
          ctx.beginPath();
          ctx.arc(bgx, bgy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      choppers.filter((e) => e.alive).forEach((e) => {
        // gentle hover bob so patrolling choppers don't sit dead-still in the air
        const hbob = Math.sin(elapsed * 4 + e.x * 0.05) * 2;
        const by = e.y + hbob;
        const chx = e.x + e.w / 2, chy = by + e.h / 2;
        FX.shadow(ctx, chx, GROUND_Y, e.w / 2, 6, 0.2);
        const chopGrad = ctx.createLinearGradient(chx, by, chx, by + e.h);
        chopGrad.addColorStop(0, FX.shade('#3a3a44', 35));
        chopGrad.addColorStop(1, FX.shade('#3a3a44', -25));
        ctx.fillStyle = chopGrad;
        ctx.beginPath();
        ctx.ellipse(chx, chy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // rotor blade motion-blur streaks
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - 10, by + e.h / 2);
        ctx.lineTo(e.x + e.w + 10, by + e.h / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x - 6, by + e.h / 2 - 3);
        ctx.lineTo(e.x + e.w + 6, by + e.h / 2 - 3);
        ctx.moveTo(e.x - 6, by + e.h / 2 + 3);
        ctx.lineTo(e.x + e.w + 6, by + e.h / 2 + 3);
        ctx.stroke();
        ctx.fillStyle = '#1a1a1e';
        ctx.beginPath();
        ctx.arc(chx, chy, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.save();
      ctx.shadowColor = '#ffd24f';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#ffd24f';
      bullets.forEach((b) => ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
      ctx.shadowColor = '#ff5c5c';
      ctx.fillStyle = '#ff5c5c';
      enemyBullets.forEach((b) => ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
      ctx.restore();

      const flip = player.facing.dx < 0;
      FX.shadow(ctx, player.x + player.w / 2, player.y + player.h + 3, player.w / 2, 3, 0.3);
      const playerBody = (player.hitFlash > 0 && Math.floor(player.hitFlash * 20) % 2 === 0) ? '#ff5c5c' : '#2a5a7a';
      FX.bevelRect(ctx, player.x, player.y + 12, player.w, player.h - 12, playerBody, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(player.x, player.y + 12, player.w, player.h - 12);
      // rim shadow along the torso base for extra roundness
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(player.x + 2, player.y + player.h - 2);
      ctx.lineTo(player.x + player.w - 2, player.y + player.h - 2);
      ctx.stroke();
      FX.sphere(ctx, player.x + player.w / 2, player.y + 8, 8, '#d9b98a');
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(player.x + player.w / 2, player.y + 8, 8, 0, Math.PI * 2);
      ctx.stroke();

      const gunX = player.x + player.w / 2 + player.facing.dx * 6 - (flip ? 14 : 0);
      const gunY = player.y + player.h / 2 - 2 + player.facing.dy * 6;
      const gunGrad = ctx.createLinearGradient(gunX, gunY, gunX, gunY + 3);
      gunGrad.addColorStop(0, '#6a6a6a');
      gunGrad.addColorStop(0.5, '#2a2a2a');
      gunGrad.addColorStop(1, '#161616');
      ctx.fillStyle = gunGrad;
      ctx.fillRect(gunX, gunY, 14, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(gunX, gunY, 14, 1);

      const activeCooldown = player.rapidTimer > 0 ? SHOT_COOLDOWN * 0.4 : SHOT_COOLDOWN;
      if (player.shotCooldown > activeCooldown * 0.6) {
        const mfx = player.x + player.w / 2 + player.facing.dx * 20;
        const mfy = player.y + player.h / 2 + player.facing.dy * 6 - 2;
        const flashGrad = ctx.createRadialGradient(mfx, mfy, 0, mfx, mfy, 12);
        flashGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
        flashGrad.addColorStop(0.35, 'rgba(255,224,140,0.85)');
        flashGrad.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(mfx, mfy, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // ambient atmosphere + impact/score feedback draw on top of all sprites,
      // still in world space, before the camera transform is undone
      ambientFx.draw(ctx);
      hitFx.draw(ctx);
      floatText.draw(ctx);
      ctx.textAlign = 'left';

      ctx.restore();

      if (ambientCfg && ambientCfg.type === 'rain') {
        ctx.save();
        ctx.strokeStyle = 'rgba(190,205,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rainDrops.forEach((d) => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 4, d.y + d.len); });
        ctx.stroke();
        ctx.restore();
      }
      if (lightningFlash > 0) FX.flash(ctx, W, H, '#e8ecff', Math.min(0.6, lightningFlash));
      if (screenFlash > 0) FX.flash(ctx, W, H, '#ff3030', Math.min(0.5, screenFlash * 0.6));

      const remaining = aliveEnemies().length;
      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(remaining > 0 ? `HOSTILES: ${remaining}` : 'EXTRACTION POINT AHEAD', 8, 16);
      if (player.rapidTimer > 0) {
        ctx.fillStyle = '#ffd24f';
        ctx.fillText('RAPID FIRE!', W - 80, 16);
      }
      if (player.killStreak > 1 && player.killStreakTimer > 0) {
        ctx.fillStyle = '#ff9a4f';
        ctx.fillText(`STREAK x${player.killStreak}`, 8, 28);
      }

      // screen-edge red pulse: ramps up on your last life, and the final
      // gauntlet stage always runs a faint version of it for extra menace
      const lowHealth = typeof api.lives === 'number' && api.lives <= 1;
      const gauntletDanger = ambientCfg && (ambientCfg.intensity || 1) > 1.5 ? 0.1 : 0;
      const dangerAlpha = lowHealth ? Math.max(gauntletDanger, 0.22 + Math.sin(elapsed * 6) * 0.14) : gauntletDanger;
      if (dangerAlpha > 0) {
        const dgrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
        dgrad.addColorStop(0, 'rgba(255,0,0,0)');
        dgrad.addColorStop(1, `rgba(255,20,20,${dangerAlpha})`);
        ctx.fillStyle = dgrad;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };
}
