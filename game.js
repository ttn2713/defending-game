(() => {
  "use strict";

  /* ================================================================ */
  /*  config                                                           */
  /* ================================================================ */

  const CONFIG = {
    WORLD_W: 1700,
    CENTER: 850,
    PORTAL_L: 230,
    PORTAL_R: 1470,
    FIRST_WAVE: 20,
    WAVE_EVERY: 20,
    CORE_MAX: 10,
    PLAYER_SPEED: 255,
    PLAYER_ACCEL: 2100,
    PLAYER_DECEL: 2650,
    PLAYER_W: 18,
    PLAYER_H: 46,
    ATTACK_INTERVAL: 1,
    ATTACK_RANGE: 520,
    BOLT_SPEED: 1040,
    SLIME_RADIUS: 11.5,
    SLIME_HP: 3,
    SLIME_SPEED: 30,
    RIFT_RADIUS: 82,
    RIFT_STAND_OFFSET: 66,
    TRANSITION_TIME: 2.2,
  };

  const C = {
    bg: "#f2f1ec",
    ink: "#0b0b0b",
    muted: "#706e66",
    red: "#e23b2e",
    blue: "#2f55d9",
  };

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const SANS = '"Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
  const MONO = '"Cascadia Mono", "SFMono-Regular", "Roboto Mono", "Courier New", monospace';

  /* ================================================================ */
  /*  helpers                                                          */
  /* ================================================================ */

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n, len = 2) => String(Math.max(0, Math.floor(n))).padStart(len, "0");
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOutCubic = (t) => {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  function rgba(hex, alpha) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  function storageRead(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (_) {
      /* file scheme / privacy mode */
    }
  }

  function laneColor(lane) {
    return lane === "blue" ? C.blue : C.red;
  }

  function otherLane(lane) {
    return lane === "blue" ? "red" : "blue";
  }

  function laneName(lane) {
    return lane === "blue" ? "BLUE AXIS" : "RED AXIS";
  }

  function laneMode(lane) {
    return lane === "blue" ? "ECONOMY" : "COMBAT";
  }

  /* ================================================================ */
  /*  dom                                                              */
  /* ================================================================ */

  const $ = (selector, root = document) => root.querySelector(selector);

  const ui = {
    app: $("#app"),
    stage: $("#stage"),
    waveNo: $("#waveNo"),
    waveStatus: $("#waveStatus"),
    countdown: $("#countdown"),
    waveFill: $("#waveFill"),
    axisLabel: $("#axisLabel"),
    axisMode: $("#axisMode"),
    integrity: $("#integrity"),
    coreNum: $("#coreNum"),
    score: $("#score"),
    mobileScore: $("#mobileScore"),
    best: $("#best"),
    shapeText: $("#shapeText"),
    chargeFill: $("#chargeFill"),
    weaponState: $("#weaponState"),
    threatBadge: $("#threatBadge"),
    threatText: $("#threatText"),
    announce: $("#announce"),
    announceKicker: $("#announceKicker"),
    announceTitle: $("#announceTitle"),
    announceSub: $("#announceSub"),
    toast: $("#toast"),
    toastText: $("#toastText"),
    riftPrompt: $("#riftPrompt"),
    riftKey: $("#riftKey"),
    riftMain: $("#riftMain"),
    riftSub: $("#riftSub"),
    gameoverOverlay: $("#gameoverOverlay"),
    pauseOverlay: $("#pauseOverlay"),
    helpOverlay: $("#helpOverlay"),
    finalWave: $("#finalWave"),
    finalKills: $("#finalKills"),
    finalScore: $("#finalScore"),
    audioBtn: $("#audioBtn"),
    pauseBtn: $("#pauseBtn"),
    helpBtn: $("#helpBtn"),
    restartBtn: $("#restartBtn"),
    resumeBtn: $("#resumeBtn"),
    closeHelpBtn: $("#closeHelpBtn"),
    helpStartBtn: $("#helpStartBtn"),
    touchLeft: $("#touchLeft"),
    touchRight: $("#touchRight"),
    touchFlip: $("#touchFlip"),
    touchRift: $("#touchRift"),
    screenFlash: $("#screenFlash"),
  };

  const ctx = ui.stage.getContext("2d");

  /* ================================================================ */
  /*  view                                                             */
  /* ================================================================ */

  let W = 0;
  let H = 0;
  let DPR = 1;
  let zoom = 1;
  let viewW = 0;
  let viewH = 0;
  let groundY = 0;
  let groundScreenY = 0;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resizeStage() {
    const rect = ui.stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);

    ui.stage.width = Math.round(W * DPR);
    ui.stage.height = Math.round(H * DPR);

    const baseZoom = Math.max(W / CONFIG.WORLD_W, Math.min(W / 1500, 1.12));
    zoom = clamp(baseZoom, 0.72, 1.8);
    viewW = W / zoom;
    viewH = H / zoom;
    groundY = viewH * 0.72;
    groundScreenY = H * 0.72;

    if (game) {
      game.camera.x = clamp(game.camera.x, 0, Math.max(0, CONFIG.WORLD_W - viewW));
    }
  }

  function cameraTargetX() {
    if (!game) return 0;
    const p = game.player;
    const lead = p.facing * Math.min(44, Math.abs(p.vx) * 0.16);
    const follow = p.x - viewW / 2 + lead;
    const centered = CONFIG.CENTER - viewW / 2;
    const proximity = 1 - clamp((Math.abs(p.x - CONFIG.CENTER) - 60) / 280, 0, 1);
    const desired = lerp(follow, centered, proximity * 0.82);
    return clamp(desired, 0, Math.max(0, CONFIG.WORLD_W - viewW));
  }

  function snapCamera() {
    if (!game) return;
    game.camera.x = cameraTargetX();
  }

  function updateCamera(dt) {
    if (!game) return;
    const target = cameraTargetX();
    game.camera.x += (target - game.camera.x) * (1 - Math.exp(-6.4 * dt));
    game.camera.x = clamp(game.camera.x, 0, Math.max(0, CONFIG.WORLD_W - viewW));

    game.camera.shake *= Math.exp(-8 * dt);
    if (game.camera.shake < 0.03) game.camera.shake = 0;
    const mag = reducedMotion ? 0 : game.camera.shake;
    game.camera.shakeX = (Math.random() * 2 - 1) * mag;
    game.camera.shakeY = (Math.random() * 2 - 1) * mag * 0.55;
  }

  function addShake(amount) {
    if (reducedMotion) return;
    game.camera.shake = Math.max(game.camera.shake, amount);
  }

  /* ================================================================ */
  /*  audio                                                            */
  /* ================================================================ */

  let audio = null;
  let muted = storageRead("crossward.muted", "0") === "1";

  function initAudio() {
    if (audio) {
      if (audio.state === "suspended") audio.resume().catch(() => {});
      return;
    }
    if (muted) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    const master = ac.createGain();
    master.gain.value = 0.16;
    master.connect(ac.destination);
    audio = ac;
    audio.__master = master;
    if (ac.state === "suspended") ac.resume().catch(() => {});
  }

  function tone(startFreq, endFreq, duration, type, gainValue, delay = 0) {
    if (!audio || muted) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + Math.min(0.01, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.__master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  const sfx = {
    shot() {
      tone(210, 105, 0.04, "square", 0.035);
      tone(720, 360, 0.025, "triangle", 0.015);
    },
    hit() {
      tone(140, 90, 0.055, "square", 0.025);
    },
    kill() {
      tone(90, 48, 0.1, "triangle", 0.035);
      tone(360, 180, 0.045, "square", 0.016, 0.01);
    },
    portal() {
      tone(70, 54, 0.38, "sine", 0.035);
      tone(140, 112, 0.28, "triangle", 0.012);
    },
    flip() {
      tone(420, 560, 0.035, "square", 0.018);
    },
    warp() {
      tone(120, 680, 0.5, "sine", 0.04);
      tone(360, 1080, 0.42, "triangle", 0.013, 0.08);
    },
    arrive() {
      tone(520, 190, 0.32, "sine", 0.03);
    },
    leak() {
      tone(110, 38, 0.28, "sawtooth", 0.04);
    },
    deny() {
      tone(120, 100, 0.06, "square", 0.018);
    },
    over() {
      tone(190, 70, 0.75, "sine", 0.045);
      tone(120, 44, 0.95, "triangle", 0.025, 0.12);
    },
    ui() {
      tone(640, 820, 0.03, "square", 0.012);
    },
  };

  function toggleMute() {
    muted = !muted;
    storageWrite("crossward.muted", muted ? "1" : "0");
    ui.app.classList.toggle("is-muted", muted);
    ui.audioBtn.setAttribute("aria-pressed", String(muted));
    ui.audioBtn.setAttribute("aria-label", muted ? "开启声音" : "关闭声音");
    if (!muted) {
      initAudio();
      sfx.ui();
    }
  }

  /* ================================================================ */
  /*  state                                                            */
  /* ================================================================ */

  let game = null;
  let enemySerial = 0;
  let bestScore = Number(storageRead("crossward.best", 0)) || 0;
  let announceSerial = 0;
  let toastSerial = 0;
  let helpWasPaused = false;
  let lastTouchWarning = 0;

  const keys = {
    left: false,
    right: false,
  };

  function createGame() {
    return {
      time: 0,
      wave: 0,
      nextWaveAt: CONFIG.FIRST_WAVE,
      core: CONFIG.CORE_MAX,
      score: 0,
      kills: 0,
      best: bestScore,
      lane: "red",
      player: {
        x: CONFIG.CENTER - CONFIG.RIFT_STAND_OFFSET,
        vx: 0,
        facing: 1,
        shape: "vertical",
        angle: 0,
        targetAngle: 0,
        cooldown: 0,
        aim: 0,
        aimSide: 1,
        target: null,
        recoil: 0,
      },
      red: {
        enemies: [],
        spawnQueue: [],
        portalOpen: 0,
        lastWaveAt: -999,
      },
      bolts: [],
      particles: [],
      floaters: [],
      camera: {
        x: 0,
        shake: 0,
        shakeX: 0,
        shakeY: 0,
      },
      transition: null,
      paused: false,
      over: false,
    };
  }

  /* ================================================================ */
  /*  hud basics                                                       */
  /* ================================================================ */

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function buildIntegrity() {
    ui.integrity.innerHTML = "";
    for (let i = 0; i < CONFIG.CORE_MAX; i += 1) {
      const pip = document.createElement("i");
      pip.dataset.index = String(i);
      ui.integrity.appendChild(pip);
    }
  }

  function updateIntegrity() {
    if (!game) return;
    const pips = ui.integrity.children;
    for (let i = 0; i < pips.length; i += 1) {
      pips[i].classList.toggle("lost", i >= game.core);
    }
    setText(ui.coreNum, String(game.core));
    ui.integrity.setAttribute("aria-label", `核心完整度 ${game.core} / ${CONFIG.CORE_MAX}`);
  }

  function updateLaneChrome() {
    if (!game) return;
    const isBlue = game.lane === "blue";
    ui.app.dataset.lane = game.lane;
    setText(ui.axisLabel, laneName(game.lane));
    setText(ui.axisMode, laneMode(game.lane));
    setText(ui.riftMain, isBlue ? "返回红轴" : "进入裂缝");
    setText(ui.riftSub, isBlue ? "俯视切换 → RED / COMBAT" : "俯视切换 → BLUE / ECONOMY");
    ui.stage.setAttribute(
      "aria-label",
      `横向卷轴几何塔防画面：当前位于${isBlue ? "蓝色经济轴" : "红色战斗轴"}，中央是一道黑色裂缝。`
    );
  }

  function updateShapeUI() {
    if (!game) return;
    ui.app.dataset.shape = game.player.shape;
    setText(ui.shapeText, game.player.shape === "vertical" ? "VERTICAL" : "HORIZONTAL");
  }

  function showToast(text, duration = 3200) {
    const serial = ++toastSerial;
    setText(ui.toastText, text);
    ui.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      if (serial === toastSerial) ui.toast.classList.remove("show");
    }, duration);
  }

  function announceWave() {
    const serial = ++announceSerial;
    setText(ui.announceKicker, `WAVE ${pad(game.wave)}`);
    setText(ui.announceTitle, "PORTALS OPEN");
    setText(ui.announceSub, "2 PORTALS / 4 CONTACTS");
    ui.announce.classList.add("visible");
    window.clearTimeout(announceWave.timer);
    announceWave.timer = window.setTimeout(() => {
      if (serial === announceSerial) ui.announce.classList.remove("visible");
    }, 1450);
  }

  function flashDamage() {
    ui.screenFlash.classList.remove("damage");
    void ui.screenFlash.offsetWidth;
    ui.screenFlash.classList.add("damage");
    window.setTimeout(() => ui.screenFlash.classList.remove("damage"), 400);
  }

  /* ================================================================ */
  /*  game lifecycle                                                   */
  /* ================================================================ */

  function resetGame() {
    window.clearTimeout(showToast.timer);
    window.clearTimeout(announceWave.timer);
    announceSerial += 1;

    game = createGame();
    game.best = bestScore;
    enemySerial = 0;
    helpWasPaused = false;

    ui.gameoverOverlay.hidden = true;
    ui.pauseOverlay.hidden = true;
    ui.helpOverlay.hidden = true;
    ui.announce.classList.remove("visible");
    ui.toast.classList.remove("show");
    ui.riftPrompt.classList.remove("visible");
    ui.threatBadge.classList.remove("visible", "urgent");
    ui.app.classList.remove("is-transitioning");
    ui.app.classList.toggle("is-muted", muted);
    ui.audioBtn.setAttribute("aria-pressed", String(muted));
    ui.audioBtn.setAttribute("aria-label", muted ? "开启声音" : "关闭声音");

    keys.left = false;
    keys.right = false;

    buildIntegrity();
    updateIntegrity();
    updateLaneChrome();
    updateShapeUI();
    updateHUD(true);
    snapCamera();

    setText(ui.score, "000000");
    setText(ui.mobileScore, "000000");
    setText(ui.best, pad(bestScore, 6));

    window.setTimeout(() => {
      if (!game || game.over) return;
      showToast("A / D 移动 · SPACE 翻转矩形 · E 进入中央裂缝", 6200);
    }, 550);
  }

  function endGame() {
    if (!game || game.over) return;
    game.over = true;
    game.player.vx = 0;
    game.player.target = null;
    game.transition = null;
    ui.app.classList.remove("is-transitioning");
    keys.left = false;
    keys.right = false;

    bestScore = Math.max(bestScore, game.score);
    game.best = bestScore;
    storageWrite("crossward.best", bestScore);

    setText(ui.finalWave, String(game.wave));
    setText(ui.finalKills, String(game.kills));
    setText(ui.finalScore, pad(game.score, 6));
    setText(ui.best, pad(bestScore, 6));
    ui.riftPrompt.classList.remove("visible");
    ui.threatBadge.classList.remove("visible", "urgent");
    ui.announce.classList.remove("visible");
    ui.gameoverOverlay.hidden = false;
    sfx.over();
    addShake(10);
  }

  function pauseGame(auto = false) {
    if (!game || game.over || game.transition) return;
    if (!ui.helpOverlay.hidden) return;
    game.paused = true;
    keys.left = false;
    keys.right = false;
    ui.pauseOverlay.hidden = false;
    ui.riftPrompt.classList.remove("visible");
    if (!auto) sfx.ui();
  }

  function resumeGame() {
    if (!game || game.over) return;
    game.paused = false;
    ui.pauseOverlay.hidden = true;
    sfx.ui();
  }

  function togglePause() {
    if (!game || game.over || game.transition) return;
    if (!ui.helpOverlay.hidden) {
      closeHelp();
      return;
    }
    if (game.paused) resumeGame();
    else pauseGame(false);
  }

  function openHelp() {
    if (!game || game.over || game.transition) return;
    helpWasPaused = game.paused;
    game.paused = true;
    keys.left = false;
    keys.right = false;
    ui.pauseOverlay.hidden = true;
    ui.helpOverlay.hidden = false;
    ui.riftPrompt.classList.remove("visible");
    sfx.ui();
  }

  function closeHelp() {
    if (!game) return;
    ui.helpOverlay.hidden = true;
    if (!helpWasPaused) game.paused = false;
    sfx.ui();
  }

  /* ================================================================ */
  /*  shape                                                            */
  /* ================================================================ */

  function toggleShape() {
    if (!game || game.over || game.paused || game.transition) return;
    const p = game.player;
    p.shape = p.shape === "vertical" ? "horizontal" : "vertical";
    p.targetAngle = p.shape === "vertical" ? 0 : Math.PI / 2;
    updateShapeUI();
    sfx.flip();
  }

  /* ================================================================ */
  /*  top-down transition                                              */
  /* ================================================================ */

  function nearRift() {
    return game && Math.abs(game.player.x - CONFIG.CENTER) <= CONFIG.RIFT_RADIUS;
  }

  function startTransition() {
    if (!game || game.over || game.paused || game.transition) return;

    initAudio();

    if (!nearRift()) {
      const now = performance.now();
      if (now - lastTouchWarning > 600) {
        lastTouchWarning = now;
        showToast("靠近中央裂缝才能切换轴线。", 2000);
        sfx.deny();
      }
      return;
    }

    const from = game.lane;
    const to = otherLane(from);
    game.transition = {
      t: 0,
      duration: CONFIG.TRANSITION_TIME,
      from,
      to,
      swapped: false,
    };

    game.player.x = CONFIG.CENTER;
    game.player.vx = 0;
    game.player.target = null;
    game.bolts.length = 0;
    ui.app.classList.add("is-transitioning");
    ui.riftPrompt.classList.remove("visible");
    ui.announce.classList.remove("visible");
    sfx.warp();
  }

  function updateTransition(dt) {
    const s = game.transition;
    s.t += dt;
    const q = s.t / s.duration;

    if (!s.swapped && q >= 0.78) {
      game.lane = s.to;
      game.player.x = CONFIG.CENTER - CONFIG.RIFT_STAND_OFFSET;
      game.player.vx = 0;
      updateLaneChrome();
      updateHUD(true);
      s.swapped = true;
      sfx.arrive();
    }

    if (s.t >= s.duration) {
      game.transition = null;
      game.player.x = CONFIG.CENTER - CONFIG.RIFT_STAND_OFFSET;
      game.player.vx = 0;
      ui.app.classList.remove("is-transitioning");
      addShake(2);
      if (game.lane === "blue") {
        showToast("BLUE AXIS / 经济与升级区域。红轴仍在继续运行。", 3800);
      } else {
        showToast("RED AXIS / 战斗区域。边缘传送门每 20 秒展开。", 3000);
      }
    }
  }

  /* ================================================================ */
  /*  waves / portals / enemies                                        */
  /* ================================================================ */

  function spawnWave() {
    if (!game || game.over) return;
    game.wave += 1;
    const base = game.time;
    game.red.lastWaveAt = base;

    for (const side of ["left", "right"]) {
      game.red.spawnQueue.push({ at: base + 0.32, side, slot: 0 });
      game.red.spawnQueue.push({ at: base + 0.66, side, slot: 1 });
    }

    game.nextWaveAt = base + CONFIG.WAVE_EVERY;
    announceWave();
    sfx.portal();
  }

  function updatePortals() {
    const age = game.time - game.red.lastWaveAt;
    let open = 0;
    if (age >= 0 && age < 1.9) {
      if (age < 0.24) {
        open = easeOutCubic(age / 0.24);
      } else if (age < 1.25) {
        open = 1;
      } else {
        open = 1 - easeInOutCubic((age - 1.25) / 0.65);
      }
    }
    game.red.portalOpen = clamp(open, 0, 1);
  }

  function spawnSlime(side, slot) {
    const baseX = side === "left" ? CONFIG.PORTAL_L + 35 + slot * 9 : CONFIG.PORTAL_R - 35 - slot * 9;
    const enemy = {
      id: ++enemySerial,
      lane: "red",
      x: baseX,
      side,
      dir: side === "left" ? 1 : -1,
      hp: CONFIG.SLIME_HP,
      maxHp: CONFIG.SLIME_HP,
      radius: CONFIG.SLIME_RADIUS,
      speed: CONFIG.SLIME_SPEED,
      age: 0,
      phase: "spawn",
      dead: false,
      hitFlash: 0,
      wobbleSeed: Math.random() * 10,
    };
    game.red.enemies.push(enemy);
    burstBlack(baseX, groundY - 12, 4, 0.55);
  }

  function updateSpawnQueue() {
    const waiting = [];
    for (const entry of game.red.spawnQueue) {
      if (game.time >= entry.at) {
        spawnSlime(entry.side, entry.slot);
      } else {
        waiting.push(entry);
      }
    }
    game.red.spawnQueue = waiting;
  }

  function updateEnemies(dt) {
    for (const enemy of game.red.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (enemy.phase === "spawn" && enemy.age >= 0.28) {
        enemy.phase = "walk";
      }

      if (enemy.phase === "walk") {
        enemy.x += enemy.dir * enemy.speed * dt;
        const reached =
          (enemy.dir > 0 && enemy.x >= CONFIG.CENTER - 22) ||
          (enemy.dir < 0 && enemy.x <= CONFIG.CENTER + 22);
        if (reached) {
          enemy.dead = true;
          leakEnemy(enemy);
          if (game.over) break;
        }
      }
    }

    game.red.enemies = game.red.enemies.filter((enemy) => !enemy.dead);
  }

  function leakEnemy(enemy) {
    if (!game || game.over) return;
    game.core = Math.max(0, game.core - 1);
    addShake(9);
    flashDamage();
    burstBlack(CONFIG.CENTER, groundY - 28, 12, 1.2, C.red);
    floatText("−1 CORE", CONFIG.CENTER, groundY - 92, C.red, 10);
    sfx.leak();
    updateIntegrity();

    if (game.core <= 0) {
      endGame();
    } else if (game.lane === "blue") {
      showToast("红轴漏怪，核心完整度 −1。", 1600);
    }
  }

  /* ================================================================ */
  /*  player / combat                                                  */
  /* ================================================================ */

  function bodyMetrics() {
    const p = game.player;
    const hw = CONFIG.PLAYER_W / 2;
    const hh = CONFIG.PLAYER_H / 2;
    const yExtent = Math.abs(hw * Math.sin(p.angle)) + Math.abs(hh * Math.cos(p.angle));
    const centerY = groundY - yExtent;
    const topY = centerY - yExtent;
    return { hw, hh, yExtent, centerY, topY };
  }

  function crossbowMount() {
    const p = game.player;
    const m = bodyMetrics();
    return {
      x: p.x + p.aimSide * 7,
      y: m.topY - 2,
    };
  }

  function selectTarget() {
    if (!game || game.lane !== "red") return null;
    const p = game.player;
    let best = null;
    let bestThreat = Infinity;

    for (const enemy of game.red.enemies) {
      if (enemy.dead || enemy.phase !== "walk") continue;
      if (Math.abs(enemy.x - p.x) > CONFIG.ATTACK_RANGE) continue;
      const threat = Math.abs(enemy.x - CONFIG.CENTER);
      if (threat < bestThreat) {
        bestThreat = threat;
        best = enemy;
      }
    }
    return best;
  }

  function updatePlayer(dt) {
    const p = game.player;
    const axis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const targetV = axis * CONFIG.PLAYER_SPEED;
    const accel = axis !== 0 ? CONFIG.PLAYER_ACCEL : CONFIG.PLAYER_DECEL;

    if (p.vx < targetV) p.vx = Math.min(p.vx + accel * dt, targetV);
    else if (p.vx > targetV) p.vx = Math.max(p.vx - accel * dt, targetV);

    p.x = clamp(p.x + p.vx * dt, CONFIG.PORTAL_L - 22, CONFIG.PORTAL_R + 22);
    if (Math.abs(p.vx) > 4) p.facing = p.vx > 0 ? 1 : -1;

    const angleDelta = p.targetAngle - p.angle;
    p.angle += angleDelta * (1 - Math.exp(-20 * dt));
    if (Math.abs(p.targetAngle - p.angle) < 0.0004) p.angle = p.targetAngle;

    p.cooldown = Math.max(0, p.cooldown - dt);
    p.recoil = Math.max(0, p.recoil - dt * 10);

    p.target = selectTarget();
    p.aimSide = p.target ? (p.target.x >= p.x ? 1 : -1) : p.facing;
    const mount = crossbowMount();
    if (p.target) {
      p.aim = Math.atan2(groundY - p.target.radius - mount.y, p.target.x - mount.x);
    } else {
      p.aim = p.facing > 0 ? 0 : Math.PI;
    }

    if (p.target && p.cooldown <= 0) {
      fireBolt(p.target, mount);
    }
  }

  function fireBolt(target, mount) {
    const p = game.player;
    const angle = Math.atan2(groundY - target.radius - mount.y, target.x - mount.x);
    game.bolts.push({
      x: mount.x + Math.cos(angle) * 5,
      y: mount.y + Math.sin(angle) * 5,
      prevX: mount.x,
      prevY: mount.y,
      angle,
      target,
      life: 1.5,
      dead: false,
    });

    p.cooldown = CONFIG.ATTACK_INTERVAL;
    p.recoil = 1;
    p.aim = angle;
    burstBlack(mount.x + Math.cos(angle) * 8, mount.y + Math.sin(angle) * 8, 2, 0.35, C.red);
    sfx.shot();
  }

  function updateBolts(dt) {
    for (const bolt of game.bolts) {
      if (bolt.dead) continue;
      bolt.life -= dt;
      if (bolt.life <= 0 || !bolt.target || bolt.target.dead) {
        bolt.dead = true;
        continue;
      }

      const targetY = groundY - bolt.target.radius;
      const dx = bolt.target.x - bolt.x;
      const dy = targetY - bolt.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= 15) {
        hitEnemy(bolt.target);
        bolt.dead = true;
        continue;
      }

      const step = Math.min(CONFIG.BOLT_SPEED * dt, dist);
      bolt.prevX = bolt.x;
      bolt.prevY = bolt.y;
      bolt.x += (dx / Math.max(0.001, dist)) * step;
      bolt.y += (dy / Math.max(0.001, dist)) * step;
      bolt.angle = Math.atan2(dy, dx);
    }

    game.bolts = game.bolts.filter((bolt) => !bolt.dead);
  }

  function hitEnemy(enemy) {
    if (!enemy || enemy.dead) return;
    enemy.hp -= 1;
    enemy.hitFlash = 0.18;
    addShake(1.4);
    burstBlack(enemy.x, groundY - enemy.radius, 5, 0.5);
    sfx.hit();

    if (enemy.hp <= 0) {
      killEnemy(enemy);
    }
  }

  function killEnemy(enemy) {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    game.kills += 1;
    game.score += 100;
    game.best = Math.max(game.best, game.score);
    if (game.score > bestScore) {
      bestScore = game.score;
      storageWrite("crossward.best", bestScore);
    }

    burstBlack(enemy.x, groundY - enemy.radius, 14, 1.15);
    burstBlack(enemy.x, groundY - enemy.radius, 4, 0.55, C.red);
    floatText("+100", enemy.x, groundY - enemy.radius - 26, C.ink, 9);
    addShake(2);
    sfx.kill();
  }

  /* ================================================================ */
  /*  particles                                                        */
  /* ================================================================ */

  function burstBlack(x, y, count, power, color = C.ink) {
    const actual = reducedMotion ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < actual; i += 1) {
      const angle = Math.random() * TAU;
      const speed = (18 + Math.random() * 78) * power;
      const life = 0.25 + Math.random() * 0.48;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        gravity: 160 + Math.random() * 120,
        life,
        maxLife: life,
        size: 1 + Math.random() * 2.6,
        color,
        rotate: Math.random() * TAU,
      });
    }
    if (game.particles.length > 220) game.particles.splice(0, game.particles.length - 220);
  }

  function floatText(text, x, y, color, size) {
    game.floaters.push({
      text,
      x,
      y,
      color,
      size,
      life: 0.85,
      maxLife: 0.85,
    });
    if (game.floaters.length > 20) game.floaters.shift();
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= Math.exp(-1.1 * dt);
      p.rotate += dt * 4;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    for (const f of game.floaters) {
      f.life -= dt;
      f.y -= 18 * dt;
    }
    game.floaters = game.floaters.filter((f) => f.life > 0);
  }

  /* ================================================================ */
  /*  simulation                                                       */
  /* ================================================================ */

  function update(dt) {
    if (!game || game.paused || game.over) return;

    if (game.transition) {
      updateTransition(dt);
      return;
    }

    game.time += dt;

    if (game.time >= game.nextWaveAt) {
      spawnWave();
    }

    updatePortals();
    updatePlayer(dt);
    updateSpawnQueue();
    updateEnemies(dt);
    if (game.over) return;
    updateBolts(dt);
    updateParticles(dt);
    updateHUD();
  }

  /* ================================================================ */
  /*  hud update                                                       */
  /* ================================================================ */

  function updateHUD(force = false) {
    if (!game) return;

    const countdown = Math.max(0, game.nextWaveAt - game.time);
    setText(ui.countdown, formatClock(countdown));
    setText(ui.waveNo, pad(game.wave));

    const hostiles = game.red.enemies.length;
    if (game.lane === "blue" && hostiles > 0) {
      setText(ui.waveStatus, "RED UNATTENDED");
    } else if (countdown <= 5) {
      setText(ui.waveStatus, "PORTAL INCOMING");
    } else {
      setText(ui.waveStatus, game.wave === 0 ? "FIRST CONTACT" : "STANDBY");
    }

    const cycleStart = game.wave === 0 ? 0 : game.nextWaveAt - CONFIG.WAVE_EVERY;
    const cycleLength = game.wave === 0 ? CONFIG.FIRST_WAVE : CONFIG.WAVE_EVERY;
    const progress = clamp((game.time - cycleStart) / Math.max(0.001, cycleLength), 0, 1);
    ui.waveFill.style.transform = `scaleX(${progress.toFixed(4)})`;

    setText(ui.score, pad(game.score, 6));
    setText(ui.mobileScore, pad(game.score, 6));
    setText(ui.best, pad(Math.max(bestScore, game.best), 6));

    const healthChanged = Number(ui.coreNum.textContent) !== game.core || force;
    if (healthChanged) updateIntegrity();

    const showPrompt =
      !game.transition &&
      !game.paused &&
      !game.over &&
      Math.abs(game.player.x - CONFIG.CENTER) <= CONFIG.RIFT_RADIUS;
    ui.riftPrompt.classList.toggle("visible", showPrompt);
    ui.touchRift.classList.toggle("near", showPrompt);

    const showThreat =
      game.lane === "blue" &&
      !game.transition &&
      !game.over &&
      (hostiles > 0 || game.red.portalOpen > 0.08);
    ui.threatBadge.classList.toggle("visible", showThreat);
    if (showThreat) {
      const text = hostiles > 0 ? `${hostiles} HOSTILE${hostiles === 1 ? "" : "S"}` : "PORTALS OPEN";
      setText(ui.threatText, text);
      let urgent = false;
      for (const e of game.red.enemies) {
        if (Math.abs(e.x - CONFIG.CENTER) < 150) {
          urgent = true;
          break;
        }
      }
      ui.threatBadge.classList.toggle("urgent", urgent);
    }

    const ready = game.lane === "red" ? 1 - clamp(game.player.cooldown / CONFIG.ATTACK_INTERVAL, 0, 1) : 0;
    ui.chargeFill.style.transform = `scaleX(${ready.toFixed(3)})`;
    setText(ui.weaponState, game.lane === "blue" ? "STANDBY" : game.player.target ? "TRACKING" : "1.0 HZ");

    if (force) {
      updateLaneChrome();
      updateShapeUI();
      updateIntegrity();
    }
  }

  /* ================================================================ */
  /*  rendering — background                                           */
  /* ================================================================ */

  function drawBackground() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const step = 64;
    const offset = -((game.camera.x * zoom * 0.06) % step);
    ctx.strokeStyle = rgba(C.ink, 0.035);
    ctx.lineWidth = 1;
    for (let x = offset; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
      ctx.stroke();
    }

    // Sparse parallax frames made from straight lines only.
    const shift = -((game.camera.x * zoom * 0.15) % 460);
    ctx.strokeStyle = rgba(C.ink, 0.055);
    for (let i = -1; i < Math.ceil(W / 460) + 2; i += 1) {
      const x = shift + i * 460;
      const y = H * 0.25 + ((i + 2) % 3) * 30;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, 128, 128);
    }

    ctx.strokeStyle = rgba(C.ink, 0.06);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(H * 0.41) + 0.5);
    ctx.lineTo(W, Math.round(H * 0.41) + 0.5);
    ctx.stroke();

    // Small registration ticks at the frame edges.
    ctx.strokeStyle = rgba(C.ink, 0.18);
    const edge = 14;
    const tick = 6;
    for (const x of [edge, W - edge]) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, edge);
      ctx.lineTo(x + 0.5, edge + tick);
      ctx.stroke();
    }
    for (const y of [edge, H - edge]) {
      ctx.beginPath();
      ctx.moveTo(edge, y + 0.5);
      ctx.lineTo(edge + tick, y + 0.5);
      ctx.stroke();
    }
  }

  /* ================================================================ */
  /*  rendering — world                                                */
  /* ================================================================ */

  function drawWorld() {
    drawCrossGuide();
    drawPlatform();
    if (game.lane === "red") {
      drawEndPortals();
    } else {
      drawEconomyGrid();
    }
    drawRift();
    drawSlimes();
    drawPlayer();
    drawBolts();
    drawParticles();
    drawFloaters();
  }

  function drawCrossGuide() {
    const color = laneColor(otherLane(game.lane));
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CONFIG.CENTER + 0.5, groundY - 380);
    ctx.lineTo(CONFIG.CENTER + 0.5, groundY - 128);
    ctx.stroke();

    ctx.fillStyle = rgba(color, 0.6);
    ctx.fillRect(CONFIG.CENTER - 2, groundY - 386, 5, 5);

    for (let i = 0; i < 5; i += 1) {
      const y = groundY - 345 + i * 48;
      ctx.strokeStyle = rgba(color, 0.18);
      ctx.beginPath();
      ctx.moveTo(CONFIG.CENTER - 4, y + 0.5);
      ctx.lineTo(CONFIG.CENTER + 5, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlatform() {
    const accent = laneColor(game.lane);
    const left = CONFIG.PORTAL_L - 32;
    const right = CONFIG.PORTAL_R + 32;

    ctx.save();
    ctx.fillStyle = rgba(accent, 0.055);
    ctx.fillRect(left, groundY + 1, right - left, 28);
    ctx.fillStyle = accent;
    ctx.fillRect(left, groundY - 2, right - left, 3);
    ctx.fillStyle = C.ink;
    ctx.fillRect(left, groundY + 1, right - left, 8);

    ctx.strokeStyle = rgba(C.ink, 0.2);
    ctx.lineWidth = 1;
    for (let x = left; x <= right; x += 80) {
      const major = Math.round(x - left) % 320 === 0;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, groundY + 8);
      ctx.lineTo(x + 0.5, groundY + (major ? 18 : 12));
      ctx.stroke();
    }

    ctx.strokeStyle = rgba(C.ink, 0.1);
    ctx.beginPath();
    ctx.moveTo(left, groundY + 27.5);
    ctx.lineTo(right, groundY + 27.5);
    ctx.stroke();

    // Solid end caps make the platform a compact object rather than a rule.
    ctx.fillStyle = C.ink;
    ctx.fillRect(left - 1, groundY - 8, 3, 18);
    ctx.fillRect(right - 2, groundY - 8, 3, 18);
    ctx.restore();
  }

  function drawEndPortals() {
    const open = game.red.portalOpen;
    const width = 2 + open * 31;
    const height = 84;

    for (const side of ["left", "right"]) {
      const x = side === "left" ? CONFIG.PORTAL_L : CONFIG.PORTAL_R;
      const label = side === "left" ? "L-01" : "R-01";

      ctx.save();
      ctx.fillStyle = C.ink;
      ctx.fillRect(x - width / 2, groundY - height, width, height);

      if (open > 0.05) {
        ctx.fillStyle = rgba(C.bg, 0.72 * open);
        ctx.fillRect(x - 0.5, groundY - height + 9, 1, height - 18);
      }

      ctx.fillStyle = rgba(C.ink, 0.62);
      ctx.font = `7px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(label, x, groundY - height - 12);

      ctx.fillStyle = rgba(C.ink, 0.34);
      ctx.font = `6.5px ${MONO}`;
      ctx.fillText("2 / 20 SEC", x, groundY + 41);
      ctx.restore();
    }
  }

  function drawEconomyGrid() {
    const pads = [-410, -245, 245, 410];
    const labels = ["E-01", "E-02", "E-03", "E-04"];

    ctx.save();
    ctx.strokeStyle = C.blue;
    ctx.fillStyle = C.blue;
    ctx.lineWidth = 1;
    for (let i = 0; i < pads.length; i += 1) {
      const x = CONFIG.CENTER + pads[i];
      const top = groundY - 42;
      ctx.strokeRect(x - 11.5, top + 0.5, 23, 23);

      ctx.beginPath();
      ctx.moveTo(x - 4, top + 12);
      ctx.lineTo(x + 4, top + 12);
      ctx.moveTo(x, top + 8);
      ctx.lineTo(x, top + 16);
      ctx.stroke();

      ctx.font = `7px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x, groundY + 41);
    }

    ctx.fillStyle = rgba(C.blue, 0.75);
    ctx.font = `7px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("ECONOMY / UPGRADE GRID  ·  MODULES RESERVED", CONFIG.CENTER, groundY - 154);

    ctx.strokeStyle = rgba(C.blue, 0.35);
    ctx.beginPath();
    ctx.moveTo(CONFIG.CENTER - 280, groundY - 140.5);
    ctx.lineTo(CONFIG.CENTER + 280, groundY - 140.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRift() {
    const x = CONFIG.CENTER;
    const base = groundY + 2;
    const top = base - 128;

    ctx.save();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(x - 4, base);
    ctx.lineTo(x - 9, base - 16);
    ctx.lineTo(x - 3, base - 33);
    ctx.lineTo(x - 8, base - 51);
    ctx.lineTo(x - 2, base - 71);
    ctx.lineTo(x - 7, base - 89);
    ctx.lineTo(x - 1, top);
    ctx.lineTo(x + 4, base - 92);
    ctx.lineTo(x + 2, base - 72);
    ctx.lineTo(x + 8, base - 52);
    ctx.lineTo(x + 3, base - 32);
    ctx.lineTo(x + 9, base - 15);
    ctx.lineTo(x + 4, base);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(C.bg, 0.62);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 1, base - 4);
    ctx.lineTo(x - 4, base - 20);
    ctx.lineTo(x + 1, base - 36);
    ctx.lineTo(x - 2, base - 55);
    ctx.lineTo(x + 2, base - 74);
    ctx.lineTo(x - 1, base - 94);
    ctx.lineTo(x + 2, base - 116);
    ctx.stroke();

    // Small angular branches make the shape read as a crack, not a beam.
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, base - 43);
    ctx.lineTo(x - 19, base - 51);
    ctx.lineTo(x - 24, base - 49);
    ctx.moveTo(x + 5, base - 63);
    ctx.lineTo(x + 17, base - 69);
    ctx.lineTo(x + 22, base - 78);
    ctx.moveTo(x - 4, base - 90);
    ctx.lineTo(x - 13, base - 99);
    ctx.stroke();

    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(x - 18, base);
    ctx.lineTo(x - 8, base - 6);
    ctx.lineTo(x + 1, base - 2);
    ctx.lineTo(x + 11, base - 7);
    ctx.lineTo(x + 18, base);
    ctx.closePath();
    ctx.fill();

    if (game.core <= 3) {
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 5, base - 20);
      ctx.lineTo(x + 13, base - 27);
      ctx.lineTo(x + 8, base - 36);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSlimes() {
    if (game.lane !== "red") return;

    for (const enemy of game.red.enemies) {
      const spawnT = enemy.phase === "spawn" ? clamp(enemy.age / 0.28, 0, 1) : 1;
      const scale = 0.25 + easeOutCubic(spawnT) * 0.75;
      const x = enemy.x;
      const y = groundY - enemy.radius;

      ctx.save();
      ctx.globalAlpha = 0.35 + spawnT * 0.65;
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, TAU);
      ctx.fill();

      if (enemy.hitFlash > 0) {
        const a = enemy.hitFlash / 0.18;
        ctx.strokeStyle = rgba(C.bg, a * 0.9);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 2, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (game.player.target && !game.player.target.dead) {
      drawTargetBracket(game.player.target);
    }
  }

  function drawTargetBracket(target) {
    const r = target.radius + 6;
    const x = target.x;
    const y = groundY - target.radius;
    const corner = 5;

    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + sx * r, y + sy * (r - corner));
        ctx.lineTo(x + sx * r, y + sy * r);
        ctx.lineTo(x + sx * (r - corner), y + sy * r);
        ctx.stroke();
      }
    }
    ctx.fillStyle = C.red;
    ctx.fillRect(x - 2, y - r - 6, 4, 2);
    ctx.restore();
  }

  function drawPlayer() {
    const p = game.player;
    const m = bodyMetrics();
    const res = reducedMotion ? 0 : p.recoil;

    ctx.save();
    ctx.translate(p.x - p.aimSide * res * 1.2, m.centerY);
    ctx.rotate(p.angle);

    ctx.fillStyle = C.ink;
    ctx.fillRect(-m.hw, -m.hh, m.hw * 2, m.hh * 2);
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.strokeRect(-m.hw + 0.5, -m.hh + 0.5, m.hw * 2 - 1, m.hh * 2 - 1);
    ctx.restore();

    // Crossbow sits directly on top of the rectangle.
    const mount = crossbowMount();
    ctx.save();
    ctx.translate(mount.x, mount.y);
    ctx.rotate(p.aim);
    ctx.translate(-p.recoil * 1.8, 0);

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();

    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(9, -6);
    ctx.lineTo(13, -2);
    ctx.lineTo(13, 2);
    ctx.lineTo(9, 6);
    ctx.stroke();

    ctx.strokeStyle = C.red;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(18, -2);
    ctx.lineTo(18, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBolts() {
    for (const bolt of game.bolts) {
      const dx = Math.cos(bolt.angle);
      const dy = Math.sin(bolt.angle);
      ctx.save();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bolt.x - dx * 12, bolt.y - dy * 12);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();
      ctx.strokeStyle = C.red;
      ctx.beginPath();
      ctx.moveTo(bolt.x, bolt.y);
      ctx.lineTo(bolt.x + dx * 4, bolt.y + dy * 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotate);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (const f of game.floaters) {
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = `${f.size}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /* ================================================================ */
  /*  rendering — top-down transition                                  */
  /* ================================================================ */

  function drawPlanGrid() {
    ctx.save();
    ctx.strokeStyle = rgba(C.ink, 0.055);
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function axisPoint(horizontal, t, offset = 0) {
    if (horizontal) return { x: t, y: offset };
    return { x: offset, y: t };
  }

  function drawPlanAxis(horizontal, color, width, arm) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(-arm, 0);
      ctx.lineTo(arm, 0);
    } else {
      ctx.moveTo(0, -arm);
      ctx.lineTo(0, arm);
    }
    ctx.stroke();

    ctx.strokeStyle = rgba(C.ink, 0.16);
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i += 1) {
      if (i === 0) continue;
      const t = (i / 4) * arm;
      const p = axisPoint(horizontal, t);
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(p.x, -5);
        ctx.lineTo(p.x, 5);
      } else {
        ctx.moveTo(-5, p.y);
        ctx.lineTo(5, p.y);
      }
      ctx.stroke();
    }
  }

  function drawPlanFeatures(horizontal, arm, redAxis) {
    if (redAxis) {
      for (const t of [-0.84, 0.84]) {
        const p = axisPoint(horizontal, t * arm);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(p.x, p.y - 16);
          ctx.lineTo(p.x, p.y + 16);
        } else {
          ctx.moveTo(p.x - 16, p.y);
          ctx.lineTo(p.x + 16, p.y);
        }
        ctx.stroke();
      }

      for (const enemy of game.red.enemies) {
        const t = clamp((enemy.x - CONFIG.CENTER) / (CONFIG.PORTAL_R - CONFIG.CENTER), -1, 1);
        const p = axisPoint(horizontal, t * arm * 0.84, horizontal ? -7 : 7);
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, TAU);
        ctx.fill();
      }
    } else {
      for (const t of [-0.66, -0.32, 0.32, 0.66]) {
        const p = axisPoint(horizontal, t * arm, horizontal ? -9 : 9);
        ctx.strokeStyle = C.blue;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
      }
    }
  }

  function drawTransition() {
    if (!game.transition) return;
    const s = game.transition;
    const q = clamp(s.t / s.duration, 0, 1);

    let cover;
    if (q < 0.12) cover = easeOutCubic(q / 0.12);
    else if (q > 0.84) cover = 1 - easeInOutCubic((q - 0.84) / 0.16);
    else cover = 1;
    if (cover <= 0.001) return;

    const fromColor = laneColor(s.from);
    const toColor = laneColor(s.to);
    const compact = H < 560;
    const arm = compact ? Math.min(W * 0.34, H * 0.3, 160) : Math.min(W * 0.42, H * 0.34, 350);
    const entry = easeOutCubic(clamp(q / 0.18, 0, 1));
    const settle = easeInOutCubic(clamp((q - 0.52) / 0.3, 0, 1));
    const cx = W / 2;
    const planRestY = compact ? H * 0.56 : H * 0.47;
    const baseCenterY = lerp(groundScreenY, planRestY, entry);
    const cy = lerp(baseCenterY, groundScreenY, settle);
    const direction = s.from === "red" ? -1 : 1;
    const rotation = easeInOutCubic(clamp((q - 0.48) / 0.28, 0, 1)) * direction * Math.PI * 0.5;
    const zoomT = easeInOutCubic(clamp((q - 0.6) / 0.28, 0, 1));
    const introScale = 0.62 + 0.38 * entry;
    const scale = introScale * (1 + zoomT * 4.4);
    const focus = easeInOutCubic(clamp((q - 0.24) / 0.25, 0, 1));

    ctx.save();
    ctx.globalAlpha = cover;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    drawPlanGrid();

    // Overhead cross. The active axis starts horizontal; the target axis
    // becomes horizontal as the plan rotates and zooms.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    drawPlanAxis(true, fromColor, 9 - focus * 5, arm);
    drawPlanAxis(false, toColor, 3 + focus * 6, arm);

    const redHorizontal = s.from === "red";
    drawPlanFeatures(redHorizontal, arm, true);
    drawPlanFeatures(!redHorizontal, arm, false);

    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(-1, -8);
    ctx.lineTo(1, 2);
    ctx.lineTo(6, -4);
    ctx.lineTo(3, 8);
    ctx.lineTo(-2, 4);
    ctx.closePath();
    ctx.fill();

    const marker = axisPoint(true, 13);
    ctx.fillStyle = C.ink;
    ctx.fillRect(marker.x - 4, marker.y - 5, 8, 10);
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 1;
    ctx.strokeRect(marker.x - 4.5, marker.y - 5.5, 9, 11);

    ctx.restore();

    const topLabelY = compact ? 22 : 54;
    const axisLabelY = compact ? 42 : 77;
    const legendY = compact ? 65 : 104;

    ctx.fillStyle = C.ink;
    ctx.font = `8.5px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("TOP VIEW / 俯视", cx, topLabelY);

    ctx.fillStyle = toColor;
    ctx.font = `700 ${compact ? 12 : 14}px ${SANS}`;
    ctx.fillText(s.to === "blue" ? "ECONOMY AXIS" : "COMBAT AXIS", cx, axisLabelY);

    drawPlanLegend(30, legendY, C.red, "RED / COMBAT", s.to === "red");
    drawPlanLegend(W - 30, legendY, C.blue, "BLUE / ECONOMY", s.to === "blue", "right");

    const targetAlpha = clamp((q - 0.34) / 0.18, 0, 1);
    if (targetAlpha > 0) {
      ctx.globalAlpha = cover * targetAlpha;
      ctx.fillStyle = toColor;
      ctx.font = `7px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(
        s.to === "blue" ? "→ ENTERING ECONOMY / RESERVED AREA" : "→ ENTERING COMBAT AXIS",
        cx,
        H - (compact ? 44 : 56)
      );
      ctx.globalAlpha = cover;
    }

    const steps = ["PLAN", "ROTATE", "ENTER"];
    const activeStep = q < 0.48 ? 0 : q < 0.8 ? 1 : 2;
    const stepW = compact ? 52 : 62;
    const total = stepW * 3 + 16;
    const startX = cx - total / 2;
    const baseY = H - (compact ? 24 : 32);
    ctx.font = `7px ${MONO}`;
    for (let i = 0; i < 3; i += 1) {
      const x = startX + i * (stepW + 8);
      ctx.fillStyle = i === activeStep ? toColor : rgba(C.ink, 0.22);
      ctx.fillRect(x, baseY, stepW, 2);
      ctx.fillStyle = i === activeStep ? C.ink : C.muted;
      ctx.textAlign = "left";
      ctx.fillText(`0${i + 1} ${steps[i]}`, x, baseY + 12);
    }

    ctx.strokeStyle = rgba(C.ink, 0.16);
    ctx.lineWidth = 1;
    const ruleY = compact ? 84.5 : 124.5;
    ctx.beginPath();
    ctx.moveTo(30, ruleY);
    ctx.lineTo(W - 30, ruleY);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlanLegend(x, y, color, label, active, align = "left") {
    ctx.save();
    ctx.textAlign = align;
    ctx.fillStyle = color;
    const square = 7;
    if (align === "right") ctx.fillRect(x - square, y, square, square);
    else ctx.fillRect(x, y, square, square);

    ctx.fillStyle = active ? C.ink : C.muted;
    ctx.font = `7px ${MONO}`;
    const tx = align === "right" ? x - 12 : x + 12;
    ctx.fillText(label, tx, y + 6.5);
    if (active) {
      ctx.fillStyle = color;
      ctx.fillRect(align === "right" ? x - 110 : x, y + 12, 110, 2);
    }
    ctx.restore();
  }

  /* ================================================================ */
  /*  render loop                                                      */
  /* ================================================================ */

  function render() {
    if (!game) return;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-game.camera.x + game.camera.shakeX / zoom, game.camera.shakeY / zoom);
    drawWorld();
    ctx.restore();

    if (game.transition) drawTransition();
  }

  /* ================================================================ */
  /*  input                                                            */
  /* ================================================================ */

  function handleKeyDown(event) {
    const key = event.key;
    const lower = key.toLowerCase();

    if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar", "e", "p", "h", "m", "r"].includes(lower) ||
      key === "?"
    ) {
      event.preventDefault();
    }

    initAudio();

    if (!ui.helpOverlay.hidden) {
      if (lower === "e" || lower === "h" || key === "Escape") closeHelp();
      return;
    }

    if (!ui.pauseOverlay.hidden) {
      if (lower === "p" || lower === "e" || key === "Escape") resumeGame();
      return;
    }

    if (!ui.gameoverOverlay.hidden) {
      if (lower === "r" || lower === "e" || lower === "enter" || lower === " ") resetGame();
      return;
    }

    if (!game || game.over || game.transition) return;

    if (lower === "a" || key === "ArrowLeft") {
      keys.left = true;
    } else if (lower === "d" || key === "ArrowRight") {
      keys.right = true;
    } else if (lower === " " || lower === "spacebar") {
      if (!event.repeat) toggleShape();
    } else if (lower === "e") {
      if (!event.repeat) startTransition();
    } else if (lower === "p" || key === "Escape") {
      if (!event.repeat) togglePause();
    } else if (lower === "h" || key === "?") {
      if (!event.repeat) openHelp();
    } else if (lower === "m") {
      if (!event.repeat) toggleMute();
    }
  }

  function handleKeyUp(event) {
    const key = event.key;
    const lower = key.toLowerCase();
    if (lower === "a" || key === "ArrowLeft") keys.left = false;
    if (lower === "d" || key === "ArrowRight") keys.right = false;
  }

  function bindHoldButton(button, direction) {
    const down = (event) => {
      event.preventDefault();
      initAudio();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch (_) {
        /* ignore */
      }
      button.classList.add("active");
      if (!game || game.over || game.paused || game.transition) return;
      keys[direction] = true;
    };

    const up = (event) => {
      if (event) event.preventDefault();
      button.classList.remove("active");
      keys[direction] = false;
    };

    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function wireEvents() {
    window.addEventListener("resize", resizeStage);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => {
      keys.left = false;
      keys.right = false;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game && !game.over && !game.paused && !game.transition) {
        pauseGame(true);
      }
    });

    ui.audioBtn.addEventListener("click", toggleMute);
    ui.pauseBtn.addEventListener("click", togglePause);
    ui.helpBtn.addEventListener("click", openHelp);
    ui.restartBtn.addEventListener("click", () => {
      initAudio();
      resetGame();
    });
    ui.resumeBtn.addEventListener("click", resumeGame);
    ui.closeHelpBtn.addEventListener("click", closeHelp);
    ui.helpStartBtn.addEventListener("click", closeHelp);

    bindHoldButton(ui.touchLeft, "left");
    bindHoldButton(ui.touchRight, "right");

    ui.touchFlip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      initAudio();
      toggleShape();
    });

    ui.touchRift.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      initAudio();
      startTransition();
    });

    window.addEventListener("pointerdown", initAudio, { passive: true });
    window.addEventListener("keydown", initAudio);
    ui.stage.addEventListener("dblclick", (event) => event.preventDefault());
  }

  /* ================================================================ */
  /*  debug                                                            */
  /* ================================================================ */

  function exposeDebug() {
    window.__crossward = {
      get state() {
        return game;
      },
      advance(seconds) {
        if (!game) return;
        let remaining = Math.max(0, seconds);
        while (remaining > 0) {
          const step = Math.min(FIXED_DT, remaining);
          if (game.transition) updateTransition(step);
          else update(step);
          updateCamera(step);
          remaining -= step;
        }
        updateHUD();
      },
      spawnWave() {
        spawnWave();
        updateHUD();
      },
      switchLane() {
        if (!game) return;
        game.player.x = CONFIG.CENTER;
        startTransition();
      },
      toggleShape,
      addSlime(lane = "red", side = "left", distance = 0.3) {
        if (!game) return;
        const x =
          side === "left"
            ? lerp(CONFIG.PORTAL_L + 17, CONFIG.CENTER, clamp(distance, 0, 1))
            : lerp(CONFIG.PORTAL_R - 17, CONFIG.CENTER, clamp(distance, 0, 1));
        game.red.enemies.push({
          id: ++enemySerial,
          lane: "red",
          x,
          side,
          dir: side === "left" ? 1 : -1,
          hp: CONFIG.SLIME_HP,
          maxHp: CONFIG.SLIME_HP,
          radius: CONFIG.SLIME_RADIUS,
          speed: 0,
          age: 1,
          phase: "walk",
          dead: false,
          hitFlash: 0,
          wobbleSeed: 0,
        });
        updateHUD();
      },
      damageCore(amount = 1) {
        if (!game) return;
        for (let i = 0; i < amount; i += 1) {
          game.core = Math.max(0, game.core - 1);
          updateIntegrity();
        }
        if (game.core <= 0) endGame();
      },
      reset: resetGame,
      pause: () => pauseGame(false),
      resume: resumeGame,
      renderOnce: render,
    };
  }

  /* ================================================================ */
  /*  boot                                                             */
  /* ================================================================ */

  let lastFrame = performance.now();
  let accumulator = 0;

  function loop(now) {
    const raw = (now - lastFrame) / 1000;
    const dt = clamp(raw, 0, 0.05);
    lastFrame = now;

    if (game && !game.paused && !game.over) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 5) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
    } else {
      accumulator = 0;
    }

    updateCamera(dt);
    render();
    updateHUD();
    requestAnimationFrame(loop);
  }

  function boot() {
    resizeStage();
    wireEvents();
    resetGame();
    exposeDebug();
    requestAnimationFrame((now) => {
      lastFrame = now;
      requestAnimationFrame(loop);
    });
  }

  boot();
})();
