function createPlatformerLevel(api) {
  const { W, H, isDown, addScore, loseLife, winLevel, sfx, shake } = api;

  const GRAVITY = 1500;
  const MOVE_SPEED = 200;
  const JUMP_VEL = -520;
  const GROUND_Y = H - 40;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER = 0.12;
  const FALL_IMPACT_VY = 900;

  // Ten hand-built stage layouts. Stage 1 is the original default layout.
  // Stages 2-10 are genuinely different platform/gap arrangements (not
  // re-skins) with progressively more and faster enemies. Every gap below was
  // sized against the actual jump physics: with GRAVITY=1500, MOVE_SPEED=200,
  // JUMP_VEL=-520, a single ground jump landing at a rise of R above the
  // launch platform covers a max horizontal distance of
  // 200 * (520 + sqrt(270400 - 3000*R)) / 1500 (valid while R <= 90.1, the
  // peak of a single jump; a drop of |R| instead extends that max distance).
  // A double jump (second jump fires mid-air at 0.85x velocity, i.e. -442,
  // and is most powerful when triggered near the first jump's apex ~0.347s
  // in) extends the reachable rise up to ~155px and the reachable flat
  // distance up to ~219px. Every gap+rise pair used below was checked against
  // these bounds with margin, so no jump in stages 1-10 is impossible; the
  // tightest gaps (rise 80-140, requiring a well-timed double jump) are
  // reserved for stages 8-10. Stage 11+ ("endless mode") reuses stage 10's
  // layout as a base and applies a smooth continuous difficulty-scaling
  // formula on top (see buildStageData below).
  const STAGE_LAYOUTS = [
    // --- Stage 1: original default layout ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 300, h: 40 },
        { x: 380, y: GROUND_Y, w: 220, h: 40 },
        { x: 660, y: GROUND_Y - 70, w: 140, h: 20 },
        { x: 860, y: GROUND_Y, w: 260, h: 40 },
        { x: 1180, y: GROUND_Y - 70, w: 120, h: 20 },
        { x: 1360, y: GROUND_Y - 40, w: 120, h: 20 },
        { x: 1540, y: GROUND_Y, w: 260, h: 40 },
        { x: 1860, y: GROUND_Y - 60, w: 100, h: 20 },
        { x: 2020, y: GROUND_Y, w: 400, h: 40 },
      ],
      worldEnd: 2420,
      coins: [
        { x: 440, y: GROUND_Y - 40 }, { x: 500, y: GROUND_Y - 40 },
        { x: 700, y: GROUND_Y - 110 },
        { x: 920, y: GROUND_Y - 40 }, { x: 980, y: GROUND_Y - 40 }, { x: 1040, y: GROUND_Y - 40 },
        { x: 1210, y: GROUND_Y - 140 },
        { x: 1600, y: GROUND_Y - 40 }, { x: 1660, y: GROUND_Y - 40 },
        { x: 2100, y: GROUND_Y - 40 }, { x: 2160, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 420, range: [400, 560], baseSpeed: 55 },
        { x: 900, range: [880, 1080], baseSpeed: 70 },
        { x: 1580, range: [1560, 1760], baseSpeed: 85 },
        { x: 2060, range: [2040, 2340], baseSpeed: 100 },
      ],
    },
    // --- Stage 2: tighter staircase gaps, more/faster enemies ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 180, h: 40 },
        { x: 260, y: GROUND_Y - 50, w: 90, h: 20 },
        { x: 430, y: GROUND_Y - 100, w: 80, h: 20 },
        { x: 600, y: GROUND_Y - 50, w: 90, h: 20 },
        { x: 780, y: GROUND_Y, w: 160, h: 40 },
        { x: 1020, y: GROUND_Y - 60, w: 70, h: 20 },
        { x: 1170, y: GROUND_Y - 120, w: 70, h: 20 },
        { x: 1320, y: GROUND_Y - 60, w: 70, h: 20 },
        { x: 1470, y: GROUND_Y, w: 180, h: 40 },
        { x: 1730, y: GROUND_Y - 40, w: 60, h: 20 },
        { x: 1870, y: GROUND_Y - 90, w: 60, h: 20 },
        { x: 2010, y: GROUND_Y - 40, w: 60, h: 20 },
        { x: 2150, y: GROUND_Y, w: 340, h: 40 },
      ],
      worldEnd: 2560,
      coins: [
        { x: 300, y: GROUND_Y - 90 }, { x: 340, y: GROUND_Y - 90 },
        { x: 460, y: GROUND_Y - 140 },
        { x: 630, y: GROUND_Y - 90 },
        { x: 820, y: GROUND_Y - 40 }, { x: 880, y: GROUND_Y - 40 },
        { x: 1050, y: GROUND_Y - 100 },
        { x: 1200, y: GROUND_Y - 160 },
        { x: 1500, y: GROUND_Y - 40 }, { x: 1560, y: GROUND_Y - 40 },
        { x: 2200, y: GROUND_Y - 40 }, { x: 2260, y: GROUND_Y - 40 }, { x: 2320, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 40, range: [20, 160], baseSpeed: 70 },
        { x: 300, range: [260, 350], baseSpeed: 88 },
        { x: 800, range: [780, 940], baseSpeed: 106 },
        { x: 1500, range: [1480, 1650], baseSpeed: 124 },
        { x: 1750, range: [1730, 1870], baseSpeed: 142 },
        { x: 2170, range: [2150, 2490], baseSpeed: 160 },
      ],
    },
    // --- Stage 3: bigger gaps, narrower ledges, most/fastest enemies ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 140, h: 40 },
        { x: 260, y: GROUND_Y - 60, w: 60, h: 20 },
        { x: 460, y: GROUND_Y - 120, w: 60, h: 20 },
        { x: 660, y: GROUND_Y - 60, w: 60, h: 20 },
        { x: 860, y: GROUND_Y, w: 140, h: 40 },
        { x: 1100, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1300, y: GROUND_Y - 140, w: 55, h: 20 },
        { x: 1500, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1700, y: GROUND_Y, w: 140, h: 40 },
        { x: 1940, y: GROUND_Y - 50, w: 50, h: 20 },
        { x: 2120, y: GROUND_Y - 110, w: 50, h: 20 },
        { x: 2300, y: GROUND_Y - 50, w: 50, h: 20 },
        { x: 2480, y: GROUND_Y, w: 320, h: 40 },
      ],
      worldEnd: 2900,
      coins: [
        { x: 290, y: GROUND_Y - 100 },
        { x: 490, y: GROUND_Y - 160 },
        { x: 690, y: GROUND_Y - 100 },
        { x: 900, y: GROUND_Y - 40 }, { x: 950, y: GROUND_Y - 40 },
        { x: 1130, y: GROUND_Y - 110 },
        { x: 1330, y: GROUND_Y - 180 },
        { x: 1530, y: GROUND_Y - 110 },
        { x: 1740, y: GROUND_Y - 40 }, { x: 1790, y: GROUND_Y - 40 },
        { x: 2560, y: GROUND_Y - 40 }, { x: 2620, y: GROUND_Y - 40 }, { x: 2680, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 40, range: [20, 130], baseSpeed: 85 },
        { x: 300, range: [260, 320], baseSpeed: 105 },
        { x: 700, range: [660, 720], baseSpeed: 125 },
        { x: 900, range: [880, 990], baseSpeed: 145 },
        { x: 1140, range: [1100, 1155], baseSpeed: 165 },
        { x: 1740, range: [1720, 1830], baseSpeed: 185 },
        { x: 1980, range: [1940, 1990], baseSpeed: 205 },
        { x: 2520, range: [2500, 2790], baseSpeed: 225 },
      ],
    },
    // --- Stage 4: rolling staircase waves, single-jump gaps only, first
    // taste of a rest plateau between climbs. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 150, h: 40 },
        { x: 250, y: GROUND_Y - 50, w: 70, h: 20 },
        { x: 435, y: GROUND_Y - 80, w: 60, h: 20 },
        { x: 645, y: GROUND_Y, w: 140, h: 40 },
        { x: 880, y: GROUND_Y - 60, w: 55, h: 20 },
        { x: 1060, y: GROUND_Y - 80, w: 55, h: 20 },
        { x: 1265, y: GROUND_Y, w: 90, h: 40 },
        { x: 1445, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1645, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 1995,
      coins: [
        { x: 280, y: GROUND_Y - 90 },
        { x: 460, y: GROUND_Y - 120 },
        { x: 700, y: GROUND_Y - 40 }, { x: 750, y: GROUND_Y - 40 },
        { x: 905, y: GROUND_Y - 100 },
        { x: 1085, y: GROUND_Y - 120 },
        { x: 1295, y: GROUND_Y - 40 }, { x: 1330, y: GROUND_Y - 40 },
        { x: 1465, y: GROUND_Y - 110 },
        { x: 1700, y: GROUND_Y - 40 }, { x: 1750, y: GROUND_Y - 40 }, { x: 1800, y: GROUND_Y - 40 },
        { x: 1900, y: GROUND_Y - 40 }, { x: 1950, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 50, range: [20, 120], baseSpeed: 100 },
        { x: 460, range: [440, 485], baseSpeed: 130 },
        { x: 700, range: [660, 760], baseSpeed: 150 },
        { x: 1300, range: [1275, 1345], baseSpeed: 180 },
        { x: 1720, range: [1660, 1850], baseSpeed: 210 },
        { x: 1930, range: [1860, 1985], baseSpeed: 250 },
      ],
    },
    // --- Stage 5: zigzag up/down with the first flat 200px gap that forces
    // a real double jump, plus a raised double-jump gap near the end. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 140, h: 40 },
        { x: 240, y: GROUND_Y - 50, w: 65, h: 20 },
        { x: 445, y: GROUND_Y, w: 65, h: 40 },
        { x: 605, y: GROUND_Y - 60, w: 60, h: 20 },
        { x: 810, y: GROUND_Y, w: 90, h: 40 },
        { x: 990, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1170, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 1375, y: GROUND_Y, w: 90, h: 40 },
        { x: 1665, y: GROUND_Y, w: 70, h: 40 },
        { x: 1885, y: GROUND_Y - 90, w: 60, h: 20 },
        { x: 2095, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 2445,
      coins: [
        { x: 270, y: GROUND_Y - 90 },
        { x: 630, y: GROUND_Y - 100 },
        { x: 840, y: GROUND_Y - 40 }, { x: 870, y: GROUND_Y - 40 },
        { x: 1015, y: GROUND_Y - 110 },
        { x: 1195, y: GROUND_Y - 130 },
        { x: 1405, y: GROUND_Y - 40 }, { x: 1435, y: GROUND_Y - 40 },
        { x: 1700, y: GROUND_Y - 40 },
        { x: 1910, y: GROUND_Y - 130 },
        { x: 2150, y: GROUND_Y - 40 }, { x: 2200, y: GROUND_Y - 40 }, { x: 2250, y: GROUND_Y - 40 },
        { x: 2350, y: GROUND_Y - 40 }, { x: 2400, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 40, range: [20, 110], baseSpeed: 110 },
        { x: 475, range: [450, 505], baseSpeed: 140 },
        { x: 850, range: [820, 890], baseSpeed: 160 },
        { x: 1195, range: [1175, 1220], baseSpeed: 185 },
        { x: 1410, range: [1385, 1455], baseSpeed: 210 },
        { x: 1700, range: [1670, 1730], baseSpeed: 240 },
        { x: 2300, range: [2120, 2420], baseSpeed: 280 },
      ],
    },
    // --- Stage 6: plateau-and-chasm rhythm — a rest platform after every
    // climb, but the climbs themselves lean harder on double jumps. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 150, h: 40 },
        { x: 245, y: GROUND_Y - 60, w: 60, h: 20 },
        { x: 420, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 625, y: GROUND_Y, w: 80, h: 40 },
        { x: 905, y: GROUND_Y, w: 60, h: 40 },
        { x: 1115, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 1285, y: GROUND_Y - 130, w: 50, h: 20 },
        { x: 1495, y: GROUND_Y, w: 90, h: 40 },
        { x: 1675, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1855, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 2110, y: GROUND_Y - 90, w: 60, h: 20 },
        { x: 2320, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 2670,
      coins: [
        { x: 270, y: GROUND_Y - 100 },
        { x: 445, y: GROUND_Y - 130 },
        { x: 650, y: GROUND_Y - 40 }, { x: 680, y: GROUND_Y - 40 },
        { x: 930, y: GROUND_Y - 40 },
        { x: 1140, y: GROUND_Y - 130 },
        { x: 1305, y: GROUND_Y - 170 },
        { x: 1520, y: GROUND_Y - 40 }, { x: 1555, y: GROUND_Y - 40 },
        { x: 1700, y: GROUND_Y - 110 },
        { x: 1880, y: GROUND_Y - 130 },
        { x: 2135, y: GROUND_Y - 130 },
        { x: 2380, y: GROUND_Y - 40 }, { x: 2430, y: GROUND_Y - 40 }, { x: 2480, y: GROUND_Y - 40 },
        { x: 2550, y: GROUND_Y - 40 }, { x: 2620, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 45, range: [20, 120], baseSpeed: 120 },
        { x: 660, range: [635, 695], baseSpeed: 145 },
        { x: 930, range: [915, 955], baseSpeed: 165 },
        { x: 1140, range: [1120, 1165], baseSpeed: 185 },
        { x: 1530, range: [1505, 1575], baseSpeed: 205 },
        { x: 1880, range: [1860, 1905], baseSpeed: 230 },
        { x: 2135, range: [2115, 2165], baseSpeed: 260 },
        { x: 2500, range: [2340, 2660], baseSpeed: 300 },
      ],
    },
    // --- Stage 7: floating-island field — most gaps now require a
    // deliberate double jump, with wider rest islands between clusters. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 150, h: 40 },
        { x: 300, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 470, y: GROUND_Y - 120, w: 50, h: 20 },
        { x: 690, y: GROUND_Y, w: 80, h: 40 },
        { x: 970, y: GROUND_Y, w: 60, h: 40 },
        { x: 1190, y: GROUND_Y - 120, w: 55, h: 20 },
        { x: 1415, y: GROUND_Y, w: 90, h: 40 },
        { x: 1655, y: GROUND_Y - 90, w: 55, h: 20 },
        { x: 1825, y: GROUND_Y - 130, w: 50, h: 20 },
        { x: 2035, y: GROUND_Y, w: 80, h: 40 },
        { x: 2315, y: GROUND_Y, w: 70, h: 40 },
        { x: 2480, y: GROUND_Y - 60, w: 60, h: 20 },
        { x: 2685, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 3035,
      coins: [
        { x: 325, y: GROUND_Y - 130 },
        { x: 490, y: GROUND_Y - 160 },
        { x: 715, y: GROUND_Y - 40 }, { x: 745, y: GROUND_Y - 40 },
        { x: 995, y: GROUND_Y - 40 },
        { x: 1210, y: GROUND_Y - 160 },
        { x: 1440, y: GROUND_Y - 40 }, { x: 1470, y: GROUND_Y - 40 },
        { x: 1680, y: GROUND_Y - 130 },
        { x: 1845, y: GROUND_Y - 170 },
        { x: 2060, y: GROUND_Y - 40 }, { x: 2090, y: GROUND_Y - 40 },
        { x: 2345, y: GROUND_Y - 40 },
        { x: 2505, y: GROUND_Y - 100 },
        { x: 2740, y: GROUND_Y - 40 }, { x: 2800, y: GROUND_Y - 40 }, { x: 2860, y: GROUND_Y - 40 },
        { x: 2930, y: GROUND_Y - 40 }, { x: 2990, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 45, range: [20, 120], baseSpeed: 130 },
        { x: 725, range: [700, 765], baseSpeed: 150 },
        { x: 995, range: [975, 1025], baseSpeed: 170 },
        { x: 1215, range: [1195, 1240], baseSpeed: 190 },
        { x: 1450, range: [1420, 1500], baseSpeed: 210 },
        { x: 1845, range: [1830, 1870], baseSpeed: 235 },
        { x: 2070, range: [2040, 2110], baseSpeed: 260 },
        { x: 2345, range: [2320, 2380], baseSpeed: 290 },
        { x: 2900, range: [2700, 3020], baseSpeed: 320 },
      ],
    },
    // --- Stage 8: molten sawtooth — tight single-jump ledges punctuated by
    // wide double-jump chasms, narrower platforms throughout. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 150, h: 40 },
        { x: 230, y: GROUND_Y - 80, w: 50, h: 20 },
        { x: 430, y: GROUND_Y, w: 70, h: 40 },
        { x: 650, y: GROUND_Y - 90, w: 50, h: 20 },
        { x: 815, y: GROUND_Y - 120, w: 50, h: 20 },
        { x: 990, y: GROUND_Y - 140, w: 45, h: 20 },
        { x: 1200, y: GROUND_Y, w: 90, h: 40 },
        { x: 1380, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1515, y: GROUND_Y - 150, w: 45, h: 20 },
        { x: 1725, y: GROUND_Y, w: 80, h: 40 },
        { x: 2005, y: GROUND_Y, w: 60, h: 40 },
        { x: 2210, y: GROUND_Y - 140, w: 50, h: 20 },
        { x: 2425, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 2775,
      coins: [
        { x: 250, y: GROUND_Y - 120 },
        { x: 450, y: GROUND_Y - 40 }, { x: 470, y: GROUND_Y - 40 },
        { x: 670, y: GROUND_Y - 130 },
        { x: 835, y: GROUND_Y - 160 },
        { x: 1010, y: GROUND_Y - 180 },
        { x: 1225, y: GROUND_Y - 40 }, { x: 1260, y: GROUND_Y - 40 },
        { x: 1400, y: GROUND_Y - 110 },
        { x: 1535, y: GROUND_Y - 190 },
        { x: 1750, y: GROUND_Y - 40 }, { x: 1780, y: GROUND_Y - 40 },
        { x: 2030, y: GROUND_Y - 40 },
        { x: 2230, y: GROUND_Y - 180 },
        { x: 2480, y: GROUND_Y - 40 }, { x: 2540, y: GROUND_Y - 40 }, { x: 2600, y: GROUND_Y - 40 },
        { x: 2680, y: GROUND_Y - 40 }, { x: 2740, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 45, range: [20, 120], baseSpeed: 140 },
        { x: 460, range: [435, 495], baseSpeed: 160 },
        { x: 670, range: [655, 695], baseSpeed: 180 },
        { x: 835, range: [820, 860], baseSpeed: 200 },
        { x: 1235, range: [1205, 1285], baseSpeed: 220 },
        { x: 1400, range: [1385, 1430], baseSpeed: 240 },
        { x: 1535, range: [1520, 1555], baseSpeed: 260 },
        { x: 1760, range: [1730, 1800], baseSpeed: 280 },
        { x: 2030, range: [2010, 2060], baseSpeed: 300 },
        { x: 2600, range: [2440, 2760], baseSpeed: 340 },
      ],
    },
    // --- Stage 9: frozen gauntlet — back-to-back double jumps including a
    // 180px sheer drop, dense fast enemies, narrow icy ledges. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 150, h: 40 },
        { x: 300, y: GROUND_Y - 90, w: 50, h: 20 },
        { x: 500, y: GROUND_Y - 180, w: 45, h: 20 },
        { x: 715, y: GROUND_Y, w: 90, h: 40 },
        { x: 895, y: GROUND_Y - 70, w: 55, h: 20 },
        { x: 1040, y: GROUND_Y - 140, w: 50, h: 20 },
        { x: 1255, y: GROUND_Y, w: 80, h: 40 },
        { x: 1535, y: GROUND_Y, w: 60, h: 40 },
        { x: 1755, y: GROUND_Y - 120, w: 50, h: 20 },
        { x: 1920, y: GROUND_Y - 150, w: 45, h: 20 },
        { x: 2135, y: GROUND_Y, w: 80, h: 40 },
        { x: 2415, y: GROUND_Y, w: 70, h: 40 },
        { x: 2580, y: GROUND_Y - 60, w: 55, h: 20 },
        { x: 2780, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 3130,
      coins: [
        { x: 320, y: GROUND_Y - 130 },
        { x: 520, y: GROUND_Y - 220 },
        { x: 740, y: GROUND_Y - 40 }, { x: 770, y: GROUND_Y - 40 },
        { x: 915, y: GROUND_Y - 110 },
        { x: 1060, y: GROUND_Y - 180 },
        { x: 1280, y: GROUND_Y - 40 }, { x: 1310, y: GROUND_Y - 40 },
        { x: 1560, y: GROUND_Y - 40 },
        { x: 1775, y: GROUND_Y - 160 },
        { x: 1940, y: GROUND_Y - 190 },
        { x: 2160, y: GROUND_Y - 40 }, { x: 2190, y: GROUND_Y - 40 },
        { x: 2440, y: GROUND_Y - 40 },
        { x: 2600, y: GROUND_Y - 100 },
        { x: 2830, y: GROUND_Y - 40 }, { x: 2890, y: GROUND_Y - 40 }, { x: 2950, y: GROUND_Y - 40 },
        { x: 3020, y: GROUND_Y - 40 }, { x: 3080, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 45, range: [20, 120], baseSpeed: 150 },
        { x: 750, range: [720, 800], baseSpeed: 170 },
        { x: 915, range: [900, 945], baseSpeed: 185 },
        { x: 1060, range: [1045, 1085], baseSpeed: 205 },
        { x: 1290, range: [1260, 1330], baseSpeed: 225 },
        { x: 1560, range: [1540, 1590], baseSpeed: 245 },
        { x: 1775, range: [1760, 1800], baseSpeed: 265 },
        { x: 1940, range: [1925, 1960], baseSpeed: 285 },
        { x: 2170, range: [2140, 2210], baseSpeed: 305 },
        { x: 2440, range: [2420, 2480], baseSpeed: 330 },
        { x: 2950, range: [2790, 3120], baseSpeed: 360 },
      ],
    },
    // --- Stage 10: the void gauntlet — the full move set chained with
    // minimal rest, two of the hardest double-jump climbs, most/fastest
    // enemies. Top-tier hand-built challenge. ---
    {
      platforms: [
        { x: 0, y: GROUND_Y, w: 140, h: 40 },
        { x: 290, y: GROUND_Y - 90, w: 50, h: 20 },
        { x: 435, y: GROUND_Y - 150, w: 45, h: 20 },
        { x: 650, y: GROUND_Y, w: 70, h: 40 },
        { x: 920, y: GROUND_Y, w: 55, h: 40 },
        { x: 1120, y: GROUND_Y - 140, w: 45, h: 20 },
        { x: 1290, y: GROUND_Y - 160, w: 45, h: 20 },
        { x: 1505, y: GROUND_Y, w: 70, h: 40 },
        { x: 1665, y: GROUND_Y - 70, w: 50, h: 20 },
        { x: 1805, y: GROUND_Y - 140, w: 45, h: 20 },
        { x: 2015, y: GROUND_Y, w: 70, h: 40 },
        { x: 2285, y: GROUND_Y, w: 55, h: 40 },
        { x: 2500, y: GROUND_Y - 120, w: 45, h: 20 },
        { x: 2660, y: GROUND_Y - 150, w: 40, h: 20 },
        { x: 2870, y: GROUND_Y, w: 70, h: 40 },
        { x: 3140, y: GROUND_Y, w: 60, h: 40 },
        { x: 3345, y: GROUND_Y - 140, w: 45, h: 20 },
        { x: 3555, y: GROUND_Y, w: 350, h: 40 },
      ],
      worldEnd: 3905,
      coins: [
        { x: 310, y: GROUND_Y - 130 },
        { x: 455, y: GROUND_Y - 190 },
        { x: 670, y: GROUND_Y - 40 }, { x: 700, y: GROUND_Y - 40 },
        { x: 945, y: GROUND_Y - 40 },
        { x: 1140, y: GROUND_Y - 180 },
        { x: 1310, y: GROUND_Y - 200 },
        { x: 1530, y: GROUND_Y - 40 }, { x: 1555, y: GROUND_Y - 40 },
        { x: 1685, y: GROUND_Y - 110 },
        { x: 1825, y: GROUND_Y - 180 },
        { x: 2040, y: GROUND_Y - 40 }, { x: 2060, y: GROUND_Y - 40 },
        { x: 2310, y: GROUND_Y - 40 },
        { x: 2520, y: GROUND_Y - 160 },
        { x: 2680, y: GROUND_Y - 190 },
        { x: 2895, y: GROUND_Y - 40 }, { x: 2915, y: GROUND_Y - 40 },
        { x: 3165, y: GROUND_Y - 40 },
        { x: 3365, y: GROUND_Y - 180 },
        { x: 3610, y: GROUND_Y - 40 }, { x: 3670, y: GROUND_Y - 40 }, { x: 3730, y: GROUND_Y - 40 },
        { x: 3800, y: GROUND_Y - 40 }, { x: 3860, y: GROUND_Y - 40 },
      ],
      enemySpawns: [
        { x: 40, range: [20, 110], baseSpeed: 160 },
        { x: 685, range: [655, 715], baseSpeed: 180 },
        { x: 945, range: [925, 970], baseSpeed: 195 },
        { x: 1140, range: [1125, 1160], baseSpeed: 215 },
        { x: 1310, range: [1295, 1330], baseSpeed: 235 },
        { x: 1540, range: [1510, 1570], baseSpeed: 255 },
        { x: 1685, range: [1670, 1710], baseSpeed: 270 },
        { x: 1825, range: [1810, 1845], baseSpeed: 290 },
        { x: 2050, range: [2020, 2080], baseSpeed: 310 },
        { x: 2310, range: [2290, 2335], baseSpeed: 330 },
        { x: 2520, range: [2505, 2540], baseSpeed: 360 },
        { x: 3750, range: [3565, 3895], baseSpeed: 400 },
      ],
    },
  ];

  // Builds the concrete layout + enemy roster for a given stage number.
  // Stages 1-10 use their hand-built layout as-is. Stage 11+ reuses stage
  // 10's layout and applies a smooth, continuous difficulty scale to enemy
  // speed and count, capped so endless mode never becomes literally
  // impossible.
  function buildStageData(stage) {
    const layoutIndex = Math.min(stage, 10) - 1;
    const layout = STAGE_LAYOUTS[layoutIndex];
    const isEndless = stage > 10;
    const scale = isEndless ? Math.min(1 + (stage - 10) * 0.12, 2.5) : 1;

    const enemies = layout.enemySpawns.map((s) => ({
      x: s.x, y: GROUND_Y - 18, w: 20, h: 18, dir: 1, range: s.range, alive: true,
      speed: s.baseSpeed * scale,
    }));

    if (isEndless) {
      // Layer in a few extra patrolling enemies as endless stages climb,
      // capped so the level doesn't get flooded with hazards.
      const extraCount = Math.min(Math.floor((stage - 10) / 2), 3);
      for (let i = 0; i < extraCount; i++) {
        const src = layout.enemySpawns[i % layout.enemySpawns.length];
        const mid = (src.range[0] + src.range[1]) / 2;
        enemies.push({
          x: mid, y: GROUND_Y - 18, w: 20, h: 18, dir: -1, range: src.range, alive: true,
          speed: (src.baseSpeed + 20) * scale,
        });
      }
    }

    return {
      platforms: layout.platforms,
      coins: layout.coins.map((c) => ({ ...c, taken: false })),
      enemies,
      worldEnd: layout.worldEnd,
      flag: { x: layout.worldEnd - 40, y: GROUND_Y - 90, w: 12, h: 90 },
    };
  }

  // Cheap per-stage lighting shift (day -> dusk -> night -> dawn -> storm ->
  // desert -> alien -> volcanic -> arctic -> void), the same idea the racing
  // level uses for its sky/road themes: recolor the existing sky + mountain
  // gradients only, no new geometry, so each stage reads as a new place
  // without touching gameplay. Stage 11+ (endless) reuses stage 10's void
  // palette, same as it reuses stage 10's layout.
  const STAGE_THEMES = [
    { sky: '#0c1424', mtnTop: '#2a5f8a', mtnBot: '#0e2438', mtnGlow: 'rgba(255,255,255,0.08)' }, // 1: day
    { sky: '#221a30', mtnTop: '#7a4a6a', mtnBot: '#1c1128', mtnGlow: 'rgba(255,196,140,0.12)' }, // 2: dusk
    { sky: '#080a16', mtnTop: '#182444', mtnBot: '#04060c', mtnGlow: 'rgba(180,200,255,0.10)' }, // 3: night
    { sky: '#3a2a4a', mtnTop: '#c96a7a', mtnBot: '#4a2038', mtnGlow: 'rgba(255,200,150,0.15)' }, // 4: dawn
    { sky: '#1a1f28', mtnTop: '#3a4a56', mtnBot: '#10151c', mtnGlow: 'rgba(180,220,255,0.12)' }, // 5: storm
    { sky: '#3a2c18', mtnTop: '#a86a3a', mtnBot: '#2a1a0c', mtnGlow: 'rgba(255,200,120,0.14)' }, // 6: desert dust
    { sky: '#12061e', mtnTop: '#5a2a7a', mtnBot: '#0a0414', mtnGlow: 'rgba(140,255,150,0.14)' }, // 7: alien
    { sky: '#1a0808', mtnTop: '#8a2a18', mtnBot: '#100404', mtnGlow: 'rgba(255,120,40,0.18)' },  // 8: volcanic
    { sky: '#141c28', mtnTop: '#8aa8c0', mtnBot: '#0c1420', mtnGlow: 'rgba(220,240,255,0.16)' }, // 9: arctic
    { sky: '#020208', mtnTop: '#241a3a', mtnBot: '#000000', mtnGlow: 'rgba(200,180,255,0.10)' }, // 10: void
  ];
  function themeForStage(stage) { return STAGE_THEMES[Math.min(Math.max(stage, 1), 10) - 1]; }

  let platforms, coins, WORLD_END, flag;
  let player, camX, enemies, coinList, onGround, spawnX, spawnY, jumpKeyPrev;
  let currentStage, checkpoint, coyoteTimer, jumpBufferTimer, stompChain;
  let ambientT, flagWaveT, flashAlpha, flashColor, airMinY, torches;

  // Particle + floating-text systems, created once for the life of this level
  // instance (not per-frame) and reused across stages/retries.
  const fxParticles = FX.makeParticles(90);
  const fxText = FX.makeFloatText(24);

  // Drifting cloud layer, generated once — purely cosmetic parallax, drawn in
  // screen space like the existing mountain silhouette layer.
  const clouds = Array.from({ length: 6 }, (_, i) => ({
    baseX: i * 260 + Math.random() * 140,
    y: 18 + Math.random() * 46,
    w: 46 + Math.random() * 40,
    speed: 6 + Math.random() * 8,
  }));

  function drawHero(ctx, p) {
    const cx = p.x + p.w / 2;
    const stride = onGround && p.vx !== 0 ? Math.sin(p.animT) * 5 : 0;
    const legLift = !onGround ? 3 : 0;
    if (onGround) FX.shadow(ctx, cx, p.y + p.h + 2, p.w / 2, 3, 0.3);

    // Squash-and-stretch: scale the whole sprite around its feet.
    ctx.save();
    ctx.translate(cx, p.y + p.h);
    ctx.scale(p.scaleX, p.scaleY);
    ctx.translate(-cx, -(p.y + p.h));

    // Idle breathing + blink when standing still.
    const idle = onGround && p.vx === 0 ? p.idleT : 0;
    const breathe = idle > 0.15 ? Math.sin(idle * 2.2) * 0.03 : 0;
    const blinking = idle > 0.4 && (idle % 2.6) < 0.1;
    ctx.save();
    ctx.translate(cx, p.y + p.h);
    ctx.scale(1, 1 + breathe);
    ctx.translate(-cx, -(p.y + p.h));

    // legs — subtle gradient + outline
    const legGrad = ctx.createLinearGradient(0, p.y + 18, 0, p.y + 30);
    legGrad.addColorStop(0, '#2a5a6f');
    legGrad.addColorStop(1, '#12262f');
    ctx.fillStyle = legGrad;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    const leg1x = cx - 5 + stride * 0.3, leg2x = cx + 1 - stride * 0.3, legY = p.y + 20 - legLift, legH = 8 + legLift;
    ctx.fillRect(leg1x, legY, 4, legH);
    ctx.strokeRect(leg1x, legY, 4, legH);
    ctx.fillRect(leg2x, legY, 4, legH);
    ctx.strokeRect(leg2x, legY, 4, legH);

    // torso — gradient with a bright edge highlight and a dark belt shading band
    const bodyGrad = ctx.createLinearGradient(p.x, p.y + 9, p.x, p.y + 22);
    bodyGrad.addColorStop(0, '#7dffea');
    bodyGrad.addColorStop(0.45, '#4fe3d0');
    bodyGrad.addColorStop(1, '#297f74');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(p.x + 2, p.y + 9, p.w - 4, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(p.x + 3, p.y + 10, 2, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x + 2, p.y + 19, p.w - 4, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(p.x + 2, p.y + 9, p.w - 4, 13);

    // arm
    const armX = cx + (p.facing > 0 ? 2 : -6);
    ctx.fillStyle = '#e8b98a';
    ctx.fillRect(armX, p.y + 12, 4, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(armX, p.y + 12, 4, 7);

    // head — lit sphere with outline
    FX.sphere(ctx, cx, p.y + 6, 6, '#e8b98a');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, p.y + 6, 6, 0, Math.PI * 2);
    ctx.stroke();

    // hair with outline + tiny sheen
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(cx, p.y + 3, 6, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - 4, p.y, 3, 2);

    // eye + specular glint (closes for a brief blink while idle)
    if (blinking) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + p.facing * 2 - 1, p.y + 6);
      ctx.lineTo(cx + p.facing * 2 + 1, p.y + 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx + p.facing * 2, p.y + 5, 2, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(cx + p.facing * 2 + (p.facing > 0 ? 0.2 : 0.9), p.y + 5.2, 0.7, 0.7);
    }

    ctx.restore(); // breathing scale
    ctx.restore(); // squash/stretch scale
  }

  function resetPlayer() {
    player = {
      x: spawnX, y: spawnY, w: 22, h: 28, vx: 0, vy: 0, facing: 1, animT: 0,
      jumpsUsed: 0, scaleX: 1, scaleY: 1, idleT: 0,
    };
  }

  return {
    init(stage = 1) {
      const isNewStage = stage !== currentStage;

      if (isNewStage) {
        // Moving to a new stage (either the very first init, or advancing
        // after winLevel()): rebuild the layout, enemies and coins for this
        // stage and reset the checkpoint — a checkpoint from the previous
        // stage must never leak into the new one.
        currentStage = stage;
        checkpoint = null;
        const data = buildStageData(stage);
        platforms = data.platforms;
        coins = data.coins;
        WORLD_END = data.worldEnd;
        flag = data.flag;
        enemies = data.enemies;
        coinList = data.coins;

        // Ambient background torches — purely decorative, spaced along this
        // stage's world length so they scale with worldEnd without touching
        // any gameplay config.
        const torchCount = Math.min(10, Math.max(2, Math.round(WORLD_END / 480)));
        torches = Array.from({ length: torchCount }, (_, i) => ({
          x: 60 + i * (WORLD_END / torchCount),
          phase: Math.random() * Math.PI * 2,
        }));
      }
      // else: a same-stage retry after losing a life re-calls init() with the
      // same stage number (see game.js) — enemies/coins/checkpoint from this
      // attempt are intentionally left untouched so a death sends you back
      // to your last checkpoint, not all the way to the start with progress
      // undone.

      spawnX = checkpoint ? checkpoint.x : 20;
      spawnY = checkpoint ? checkpoint.y : GROUND_Y - 28;
      resetPlayer();
      camX = Math.max(0, Math.min(WORLD_END - W, spawnX - W / 2));
      onGround = true;
      airMinY = player.y;
      fxParticles.clear();
      fxText.clear();
      ambientT = 0;
      flagWaveT = 0;
      flashAlpha = 0;
      flashColor = '#ff3050';
      jumpKeyPrev = false;
      coyoteTimer = 0;
      jumpBufferTimer = 0;
      stompChain = 0;
    },

    update(dt) {
      player.vx = 0;
      let moveLeft = isDown('ArrowLeft', 'a');
      let moveRight = isDown('ArrowRight', 'd');
      // Click-and-hold-to-move: while the mouse is held, steer toward the
      // cursor's x position using the same movement code as the keyboard.
      // A real keyboard direction key always takes priority for the frame.
      if (!moveLeft && !moveRight && api.mouseDown) {
        const cx = player.x + player.w / 2;
        if (api.mouseX < cx - 4) moveLeft = true;
        else if (api.mouseX > cx + 4) moveRight = true;
      }
      if (moveLeft) player.vx = -MOVE_SPEED;
      if (moveRight) player.vx = MOVE_SPEED;
      if (player.vx > 0) player.facing = 1;
      else if (player.vx < 0) player.facing = -1;
      player.animT += dt * (player.vx !== 0 ? 10 : 3);
      player.idleT = (onGround && player.vx === 0) ? player.idleT + dt : 0;

      // Track the highest point reached during the current airborne stretch,
      // so a landing can size its dust puff / squash to how far the fall was.
      const wasOnGround = onGround;
      if (!wasOnGround) airMinY = Math.min(airMinY, player.y);
      else airMinY = player.y;

      // Coyote time: a short grace window after walking off a ledge where a
      // ground-strength jump is still allowed, so near-miss timing at platform
      // edges doesn't feel like an unfair instant fall.
      coyoteTimer = onGround ? COYOTE_TIME : Math.max(0, coyoteTimer - dt);

      const jumpKeyDown = isDown('ArrowUp', 'w', 'Space');
      const jumpPressed = jumpKeyDown && !jumpKeyPrev;
      jumpKeyPrev = jumpKeyDown;
      // Jump buffering: remember a jump press for a brief window so pressing
      // jump slightly before landing still fires the moment you touch down.
      if (jumpPressed) jumpBufferTimer = JUMP_BUFFER;
      else jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

      if (jumpBufferTimer > 0) {
        if (coyoteTimer > 0) {
          player.vy = JUMP_VEL;
          onGround = false;
          coyoteTimer = 0;
          jumpBufferTimer = 0;
          player.jumpsUsed = 1;
          sfx('jump');
          player.scaleY = 1.28; player.scaleX = 0.8;
        } else if (player.jumpsUsed < 2) {
          player.vy = JUMP_VEL * 0.85;
          player.jumpsUsed = 2;
          jumpBufferTimer = 0;
          sfx('jump');
          player.scaleY = 1.3; player.scaleX = 0.76;
          fxParticles.burst(player.x + player.w / 2, player.y + player.h, 8, {
            colors: ['#4fe3d0', '#7dffea', '#bffff0'], speedMin: 30, speedMax: 100,
            lifeMin: 0.2, lifeMax: 0.4, sizeMin: 1.5, sizeMax: 3, gravity: 150,
            angle: Math.PI / 2, spread: Math.PI * 0.8,
          });
        }
      }

      player.vy += GRAVITY * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      onGround = false;
      for (const p of platforms) {
        if (player.x + player.w > p.x && player.x < p.x + p.w) {
          const feetPrev = player.y + player.h - player.vy * dt;
          if (player.vy >= 0 && feetPrev <= p.y && player.y + player.h >= p.y) {
            player.y = p.y - player.h;
            if (player.vy > FALL_IMPACT_VY) {
              sfx('bounce');
              shake(0.08, 2);
            }
            player.vy = 0;
            onGround = true;
            player.jumpsUsed = 0;
            stompChain = 0;
            if (!checkpoint || player.x > checkpoint.x) {
              checkpoint = { x: player.x, y: player.y };
            }
          }
        }
      }
      player.x = Math.max(0, Math.min(WORLD_END - player.w, player.x));

      if (!wasOnGround && onGround) {
        // Just touched down — dust puff sized (and squash strengthened) by
        // how far the fall was, tracked via airMinY above.
        const fallDist = Math.max(0, player.y - airMinY);
        const puffCount = Math.max(4, Math.min(16, Math.round(4 + fallDist / 12)));
        fxParticles.burst(player.x + player.w / 2, player.y + player.h, puffCount, {
          colors: ['#d8d4c8', '#eee8d5', '#b8b0a0'], speedMin: 20, speedMax: 60 + fallDist,
          lifeMin: 0.2, lifeMax: 0.45, sizeMin: 2, sizeMax: 4, gravity: 200,
          angle: -Math.PI / 2, spread: Math.PI * 0.9,
        });
        const squashAmt = Math.min(0.45, 0.1 + fallDist / 300);
        player.scaleY = 1 - squashAmt;
        player.scaleX = 1 + squashAmt * 0.7;
        if (fallDist > 40) {
          // Wood-splinter accent on a hard landing — a nod to the "Crate
          // Runner" theme of the platforms you're pounding across.
          fxParticles.burst(player.x + player.w / 2, player.y + player.h, 6, {
            colors: ['#c9a15a', '#8a6a3a', '#6b4a26'], speedMin: 40, speedMax: 140,
            lifeMin: 0.25, lifeMax: 0.5, sizeMin: 1.5, sizeMax: 3, gravity: 300,
          });
        }
      }

      if (player.y > H + 100) {
        stompChain = 0;
        flashAlpha = 0.5; flashColor = '#ff3050';
        shake(0.2, 6);
        loseLife();
        return;
      }

      enemies.filter((e) => e.alive).forEach((e) => {
        e.x += e.dir * e.speed * dt;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.dir *= -1;
      });

      for (const e of enemies) {
        if (!e.alive) continue;
        if (rectsOverlapP(player, e)) {
          const stomping = player.vy > 0 && player.y + player.h - e.h / 2 < e.y + e.h / 2;
          if (stomping) {
            e.alive = false;
            player.vy = JUMP_VEL * 0.6;
            player.jumpsUsed = 0;
            stompChain++;
            const mult = Math.min(stompChain, 5);
            const gained = 20 + (mult - 1) * 15;
            addScore(gained);
            fxParticles.burst(e.x + e.w / 2, e.y + e.h / 2, 10, {
              colors: ['#ff4fa3', '#ffd0e6', '#7a1a45'], speedMin: 60, speedMax: 160,
              lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 4, gravity: 250,
            });
            fxText.spawn(e.x + e.w / 2, e.y, `+${gained}`, '#ffd24f', { life: 0.7, size: 12 });
            if (stompChain >= 3) {
              sfx('explosion');
              shake(0.15, 5);
            } else {
              sfx('hit');
              shake(0.08, 3);
            }
          } else {
            stompChain = 0;
            fxParticles.burst(player.x + player.w / 2, player.y + player.h / 2, 12, {
              colors: ['#ff3050', '#ff8a50', '#ffe0a0'], speedMin: 50, speedMax: 170,
              lifeMin: 0.3, lifeMax: 0.55, sizeMin: 2, sizeMax: 4, gravity: 200,
            });
            flashAlpha = 0.45; flashColor = '#ff3050';
            shake(0.18, 6);
            loseLife();
            return;
          }
        }
      }

      coinList.forEach((c) => {
        if (!c.taken && Math.hypot(player.x - c.x, player.y - c.y) < 24) {
          c.taken = true;
          addScore(5);
          sfx('pickup');
          fxParticles.burst(c.x, c.y, 8, {
            colors: ['#ffe98a', '#ffd24f', '#fff6d0'], speedMin: 30, speedMax: 90,
            lifeMin: 0.25, lifeMax: 0.45, sizeMin: 1.5, sizeMax: 3, gravity: 80,
          });
          fxText.spawn(c.x, c.y - 6, '+5', '#ffd24f', { life: 0.6, size: 11 });
        }
      });

      if (rectsOverlapP(player, flag)) {
        fxParticles.burst(flag.x + 12, flag.y + 8, 16, {
          colors: ['#7dffea', '#ffffff', '#ffd24f'], speedMin: 60, speedMax: 180,
          lifeMin: 0.4, lifeMax: 0.7, sizeMin: 2, sizeMax: 4, gravity: 100,
        });
        fxText.spawn(flag.x + 12, flag.y - 10, '+30', '#7dffea', { life: 1, size: 16 });
        winLevel(30);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_END - W, player.x - W / 2));

      // Ease the squash/stretch scale back toward normal each frame.
      const scaleLerp = Math.min(1, dt * 10);
      player.scaleX += (1 - player.scaleX) * scaleLerp;
      player.scaleY += (1 - player.scaleY) * scaleLerp;

      ambientT += dt;
      flagWaveT += dt;
      flashAlpha = Math.max(0, flashAlpha - dt * 2.2);
      fxParticles.update(dt);
      fxText.update(dt);
    },

    draw(ctx) {
      const theme = themeForStage(currentStage);
      ctx.fillStyle = theme.sky;
      ctx.fillRect(0, 0, W, H);

      const mtnGrad = ctx.createLinearGradient(0, H - 120, 0, H);
      mtnGrad.addColorStop(0, theme.mtnTop);
      mtnGrad.addColorStop(1, theme.mtnBot);
      ctx.fillStyle = mtnGrad;
      for (let i = 0; i < 6; i++) {
        const px = (i * 220 - camX * 0.3) % (W + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(px, H);
        ctx.lineTo(px + 60, H - 120);
        ctx.lineTo(px + 120, H);
        ctx.fill();
        ctx.fillStyle = theme.mtnGlow;
        ctx.beginPath();
        ctx.moveTo(px + 60, H - 120);
        ctx.lineTo(px + 72, H - 96);
        ctx.lineTo(px + 48, H - 96);
        ctx.fill();
        ctx.fillStyle = mtnGrad;
      }

      // Drifting cloud layer — slower parallax than the mountains, plus a
      // slow independent drift over time so they never look frozen.
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      clouds.forEach((cl) => {
        const cw = W + 320;
        const px = ((cl.baseX + ambientT * cl.speed - camX * 0.12) % cw + cw) % cw - 160;
        FX.shadow(ctx, px, cl.y, cl.w * 0.5, cl.w * 0.22, 1);
      });

      ctx.save();
      ctx.translate(-camX, 0);

      // Background torches — fixed world positions, flickering flame.
      torches.forEach((t) => {
        const flick = 0.75 + Math.sin(ambientT * 9 + t.phase) * 0.15 + Math.sin(ambientT * 23 + t.phase) * 0.1;
        const baseY = GROUND_Y;
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(t.x - 2, baseY - 28, 4, 28);
        const flameH = 10 * flick;
        const flameGrad = ctx.createRadialGradient(t.x, baseY - 30, 1, t.x, baseY - 30, 8);
        flameGrad.addColorStop(0, '#fff3c0');
        flameGrad.addColorStop(0.5, '#ffb040');
        flameGrad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.ellipse(t.x, baseY - 28 - flameH * 0.5, 5, flameH, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      platforms.forEach((p) => {
        FX.shadow(ctx, p.x + p.w / 2, p.y + p.h + 6, p.w / 2, 6, 0.3);
        FX.bevelRect(ctx, p.x, p.y, p.w, p.h, '#3a2f5a', 3);

        // grassy top with a lit gradient + rim-light edge
        const grassGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + 4);
        grassGrad.addColorStop(0, '#a8ff9a');
        grassGrad.addColorStop(1, '#4fcf4f');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(p.x, p.y, p.w, 1);

        // faint brick-coursing texture on the dirt body (cheap, few lines)
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        for (let lx = p.x + 14; lx < p.x + p.w - 2; lx += 26) {
          ctx.beginPath();
          ctx.moveTo(lx, p.y + 6);
          ctx.lineTo(lx, p.y + p.h - 4);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(p.x + 2, p.y + p.h * 0.55);
        ctx.lineTo(p.x + p.w - 2, p.y + p.h * 0.55);
        ctx.stroke();

        // crate-style corner bolts — small nod to the "Crate Runner" theme
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(p.x + 3, p.y + p.h - 6, 2, 2);
        ctx.fillRect(p.x + p.w - 5, p.y + p.h - 6, 2, 2);
      });

      coinList.forEach((c) => {
        if (c.taken) return;
        FX.sphere(ctx, c.x, c.y, 6, '#ffd24f');
      });

      enemies.filter((e) => e.alive).forEach((e) => {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        FX.shadow(ctx, cx, e.y + e.h + 2, e.w / 2, 3, 0.3);
        ctx.fillStyle = '#c93a7a';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI);
        ctx.fill();
        const bodyGrad = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, e.w / 2 + 3);
        bodyGrad.addColorStop(0, FX.shade('#ff4fa3', 40));
        bodyGrad.addColorStop(1, FX.shade('#ff4fa3', -15));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = '#2a1020';
        ctx.fillRect(e.x + 2, e.y + e.h - 4, 5, 4);
        ctx.fillRect(e.x + e.w - 7, e.y + e.h - 4, 5, 4);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0a10';
        ctx.beginPath();
        ctx.arc(cx - 4 + e.dir, cy - 2, 1.3, 0, Math.PI * 2);
        ctx.arc(cx + 4 + e.dir, cy - 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(cx - 4.6 + e.dir, cy - 2.8, 0.6, 0, Math.PI * 2);
        ctx.arc(cx + 3.4 + e.dir, cy - 2.8, 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      const poleGrad = ctx.createLinearGradient(flag.x, 0, flag.x + 3, 0);
      poleGrad.addColorStop(0, '#ffffff');
      poleGrad.addColorStop(1, '#a8b4d8');
      ctx.fillStyle = poleGrad;
      ctx.fillRect(flag.x, flag.y, 3, flag.h);
      const clothGrad = ctx.createLinearGradient(flag.x + 3, flag.y, flag.x + 27, flag.y + 16);
      clothGrad.addColorStop(0, '#7dffea');
      clothGrad.addColorStop(1, '#3ab8a8');
      ctx.fillStyle = clothGrad;
      // Gentle wave on the outer edge of the cloth instead of a static rect.
      const waveA = Math.sin(flagWaveT * 4) * 3;
      const waveB = Math.sin(flagWaveT * 4 + 1.3) * 3;
      ctx.beginPath();
      ctx.moveTo(flag.x + 3, flag.y);
      ctx.lineTo(flag.x + 27, flag.y + waveA);
      ctx.lineTo(flag.x + 27, flag.y + 16 + waveB);
      ctx.lineTo(flag.x + 3, flag.y + 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      drawHero(ctx, player);

      fxParticles.draw(ctx);
      fxText.draw(ctx);

      ctx.restore();

      if (flashAlpha > 0) FX.flash(ctx, W, H, flashColor, flashAlpha);

      ctx.fillStyle = '#e8ecff';
      ctx.font = '9px monospace';
      ctx.fillText(`COINS ${coinList.filter((c) => c.taken).length}/${coins.length}`, 8, 16);
    },
  };
}

function rectsOverlapP(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
