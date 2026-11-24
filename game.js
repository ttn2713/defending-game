(() => {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  constants                                                          */
  /* ------------------------------------------------------------------ */

  const CONFIG = {
    WORLD_W: 2400,
    CENTER: 1200,
    PORTAL_L: 210,
    PORTAL_R: 2190,
    FIRST_WAVE: 20,
    WAVE_EVERY: 20,
    CORE_MAX: 10,
    PLAYER_SPEED: 325,
    PLAYER_ACCEL: 2300,
    PLAYER_DECEL: 2850,
    ATTACK_INTERVAL: 1,
    ATTACK_RANGE: 700,
    BOLT_SPEED: 1520,
    SWITCH_RADIUS: 140,
    SWITCH_TIME: 1.08,
  };

  const C = {
    paper: "#f1ede3",
    paperBright: "#f8f4ea",
    ink: "#171410",
    muted: "#746d61",
    faint: "#aaa294",
    red: "#d4473a",
    blue: "#3457c5",
    plum: "#2a0d32",
    plumMid: "#4d1e5c",
    plumLight: "#89549a",
    cream: "#f8f4ea",
    palePurple: "#c6a5d2",
  };

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const SERIF = '"Iowan Old Style","Baskerville","Songti SC","STSong","Noto Serif CJK SC","SimSun",Georgia,serif';
  const MONO = '"SFMono-Regular","Cascadia Mono","Roboto Mono","Courier New",monospace';
  const WAVE_NAMES = ["四门同开", "双轴回声", "紫门低语", "核心震颤", "十字绞杀", "无声潮汐"];

  /* ------------------------------------------------------------------ */
  /*  helpers                                                            */
  /* ------------------------------------------------------------------ */

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (v, target, amount) => {
    if (v < target) return Math.min(v + amount, target);
    if (v > target) return Math.max(v - amount, target);
    return target;
  };
  const pad = (n, len = 2) => String(Math.max(0, Math.floor(n))).padStart(len, "0");
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOutCubic = (t) => {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  function rgba(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function laneColor(lane = game ? game.lane : "red") {
    return lane === "blue" ? C.blue : C.red;
  }

  function otherLane(lane = game ? game.lane : "red") {
    return lane === "blue" ? "red" : "blue";
  }

  function otherColor(lane = game ? game.lane : "red") {
    return lane === "blue" ? C.red : C.blue;
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  function storageRead(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (_) {
      /* private mode / file scheme — safe to ignore */
    }
  }

  /* ------------------------------------------------------------------ */
  /*  dom / canvas                                                       */
  /* ------------------------------------------------------------------ */

  const $ = (selector, root = document) => root.querySelector(selector);

  const ui = {
    app: $("#app"),
    stage: $("#stage"),
    minimap: $("#minimap"),
    waveNo: $("#waveNo"),
    waveStatus: $("#waveStatus"),
    countdown: $("#countdown"),
    waveFill: $("#waveFill"),
    axisLabel: $("#axisLabel"),
    offlaneCount: $("#offlaneCount"),
    integrity: $("#integrity"),
    coreNum: $("#coreNum"),
    score: $("#score"),
    best: $("#best"),
    mobileScore: $("#mobileScore"),
    redCount: $("#redCount"),
    blueCount: $("#blueCount"),
    toast: $("#toast"),
    toastText: $("#toastText"),
    announce: $("#announce"),
    announceKicker: $("#announceKicker"),
    announceTitle: $("#announceTitle"),
    portalPrompt: $("#portalPrompt"),
    promptMain: $("#promptMain"),
    promptSub: $("#promptSub"),
    offlaneAlert: $("#offlaneAlert"),
    offlaneAlertText: $("#offlaneAlertText"),
    chargeRing: $("#chargeRing"),
    screenFlash: $("#screenFlash"),
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
    touchSwitch: $("#touchSwitch"),
  };

  const ctx = ui.stage.getContext("2d");
  const mctx = ui.minimap.getContext("2d");

  let W = 0;
  let H = 0;
  let DPR = 1;
  let zoom = 1;
  let viewW = 0;
  let viewH = 0;
  let groundY = 0;
  let visualTime = 0;
  let miniDPR = 1;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /*  game state                                                         */
  /* ------------------------------------------------------------------ */

  let game;
  let enemySerial = 0;
  let announceSerial = 0;
  let toastSerial = 0;
  let helpWasPaused = false;
  let bestScore = Number(storageRead("crossward.best", 0)) || 0;
  let muted = storageRead("crossward.muted", "0") === "1";
  let audio = null;
  let lastTouchWarn = 0;

  const keys = {
    left: false,
    right: false,
  };

  function makeLane() {
    return {
      enemies: [],
      spawnQueue: [],
      portalPulse: 0,
    };
  }

  function createGame() {
    return {
      time: 0,
      wave: 0,
      nextWaveAt: CONFIG.FIRST_WAVE,
      core: CONFIG.CORE_MAX,
      lastCore: CONFIG.CORE_MAX,
      score: 0,
      kills: 0,
      best: bestScore,
      lane: "red",
      player: {
        x: CONFIG.CENTER,
        vx: 0,
        facing: 1,
        walk: 0,
        cooldown: 0,
        aim: 0,
        recoil: 0,
        target: null,
        nearPortal: true,
      },
      lanes: {
        red: makeLane(),
        blue: makeLane(),
      },
      bolts: [],
      particles: [],
      floaters: [],
      splats: [],
      camera: {
        x: 0,
        shake: 0,
        shakeX: 0,
        shakeY: 0,
      },
      switching: null,
      switchCooldown: 0,
      over: false,
      paused: false,
      autoPaused: false,
      lastOfflaneWarn: -10,
      started: false,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  view                                                               */
  /* ------------------------------------------------------------------ */

  function resizeStage() {
    const rect = ui.stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);

    ui.stage.width = Math.round(W * DPR);
    ui.stage.height = Math.round(H * DPR);

    zoom = Math.max(W / CONFIG.WORLD_W, Math.min(W / 1150, 1.15));
    zoom = clamp(zoom, 0.7, 1.8);
    viewW = W / zoom;
    viewH = H / zoom;
    groundY = viewH * 0.64;

    resizeMinimap();

    if (game) {
      game.camera.x = clamp(game.camera.x, 0, Math.max(0, CONFIG.WORLD_W - viewW));
    }
  }

  function resizeMinimap() {
    const size = 152;
    miniDPR = Math.min(2, window.devicePixelRatio || 1);
    ui.minimap.width = Math.round(size * miniDPR);
    ui.minimap.height = Math.round(size * miniDPR);
    ui.minimap.style.width = `${size}px`;
    ui.minimap.style.height = `${size}px`;
  }

  function cameraTargetX() {
    if (!game) return 0;
    if (game.switching) {
      return clamp(CONFIG.CENTER - viewW / 2, 0, Math.max(0, CONFIG.WORLD_W - viewW));
    }
    const p = game.player;
    const lead = p.facing * Math.min(95, Math.abs(p.vx) * 0.28);
    return clamp(p.x - viewW / 2 + lead, 0, Math.max(0, CONFIG.WORLD_W - viewW));
  }

  function snapCamera() {
    if (!game) return;
    game.camera.x = cameraTargetX();
    game.camera.shake = 0;
    game.camera.shakeX = 0;
    game.camera.shakeY = 0;
  }

  function updateCamera(dt) {
    if (!game) return;
    const target = cameraTargetX();
    const speed = game.switching ? 11 : 6.2;
    game.camera.x += (target - game.camera.x) * (1 - Math.exp(-speed * dt));
    game.camera.x = clamp(game.camera.x, 0, Math.max(0, CONFIG.WORLD_W - viewW));

    const decay = Math.exp(-7.2 * dt);
    game.camera.shake *= decay;
    if (game.camera.shake < 0.04) game.camera.shake = 0;
    const magnitude = reducedMotion ? 0 : game.camera.shake;
    game.camera.shakeX = (Math.random() * 2 - 1) * magnitude;
    game.camera.shakeY = (Math.random() * 2 - 1) * magnitude * 0.55;
  }

  function addShake(amount) {
    if (reducedMotion) return;
    game.camera.shake = Math.max(game.camera.shake, amount);
  }

  /* ------------------------------------------------------------------ */
  /*  audio                                                              */
  /* ------------------------------------------------------------------ */

  function initAudio() {
    if (audio) {
      if (audio.state === "suspended") audio.resume().catch(() => {});
      return;
    }
    if (muted) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    const ac = new AudioCtor();
    const master = ac.createGain();
    master.gain.value = 0.2;
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
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + Math.min(0.012, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.__master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function noiseBurst(duration, gainValue, filterFreq = 800) {
    if (!audio || muted) return;
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = audio.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.__master);
    source.start();
  }

  const sfx = {
    shot() {
      tone(460, 190, 0.055, "triangle", 0.06);
      noiseBurst(0.035, 0.025, 2400);
    },
    hit() {
      tone(620, 240, 0.07, "sine", 0.04);
    },
    kill() {
      tone(260, 100, 0.11, "triangle", 0.05);
      tone(760, 420, 0.055, "sine", 0.02, 0.02);
    },
    spawn() {
      tone(90, 160, 0.22, "sine", 0.035);
    },
    wave() {
      tone(120, 90, 0.5, "sine", 0.05);
      tone(240, 300, 0.35, "triangle", 0.018, 0.08);
    },
    portal() {
      tone(130, 640, 0.42, "sine", 0.055);
      tone(260, 960, 0.35, "triangle", 0.02, 0.08);
      noiseBurst(0.28, 0.03, 1500);
    },
    portalDone() {
      tone(680, 170, 0.35, "sine", 0.045);
      tone(920, 250, 0.28, "triangle", 0.018, 0.03);
    },
    leak() {
      tone(110, 38, 0.38, "sawtooth", 0.055);
      noiseBurst(0.22, 0.035, 520);
    },
    deny() {
      tone(130, 110, 0.08, "square", 0.025);
    },
    over() {
      tone(220, 80, 0.9, "sine", 0.06);
      tone(160, 52, 1.15, "triangle", 0.035, 0.15);
      tone(80, 34, 1.4, "sine", 0.04, 0.35);
    },
    ui() {
      tone(760, 980, 0.035, "sine", 0.015);
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

  /* ------------------------------------------------------------------ */
  /*  ui helpers                                                         */
  /* ------------------------------------------------------------------ */

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

  function updateIntegrity(animateHit = false) {
    if (!game) return;
    const pips = ui.integrity.children;
    for (let i = 0; i < pips.length; i += 1) {
      const lost = i >= game.core;
      if (pips[i].classList.contains("lost") !== lost) {
        pips[i].classList.toggle("lost", lost);
      }
      pips[i].classList.remove("hit");
    }
    if (animateHit && game.core >= 0 && game.core < pips.length) {
      const target = pips[game.core];
      // Force animation replay.
      void target.offsetWidth;
      target.classList.add("hit");
      window.setTimeout(() => target.classList.remove("hit"), 380);
    }
    setText(ui.coreNum, String(game.core));
    ui.integrity.setAttribute("aria-label", `核心完整度 ${game.core} / ${CONFIG.CORE_MAX}`);
  }

  function updateLaneChrome() {
    if (!game) return;
    const isRed = game.lane === "red";
    ui.app.dataset.lane = game.lane;
    setText(ui.axisLabel, isRed ? "红轴 / RED" : "蓝轴 / BLUE");
    const to = otherLane();
    setText(ui.promptMain, to === "blue" ? "转向蓝轴" : "转向红轴");
    setText(ui.promptSub, `中心传送门 · ${isRed ? "红轴" : "蓝轴"} → ${to === "blue" ? "蓝轴" : "红轴"}`);
    ui.stage.setAttribute(
      "aria-label",
      `横向卷轴塔防游戏画面：黑色礼帽角色站在${isRed ? "红" : "蓝"}色横轴上，中央是深紫色传送门。`
    );
    ui.offlaneAlert.style.setProperty("--alert-color", otherColor());
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
    const name = WAVE_NAMES[(game.wave - 1) % WAVE_NAMES.length];
    setText(ui.announceKicker, `WAVE ${pad(game.wave)} · ${game.lane === "red" ? "RED AXIS" : "BLUE AXIS"}`);
    setText(ui.announceTitle, name);
    ui.announce.classList.add("visible");
    window.clearTimeout(announceWave.timer);
    announceWave.timer = window.setTimeout(() => {
      if (serial === announceSerial) ui.announce.classList.remove("visible");
    }, 1350);
  }

  function flashDamage() {
    ui.screenFlash.classList.remove("damage");
    void ui.screenFlash.offsetWidth;
    ui.screenFlash.classList.add("damage");
    window.setTimeout(() => ui.screenFlash.classList.remove("damage"), 520);
  }

  /* ------------------------------------------------------------------ */
  /*  lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  function resetGame() {
    window.clearTimeout(showToast.timer);
    window.clearTimeout(announceWave.timer);
    announceSerial += 1;

    game = createGame();
    game.best = bestScore;
    enemySerial = 0;

    ui.gameoverOverlay.hidden = true;
    ui.pauseOverlay.hidden = true;
    ui.helpOverlay.hidden = true;
    ui.announce.classList.remove("visible");
    ui.toast.classList.remove("show");
    ui.portalPrompt.classList.remove("visible");
    ui.offlaneAlert.classList.remove("visible");
    ui.app.classList.remove("low-core");
    ui.app.classList.toggle("is-muted", muted);
    ui.audioBtn.setAttribute("aria-pressed", String(muted));
    ui.audioBtn.setAttribute("aria-label", muted ? "开启声音" : "关闭声音");

    buildIntegrity();
    updateIntegrity();
    updateLaneChrome();
    updateHud(true);
    snapCamera();

    setText(ui.score, "000000");
    setText(ui.mobileScore, "000000");
    setText(ui.best, pad(bestScore, 6));

    window.setTimeout(() => {
      if (!game || game.over) return;
      showToast("四个深紫传送门，每 20 秒各释放 2 只史莱姆。靠近中央传送门，按 E 转向另一条轴。", 6800);
    }, 500);

    lastTouchWarn = 0;
  }

  function endGame() {
    if (!game || game.over) return;
    game.over = true;
    game.player.vx = 0;
    game.player.target = null;
    game.switching = null;
    keys.left = false;
    keys.right = false;

    bestScore = Math.max(bestScore, game.score);
    game.best = bestScore;
    storageWrite("crossward.best", bestScore);

    setText(ui.finalWave, String(game.wave));
    setText(ui.finalKills, String(game.kills));
    setText(ui.finalScore, pad(game.score, 6));
    setText(ui.best, pad(bestScore, 6));
    ui.portalPrompt.classList.remove("visible");
    ui.offlaneAlert.classList.remove("visible");
    ui.announce.classList.remove("visible");
    ui.gameoverOverlay.hidden = false;
    sfx.over();
    addShake(12);
  }

  function pauseGame(auto = false) {
    if (!game || game.over) return;
    if (!ui.helpOverlay.hidden) return;
    game.paused = true;
    game.autoPaused = auto;
    keys.left = false;
    keys.right = false;
    ui.pauseOverlay.hidden = false;
    ui.portalPrompt.classList.remove("visible");
    if (!auto) sfx.ui();
  }

  function resumeGame() {
    if (!game || game.over) return;
    game.paused = false;
    game.autoPaused = false;
    ui.pauseOverlay.hidden = true;
    sfx.ui();
  }

  function togglePause() {
    if (!game || game.over) return;
    if (!ui.helpOverlay.hidden) {
      closeHelp();
      return;
    }
    if (game.paused) resumeGame();
    else pauseGame(false);
  }

  function openHelp() {
    if (!game || game.over) return;
    helpWasPaused = game.paused;
    game.paused = true;
    keys.left = false;
    keys.right = false;
    ui.pauseOverlay.hidden = true;
    ui.helpOverlay.hidden = false;
    ui.portalPrompt.classList.remove("visible");
    sfx.ui();
  }

  function closeHelp() {
    if (!game) return;
    ui.helpOverlay.hidden = true;
    game.paused = helpWasPaused;
    if (!game.paused) {
      // Resume only when help was opened from an active run.
      game.paused = false;
    }
    sfx.ui();
  }

  /* ------------------------------------------------------------------ */
  /*  lane switching                                                     */
  /* ------------------------------------------------------------------ */

  function canUsePortal() {
    return game && Math.abs(game.player.x - CONFIG.CENTER) <= CONFIG.SWITCH_RADIUS;
  }

  function startSwitch() {
    if (!game || game.over) return;
    if (game.paused || game.switching || game.switchCooldown > 0) return;

    initAudio();

    if (!canUsePortal()) {
      sfx.deny();
      addShake(2.5);
      const now = performance.now();
      if (now - lastTouchWarn > 700) {
        lastTouchWarn = now;
        showToast("靠近中央传送门，才能转向另一条轴。", 2200);
      }
      return;
    }

    const from = game.lane;
    const to = otherLane(from);
    game.switching = {
      t: 0,
      duration: CONFIG.SWITCH_TIME,
      from,
      to,
      swapped: false,
    };
    game.player.vx = 0;
    game.player.target = null;
    game.bolts.length = 0;
    ui.portalPrompt.classList.remove("visible");

    burst(CONFIG.CENTER, groundY - 108, C.plumLight, 28, 1.6);
    burst(CONFIG.CENTER, groundY - 20, laneColor(from), 16, 1.2);
    addShake(4);
    sfx.portal();
  }

  function updateSwitch(dt) {
    const s = game.switching;
    s.t += dt;
    const p = game.player;
    p.x = approach(p.x, CONFIG.CENTER, 700 * dt);
    p.vx = 0;
    p.walk += dt * 4;
    p.cooldown = Math.max(0, p.cooldown - dt);

    if (!s.swapped && s.t >= s.duration * 0.46) {
      s.swapped = true;
      game.lane = s.to;
      updateLaneChrome();
      burst(CONFIG.CENTER, groundY - 120, laneColor(s.to), 34, 1.8);
      burst(CONFIG.CENTER, groundY - 120, C.plumLight, 22, 1.2);
      addShake(6);
      sfx.portalDone();
      showToast(
        s.to === "blue"
          ? "已转向蓝轴。蓝门与红门仍在同时涌出史莱姆。"
          : "已转向红轴。红门与蓝门仍在同时涌出史莱姆。",
        2500
      );
    }

    updateParticles(dt);

    if (s.t >= s.duration) {
      game.switching = null;
      game.switchCooldown = 0.3;
      game.camera.shake = Math.max(game.camera.shake, 2);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  waves / spawning / enemies                                         */
  /* ------------------------------------------------------------------ */

  function spawnWave() {
    if (!game || game.over) return;
    game.wave += 1;
    const base = game.time;

    for (const laneKey of ["red", "blue"]) {
      const lane = game.lanes[laneKey];
      lane.portalPulse = 1;

      for (const side of ["left", "right"]) {
        for (let i = 0; i < 2; i += 1) {
          lane.spawnQueue.push({
            at: base + 0.08 + i * 0.5,
            side,
            offset: i * 24 - 9,
          });
        }
      }
    }

    game.nextWaveAt = base + CONFIG.WAVE_EVERY;
    announceWave();
    sfx.wave();
  }

  function spawnSlime(laneKey, side, offset) {
    const lane = game.lanes[laneKey];
    const x =
      side === "left"
        ? CONFIG.PORTAL_L + 61 + offset
        : CONFIG.PORTAL_R - 61 - offset;

    const speed = Math.min(82, 31 + game.wave * 2.05 + Math.random() * 4.2);

    const enemy = {
      id: ++enemySerial,
      lane: laneKey,
      x,
      side,
      dir: side === "left" ? 1 : -1,
      hp: 1,
      maxHp: 1,
      age: 0,
      phase: "spawn",
      speed,
      phaseOffset: Math.random() * TAU,
      wobbleSeed: Math.random() * 100,
      height: 30 + Math.random() * 4,
      dead: false,
    };

    lane.enemies.push(enemy);
    lane.portalPulse = Math.max(lane.portalPulse, 0.7);

    if (laneKey === game.lane) {
      burst(x, groundY - 20, C.plumLight, 9, 0.75);
      sfx.spawn();
    }
  }

  function updateSpawnQueues(dt) {
    for (const laneKey of ["red", "blue"]) {
      const lane = game.lanes[laneKey];
      const waiting = [];

      for (const entry of lane.spawnQueue) {
        if (game.time >= entry.at) {
          spawnSlime(laneKey, entry.side, entry.offset);
        } else {
          waiting.push(entry);
        }
      }

      lane.spawnQueue = waiting;
      lane.portalPulse = Math.max(0, lane.portalPulse - dt * 1.35);
    }
  }

  function updateEnemies(dt) {
    for (const laneKey of ["red", "blue"]) {
      const lane = game.lanes[laneKey];

      for (const enemy of lane.enemies) {
        if (enemy.dead) continue;
        enemy.age += dt;

        if (enemy.phase === "spawn" && enemy.age >= 0.58) {
          enemy.phase = "walk";
        }

        if (enemy.phase === "walk") {
          const wobble = 1 + Math.sin(visualTime * 5.5 + enemy.phaseOffset) * 0.035;
          enemy.x += enemy.dir * enemy.speed * wobble * dt;

          const reached =
            (enemy.dir > 0 && enemy.x >= CONFIG.CENTER - 39) ||
            (enemy.dir < 0 && enemy.x <= CONFIG.CENTER + 39);

          if (reached) {
            enemy.dead = true;
            leakEnemy(enemy);
            if (game.over) break;
          }
        }
      }

      lane.enemies = lane.enemies.filter((enemy) => !enemy.dead);
      if (game.over) break;
    }
  }

  function leakEnemy(enemy) {
    if (!game || game.over) return;

    game.core = Math.max(0, game.core - 1);
    game.lastCore = game.core;
    addShake(11);
    flashDamage();
    burst(CONFIG.CENTER, groundY - 46, C.plum, 24, 1.25);
    burst(CONFIG.CENTER, groundY - 40, C.red, 8, 1.1);
    floatText("−1 CORE", CONFIG.CENTER, groundY - 120, C.red, 13);
    sfx.leak();
    updateIntegrity(true);

    if (game.time > 3) {
      showToast(
        `${enemy.lane === "red" ? "红轴" : "蓝轴"}的史莱姆触碰了核心，完整度 −1。`,
        1800
      );
    }

    if (game.core <= 0) {
      endGame();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  combat                                                             */
  /* ------------------------------------------------------------------ */

  function selectTarget() {
    if (!game || game.switching) return null;
    const p = game.player;
    const lane = game.lanes[game.lane];
    let candidate = null;
    let candidateThreat = Infinity;

    for (const enemy of lane.enemies) {
      if (enemy.dead || enemy.phase !== "walk") continue;
      const distance = Math.abs(enemy.x - p.x);
      if (distance > CONFIG.ATTACK_RANGE) continue;
      const threat = Math.abs(enemy.x - CONFIG.CENTER);
      if (threat < candidateThreat) {
        candidateThreat = threat;
        candidate = enemy;
      }
    }

    return candidate;
  }

  function updatePlayer(dt) {
    const p = game.player;
    const axis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const targetVelocity = axis * CONFIG.PLAYER_SPEED;
    const acceleration = axis !== 0 ? CONFIG.PLAYER_ACCEL : CONFIG.PLAYER_DECEL;

    p.vx = approach(p.vx, targetVelocity, acceleration * dt);
    p.x = clamp(p.x + p.vx * dt, 92, CONFIG.WORLD_W - 92);

    if (Math.abs(p.vx) > 8) {
      p.facing = p.vx > 0 ? 1 : -1;
      p.walk += Math.abs(p.vx) * dt * 0.075;
    } else {
      p.walk += dt * 1.8;
    }

    p.cooldown = Math.max(0, p.cooldown - dt);
    p.recoil = Math.max(0, p.recoil - dt * 8.5);
    p.nearPortal = canUsePortal();

    p.target = selectTarget();

    if (p.target) {
      const shoulderY = groundY - 44;
      p.aim = Math.atan2(groundY - 20 - shoulderY, p.target.x - p.x);
    } else {
      p.aim = p.facing > 0 ? -0.06 : Math.PI + 0.06;
    }

    if (p.target && p.cooldown <= 0) {
      fireBolt(p.target);
    }
  }

  function fireBolt(target) {
    const p = game.player;
    const side = Math.sign(target.x - p.x) || p.facing;
    const shoulderY = groundY - 44;
    const startX = p.x + side * 24;
    const startY = shoulderY - 2;
    const angle = Math.atan2(groundY - 20 - startY, target.x - startX);

    game.bolts.push({
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      angle,
      target,
      life: 1.6,
      dead: false,
    });

    p.cooldown = CONFIG.ATTACK_INTERVAL;
    p.recoil = 1;
    p.aim = angle;

    burst(startX, startY, laneColor(), 4, 0.45);
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

      const target = bolt.target;
      const targetY = groundY - 21;
      const dx = target.x - bolt.x;
      const dy = targetY - bolt.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 20) {
        hitEnemy(target);
        bolt.dead = true;
        continue;
      }

      const step = Math.min(CONFIG.BOLT_SPEED * dt, distance);
      bolt.prevX = bolt.x;
      bolt.prevY = bolt.y;
      bolt.x += (dx / Math.max(0.001, distance)) * step;
      bolt.y += (dy / Math.max(0.001, distance)) * step;
      bolt.angle = Math.atan2(dy, dx);
    }

    game.bolts = game.bolts.filter((bolt) => !bolt.dead);
  }

  function hitEnemy(enemy) {
    if (!enemy || enemy.dead) return;
    enemy.hp -= 1;
    burst(enemy.x, groundY - 22, laneColor(), 6, 0.55);

    if (enemy.hp <= 0) {
      killEnemy(enemy);
    } else {
      sfx.hit();
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

    const color = laneColor(enemy.lane);
    burst(enemy.x, groundY - 22, color, 15, 0.9);
    burst(enemy.x, groundY - 18, C.plumLight, 5, 0.55);

    game.splats.push({
      x: enemy.x,
      y: groundY + 3,
      color,
      life: 7.5,
      maxLife: 7.5,
      size: 8 + Math.random() * 7,
    });
    if (game.splats.length > 22) game.splats.shift();

    floatText("+100", enemy.x, groundY - 62, C.ink, 10);
    addShake(2);
    sfx.kill();
  }

  /* ------------------------------------------------------------------ */
  /*  particles                                                          */
  /* ------------------------------------------------------------------ */

  function burst(x, y, color, count = 10, power = 1) {
    const actualCount = reducedMotion ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < actualCount; i += 1) {
      const angle = Math.random() * TAU;
      const speed = (26 + Math.random() * 120) * power;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 24 * power,
        gravity: 150 + Math.random() * 130,
        life: 0.35 + Math.random() * 0.65,
        maxLife: 1,
        size: 1 + Math.random() * 2.7,
        color,
        spin: Math.random() * TAU,
        shape: Math.random() > 0.76 ? "line" : "dot",
      });
      game.particles[game.particles.length - 1].maxLife = game.particles[game.particles.length - 1].life;
    }

    if (game.particles.length > 260) {
      game.particles.splice(0, game.particles.length - 260);
    }
  }

  function floatText(text, x, y, color, size = 10) {
    game.floaters.push({
      text,
      x,
      y,
      color,
      size,
      life: 0.9,
      maxLife: 0.9,
      drift: (Math.random() * 2 - 1) * 8,
    });
    if (game.floaters.length > 28) game.floaters.shift();
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.exp(-1.2 * dt);
      particle.spin += dt * 4;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);

    for (const floater of game.floaters) {
      floater.life -= dt;
      floater.y -= 22 * dt;
      floater.x += floater.drift * dt;
    }
    game.floaters = game.floaters.filter((floater) => floater.life > 0);

    for (const splat of game.splats) {
      splat.life -= dt;
    }
    game.splats = game.splats.filter((splat) => splat.life > 0);
  }

  /* ------------------------------------------------------------------ */
  /*  simulation                                                         */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    if (!game || game.over || game.paused) return;

    if (game.switching) {
      updateSwitch(dt);
      return;
    }

    game.time += dt;
    game.switchCooldown = Math.max(0, game.switchCooldown - dt);

    if (game.time >= game.nextWaveAt) {
      spawnWave();
    }

    updatePlayer(dt);
    updateSpawnQueues(dt);
    updateEnemies(dt);
    if (game.over) return;
    updateBolts(dt);
    updateParticles(dt);
    updateHud();
  }

  /* ------------------------------------------------------------------ */
  /*  hud                                                                */
  /* ------------------------------------------------------------------ */

  function updateHud(force = false) {
    if (!game) return;

    const countdown = Math.max(0, game.nextWaveAt - game.time);
    const clock = formatClock(countdown);
    setText(ui.countdown, clock);
    setText(ui.waveNo, pad(game.wave));

    if (game.wave === 0) {
      setText(ui.waveStatus, "首波接近");
    } else if (countdown <= 5) {
      setText(ui.waveStatus, `第 ${pad(game.wave + 1)} 波接近`);
    } else {
      setText(ui.waveStatus, `第 ${pad(game.wave + 1)} 波待命`);
    }

    const cycleStart = game.wave === 0 ? 0 : game.nextWaveAt - CONFIG.WAVE_EVERY;
    const cycleLength = game.wave === 0 ? CONFIG.FIRST_WAVE : CONFIG.WAVE_EVERY;
    const progress = clamp((game.time - cycleStart) / cycleLength, 0, 1);
    ui.waveFill.style.transform = `scaleX(${progress.toFixed(4)})`;

    setText(ui.score, pad(game.score, 6));
    setText(ui.mobileScore, pad(game.score, 6));
    setText(ui.best, pad(Math.max(bestScore, game.best), 6));

    const activeEnemies = game.lanes[game.lane].enemies.length;
    const other = otherLane();
    const otherEnemies = game.lanes[other].enemies.length;

    setText(ui.offlaneCount, `${other === "blue" ? "蓝轴" : "红轴"} ${otherEnemies}`);
    ui.offlaneCount.classList.toggle("hot", otherEnemies > 2);
    setText(ui.redCount, String(game.lanes.red.enemies.length));
    setText(ui.blueCount, String(game.lanes.blue.enemies.length));

    const shouldShowPrompt =
      !game.over &&
      !game.paused &&
      !game.switching &&
      Math.abs(game.player.x - CONFIG.CENTER) <= CONFIG.SWITCH_RADIUS;
    ui.portalPrompt.classList.toggle("visible", shouldShowPrompt);
    ui.touchSwitch.classList.toggle("near", shouldShowPrompt);

    const showOfflane = !game.over && !game.switching && otherEnemies > 0;
    ui.offlaneAlert.classList.toggle("visible", showOfflane);
    if (showOfflane) {
      setText(ui.offlaneAlertText, `${other === "blue" ? "蓝轴" : "红轴"} · ${otherEnemies}`);
    }

    const charge = 1 - clamp(game.player.cooldown / CONFIG.ATTACK_INTERVAL, 0, 1);
    ui.chargeRing.style.setProperty("--charge", charge.toFixed(3));

    const low = game.core <= 3;
    if (low !== ui.app.classList.contains("low-core")) {
      ui.app.classList.toggle("low-core", low);
    }

    if (force) {
      updateIntegrity();
      updateLaneChrome();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  minimap                                                            */
  /* ------------------------------------------------------------------ */

  function drawMinimap() {
    if (!game) return;
    const size = 152;
    const cx = size / 2;
    const cy = size / 2;
    const arm = 54;

    mctx.setTransform(miniDPR, 0, 0, miniDPR, 0, 0);
    mctx.clearRect(0, 0, size, size);

    const redActive = game.lane === "red";
    const activeColor = laneColor();

    // outer registration ring
    mctx.save();
    mctx.strokeStyle = rgba(C.ink, 0.08);
    mctx.lineWidth = 0.8;
    mctx.setLineDash([2, 5]);
    mctx.beginPath();
    mctx.arc(cx, cy, 65, 0, TAU);
    mctx.stroke();
    mctx.setLineDash([]);

    // faint cross guides
    mctx.strokeStyle = rgba(C.ink, 0.055);
    mctx.beginPath();
    mctx.moveTo(18, cy - 0.5);
    mctx.lineTo(134, cy - 0.5);
    mctx.moveTo(cx - 0.5, 18);
    mctx.lineTo(cx - 0.5, 134);
    mctx.stroke();

    // inactive axis
    const inactiveColor = redActive ? C.blue : C.red;
    mctx.strokeStyle = rgba(inactiveColor, 0.32);
    mctx.lineWidth = 1;
    mctx.setLineDash([2, 4]);
    mctx.beginPath();
    if (redActive) {
      mctx.moveTo(cx, cy - arm);
      mctx.lineTo(cx, cy + arm);
    } else {
      mctx.moveTo(cx - arm, cy);
      mctx.lineTo(cx + arm, cy);
    }
    mctx.stroke();
    mctx.setLineDash([]);

    // active axis glow
    mctx.strokeStyle = rgba(activeColor, 0.17);
    mctx.lineWidth = 5;
    mctx.beginPath();
    if (redActive) {
      mctx.moveTo(cx - arm, cy);
      mctx.lineTo(cx + arm, cy);
    } else {
      mctx.moveTo(cx, cy - arm);
      mctx.lineTo(cx, cy + arm);
    }
    mctx.stroke();

    mctx.strokeStyle = activeColor;
    mctx.lineWidth = 1.2;
    mctx.beginPath();
    if (redActive) {
      mctx.moveTo(cx - arm, cy);
      mctx.lineTo(cx + arm, cy);
    } else {
      mctx.moveTo(cx, cy - arm);
      mctx.lineTo(cx, cy + arm);
    }
    mctx.stroke();

    // portal endpoints
    const nodes = [
      [cx - arm, cy, C.red],
      [cx + arm, cy, C.red],
      [cx, cy - arm, C.blue],
      [cx, cy + arm, C.blue],
    ];
    for (const [x, y, color] of nodes) {
      mctx.fillStyle = rgba(C.plum, 0.9);
      mctx.beginPath();
      mctx.arc(x, y, 3.1, 0, TAU);
      mctx.fill();
      mctx.strokeStyle = rgba(color, 0.65);
      mctx.lineWidth = 1;
      mctx.stroke();
    }

    // enemy pips
    for (const laneKey of ["red", "blue"]) {
      const active = laneKey === game.lane;
      const color = laneColor(laneKey);
      const lane = game.lanes[laneKey];
      for (const enemy of lane.enemies) {
        const t = clamp((enemy.x - CONFIG.CENTER) / (CONFIG.PORTAL_R - CONFIG.CENTER), -1, 1);
        const px = laneKey === "red" ? cx + t * arm : cx + (enemy.id % 3 - 1) * 2.4;
        const py = laneKey === "red" ? cy + (enemy.id % 3 - 1) * 2.4 : cy + t * arm;
        mctx.beginPath();
        mctx.arc(px, py, active ? 2.1 : 1.8, 0, TAU);
        if (active) {
          mctx.fillStyle = color;
          mctx.fill();
        } else {
          mctx.strokeStyle = rgba(color, 0.9);
          mctx.lineWidth = 1;
          mctx.stroke();
        }
      }
    }

    // player marker on active bar
    const p = game.player;
    const pt = clamp((p.x - CONFIG.CENTER) / (CONFIG.PORTAL_R - CONFIG.CENTER), -1, 1);
    const px = redActive ? cx + pt * arm : cx;
    const py = redActive ? cy : cy + pt * arm;
    mctx.fillStyle = C.ink;
    mctx.beginPath();
    mctx.arc(px, py, 3.4, 0, TAU);
    mctx.fill();
    mctx.strokeStyle = C.paperBright;
    mctx.lineWidth = 1;
    mctx.stroke();
    mctx.strokeStyle = rgba(activeColor, 0.8);
    mctx.beginPath();
    mctx.arc(px, py, 5.3, 0, TAU);
    mctx.stroke();

    // core
    mctx.fillStyle = C.paperBright;
    mctx.beginPath();
    mctx.arc(cx, cy, 7.2, 0, TAU);
    mctx.fill();
    mctx.strokeStyle = rgba(C.plum, 0.9);
    mctx.lineWidth = 1;
    mctx.stroke();
    mctx.fillStyle = C.plum;
    mctx.beginPath();
    mctx.arc(cx, cy, 2.6, 0, TAU);
    mctx.fill();

    // tiny core cracks
    if (game.core <= 3) {
      mctx.strokeStyle = rgba(C.red, 0.8);
      mctx.beginPath();
      mctx.moveTo(cx + 3, cy - 4);
      mctx.lineTo(cx + 7, cy);
      mctx.lineTo(cx + 4, cy + 5);
      mctx.stroke();
    }

    mctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  rendering — background                                             */
  /* ------------------------------------------------------------------ */

  function drawPaper() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#f4f0e6");
    grad.addColorStop(0.62, "#f1ede3");
    grad.addColorStop(1, "#e9e3d6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // A barely-there printed grid keeps the large paper field from feeling flat.
    ctx.save();
    ctx.strokeStyle = rgba(C.ink, 0.022);
    ctx.lineWidth = 1;
    const grid = 74;
    const offset = (-game.camera.x * 0.06) % grid;
    for (let x = offset; x < W; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParallax() {
    if (!game) return;
    const accent = laneColor();
    const other = otherColor();
    const gs = groundY * zoom;
    const screenCenter = (CONFIG.CENTER - game.camera.x) * zoom;

    // Warm/cool wash at the heart of the cross.
    const wash = ctx.createRadialGradient(
      screenCenter,
      gs - 150 * zoom,
      10,
      screenCenter,
      gs - 150 * zoom,
      520 * zoom
    );
    wash.addColorStop(0, rgba(accent, 0.075));
    wash.addColorStop(0.57, rgba(accent, 0.025));
    wash.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    // The plus sign is the map; show it as a technical underdrawing.
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(C.ink, 0.026);
    ctx.font = `500 ${Math.round(430 * zoom)}px ${SERIF}`;
    ctx.fillText("十", screenCenter, gs - 210 * zoom);
    ctx.restore();

    // Concentric registration rings.
    ctx.save();
    ctx.strokeStyle = rgba(C.ink, 0.055);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenCenter, gs - 186 * zoom, 274 * zoom, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(accent, 0.14);
    ctx.setLineDash([2, 12]);
    ctx.beginPath();
    ctx.arc(screenCenter, gs - 186 * zoom, 226 * zoom, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cardinal ticks.
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i;
      const x1 = screenCenter + Math.cos(angle) * 262 * zoom;
      const y1 = gs - 186 * zoom + Math.sin(angle) * 262 * zoom;
      const x2 = screenCenter + Math.cos(angle) * 283 * zoom;
      const y2 = gs - 186 * zoom + Math.sin(angle) * 283 * zoom;
      ctx.strokeStyle = rgba(i % 2 === 0 ? other : accent, 0.26);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Vertical (other-axis) construction line.
    ctx.strokeStyle = rgba(other, 0.16);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 11]);
    ctx.beginPath();
    ctx.moveTo(screenCenter, 84);
    ctx.lineTo(screenCenter, gs - 235 * zoom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Parallax + marks.
    const spacing = 420 * zoom;
    const shift = -((game.camera.x * 0.2 * zoom) % spacing) - spacing;
    for (let i = 0; i < Math.ceil(W / spacing) + 3; i += 1) {
      const x = shift + i * spacing;
      const y = gs - (255 + (i % 3) * 67) * zoom;
      const size = (5 + (i % 2) * 4) * zoom;
      ctx.strokeStyle = rgba(C.ink, 0.075);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      ctx.stroke();
    }

    // Horizon registration.
    ctx.strokeStyle = rgba(C.ink, 0.045);
    ctx.beginPath();
    ctx.moveTo(0, gs - 305 * zoom);
    ctx.lineTo(W, gs - 305 * zoom);
    ctx.stroke();

  }

  /* ------------------------------------------------------------------ */
  /*  rendering — world                                                  */
  /* ------------------------------------------------------------------ */

  function drawWorld() {
    const t = visualTime;
    drawCrossAxis(t);
    drawLane(t);
    drawEndPortal(CONFIG.PORTAL_L, "left", t);
    drawEndPortal(CONFIG.PORTAL_R, "right", t);
    drawCentralPortal(t);
    drawSplats();
    drawSlimes(t);
    drawPlayer(t);
    drawBolts();
    drawParticles();
    drawFloaters();
  }

  function drawCrossAxis(t) {
    const cx = CONFIG.CENTER;
    const other = otherColor();
    const accent = laneColor();
    const topY = -40;
    const bottomY = groundY - 214;

    ctx.save();

    // The hidden orthogonal bar, seen edge-on as a narrow beam. Its intersection
    // with the active horizontal lane makes the full plus readable in side view.
    const beam = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    beam.addColorStop(0, rgba(other, 0));
    beam.addColorStop(0.25, rgba(other, 0.035));
    beam.addColorStop(0.5, rgba(other, 0.085));
    beam.addColorStop(0.75, rgba(other, 0.035));
    beam.addColorStop(1, rgba(other, 0));
    ctx.fillStyle = beam;
    ctx.fillRect(cx - 24, topY, 48, bottomY - topY);

    // Two rails plus a dashed centerline.
    ctx.strokeStyle = rgba(other, 0.24);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 18, topY);
    ctx.lineTo(cx - 18, bottomY);
    ctx.moveTo(cx + 18, topY);
    ctx.lineTo(cx + 18, bottomY);
    ctx.stroke();

    ctx.strokeStyle = rgba(other, 0.18);
    ctx.setLineDash([2, 10]);
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Measurement rungs.
    ctx.strokeStyle = rgba(other, 0.2);
    ctx.lineWidth = 0.8;
    for (let y = 26; y < bottomY - 8; y += 30) {
      const major = Math.round((y - 26) / 30) % 4 === 0;
      const half = major ? 23 : 12;
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx + half, y);
      ctx.stroke();
    }

    // Arrow caps on the hidden axis.
    ctx.strokeStyle = rgba(other, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 5, 7);
    ctx.lineTo(cx, 1);
    ctx.lineTo(cx + 5, 7);
    ctx.moveTo(cx - 5, bottomY - 7);
    ctx.lineTo(cx, bottomY - 1);
    ctx.lineTo(cx + 5, bottomY - 7);
    ctx.stroke();

    // A large floor halo ties the two axes together.
    ctx.strokeStyle = rgba(accent, 0.12);
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 3, 235, 13, 0, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(C.ink, 0.09);
    ctx.setLineDash([1, 8]);
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 3, 300, 17, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis caption, running up the beam.
    const otherKey = otherLane();
    ctx.save();
    ctx.translate(cx + 27, groundY - 330);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = rgba(other, 0.55);
    ctx.font = `7px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText(`${otherKey === "blue" ? "BLUE" : "RED"} AXIS / ${otherKey === "blue" ? "蓝轴" : "红轴"}  ·  ORTHOGONAL`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  function drawLane(t) {
    const accent = laneColor();
    const left = -180;
    const right = CONFIG.WORLD_W + 180;

    ctx.save();

    // Paper-thin floor shadow.
    const floor = ctx.createLinearGradient(0, groundY, 0, groundY + 62);
    floor.addColorStop(0, rgba(accent, 0.13));
    floor.addColorStop(0.48, rgba(accent, 0.04));
    floor.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = floor;
    ctx.fillRect(left, groundY, right - left, 62);

    // Broad faint lower rail gives the side-view lane a little thickness.
    ctx.strokeStyle = rgba(accent, 0.19);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, groundY + 27);
    ctx.lineTo(right, groundY + 27);
    ctx.stroke();

    // Main edge.
    ctx.strokeStyle = rgba(C.ink, 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, groundY + 4.5);
    ctx.lineTo(right, groundY + 4.5);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(left, groundY);
    ctx.lineTo(right, groundY);
    ctx.stroke();

    ctx.strokeStyle = rgba(accent, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, groundY - 3);
    ctx.lineTo(right, groundY - 3);
    ctx.stroke();

    // Track ties.
    for (let x = 0; x <= CONFIG.WORLD_W; x += 96) {
      const major = x % 480 === 0;
      ctx.strokeStyle = rgba(C.ink, major ? 0.2 : 0.105);
      ctx.lineWidth = major ? 1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x, groundY + 7);
      ctx.lineTo(x, groundY + (major ? 22 : 15));
      ctx.stroke();
    }

    // Survey marks.
    for (let x = 240; x < CONFIG.WORLD_W; x += 480) {
      ctx.strokeStyle = rgba(C.ink, 0.16);
      ctx.beginPath();
      ctx.moveTo(x - 5, groundY - 4);
      ctx.lineTo(x + 5, groundY - 4);
      ctx.stroke();
      ctx.fillStyle = rgba(C.ink, 0.28);
      ctx.font = `6px ${MONO}`;
      ctx.textAlign = "left";
      ctx.fillText(pad(x, 4), x + 9, groundY + 41);
    }

    // Giant axis captions resting on the floor.
    ctx.fillStyle = rgba(C.ink, 0.15);
    ctx.font = `7px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(`${game.lane === "red" ? "红轴" : "蓝轴"}  /  ${game.lane === "red" ? "RED AXIS" : "BLUE AXIS"}`, 560, groundY + 43);
    ctx.fillText("TURN GATE  →", CONFIG.CENTER - 168, groundY + 43);
    ctx.fillText(`${game.lane === "red" ? "红轴" : "蓝轴"}  /  ${game.lane === "red" ? "RED AXIS" : "BLUE AXIS"}`, 1840, groundY + 43);

    // Scuffed edge marks.
    ctx.strokeStyle = rgba(C.ink, 0.14);
    for (let x = 150; x < CONFIG.WORLD_W; x += 240) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 33);
      ctx.lineTo(x + 18, groundY + 33);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawEndPortal(x, side, t) {
    const w = 96;
    const h = 226;
    const base = groundY + 2;
    const top = base - h;
    const pulse = game.lanes[game.lane].portalPulse;

    ctx.save();

    // A soft purple pool of light.
    const glow = ctx.createRadialGradient(x, base - h * 0.44, 4, x, base - h * 0.44, w * 1.6);
    glow.addColorStop(0, rgba(C.plumLight, 0.24));
    glow.addColorStop(0.45, rgba(C.plumMid, 0.09));
    glow.addColorStop(1, rgba(C.plumMid, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - w * 1.8, top - 50, w * 3.6, h + 100);

    // Floor shadow.
    ctx.fillStyle = rgba(C.ink, 0.16);
    ctx.beginPath();
    ctx.ellipse(x, base + 1, w * 0.58, 6, 0, 0, TAU);
    ctx.fill();

    // Arch silhouette.
    const arch = new Path2D();
    arch.moveTo(x - w / 2, base);
    arch.lineTo(x - w / 2, top + w / 2);
    arch.arc(x, top + w / 2, w / 2, Math.PI, 0, false);
    arch.lineTo(x + w / 2, base);
    arch.closePath();

    const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    body.addColorStop(0, "#17091d");
    body.addColorStop(0.18, "#2a0d32");
    body.addColorStop(0.52, "#4b1b59");
    body.addColorStop(0.78, "#210b29");
    body.addColorStop(1, "#120716");
    ctx.fillStyle = body;
    ctx.shadowColor = rgba(C.plumMid, 0.38);
    ctx.shadowBlur = 20;
    ctx.fill(arch);
    ctx.shadowBlur = 0;

    // Inner void.
    ctx.save();
    ctx.clip(arch);
    const inner = ctx.createRadialGradient(x, base - h * 0.48, 2, x, base - h * 0.48, w * 0.66);
    inner.addColorStop(0, "rgba(11,3,15,0.98)");
    inner.addColorStop(0.48, "rgba(37,10,45,0.97)");
    inner.addColorStop(1, "rgba(18,5,23,0.99)");
    ctx.fillStyle = inner;
    ctx.fillRect(x - w, top - 10, w * 2, h + 20);

    // Slow purple vortices.
    for (let i = 0; i < 4; i += 1) {
      const rx = w * (0.22 + i * 0.065);
      const ry = h * (0.09 + i * 0.024);
      const rot = t * (0.09 + i * 0.018) * (side === "left" ? 1 : -1) + i * 0.7;
      ctx.strokeStyle = rgba(i % 2 === 0 ? C.palePurple : C.plumLight, 0.15 + i * 0.018);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, base - h * 0.47, rx, ry, rot, 0, TAU);
      ctx.stroke();
    }

    // Vertical seam of light.
    const seam = ctx.createLinearGradient(0, top + 30, 0, base - 10);
    seam.addColorStop(0, rgba(C.palePurple, 0));
    seam.addColorStop(0.4, rgba(C.palePurple, 0.33));
    seam.addColorStop(0.7, rgba(C.plumLight, 0.18));
    seam.addColorStop(1, rgba(C.palePurple, 0));
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(t * 0.45) * 2.2, top + 33);
    ctx.lineTo(x + Math.sin(t * 0.45 + 1) * 3.2, base - 8);
    ctx.stroke();

    // Stars caught in the doorway.
    for (let i = 0; i < 17; i += 1) {
      const a = i * 2.399 + 0.7;
      const r = 0.14 + ((i * 37) % 67) / 100;
      const sx = x + Math.cos(a) * w * 0.35 * r + Math.sin(t * 0.3 + i) * 4;
      const sy = base - h * 0.47 + Math.sin(a) * h * 0.35 * r;
      const blink = 0.14 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.9));
      ctx.fillStyle = rgba(C.palePurple, blink);
      ctx.beginPath();
      ctx.arc(sx, sy, i % 5 === 0 ? 1.3 : 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Rim.
    ctx.strokeStyle = rgba(C.plumLight, 0.72);
    ctx.lineWidth = 1.2;
    ctx.stroke(arch);

    ctx.strokeStyle = rgba(C.palePurple, 0.2);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 7, base);
    ctx.lineTo(x - w / 2 + 7, top + w / 2);
    ctx.arc(x, top + w / 2, w / 2 - 7, Math.PI, 0, false);
    ctx.lineTo(x + w / 2 - 7, base);
    ctx.stroke();

    // Impact rings when a wave arrives.
    if (pulse > 0.02) {
      for (let i = 0; i < 2; i += 1) {
        const ring = clamp(1 - pulse - i * 0.18, 0, 1);
        ctx.strokeStyle = rgba(laneColor(), (1 - ring) * 0.28);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, base - h * 0.45, w * 0.5 + ring * 40, h * 0.22 + ring * 38, 0, 0, TAU);
        ctx.stroke();
      }
    }

    // Labels.
    ctx.strokeStyle = rgba(C.ink, 0.3);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 24, top - 22);
    ctx.lineTo(x + 24, top - 22);
    ctx.stroke();

    ctx.fillStyle = rgba(C.ink, 0.62);
    ctx.font = `7px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(`SOURCE ${side === "left" ? "L-01" : "R-01"}`, x, top - 31);

    ctx.fillStyle = rgba(laneColor(), 0.82);
    ctx.font = `6.5px ${MONO}`;
    ctx.fillText("2 SLIMES / 20 SEC", x, base + 22);

    // Tiny corner registration marks.
    ctx.strokeStyle = rgba(C.ink, 0.2);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 10, base + 8);
    ctx.lineTo(x - w / 2 - 3, base + 8);
    ctx.moveTo(x + w / 2 + 3, base + 8);
    ctx.lineTo(x + w / 2 + 10, base + 8);
    ctx.stroke();

    ctx.restore();
  }

  function drawCentralPortal(t) {
    const x = CONFIG.CENTER;
    const base = groundY + 2;
    const rx = 73;
    const ry = 111;
    const cy = base - ry;
    const accent = laneColor();
    const other = otherColor();
    const near = canUsePortal();
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    ctx.save();

    // Wide halo.
    const halo = ctx.createRadialGradient(x, cy + 12, 8, x, cy + 12, 250);
    halo.addColorStop(0, rgba(C.plumMid, 0.18));
    halo.addColorStop(0.38, rgba(C.plumMid, 0.065));
    halo.addColorStop(1, rgba(C.plumMid, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - 280, groundY - 310, 560, 360);

    // Axis spokes, forming a tiny cross around the gate.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(accent, near ? 0.38 : 0.2);
    ctx.beginPath();
    ctx.moveTo(x - 20, cy);
    ctx.lineTo(x - 116, cy);
    ctx.moveTo(x + 20, cy);
    ctx.lineTo(x + 116, cy);
    ctx.stroke();

    ctx.strokeStyle = rgba(other, 0.16);
    ctx.beginPath();
    ctx.moveTo(x, cy - 20);
    ctx.lineTo(x, cy - 138);
    ctx.moveTo(x, cy + 20);
    ctx.lineTo(x, base + 18);
    ctx.stroke();

    // Concentric orbital lines.
    ctx.strokeStyle = rgba(C.ink, 0.13);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([1, 7]);
    ctx.beginPath();
    ctx.arc(x, cy, 132, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = rgba(accent, 0.25 + pulse * 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, cy, 103, 139, -0.04, 0, TAU);
    ctx.stroke();

    // Floor shadow.
    ctx.fillStyle = rgba(C.ink, 0.2);
    ctx.beginPath();
    ctx.ellipse(x, base + 1, 104, 8, 0, 0, TAU);
    ctx.fill();

    // Gate body.
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, 0, 0, TAU);
    const body = ctx.createRadialGradient(x - 15, cy - 30, 3, x, cy, ry);
    body.addColorStop(0, "#130718");
    body.addColorStop(0.36, "#2c0d35");
    body.addColorStop(0.72, "#4b1c59");
    body.addColorStop(1, "#220b2a");
    ctx.fillStyle = body;
    ctx.shadowColor = rgba(C.plumMid, 0.42);
    ctx.shadowBlur = 26;
    ctx.fill();
    ctx.shadowBlur = 0;

    // The void inside.
    ctx.save();
    ctx.clip();
    const voidGrad = ctx.createRadialGradient(x, cy + 6, 2, x, cy + 4, ry * 0.92);
    voidGrad.addColorStop(0, "rgba(7,2,9,0.99)");
    voidGrad.addColorStop(0.5, "rgba(31,8,37,0.97)");
    voidGrad.addColorStop(1, "rgba(13,4,17,0.99)");
    ctx.fillStyle = voidGrad;
    ctx.fillRect(x - rx, cy - ry, rx * 2, ry * 2);

    // Rotating rings inside the gate.
    for (let i = 0; i < 5; i += 1) {
      const r = 0.3 + i * 0.105;
      const rot = t * (0.13 + i * 0.02) * (i % 2 === 0 ? 1 : -1) + i * 0.63;
      ctx.strokeStyle = rgba(i % 2 === 0 ? C.palePurple : C.plumLight, 0.15 + i * 0.022);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(
        x + Math.sin(t * 0.34 + i) * 3,
        cy + Math.cos(t * 0.28 + i) * 2,
        rx * r * 1.2,
        ry * r,
        rot,
        0,
        TAU
      );
      ctx.stroke();
    }

    // Central pupil.
    ctx.fillStyle = rgba(C.palePurple, 0.08 + pulse * 0.035);
    ctx.beginPath();
    ctx.ellipse(x, cy, 25, 35, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(C.palePurple, 0.28);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(x, cy, 19 + pulse * 2, 28 + pulse * 3, 0, 0, TAU);
    ctx.stroke();

    // Star field.
    for (let i = 0; i < 28; i += 1) {
      const a = i * 2.399 + 1.2;
      const r = 0.12 + ((i * 41) % 73) / 100;
      const sx = x + Math.cos(a) * rx * 0.64 * r + Math.sin(t * 0.4 + i) * 5;
      const sy = cy + Math.sin(a) * ry * 0.65 * r;
      const blink = 0.16 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.3));
      ctx.fillStyle = rgba(C.palePurple, blink);
      ctx.beginPath();
      ctx.arc(sx, sy, i % 7 === 0 ? 1.35 : 0.72, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Rim layers.
    ctx.strokeStyle = rgba(C.plumLight, 0.85);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, 0, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(C.palePurple, 0.2);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx - 6, ry - 6, 0, 0, TAU);
    ctx.stroke();

    // Four switch chevrons.
    const chevron = 7;
    const points = [
      [x - rx - 14, cy, -1, 0],
      [x + rx + 14, cy, 1, 0],
      [x, cy - ry - 14, 0, -1],
      [x, cy + ry + 14, 0, 1],
    ];
    ctx.strokeStyle = rgba(near ? accent : C.ink, near ? 0.65 : 0.24);
    ctx.lineWidth = 1;
    for (const [px, py, dx, dy] of points) {
      ctx.beginPath();
      if (dx !== 0) {
        ctx.moveTo(px - dx * chevron, py - chevron);
        ctx.lineTo(px, py);
        ctx.lineTo(px - dx * chevron, py + chevron);
      } else {
        ctx.moveTo(px - chevron, py - dy * chevron);
        ctx.lineTo(px, py);
        ctx.lineTo(px + chevron, py - dy * chevron);
      }
      ctx.stroke();
    }

    // Interaction halo.
    if (near) {
      ctx.strokeStyle = rgba(accent, 0.2 + pulse * 0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, cy, rx + 23 + pulse * 5, ry + 23 + pulse * 5, 0, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = rgba(accent, 0.22);
      ctx.beginPath();
      ctx.ellipse(x, base + 4, 92 + pulse * 9, 7 + pulse, 0, 0, TAU);
      ctx.stroke();
    }

    // Gate label.
    ctx.fillStyle = rgba(C.ink, 0.5);
    ctx.font = `7px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("TURN GATE / 转向门", x, cy - ry - 31);
    ctx.strokeStyle = rgba(C.ink, 0.23);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 26, cy - ry - 22);
    ctx.lineTo(x + 26, cy - ry - 22);
    ctx.stroke();

    ctx.restore();
  }

  function drawSplats() {
    for (const splat of game.splats) {
      const alpha = clamp(splat.life / splat.maxLife, 0, 1) * 0.2;
      ctx.fillStyle = rgba(splat.color, alpha);
      for (let i = 0; i < 5; i += 1) {
        const angle = i * 2.1 + splat.size;
        const x = splat.x + Math.cos(angle) * splat.size * 0.8;
        const y = splat.y + Math.sin(angle) * 2.4;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + (i % 3), 0.8 + (i % 2), angle, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawSlimes(t) {
    const lane = game.lanes[game.lane];
    const color = laneColor();

    for (const enemy of lane.enemies) {
      drawSlime(enemy, color, t);
    }

    if (game.player.target && !game.player.target.dead) {
      drawTargetReticle(game.player.target, color, t);
    }
  }

  function drawSlime(enemy, color, t) {
    const spawning = enemy.phase === "spawn";
    const spawnT = spawning ? clamp(enemy.age / 0.58, 0, 1) : 1;
    const scale = 0.35 + easeOutCubic(spawnT) * 0.65;
    const bob = enemy.phase === "walk" ? Math.abs(Math.sin(t * 5.4 + enemy.phaseOffset)) * 2 : 0;
    const squash = 1 + Math.sin(t * 6.2 + enemy.phaseOffset) * 0.035;
    const r = 18;
    const height = enemy.height;
    const x = enemy.x;
    const y = groundY - 3 - bob;

    ctx.save();
    ctx.globalAlpha = 0.55 + spawnT * 0.45;
    ctx.translate(x, y);
    ctx.scale(scale * squash, scale * (2 - squash));

    // Shadow.
    ctx.fillStyle = rgba(C.ink, 0.16);
    ctx.beginPath();
    ctx.ellipse(0, 3, 21, 4.2, 0, 0, TAU);
    ctx.fill();

    // Spawn aura.
    if (spawning) {
      ctx.strokeStyle = rgba(C.plumLight, (1 - spawnT) * 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 + (1 - spawnT) * 17, 7 + (1 - spawnT) * 8, 0, 0, TAU);
      ctx.stroke();
    }

    // Slime body.
    const body = new Path2D();
    body.moveTo(-r, 0);
    body.bezierCurveTo(-r - 1.5, -height * 0.62, -r * 0.7, -height, 0, -height);
    body.bezierCurveTo(r * 0.7, -height, r + 1.5, -height * 0.62, r, 0);
    body.bezierCurveTo(r * 0.78, 3.4, r * 0.34, 2.2, 0, 3);
    body.bezierCurveTo(-r * 0.36, 2.2, -r * 0.82, 3.8, -r, 0);
    body.closePath();

    const fill = ctx.createLinearGradient(0, -height, 0, 4);
    fill.addColorStop(0, rgba(color, 0.98));
    fill.addColorStop(1, rgba(color, 0.7));
    ctx.fillStyle = fill;
    ctx.fill(body);

    ctx.strokeStyle = rgba(C.ink, 0.82);
    ctx.lineWidth = 1.3;
    ctx.stroke(body);

    // Gloss.
    ctx.strokeStyle = rgba(C.cream, 0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-6, -height * 0.62, 8.5, Math.PI * 1.08, Math.PI * 1.62);
    ctx.stroke();

    // Face.
    const eyeDir = enemy.dir * 1.2;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(-6 + eyeDir, -height * 0.44, 2.25, 0, TAU);
    ctx.arc(6 + eyeDir, -height * 0.44, 2.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(C.cream, 0.82);
    ctx.beginPath();
    ctx.arc(-5.2 + eyeDir, -height * 0.47, 0.7, 0, TAU);
    ctx.arc(6.8 + eyeDir, -height * 0.47, 0.7, 0, TAU);
    ctx.fill();

    // Tiny mouth.
    ctx.strokeStyle = rgba(C.ink, 0.65);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(eyeDir * 0.5, -height * 0.27, 2.8, 0.15, Math.PI - 0.15);
    ctx.stroke();

    ctx.restore();

    // A little HP mark keeps the 1 HP rule visible without a bar.
    if (!spawning) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rgba(C.paperBright, 0.9);
      ctx.strokeStyle = rgba(C.ink, 0.26);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(x, y - height * scale - 8, 3, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(C.ink, 0.65);
      ctx.font = `5px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("1", x, y - height * scale - 7.7);
      ctx.restore();
    }
  }

  function drawTargetReticle(enemy, color, t) {
    const y = groundY - enemy.height - 19;
    const pulse = 1 + Math.sin(t * 6) * 0.06;
    ctx.save();
    ctx.translate(enemy.x, y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = rgba(C.ink, 0.62);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-6, 0);
    ctx.moveTo(6, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, -9);
    ctx.stroke();

    ctx.fillStyle = rgba(color, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(3, -12);
    ctx.lineTo(-3, -12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(t) {
    const p = game.player;
    const moving = Math.abs(p.vx) > 12;
    const bob = moving
      ? Math.abs(Math.sin(p.walk * 2.2)) * 2.1
      : Math.sin(t * 2.1) * 0.8;
    const side = p.target ? (p.target.x >= p.x ? 1 : -1) : p.facing;
    const recoil = p.recoil * 2.2;

    ctx.save();
    ctx.translate(p.x - side * recoil, groundY - bob);
    ctx.scale(1.12, 1.12);

    // Faint paper backlight separates the black silhouette from the dark gate.
    const backlight = ctx.createRadialGradient(0, -44, 2, 0, -44, 62);
    backlight.addColorStop(0, rgba(C.paperBright, 0.24));
    backlight.addColorStop(0.5, rgba(C.paperBright, 0.08));
    backlight.addColorStop(1, rgba(C.paperBright, 0));
    ctx.fillStyle = backlight;
    ctx.beginPath();
    ctx.arc(0, -44, 62, 0, TAU);
    ctx.fill();

    // Shadow.
    ctx.fillStyle = rgba(C.ink, 0.18);
    ctx.beginPath();
    ctx.ellipse(0, 2.8, 29, 4.4, 0, 0, TAU);
    ctx.fill();

    // Legs.
    const swing = moving ? Math.sin(p.walk * 2.2) * 5 : 0;
    drawLeg(-9 + swing * 0.4, 0, swing, side);
    drawLeg(9 - swing * 0.4, 1, -swing, side);

    // Body: a severe little top hat with a cream band.
    ctx.save();
    ctx.rotate(side * p.recoil * 0.03);
    ctx.lineJoin = "round";

    // Crown. The pale keyline keeps the hat readable on the portal void.
    const crown = new Path2D();
    crown.moveTo(-20, -36);
    crown.lineTo(-18.5, -74);
    crown.quadraticCurveTo(-18, -82, -8, -83.5);
    crown.quadraticCurveTo(0, -85, 9, -83.5);
    crown.quadraticCurveTo(18, -82, 18.5, -74);
    crown.lineTo(20, -36);
    crown.closePath();
    ctx.strokeStyle = rgba(C.paperBright, 0.52);
    ctx.lineWidth = 2.1;
    ctx.stroke(crown);
    ctx.fillStyle = C.ink;
    ctx.fill(crown);

    // Crown top.
    ctx.fillStyle = "#0f0d0b";
    ctx.beginPath();
    ctx.ellipse(0, -82.5, 18.5, 3.2, 0, 0, TAU);
    ctx.fill();

    // Brim.
    ctx.beginPath();
    ctx.ellipse(0, -35, 34, 6.2, 0, 0, TAU);
    ctx.strokeStyle = rgba(C.paperBright, 0.42);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.fillRect(-27, -39, 54, 5.5);

    // Band and a thin axis-coloured stripe.
    ctx.fillStyle = C.cream;
    ctx.fillRect(-19.5, -51.5, 39, 7.5);
    ctx.fillStyle = laneColor();
    ctx.fillRect(-19.5, -48.5, 39, 2.1);

    // Two tiny eyes make the silhouette a character, not a prop.
    ctx.fillStyle = rgba(C.cream, 0.88);
    ctx.beginPath();
    ctx.arc(-6.8, -60.7, 1.55, 0, TAU);
    ctx.arc(6.8, -60.7, 1.55, 0, TAU);
    ctx.fill();

    // Edge highlight.
    ctx.strokeStyle = rgba(C.paperBright, 0.18);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-15.5, -75);
    ctx.lineTo(-14.5, -43);
    ctx.stroke();

    ctx.restore();

    // Arms and auto-crossbow.
    const shoulderX = side * 19;
    const shoulderY = -43;
    const weaponX = side * 26;
    const weaponY = -41;
    const angle = p.aim;
    const armSwing = moving ? Math.sin(p.walk * 2.2) * 2 : 0;

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-side * 16, -44);
    ctx.lineTo(-side * 25, -35 + armSwing);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(weaponX, weaponY);
    ctx.stroke();

    // Crossbow stock.
    ctx.save();
    ctx.translate(weaponX, weaponY);
    ctx.rotate(angle);
    ctx.translate(-p.recoil * 2.5, 0);

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();

    ctx.strokeStyle = "#3c2a20";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, -9);
    ctx.quadraticCurveTo(24, -4, 25, 0);
    ctx.quadraticCurveTo(24, 4, 16, 9);
    ctx.stroke();

    ctx.strokeStyle = rgba(C.cream, 0.65);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(16, -9);
    ctx.lineTo(23, 0);
    ctx.lineTo(16, 9);
    ctx.stroke();

    ctx.strokeStyle = laneColor();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(30, 0);
    ctx.stroke();
    ctx.restore();

    // Tiny interaction ring at the feet.
    if (p.nearPortal && !game.switching) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.strokeStyle = rgba(laneColor(), 0.24 + pulse * 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 3, 38 + pulse * 6, 6 + pulse, 0, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLeg(x, index, swing, side) {
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, -31);
    const kneeX = x + swing * 0.45;
    const kneeY = -15;
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(kneeX + (index === 0 ? -1 : 1) + swing * 0.4, -1);
    ctx.stroke();

    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(kneeX + swing * 0.4 + side * 1.2, 0.5, 6.4, 2.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBolts() {
    for (const bolt of game.bolts) {
      const dx = Math.cos(bolt.angle);
      const dy = Math.sin(bolt.angle);
      ctx.save();
      ctx.strokeStyle = rgba(C.ink, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bolt.x - dx * 23, bolt.y - dy * 23);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();

      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bolt.x - dx * 8, bolt.y - dy * 8);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();

      // Arrowhead.
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.moveTo(bolt.x + dx * 6, bolt.y + dy * 6);
      ctx.lineTo(bolt.x - dy * 3 - dx * 2, bolt.y + dx * 3 - dy * 2);
      ctx.lineTo(bolt.x + dy * 3 - dx * 2, bolt.y - dx * 3 - dy * 2);
      ctx.closePath();
      ctx.fill();

      // Fletching.
      ctx.strokeStyle = rgba(laneColor(), 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bolt.x - dx * 9 - dy * 3.5, bolt.y - dy * 9 + dx * 3.5);
      ctx.lineTo(bolt.x - dx * 6, bolt.y - dy * 6);
      ctx.lineTo(bolt.x - dx * 9 + dy * 3.5, bolt.y - dy * 9 - dx * 3.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;
      if (particle.shape === "line") {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(
          particle.x + Math.cos(particle.spin) * particle.size * 3.2,
          particle.y + Math.sin(particle.spin) * particle.size * 3.2
        );
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (const floater of game.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = floater.color;
      ctx.font = `${floater.size}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(floater.text, floater.x, floater.y);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  rendering — switch wipe / frame                                    */
  /* ------------------------------------------------------------------ */

  function drawSwitchWipe() {
    const s = game.switching;
    if (!s) return;

    const q = clamp(s.t / s.duration, 0, 1);
    const sx = (CONFIG.CENTER - game.camera.x) * zoom;
    const sy = (groundY - 112) * zoom;
    const maxR = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy)) + 100;

    let radius;
    if (q < 0.44) {
      radius = easeInOutCubic(q / 0.44) * maxR;
    } else if (q < 0.59) {
      radius = maxR;
    } else {
      radius = (1 - easeInOutCubic((q - 0.59) / 0.41)) * maxR;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.1, radius), 0, TAU);
    ctx.clip();

    ctx.fillStyle = "#16081b";
    ctx.fillRect(0, 0, W, H);

    // Violet pressure inside the circle.
    const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, Math.max(80, radius * 0.9));
    glow.addColorStop(0, "rgba(103,57,119,0.5)");
    glow.addColorStop(0.5, "rgba(66,25,79,0.22)");
    glow.addColorStop(1, "rgba(16,5,19,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Technical cross lines.
    ctx.strokeStyle = "rgba(198,165,210,0.16)";
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(sx + i * 52, 0);
      ctx.lineTo(sx + i * 52, H);
      ctx.stroke();
    }
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, sy + i * 52);
      ctx.lineTo(W, sy + i * 52);
      ctx.stroke();
    }

    const labelAlpha = q > 0.22 && q < 0.8 ? 1 : 0;
    if (labelAlpha) {
      ctx.save();
      ctx.globalAlpha = labelAlpha;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(248,244,234,0.56)";
      ctx.font = `8px ${MONO}`;
      ctx.fillText("AXIS ROTATION", sx, sy - 56);
      ctx.fillStyle = C.cream;
      ctx.font = `500 ${Math.round(38 * zoom)}px ${SERIF}`;
      ctx.fillText(
        `${s.from === "red" ? "红轴" : "蓝轴"}  →  ${s.to === "red" ? "红轴" : "蓝轴"}`,
        sx,
        sy + 12
      );
      ctx.fillStyle = "rgba(248,244,234,0.42)";
      ctx.font = `7px ${MONO}`;
      ctx.fillText("TURNING THE CROSS", sx, sy + 40);
      ctx.restore();
    }

    ctx.restore();

    // Thin colored rim of the portal wave.
    if (radius > 2 && radius < maxR) {
      ctx.save();
      ctx.strokeStyle = rgba(laneColor(s.to), 0.65);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(198,165,210,0.24)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFrameEffects() {
    if (game.switching) drawSwitchWipe();

    // Low core produces a quiet, pulsing paper-edge, not a flashing alarm.
    if (!game.over && game.core <= 3) {
      const pulse = 0.5 + 0.5 * Math.sin(visualTime * 3.1);
      const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
      edge.addColorStop(0, "rgba(42,13,50,0)");
      edge.addColorStop(1, `rgba(42,13,50,${0.05 + pulse * 0.055})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render() {
    if (!game) return;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawPaper();
    drawParallax();

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-game.camera.x + game.camera.shakeX / zoom, game.camera.shakeY / zoom);
    drawWorld();
    ctx.restore();

    drawFrameEffects();
  }

  /* ------------------------------------------------------------------ */
  /*  input                                                              */
  /* ------------------------------------------------------------------ */

  function setMoveKey(direction, down) {
    if (!game || game.over) return;
    if (direction === "left") keys.left = down;
    else keys.right = down;
  }

  function handleKeyDown(event) {
    const key = event.key;
    const lower = key.toLowerCase();

    if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "e", "p", "h", "m", "r"].includes(lower) ||
      key === "?"
    ) {
      event.preventDefault();
    }

    initAudio();

    if (!ui.helpOverlay.hidden) {
      if (lower === "e" || key === "Escape" || key === "?") {
        closeHelp();
      }
      return;
    }

    if (!ui.pauseOverlay.hidden) {
      if (lower === "p" || lower === "e" || key === "Escape") {
        resumeGame();
      }
      return;
    }

    if (!ui.gameoverOverlay.hidden) {
      if (lower === "r" || lower === "e" || lower === " ") {
        resetGame();
      }
      return;
    }

    if (!game || game.over) return;

    if (lower === "a" || key === "ArrowLeft") {
      keys.left = true;
    } else if (lower === "d" || key === "ArrowRight") {
      keys.right = true;
    } else if (lower === "e") {
      if (!event.repeat) startSwitch();
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
    if (lower === "a" || key === "ArrowLeft") {
      keys.left = false;
    } else if (lower === "d" || key === "ArrowRight") {
      keys.right = false;
    }
  }

  function bindHoldButton(button, direction) {
    const down = (event) => {
      event.preventDefault();
      initAudio();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch (_) {
        /* older pointer implementations can reject capture */
      }
      button.classList.add("active");
      if (!game || game.over) return;
      setMoveKey(direction, true);
    };

    const up = (event) => {
      if (event) event.preventDefault();
      button.classList.remove("active");
      setMoveKey(direction, false);
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
      if (document.hidden && game && !game.over && !game.paused) {
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
    ui.resumeBtn.addEventListener("click", () => {
      initAudio();
      resumeGame();
    });
    ui.closeHelpBtn.addEventListener("click", closeHelp);
    ui.helpStartBtn.addEventListener("click", closeHelp);

    ui.gameoverOverlay.addEventListener("pointerdown", (event) => {
      if (event.target === ui.gameoverOverlay) return;
    });

    ui.touchSwitch.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      initAudio();
      startSwitch();
    });

    bindHoldButton(ui.touchLeft, "left");
    bindHoldButton(ui.touchRight, "right");

    // First gesture anywhere unlocks audio without changing gameplay.
    window.addEventListener("pointerdown", initAudio, { passive: true });
    window.addEventListener("keydown", initAudio);

    // Double click on the canvas should not select or zoom.
    ui.stage.addEventListener("dblclick", (event) => event.preventDefault());
  }

  /* ------------------------------------------------------------------ */
  /*  debug API + boot                                                   */
  /* ------------------------------------------------------------------ */

  function exposeDebugApi() {
    window.__crossward = {
      get state() {
        return game;
      },
      advance(seconds) {
        if (!game) return;
        let remaining = Math.max(0, seconds);
        while (remaining > 0) {
          const step = Math.min(FIXED_DT, remaining);
          if (game.switching) updateSwitch(step);
          else update(step);
          updateCamera(step);
          remaining -= step;
        }
        updateHud();
        drawMinimap();
      },
      switchLane() {
        if (!game) return;
        game.player.x = CONFIG.CENTER;
        startSwitch();
      },
      spawnWave() {
        spawnWave();
        updateHud();
      },
      addSlime(lane = "red", side = "left", distance = 0.2) {
        if (!game) return;
        const x =
          side === "left"
            ? lerp(CONFIG.PORTAL_L + 61, CONFIG.CENTER, clamp(distance, 0, 1))
            : lerp(CONFIG.PORTAL_R - 61, CONFIG.CENTER, clamp(distance, 0, 1));
        game.lanes[lane].enemies.push({
          id: ++enemySerial,
          lane,
          x,
          side,
          dir: side === "left" ? 1 : -1,
          hp: 1,
          maxHp: 1,
          age: 1,
          phase: "walk",
          speed: 35,
          phaseOffset: Math.random() * TAU,
          wobbleSeed: Math.random() * 100,
          height: 31,
          dead: false,
        });
        updateHud();
      },
      damageCore(amount = 1) {
        for (let i = 0; i < amount; i += 1) {
          game.core = Math.max(0, game.core - 1);
          updateIntegrity(true);
        }
        if (game.core <= 0) endGame();
      },
      reset: resetGame,
      pause: () => pauseGame(false),
      resume: resumeGame,
      renderOnce: render,
    };
  }

  let lastFrame = performance.now();
  let accumulator = 0;

  function loop(now) {
    const rawDt = (now - lastFrame) / 1000;
    const dt = clamp(rawDt, 0, 0.05);
    lastFrame = now;
    visualTime += dt;

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
    updateHud();
    drawMinimap();
    requestAnimationFrame(loop);
  }

  function boot() {
    resizeStage();
    wireEvents();
    resetGame();
    exposeDebugApi();
    updateHud(true);
    requestAnimationFrame((now) => {
      lastFrame = now;
      requestAnimationFrame(loop);
    });
  }

  boot();
})();
