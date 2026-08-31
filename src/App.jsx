import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

/* localStorage-backed save (this runs in a normal browser, not the
   Claude artifact sandbox, so plain localStorage works fine here) */
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v ? { value: v } : null;
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { value };
  },
};

/* ============================================================
   APEX DRIFT — top-down arcade racer
   Canvas-drawn cars & tracks, persisted progress.
   Features: drift+boost, nitro pickups, weather variants,
   car bumping, XP levels, daily challenge, achievements,
   ghost replay, local leaderboards, synthesized audio,
   minimap, gamepad & touch controls.
   ============================================================ */

/* ---------------- palette / tokens ---------------- */
const COLORS_UI = {
  bg0: "#0A0C11",
  bg1: "#12151D",
  panel: "#171B24",
  panel2: "#1E2330",
  line: "#2A3040",
  amber: "#FFB020",
  cyan: "#33E1ED",
  red: "#FF4B5C",
  green: "#38F09A",
  text: "#EDEFF3",
  sub: "#8A93A6",
};

const CW = 1000, CH = 620; // canvas internal resolution

/* ---------------- weather / time-of-day ---------------- */
const WEATHERS = {
  clear: { id: "clear", label: "Clear Day", icon: "☀", gripMul: 1.0, speedMul: 1.0, rain: false, dark: false },
  dusk: { id: "dusk", label: "Dusk", icon: "🌆", gripMul: 0.98, speedMul: 0.99, rain: false, dark: true },
  night: { id: "night", label: "Night", icon: "🌙", gripMul: 0.96, speedMul: 1.0, rain: false, dark: true },
  rain: { id: "rain", label: "Rain", icon: "🌧", gripMul: 0.82, speedMul: 0.94, rain: true, dark: true },
  storm: { id: "storm", label: "Night Storm", icon: "⛈", gripMul: 0.76, speedMul: 0.92, rain: true, dark: true },
};

/* ---------------- track generators (world space) ---------------- */
function genOvalTrack() { // American
  const pts = [], cx = 800, cy = 500, rx = 640, ry = 330, N = 84;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}
function genRoundedRectTrack() { // European
  const pts = [], cx = 800, cy = 500, A = 610, B = 320, n = 5, N = 96;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const rx = A * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const ry = B * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const chic = 1 + 0.055 * Math.sin(4 * t);
    pts.push({ x: cx + rx * chic, y: cy + ry * chic });
  }
  return pts;
}
function genTechnicalTrack() { // Asia
  const pts = [], cx = 800, cy = 500, N = 108;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 400 + 120 * Math.sin(3 * t) + 55 * Math.cos(5 * t);
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * 0.6 * Math.sin(t) });
  }
  return pts;
}
function genNordicTrack() { // Nordic — sweeping fjord loop
  const pts = [], cx = 800, cy = 500, N = 100;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 430 + 90 * Math.sin(2 * t + 0.8) + 45 * Math.cos(3 * t);
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * 0.62 * Math.sin(t) });
  }
  return pts;
}

const REGIONS = {
  asia: {
    key: "asia", name: "Asia", sub: "Neo Circuit", tag: "Technical",
    gen: genTechnicalTrack, roadWidth: 88,
    sky: ["#0a0e22", "#181c3d"], road: "#232637", curb: "#e7e7ef",
    accent: "#39e6ff", deco: "neon",
    weathers: ["night", "night", "rain", "storm"],
    names: ["Kaito", "Mei", "Ravi", "Suri"],
  },
  american: {
    key: "american", name: "American", sub: "Salt Flat Oval", tag: "Easy",
    gen: genOvalTrack, roadWidth: 148,
    sky: ["#2a1608", "#4d2c10"], road: "#2c2620", curb: "#e9d9b8",
    accent: "#ffb020", deco: "desert",
    weathers: ["clear", "clear", "dusk"],
    names: ["Duke", "Rosa", "Hank", "Billie"],
  },
  european: {
    key: "european", name: "European", sub: "Grand Circuit", tag: "Balanced",
    gen: genRoundedRectTrack, roadWidth: 110,
    sky: ["#0b1a10", "#15301e"], road: "#242a25", curb: "#e8ece6",
    accent: "#7CFC9A", deco: "forest",
    weathers: ["clear", "clear", "rain"],
    names: ["Hugo", "Lena", "Marco", "Elin"],
  },
  nordic: {
    key: "nordic", name: "Nordic", sub: "Fjord Ice Ring", tag: "Ice — Low Grip",
    gen: genNordicTrack, roadWidth: 126,
    sky: ["#13233b", "#1d3a5c"], road: "#3d5a75", curb: "#eaf4fb",
    accent: "#9fe0ff", deco: "alpine",
    weathers: ["night", "rain", "storm"],
    names: ["Astrid", "Lars", "Ingrid", "Bjorn"],
  },
};

/* ---------------- cars / parts / colors ---------------- */
const CARS = [
  { id: "starter", name: "Vento GT", tag: "Starter Hatch", price: 0, top: 3.2, accel: 0.050, handling: 0.062, color: "#d8d8d8" },
  { id: "furia", name: "Furia V12", tag: "Italian Icon", price: 1800, top: 3.9, accel: 0.058, handling: 0.058, color: "#e2261c" },
  { id: "toro", name: "Toro Rampante", tag: "Raging Bull", price: 2600, top: 4.1, accel: 0.062, handling: 0.052, color: "#f2c200" },
  { id: "nord", name: "Nordschleife R", tag: "German Precision", price: 3400, top: 4.0, accel: 0.056, handling: 0.070, color: "#1c5fd8" },
  { id: "rising", name: "Rising Sun RX", tag: "Drift King", price: 2200, top: 3.6, accel: 0.066, handling: 0.078, color: "#ff7a1a" },
  { id: "apexx", name: "Apex X", tag: "Hidden Prototype — finish all missions", price: Infinity, hidden: true, top: 4.35, accel: 0.074, handling: 0.084, color: "#33e1ed" },
];

const BODYKITS = [
  { id: "stock", name: "Stock", price: 0, top: 0, handling: 0, spoiler: false },
  { id: "sport", name: "Sport Kit", price: 180, top: 0.09, handling: 0.003, spoiler: false },
  { id: "aero", name: "Aero Kit", price: 320, top: 0.18, handling: 0.001, spoiler: true },
  { id: "wide", name: "Widebody Kit", price: 420, top: 0.06, handling: 0.007, spoiler: true },
];
const TYRES = [
  { id: "standard", name: "Standard", price: 0, top: 0, grip: 1.0, color: "#1c1c1c" },
  { id: "sport", name: "Sport Compound", price: 140, top: 0.06, grip: 1.12, color: "#161616" },
  { id: "slick", name: "Slick Racing", price: 280, top: 0.15, grip: 0.85, color: "#0e0e0e" },
  { id: "offroad", name: "All-Terrain", price: 160, top: -0.09, grip: 1.4, color: "#2a2418" },
];
const PAINTS = [
  { id: "white", name: "Pearl White", hex: "#f1f1ef", price: 0 },
  { id: "red", name: "Racing Red", hex: "#e2261c", price: 0 },
  { id: "black", name: "Stealth Black", hex: "#161616", price: 0 },
  { id: "blue", name: "Electric Blue", hex: "#1c5fd8", price: 60 },
  { id: "yellow", name: "Volt Yellow", hex: "#f2c200", price: 60 },
  { id: "green", name: "Toxic Green", hex: "#39ff6a", price: 90 },
  { id: "orange", name: "Inferno Orange", hex: "#ff7a1a", price: 90 },
  { id: "purple", name: "Nightshade Purple", hex: "#8a2be2", price: 120 },
  { id: "chrome", name: "Chrome Flake", hex: "#b9c4c9", price: 200 },
];

const MISSIONS = [
  { id: 1, title: "First Laps", desc: "Finish 1st on the American Salt Flat Oval.", region: "american", laps: 2, goal: { type: "position", value: 1 }, rewardD: 400, rewardC: 40 },
  { id: 2, title: "Coin Rush", desc: "Collect at least 10 coins in one race on the Asia Neo Circuit.", region: "asia", laps: 2, goal: { type: "coins", value: 10 }, rewardD: 300, rewardC: 0 },
  { id: 3, title: "Podium Finish", desc: "Finish top 3 on the European Grand Circuit.", region: "european", laps: 3, goal: { type: "position", value: 3 }, rewardD: 500, rewardC: 70 },
  { id: 4, title: "Against The Clock", desc: "Complete 2 laps of the Asia Neo Circuit in under 55 seconds.", region: "asia", laps: 2, goal: { type: "time", value: 55 }, rewardD: 650, rewardC: 50 },
  { id: 5, title: "Champion", desc: "Win a full 3-lap race on the American Salt Flat Oval.", region: "american", laps: 3, goal: { type: "position", value: 1 }, rewardD: 900, rewardC: 120 },
  { id: 6, title: "Grand Tour", desc: "Finish top 2 on the European Grand Circuit over 3 laps.", region: "european", laps: 3, goal: { type: "position", value: 2 }, rewardD: 1000, rewardC: 150 },
];

/* ---------------- car XP levels ---------------- */
const MAX_LEVEL = 10;
function xpForLevel(lvl) { return Math.round(120 * lvl * (1 + lvl * 0.35)); } // xp needed to go lvl -> lvl+1
function levelFromXp(xp) {
  let lvl = 1, rem = xp;
  while (lvl < MAX_LEVEL && rem >= xpForLevel(lvl)) { rem -= xpForLevel(lvl); lvl++; }
  return { level: lvl, into: rem, need: lvl < MAX_LEVEL ? xpForLevel(lvl) : 0 };
}
/* per-level permanent bonus applied on top of parts */
function levelBonus(level) {
  const l = Math.min(level, MAX_LEVEL) - 1;
  return { top: +(l * 0.022).toFixed(3), accel: +(l * 0.0009).toFixed(4), handling: +(l * 0.0016).toFixed(4) };
}

/* ---------------- achievements ---------------- */
const ACHIEVEMENTS = [
  { id: "firstWin", icon: "🥇", name: "First Blood", desc: "Win your first race" },
  { id: "wins10", icon: "🏆", name: "Serial Winner", desc: "Win 10 races" },
  { id: "races25", icon: "🏁", name: "Grid Veteran", desc: "Finish 25 races" },
  { id: "coins500", icon: "🪙", name: "Coin Hoarder", desc: "Collect 500 coins in total" },
  { id: "coins2500", icon: "💰", name: "Gold Rush", desc: "Collect 2,500 coins in total" },
  { id: "driftLong", icon: "🌀", name: "Sideways Master", desc: "Hold a single drift for 1.8s or longer" },
  { id: "drifts100", icon: "💨", name: "Smoke Show", desc: "Perform 100 drifts" },
  { id: "nitro25", icon: "⚡", name: "Boost Addict", desc: "Use nitro 25 times" },
  { id: "allCars", icon: "🔑", name: "The Collector", desc: "Own every standard car" },
  { id: "missionsAll", icon: "🎖", name: "Career Complete", desc: "Finish every mission" },
  { id: "apexx", icon: "👽", name: "Prototype Pilot", desc: "Unlock the hidden Apex X" },
  { id: "iceKing", icon: "❄️", name: "Ice King", desc: "Win a race on the Nordic Fjord Ice Ring" },
];

/* ---------------- daily challenge pool ---------------- */
const DAILY_POOL = [
  { key: "win-american", text: "Win any race at the American oval", goal: { type: "position", value: 1 } },
  { key: "podium-asia", text: "Finish top 3 anywhere in Asia", goal: { type: "position", value: 3 }, region: "asia" },
  { key: "coins12", text: "Collect 12 coins in a single race", goal: { type: "coins", value: 12 } },
  { key: "drifts8", text: "Perform 8 drift boosts in one race", goal: { type: "drifts", value: 8 } },
  { key: "time-euro", text: "Complete a European race in under 90s", goal: { type: "time", value: 90 }, region: "european", laps: 3 },
  { key: "win-nordic", text: "Tame the ice — win on the Fjord Ring", goal: { type: "position", value: 1 }, region: "nordic" },
];
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dailyMissionFor(key) {
  const def = DAILY_POOL[hashStr(key) % DAILY_POOL.length];
  const regKey = def.region || ["asia", "american", "european", "nordic"][hashStr(key + "r") % 4];
  return {
    id: "daily-" + def.key,
    daily: true,
    day: key,
    title: "Daily: " + def.text,
    desc: def.text,
    region: regKey,
    laps: def.laps || 2,
    goal: def.goal,
    rewardD: 350,
    rewardC: 80,
  };
}

/* ---------------- helpers ---------------- */
const byId = (arr, id) => arr.find((x) => x.id === id) || arr[0];
function computeStats(carDef, bodykitId, tyreId, level = 1) {
  const kit = byId(BODYKITS, bodykitId);
  const tyre = byId(TYRES, tyreId);
  const lb = levelBonus(level);
  return {
    top: +(carDef.top + kit.top + tyre.top + lb.top).toFixed(3),
    accel: +(carDef.accel + lb.accel).toFixed(4),
    handling: +(carDef.handling + kit.handling + lb.handling).toFixed(3),
    grip: tyre.grip,
    spoiler: kit.spoiler,
  };
}
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function nearestIndex(track, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < track.length; i++) {
    const d = dist(track[i].x, track[i].y, x, y);
    if (d < bd) { bd = d; best = i; }
  }
  return { idx: best, d: bd };
}
function trackLength(track) {
  let L = 0;
  for (let i = 0; i < track.length; i++) {
    const a = track[i], b = track[(i + 1) % track.length];
    L += dist(a.x, a.y, b.x, b.y);
  }
  return L;
}
function computeFit(track, roadWidth) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  track.forEach((p) => {
    minX = Math.min(minX, p.x - roadWidth); maxX = Math.max(maxX, p.x + roadWidth);
    minY = Math.min(minY, p.y - roadWidth); maxY = Math.max(maxY, p.y + roadWidth);
  });
  const w = maxX - minX, h = maxY - minY, pad = 36;
  const scale = Math.min((CW - 2 * pad) / w, (CH - 2 * pad) / h);
  const offX = (CW - w * scale) / 2 - minX * scale;
  const offY = (CH - h * scale) / 2 - minY * scale;
  return { scale, offX, offY };
}
function toScreen(p, t) { return { x: p.x * t.scale + t.offX, y: p.y * t.scale + t.offY }; }
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, "0")}`;
}

/* ---------------- default save ---------------- */
function defaultSave() {
  return {
    dollars: 900, coins: 120,
    ownedCars: ["starter"],
    ownedBodykits: ["stock"],
    ownedTyres: ["standard"],
    ownedPaints: ["white", "red", "black"],
    loadouts: { starter: { bodykit: "stock", tyre: "standard", paint: "white" } },
    missionsCompleted: [],
    selectedCar: "starter",
    /* new systems */
    carXp: {},                      // { carId: xpNumber }
    stats: { races: 0, wins: 0, totalCoins: 0, totalDrifts: 0, longestDriftMs: 0, nitroUses: 0 },
    achievements: [],
    records: {},                    // { regionKey: [{time, laps, car, date}] } top-5
    bestLaps: {},                   // { regionKey: seconds }
    ghosts: {},                     // { regionKey: {laps,time,samples:[[x,y,a],...]} }
    dailyDone: null,                // "YYYY-MM-DD"
    soundOn: true,
    ghostOn: true,
  };
}
/* deep-ish merge so older saves gain new fields */
function migrateSave(parsed) {
  const base = defaultSave();
  const s = { ...base, ...parsed };
  s.stats = { ...base.stats, ...(parsed.stats || {}) };
  s.carXp = { ...(parsed.carXp || {}) };
  s.records = { ...(parsed.records || {}) };
  s.bestLaps = { ...(parsed.bestLaps || {}) };
  s.ghosts = { ...(parsed.ghosts || {}) };
  s.achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
  return s;
}

/* ============================================================ */
/* ---------------- audio (synthesized, no assets) ---------------- */
const AudioSys = {
  ctx: null, master: null,
  engineOsc: null, engineGain: null, engineSub: null,
  driftSrc: null, driftGain: null, windGain: null, windSrc: null,
  enabled: true,

  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.5 : 0;
        this.master.connect(this.ctx.destination);
      } catch (e) { return; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  },
  noiseBuffer() {
    if (!this._nb) {
      const len = this.ctx.sampleRate;
      this._nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._nb;
  },
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 55;
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = "square";
    this.engineSub.frequency.value = 28;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 2;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); this.engineSub.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(t); this.engineSub.start(t);
    /* wind/roll noise */
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuffer(); this.windSrc.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = "bandpass"; wf.frequency.value = 900; wf.Q.value = 0.6;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
    this.windSrc.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
    this.windSrc.start(t);
    /* drift screech loop (gain toggled) */
    this.driftSrc = this.ctx.createBufferSource();
    this.driftSrc.buffer = this.noiseBuffer(); this.driftSrc.loop = true;
    const df = this.ctx.createBiquadFilter();
    df.type = "bandpass"; df.frequency.value = 2100; df.Q.value = 8;
    this.driftGain = this.ctx.createGain(); this.driftGain.gain.value = 0;
    this.driftSrc.connect(df); df.connect(this.driftGain); this.driftGain.connect(this.master);
    this.driftSrc.start(t);
  },
  updateEngine(speed01, offTrack) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const f = 50 + speed01 * 150 + Math.sin(t * 30) * speed01 * 4;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineSub.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.035 + speed01 * 0.05, t, 0.1);
    this.windGain.gain.setTargetAtTime(speed01 * speed01 * (offTrack ? 0.16 : 0.06), t, 0.15);
  },
  setDrifting(on) {
    if (!this.driftGain) return;
    this.driftGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, on ? 0.03 : 0.08);
  },
  stopEngine() {
    try {
      if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc.disconnect(); this.engineOsc = null; }
      if (this.engineSub) { this.engineSub.stop(); this.engineSub.disconnect(); this.engineSub = null; }
      if (this.windSrc) { this.windSrc.stop(); this.windSrc.disconnect(); this.windSrc = null; }
      if (this.driftSrc) { this.driftSrc.stop(); this.driftSrc.disconnect(); this.driftSrc = null; }
      if (this.engineGain) { this.engineGain.disconnect(); this.engineGain = null; }
      if (this.windGain) { this.windGain.disconnect(); this.windGain = null; }
      if (this.driftGain) { this.driftGain.disconnect(); this.driftGain = null; }
    } catch (e) { /* noop */ }
  },
  blip(freq, dur = 0.09, type = "square", vol = 0.18, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  coin() { this.blip(1180, 0.07, "square", 0.14); this.blip(1760, 0.12, "square", 0.12, 0.07); },
  nitroPickup() { this.blip(520, 0.08, "triangle", 0.2); this.blip(1040, 0.16, "triangle", 0.18, 0.08); },
  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.34);
  },
  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  beep(final) { this.blip(final ? 880 : 440, final ? 0.42 : 0.14, "sine", 0.25); },
  jingle() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.16, "triangle", 0.16, i * 0.11));
  },
};

/* ============================================================ */
export default function ApexDrift() {
  const [screen, setScreen] = useState("menu");
  const [mode, setMode] = useState("offline");
  const [region, setRegion] = useState("asia");
  const [activeMission, setActiveMission] = useState(null);
  const [save, setSave] = useState(defaultSave());
  const [loaded, setLoaded] = useState(false);
  const [garageCarId, setGarageCarId] = useState("starter");
  const [toast, setToast] = useState(null);
  const [hud, setHud] = useState(null);
  const [result, setResult] = useState(null);
  const [touchDevice, setTouchDevice] = useState(false);

  const canvasRef = useRef(null);
  const raceRef = useRef(null);
  const keysRef = useRef({});
  const touchRef = useRef({}); // on-screen buttons for mobile

  useEffect(() => {
    if (typeof window !== "undefined" && "ontouchstart" in window) setTouchDevice(true);
  }, []);

  /* today's daily challenge (stable for the whole day) */
  const dailyMission = useMemo(() => dailyMissionFor(todayKey()), []);
  const dailyDone = save.dailyDone === todayKey();

  /* fonts */
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  /* load save */
  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get("apexdrift_save");
        if (r && r.value) {
          const parsed = JSON.parse(r.value);
          setSave(migrateSave(parsed));
        }
      } catch (e) { /* no save yet */ }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setSave(next);
    try { await storage.set("apexdrift_save", JSON.stringify(next)); } catch (e) { /* ignore */ }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  /* ---------------- achievements ---------------- */
  const checkAchievements = useCallback((s) => {
    const st = s.stats || {};
    const unlocked = [];
    const has = (id) => s.achievements.includes(id);
    const test = {
      firstWin: st.wins >= 1,
      wins10: st.wins >= 10,
      races25: st.races >= 25,
      coins500: st.totalCoins >= 500,
      coins2500: st.totalCoins >= 2500,
      driftLong: st.longestDriftMs >= 1800,
      drifts100: st.totalDrifts >= 100,
      nitro25: st.nitroUses >= 25,
      allCars: CARS.filter((c) => !c.hidden).every((c) => s.ownedCars.includes(c.id)),
      missionsAll: MISSIONS.every((m) => s.missionsCompleted.includes(m.id)),
      apexx: s.ownedCars.includes("apexx"),
      iceKing: (st.winsByRegion?.nordic || 0) >= 1,
    };
    ACHIEVEMENTS.forEach((a) => { if (test[a.id] && !has(a.id)) unlocked.push(a); });
    if (unlocked.length) {
      AudioSys.ensure(); AudioSys.jingle();
      showToast("🏆 " + unlocked.map((a) => a.name).join(" · "));
    }
    return unlocked.length ? { ...s, achievements: [...s.achievements, ...unlocked.map((a) => a.id)] } : s;
  }, []);

  function buyCar(carId) {
    const car = byId(CARS, carId);
    if (save.ownedCars.includes(carId)) return;
    if (!Number.isFinite(car.price)) return;
    if (save.dollars < car.price) { showToast("Not enough dollars"); return; }
    let next = {
      ...save,
      dollars: save.dollars - car.price,
      ownedCars: [...save.ownedCars, carId],
      loadouts: { ...save.loadouts, [carId]: save.loadouts[carId] || { bodykit: "stock", tyre: "standard", paint: "white" } },
    };
    next = checkAchievements(next);
    persist(next);
    AudioSys.ensure(); AudioSys.coin();
    showToast(`${car.name} purchased`);
  }
  function buyPart(list, key, id, price) {
    if (save[key].includes(id)) return;
    if (save.coins < price) { showToast("Not enough coins"); return; }
    persist({ ...save, coins: save.coins - price, [key]: [...save[key], id] });
    AudioSys.ensure(); AudioSys.coin();
  }
  function setLoadout(carId, field, value) {
    persist({ ...save, loadouts: { ...save.loadouts, [carId]: { ...save.loadouts[carId], [field]: value } } });
  }

  /* ---------------- navigation ---------------- */
  function openMode(m) {
    setActiveMission(null);
    setMode(m);
    if (m === "mission") setScreen("missionList");
    else setScreen("regionSelect");
  }
  function pickDaily() {
    if (dailyDone) { showToast("Today's challenge is already complete"); return; }
    setActiveMission(dailyMission);
    setMode("daily");
    setRegion(dailyMission.region);
    setScreen("carSelect");
  }
  function pickMission(mission) {
    setActiveMission(mission);
    setMode("mission");
    setRegion(mission.region);
    setScreen("carSelect");
  }
  function pickRegion(r) { setActiveMission(null); setRegion(r); setScreen("carSelect"); }

  /* ---------------- race engine ---------------- */
  function startRace() {
    const reg = REGIONS[region];
    const track = reg.gen();
    const N = track.length;
    const fit = computeFit(track, reg.roadWidth);
    const segLen = trackLength(track) / N;
    const laps = activeMission ? activeMission.laps : 3;

    /* weather roll (per race) */
    const pool = reg.weathers || ["clear"];
    const weather = WEATHERS[pool[Math.floor(Math.random() * pool.length)]] || WEATHERS.clear;

    const start = track[0];
    const dir = Math.atan2(track[1].y - track[0].y, track[1].x - track[0].x);
    const perp = dir + Math.PI / 2;

    function mkCar(carId, laneOffset, isPlayer, label, aiSkill) {
      const carDef = byId(CARS, carId);
      const loadout = save.loadouts[carId] || { bodykit: "stock", tyre: "standard", paint: "white" };
      const xpInfo = levelFromXp((save.carXp && save.carXp[carId]) || 0);
      const stats = computeStats(carDef, loadout.bodykit, loadout.tyre, xpInfo.level);
      const paint = byId(PAINTS, loadout.paint).hex;
      const tyreColor = byId(TYRES, loadout.tyre).color;
      return {
        id: label, isPlayer, label, carId,
        x: start.x + Math.cos(perp) * laneOffset,
        y: start.y + Math.sin(perp) * laneOffset,
        angle: dir, moveAngle: dir, speed: 0, lap: 0, lastIndex: 0, progress: 0,
        offTrack: false, stats, paint, tyreColor, spoiler: stats.spoiler,
        t: 0, aiSkill, lateralPhase: Math.random() * 10,
        driftCharge: 0, drifting: false, driftTimeMs: 0,
        boostTime: 0, nitroStock: 1, nitroTime: 0,
        bumpVX: 0, bumpVY: 0,
      };
    }

    const cars = [];
    let players = [];
    if (mode === "multiplayer") {
      const p1 = mkCar(save.selectedCar, -60, "p1", "P1", 0);
      const p2 = mkCar(save.selectedCar, 60, "p2", "P2", 0);
      cars.push(p1, p2);
      players = [p1, p2];
      const names = reg.names.slice(0, 2);
      cars.push(mkCar("furia", -180, "ai", names[0], 0.55 + Math.random() * 0.3));
      cars.push(mkCar("toro", 180, "ai", names[1], 0.55 + Math.random() * 0.3));
    } else {
      const p1 = mkCar(save.selectedCar, 0, "p1", "YOU", 0);
      cars.push(p1);
      players = [p1];
      const carPool = CARS.filter((c) => c.id !== save.selectedCar && !c.hidden);
      const lanes = [-120, 120, -240];
      reg.names.slice(0, 3).forEach((nm, i) => {
        const cd = carPool[i % carPool.length];
        cars.push(mkCar(cd.id, lanes[i], "ai", nm, 0.5 + Math.random() * 0.42));
      });
    }

    // coins
    const coins = [];
    for (let i = 0; i < 22; i++) {
      const idx = Math.floor(Math.random() * N);
      const p = track[idx];
      const next = track[(idx + 1) % N];
      const ang = Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2;
      const off = (Math.random() - 0.5) * reg.roadWidth * 0.7;
      coins.push({ x: p.x + Math.cos(ang) * off, y: p.y + Math.sin(ang) * off, taken: false });
    }

    // nitro canisters
    const nitros = [];
    for (let i = 0; i < 7; i++) {
      const idx = Math.floor(Math.random() * N);
      const p = track[idx];
      const next = track[(idx + 1) % N];
      const ang = Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2;
      const off = (Math.random() - 0.5) * reg.roadWidth * 0.5;
      nitros.push({ x: p.x + Math.cos(ang) * off, y: p.y + Math.sin(ang) * off, taken: false });
    }

    // decorations
    const deco = [];
    for (let i = 0; i < 26; i++) {
      const idx = Math.floor(Math.random() * N);
      const p = track[idx];
      const next = track[(idx + 1) % N];
      const ang = Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = side * (reg.roadWidth / 2 + 40 + Math.random() * 120);
      deco.push({ x: p.x + Math.cos(ang) * off, y: p.y + Math.sin(ang) * off, s: 0.6 + Math.random() * 0.8, seed: Math.random() });
    }

    // minimap cache (normalized points)
    let mmMinX = Infinity, mmMaxX = -Infinity, mmMinY = Infinity, mmMaxY = -Infinity;
    track.forEach((p) => {
      mmMinX = Math.min(mmMinX, p.x); mmMaxX = Math.max(mmMaxX, p.x);
      mmMinY = Math.min(mmMinY, p.y); mmMaxY = Math.max(mmMaxY, p.y);
    });

    /* ghost of your best race on this region */
    const ghost = (mode !== "multiplayer" && save.ghostOn && save.ghosts && save.ghosts[region]) || null;
    const recArr = mode === "multiplayer" ? null : [];

    raceRef.current = {
      running: true, track, N, fit, segLen, reg, laps, cars, players, coins, nitros, deco,
      weather,
      time: 0, raceCoins: 0, frame: 0, finished: false,
      started: false, countdown: 3.9, lastCountShown: 4,
      parts: [], shake: 0, thudCd: 0, lightning: 0,
      driftsThisRace: 0, nitroUses: 0, longestDriftMs: 0,
      lapStartT: null, bestLap: null,
      ghost, ghostPos: null, recArr,
      mmBounds: { minX: mmMinX, maxX: mmMaxX, minY: mmMinY, maxY: mmMaxY },
      flashText: null, flashT: 0,
    };
    setResult(null);

    /* audio */
    AudioSys.enabled = !!save.soundOn;
    AudioSys.ensure();
    if (AudioSys.ctx) AudioSys.startEngine();

    setScreen("race");
  }

  /* keyboard — track both e.key and e.code (code distinguishes Shift sides) */
  useEffect(() => {
    function down(e) {
      keysRef.current[e.key.toLowerCase()] = true;
      keysRef.current[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    }
    function up(e) {
      keysRef.current[e.key.toLowerCase()] = false;
      keysRef.current[e.code] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  /* main loop */
  useEffect(() => {
    if (screen !== "race") return;
    let raf;
    let canvas = canvasRef.current;
    let ctx = canvas ? canvas.getContext("2d") : null;
    const normAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const GHOST_STRIDE = 3;

    function updateProgress(car, idx) {
      const prev = car.lap;
      const diff = idx - car.lastIndex;
      if (diff < -car.N * 0.6) car.lap += 1;
      else if (diff > car.N * 0.6) car.lap = Math.max(0, car.lap - 1);
      car.lastIndex = idx;
      car.progress = car.lap * car.N + idx;
      return car.lap > prev;
    }

    /* ---------------- particles ---------------- */
    function spawnPart(R, o) {
      if (R.parts.length > 260) R.parts.shift();
      R.parts.push({ life: o.life, maxLife: o.life, size: o.size, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, col: o.col });
    }
    function spawnSmoke(car, R) {
      const px = car.x - Math.cos(car.angle) * 14, py = car.y - Math.sin(car.angle) * 14;
      const side = (R.frame % 2 === 0 ? 1 : -1) * 6;
      spawnPart(R, {
        x: px + Math.cos(car.angle + Math.PI / 2) * side,
        y: py + Math.sin(car.angle + Math.PI / 2) * side,
        vx: (Math.random() - 0.5) * 0.8 - Math.cos(car.angle) * 0.4,
        vy: (Math.random() - 0.5) * 0.8 - Math.sin(car.angle) * 0.4,
        life: 26, size: 5 + Math.random() * 4, col: car.offTrack ? "190,160,120" : "205,205,215",
      });
    }
    function spawnFlame(car, R) {
      const nitro = car.nitroTime > 0;
      const px = car.x - Math.cos(car.angle) * 18, py = car.y - Math.sin(car.angle) * 18;
      spawnPart(R, {
        x: px + (Math.random() - 0.5) * 6, y: py + (Math.random() - 0.5) * 6,
        vx: -Math.cos(car.angle) * (1.5 + Math.random()), vy: -Math.sin(car.angle) * (1.5 + Math.random()),
        life: 14, size: 4 + Math.random() * 3,
        col: nitro ? "64,220,255" : (Math.random() < 0.5 ? "255,176,32" : "255,90,32"),
      });
    }
    function spawnSpray(car, R) {
      spawnPart(R, {
        x: car.x - Math.cos(car.angle) * 14, y: car.y - Math.sin(car.angle) * 14,
        vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
        life: 16, size: 2.5 + Math.random() * 3, col: "200,225,255",
      });
    }
    function updateParts(R) {
      for (let i = R.parts.length - 1; i >= 0; i--) {
        const p = R.parts[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94;
        p.size *= 1.03;
        if (--p.life <= 0) R.parts.splice(i, 1);
      }
    }

    /* ---------------- player physics ---------------- */
    function stepPlayer(car, inp, R) {
      const wet = R.weather.gripMul;
      if (car.boostTime > 0) car.boostTime--;
      if (car.nitroTime > 0) car.nitroTime--;
      const boostMul = car.boostTime > 0 ? 1.28 : 1;
      const nitroMul = car.nitroTime > 0 ? 1.45 : 1;
      const maxSpeed = car.stats.top * R.weather.speedMul * (car.offTrack ? 0.5 : 1) * boostMul * nitroMul;

      const accel = car.stats.accel * (car.boostTime > 0 ? 1.8 : 1) * (car.nitroTime > 0 ? 2.2 : 1);
      if (inp.up) car.speed += accel;
      else if (inp.down) car.speed -= accel * 1.5;
      else car.speed *= 0.985;
      if (car.offTrack) car.speed *= 0.95;

      /* --- drift state machine --- */
      const steerIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const speedAbs = Math.abs(car.speed);
      const canDrift = inp.drift && speedAbs > 1.25;
      if (canDrift && !car.drifting) { car.drifting = true; car.driftTimeMs = 0; }
      if (car.drifting) {
        car.driftTimeMs += 1000 / 60;
        if (!canDrift || car.offTrack) {
          /* release -> convert charge into boost */
          car.drifting = false;
          if (car.driftCharge > 15) {
            const gain = Math.min(78, 24 + car.driftCharge * 0.55);
            car.boostTime = Math.max(car.boostTime, gain);
            R.driftsThisRace++;
            R.longestDriftMs = Math.max(R.longestDriftMs, car.driftTimeMs);
            R.flashText = "DRIFT BOOST!"; R.flashT = 46;
            R.shake = Math.min(9, R.shake + 2.5);
            AudioSys.boost();
          }
          car.driftCharge = 0;
        } else {
          if (steerIn !== 0) car.driftCharge = Math.min(120, car.driftCharge + 0.7 + speedAbs * 0.12);
          else car.driftCharge = Math.max(0, car.driftCharge - 0.4);
        }
      }

      /* --- nitro --- */
      if (inp.nitro && car.nitroStock > 0 && car.nitroTime <= 0) {
        car.nitroStock--;
        car.nitroTime = 100;
        R.nitroUses++;
        R.flashText = "NITRO!"; R.flashT = 40;
        R.shake = Math.min(10, R.shake + 4);
        AudioSys.boost();
      }

      car.speed = Math.max(-maxSpeed * 0.45, Math.min(maxSpeed, car.speed));

      /* steering */
      const turnFactor = 0.35 + 0.65 * Math.min(1, speedAbs / 1.6);
      let steerRate = car.stats.handling * turnFactor * (car.speed >= 0 ? 1 : -1) * Math.sqrt(wet);
      if (car.drifting) steerRate *= 1.55;
      if (inp.left) car.angle -= steerRate;
      if (inp.right) car.angle += steerRate;

      /* velocity direction lags heading — the heart of the slide */
      const gripEff = car.stats.grip * wet * (car.offTrack ? 0.45 : 1);
      const alignRate = car.drifting ? 0.05 + 0.028 * gripEff : 0.16 + 0.13 * Math.min(1.4, gripEff);
      car.moveAngle += normAng(car.angle - car.moveAngle) * alignRate;
      car.x += Math.cos(car.moveAngle) * car.speed;
      car.y += Math.sin(car.moveAngle) * car.speed;

      const wasOff = car.offTrack;
      const { idx, d } = nearestIndex(R.track, car.x, car.y);
      car.N = R.N;
      car.offTrack = d > R.reg.roadWidth / 2 + 6 / Math.max(0.4, gripEff);
      if (car.offTrack && !wasOff) { R.shake = Math.min(8, R.shake + 2); AudioSys.thud(); }

      /* effects */
      if (car.drifting && R.frame % 2 === 0) spawnSmoke(car, R);
      if ((car.boostTime > 0 || car.nitroTime > 0) && R.frame % 2 === 0) spawnFlame(car, R);
      if (R.weather.rain && speedAbs > 2 && R.frame % 3 === 0) spawnSpray(car, R);

      const lapped = updateProgress(car, idx);
      if (lapped && car.isPlayer) {
        if (R.lapStartT !== null) {
          const lapT = +(R.time - R.lapStartT).toFixed(2);
          if (lapT > 3 && (!R.bestLap || lapT < R.bestLap)) R.bestLap = lapT;
        }
        R.lapStartT = R.time;
      }
    }

    /* ---------------- AI ---------------- */
    function stepAI(car, R, baseline) {
      const speedWorld = baseline * (0.78 + 0.35 * car.aiSkill) * R.weather.speedMul;
      const inc = speedWorld / R.segLen;
      car.t += inc;
      const N = R.N;
      const i0 = Math.floor(car.t) % N;
      const frac = car.t - Math.floor(car.t);
      const i1 = (i0 + 1) % N;
      const p0 = R.track[i0], p1 = R.track[i1];
      const bx = p0.x + (p1.x - p0.x) * frac, by = p0.y + (p1.y - p0.y) * frac;
      const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const lateral = (R.reg.roadWidth * 0.22) * Math.sin(car.t * 0.12 + car.lateralPhase);
      car.x = bx + nx * lateral + car.bumpVX;
      car.y = by + ny * lateral + car.bumpVY;
      car.bumpVX *= 0.88; car.bumpVY *= 0.88;
      car.angle = Math.atan2(dy, dx);
      car.moveAngle = car.angle;
      car.lap = Math.floor(car.t / N);
      car.progress = car.t;
      car.speed = speedWorld;
    }

    /* ---------------- collisions (bumping!) ---------------- */
    function resolveCollisions(R) {
      const list = R.cars;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dd = Math.hypot(dx, dy) || 0.001;
          const minD = 21;
          if (dd < minD) {
            const nx = dx / dd, ny = dy / dd, push = (minD - dd) / 2;
            const bumpA = a.isPlayer ? 0 : 1, bumpB = b.isPlayer ? 0 : 1;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
            if (bumpA) { a.bumpVX -= nx * 1.4; a.bumpVY -= ny * 1.4; } else a.speed *= 0.97;
            if (bumpB) { b.bumpVX += nx * 1.4; b.bumpVY += ny * 1.4; } else b.speed *= 0.97;
            if ((a.isPlayer || b.isPlayer) && R.thudCd <= 0) {
              R.thudCd = 14;
              R.shake = Math.min(11, R.shake + 3.5);
              AudioSys.thud();
              spawnPart(R, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: nx * 2, vy: ny * 2, life: 12, size: 5, col: "255,210,90" });
            }
          }
        }
      }
    }

    function drawBackground(R) {
      const g = ctx.createLinearGradient(0, 0, 0, CH);
      g.addColorStop(0, R.reg.sky[0]); g.addColorStop(1, R.reg.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      R.deco.forEach((d) => {
        const p = toScreen(d, R.fit);
        if (p.x < -20 || p.x > CW + 20 || p.y < -20 || p.y > CH + 20) return;
        const s = d.s * R.fit.scale * 22;
        if (R.reg.deco === "neon") {
          ctx.fillStyle = d.seed > 0.5 ? "#232840" : "#1b1f34";
          ctx.fillRect(p.x - s * 0.35, p.y - s * 1.6, s * 0.7, s * 1.6);
          ctx.fillStyle = R.reg.accent;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(p.x - s * 0.35, p.y - s * 1.6, s * 0.7, 3);
          ctx.globalAlpha = 1;
        } else if (R.reg.deco === "desert") {
          ctx.fillStyle = "#4c7a3f";
          ctx.fillRect(p.x - s * 0.12, p.y - s, s * 0.24, s);
          ctx.fillRect(p.x - s * 0.4, p.y - s * 0.6, s * 0.24, s * 0.4);
          ctx.fillRect(p.x + s * 0.2, p.y - s * 0.75, s * 0.24, s * 0.45);
        } else if (R.reg.deco === "alpine") {
          ctx.fillStyle = "#5a4327";
          ctx.fillRect(p.x - s * 0.06, p.y - s * 0.2, s * 0.12, s * 0.5);
          ctx.fillStyle = "#1d4436";
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.55, p.y - s * 0.2);
          ctx.lineTo(p.x + s * 0.55, p.y - s * 0.2);
          ctx.lineTo(p.x, p.y - s * 1.7);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(238,246,252,0.95)";
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.22, p.y - s * 0.95);
          ctx.lineTo(p.x + s * 0.22, p.y - s * 0.95);
          ctx.lineTo(p.x, p.y - s * 1.7);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = "#2f5b3a";
          ctx.beginPath(); ctx.arc(p.x, p.y - s * 0.6, s * 0.55, 0, 7); ctx.fill();
          ctx.fillStyle = "#5a4327";
          ctx.fillRect(p.x - s * 0.06, p.y - s * 0.2, s * 0.12, s * 0.5);
        }
      });
    }

    function drawTrack(R) {
      const pts = R.track.map((p) => toScreen(p, R.fit));
      const w = R.reg.roadWidth * R.fit.scale;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      const drawPath = () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
      };
      drawPath(); ctx.lineWidth = w + 14; ctx.strokeStyle = R.reg.curb; ctx.stroke();
      drawPath(); ctx.lineWidth = w; ctx.strokeStyle = R.reg.road; ctx.stroke();
      if (R.weather.rain) { // wet sheen
        drawPath(); ctx.lineWidth = w * 0.55; ctx.strokeStyle = "rgba(170,205,255,0.08)"; ctx.stroke();
      }
      drawPath(); ctx.lineWidth = 3; ctx.setLineDash([14, 14]); ctx.strokeStyle = "#ffd23f"; ctx.stroke();
      ctx.setLineDash([]);
      // start line
      const s0 = pts[0], s1 = pts[1] || pts[0];
      const ang = Math.atan2(s1.y - s0.y, s1.x - s0.x) + Math.PI / 2;
      ctx.save(); ctx.translate(s0.x, s0.y); ctx.rotate(ang);
      const half = w / 2;
      for (let i = -half; i < half; i += 8) {
        ctx.fillStyle = ((i / 8) | 0) % 2 === 0 ? "#fff" : "#111";
        ctx.fillRect(i, -4, 8, 8);
      }
      ctx.restore();
    }

    function drawCoins(R) {
      R.coins.forEach((c) => {
        if (c.taken) return;
        const p = toScreen(c, R.fit);
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7);
        ctx.fillStyle = "#ffd23f"; ctx.fill();
        ctx.strokeStyle = "#8a6400"; ctx.lineWidth = 1.5; ctx.stroke();
      });
    }

    function drawNitros(R) {
      R.nitros.forEach((c) => {
        if (c.taken) return;
        const p = toScreen(c, R.fit);
        const pulse = 1 + Math.sin(R.frame * 0.12) * 0.15;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(51,225,237,0.18)";
        ctx.fillRect(-9 * pulse, -9 * pulse, 18 * pulse, 18 * pulse);
        ctx.strokeStyle = "#33e1ed"; ctx.lineWidth = 2;
        ctx.strokeRect(-6.5, -6.5, 13, 13);
        ctx.restore();
        ctx.fillStyle = "#bff6fa";
        ctx.font = `700 ${Math.round(11)}px Inter, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("⚡", p.x, p.y + 0.5);
        ctx.textBaseline = "alphabetic";
      });
    }

    /* translucent best-race ghost */
    function drawGhostCar(car, R) {
      const g = R.ghost;
      if (!g || !g.samples || g.samples.length < 2 || !R.started) return;
      const total = g.samples.length;
      const ef = R.time * 60 / (g.stride || 3);
      const i0 = Math.floor(ef) % total, i1 = (i0 + 1) % total;
      const fr = ef - Math.floor(ef);
      const s0 = g.samples[i0], s1 = g.samples[i1];
      const gx = s0[0] + (s1[0] - s0[0]) * fr;
      const gy = s0[1] + (s1[1] - s0[1]) * fr;
      let ga = s0[2] + normAng(s1[2] - s0[2]) * fr;
      R.ghostPos = { x: gx, y: gy };
      const p = toScreen({ x: gx, y: gy }, R.fit);
      const s = R.fit.scale;
      const L = 34 * s, W = 17 * s;
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.translate(p.x, p.y); ctx.rotate(ga);
      ctx.fillStyle = "#9fd8ff";
      roundRectPath(ctx, -L / 2, -W / 2, L, W, W * 0.3); ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2; ctx.strokeStyle = "#e0f4ff"; ctx.stroke();
      ctx.restore();
    }

    function drawHeadlights(R) {
      if (!R.weather.dark) return;
      const s = R.fit.scale;
      R.cars.forEach((car) => {
        const p = toScreen(car, R.fit);
        const L = 34 * s;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(car.angle);
        const len = L * 3.1, spread = W_CONE(len);
        const grad = ctx.createLinearGradient(L * 0.35, 0, L * 0.35 + len, 0);
        grad.addColorStop(0, "rgba(255,244,200,0.22)");
        grad.addColorStop(1, "rgba(255,244,200,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(L * 0.35, -L * 0.16);
        ctx.lineTo(L * 0.35 + len, -spread);
        ctx.lineTo(L * 0.35 + len, spread);
        ctx.lineTo(L * 0.35, L * 0.16);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      function W_CONE(l) { return l * 0.34; }
    }

    function drawParts(R) {
      R.parts.forEach((pt) => {
        const p = toScreen(pt, R.fit);
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife) * 0.75;
        ctx.fillStyle = `rgb(${pt.col})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, pt.size * R.fit.scale), 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function drawRain(R) {
      ctx.strokeStyle = "rgba(170,205,255,0.32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const seed = i * 137.51;
        const sp = 9 + (i % 5) * 2.4;
        const x = ((seed * 7.31 + R.frame * sp) % (CW + 80)) - 40;
        const y = ((seed * 13.77 + R.frame * (sp + 8)) % (CH + 60)) - 30;
        ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 15);
      }
      ctx.stroke();
      if (R.weather.id === "storm") {
        if (R.lightning > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.20 * (R.lightning / 6)})`;
          ctx.fillRect(0, 0, CW, CH);
          R.lightning--;
        } else if (Math.random() < 0.0045) R.lightning = 6;
      }
    }
    function drawVignette(R) {
      if (!R.weather.dark) return;
      const vg = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.36, CW / 2, CH / 2, CW * 0.72);
      vg.addColorStop(0, "rgba(2,4,14,0)");
      vg.addColorStop(1, "rgba(2,4,14,0.52)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
    }
    function drawSpeedLines(R) {
      const p1 = R.players[0];
      const sp01 = Math.min(1, Math.abs(p1.speed) / (p1.stats.top * R.weather.speedMul));
      const boosting = p1.boostTime > 0 || p1.nitroTime > 0;
      if (!(sp01 > 0.82 || boosting)) return;
      const inten = boosting ? 0.55 : (sp01 - 0.82) * 2.4;
      ctx.save();
      ctx.translate(CW / 2, CH / 2);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + R.frame * 0.017;
        const r0 = 250 + ((i * 53 + R.frame * 9) % 60);
        const r1 = r0 + 70 + ((i * 31) % 50);
        ctx.globalAlpha = inten * 0.30;
        ctx.strokeStyle = "#dfe9ff"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawMinimap(R) {
      const mw = 158, mh = 112, mx = CW - mw - 12, my = 12;
      ctx.save();
      ctx.globalAlpha = 0.92;
      roundRectPath(ctx, mx, my, mw, mh, 10);
      ctx.fillStyle = "rgba(10,12,18,0.74)"; ctx.fill();
      ctx.strokeStyle = COLORS_UI.line; ctx.lineWidth = 1; ctx.stroke();
      const b = R.mmBounds, pad = 12;
      const sx = (mw - 2 * pad) / (b.maxX - b.minX), sy = (mh - 2 * pad) / (b.maxY - b.minY);
      const sc = Math.min(sx, sy);
      const ox = (mw - (b.maxX - b.minX) * sc) / 2, oy = (mh - (b.maxY - b.minY) * sc) / 2;
      const mp = (p) => [mx + ox + (p.x - b.minX) * sc, my + oy + (p.y - b.minY) * sc];
      ctx.beginPath();
      R.track.forEach((p, i) => { const X = mp(p); i === 0 ? ctx.moveTo(X[0], X[1]) : ctx.lineTo(X[0], X[1]); });
      ctx.closePath();
      ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.strokeStyle = "#39445c"; ctx.stroke();
      if (R.ghostPos) {
        const [gx, gy] = mp(R.ghostPos);
        ctx.beginPath(); ctx.arc(gx, gy, 3, 0, 7);
        ctx.strokeStyle = "rgba(160,220,255,0.85)"; ctx.lineWidth = 1.4; ctx.stroke();
      }
      R.cars.forEach((c) => {
        const [cx, cy] = mp(c);
        ctx.beginPath(); ctx.arc(cx, cy, c.isPlayer ? 3.6 : 2.4, 0, 7);
        ctx.fillStyle = !c.isPlayer ? "#8a93a6" : (c.label === "P2" ? COLORS_UI.green : COLORS_UI.amber);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawOverlays(R) {
      /* countdown */
      if (!R.started) {
        const n = Math.min(3, Math.ceil(R.countdown));
        ctx.textAlign = "center";
        ctx.font = `700 110px Oswald, sans-serif`;
        ctx.fillStyle = n === 1 ? COLORS_UI.green : COLORS_UI.amber;
        ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 18;
        ctx.fillText(String(n), CW / 2, CH / 2 + 40);
        ctx.shadowBlur = 0;
        ctx.font = `600 15px Inter, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        const hint = mode === "multiplayer" ? "P1: WASD+E+Q    P2: Arrows+.+/" : "Hold SHIFT while turning to drift · SPACE for nitro";
        ctx.fillText(hint, CW / 2, CH / 2 + 78);
      } else if (R.flashT > 0) {
        R.flashT--;
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.min(1, R.flashT / 18);
        ctx.font = `700 44px Oswald, sans-serif`;
        ctx.fillStyle = R.flashText === "NITRO!" ? "#33e1ed" : COLORS_UI.amber;
        ctx.fillText(R.flashText, CW / 2, CH / 2 - 90);
        ctx.globalAlpha = 1;
      }
    }

    function drawCar(car, R) {
      const p = toScreen(car, R.fit);
      const s = R.fit.scale;
      const L = 34 * s, W = 17 * s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = car.tyreColor;
      const tw = W * 0.22, tl = L * 0.3;
      [[-L * 0.3, -W * 0.55], [-L * 0.3, W * 0.55 - tw], [L * 0.26, -W * 0.55], [L * 0.26, W * 0.55 - tw]].forEach(([tx, ty]) => {
        ctx.fillRect(tx - tl / 2, ty, tl, tw);
      });
      ctx.fillStyle = car.paint;
      roundRectPath(ctx, -L / 2, -W / 2, L, W, W * 0.3);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 1.1); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.stroke();
      ctx.fillStyle = "rgba(18,22,32,0.85)";
      roundRectPath(ctx, -L * 0.04, -W * 0.34, L * 0.32, W * 0.68, W * 0.16);
      ctx.fill();
      if (car.spoiler) { ctx.fillStyle = "#161616"; ctx.fillRect(-L * 0.52, -W * 0.5, 3 * s, W); }
      ctx.fillStyle = "#fff7c9";
      ctx.beginPath(); ctx.arc(L * 0.45, -W * 0.26, 1.6 * s, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(L * 0.45, W * 0.26, 1.6 * s, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = car.isPlayer ? "#fff" : "rgba(255,255,255,0.75)";
      ctx.font = `700 12px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(car.label, p.x, p.y - 15 * s - 5);
    }

    function endRace(R) {
      R.running = false;
      cancelAnimationFrame(raf);
      AudioSys.setDrifting(false);
      AudioSys.stopEngine();

      const ranking = [...R.cars].sort((a, b) => b.progress - a.progress);
      const rankOf = (label) => ranking.findIndex((c) => c.label === label) + 1;
      const player = R.players[0];
      const posP1 = rankOf(player.label);
      const won = posP1 === 1;

      const rewardsTable = [600, 350, 180, 60];
      let dollars = rewardsTable[Math.min(posP1 - 1, rewardsTable.length - 1)] || 20;
      let coinsEarned = R.raceCoins * 5;

      /* mission / daily goal check */
      let missionResult = null;
      if (activeMission) {
        const g = activeMission.goal;
        let success = false;
        if (g.type === "position") success = posP1 <= g.value;
        else if (g.type === "coins") success = R.raceCoins >= g.value;
        else if (g.type === "time") success = R.time <= g.value;
        else if (g.type === "drifts") success = R.driftsThisRace >= g.value;
        missionResult = { success, mission: activeMission };
        if (success) { dollars += activeMission.rewardD; coinsEarned += activeMission.rewardC; }
      }

      /* lifetime stats */
      const st = {
        ...save.stats,
        races: save.stats.races + 1,
        wins: save.stats.wins + (won ? 1 : 0),
        totalCoins: save.stats.totalCoins + R.raceCoins,
        totalDrifts: save.stats.totalDrifts + R.driftsThisRace,
        longestDriftMs: Math.max(save.stats.longestDriftMs || 0, R.longestDriftMs || 0),
        nitroUses: save.stats.nitroUses + (R.nitroUses || 0),
      };
      if (won) {
        st.winsByRegion = { ...(st.winsByRegion || {}) };
        st.winsByRegion[region] = (st.winsByRegion[region] || 0) + 1;
      }

      /* XP for every human car */
      const baseXp = Math.round(45 + (ranking.length - posP1) * 16 + R.raceCoins * 3 + (missionResult && missionResult.success ? 55 : 0));
      const xpGains = [];
      const carXp = { ...save.carXp };
      R.players.forEach((pl) => {
        if (!pl.carId) return;
        const before = levelFromXp(carXp[pl.carId] || 0);
        const gain = pl.label === "P2" ? Math.round(baseXp * 0.6) : baseXp;
        carXp[pl.carId] = (carXp[pl.carId] || 0) + gain;
        const after = levelFromXp(carXp[pl.carId]);
        xpGains.push({ label: pl.label, carName: byId(CARS, pl.carId).name, gain, levelUp: after.level > before.level ? after.level : null });
      });

      /* local leaderboards + best lap + ghost (solo modes) */
      const newRecords = [];
      let newBestLap = false, newGhost = false;
      const records = { ...(save.records || {}) };
      const bestLaps = { ...(save.bestLaps || {}) };
      const ghosts = { ...(save.ghosts || {}) };
      if (mode !== "multiplayer") {
        const arr = [...(records[region] || [])];
        const entry = { time: +R.time.toFixed(2), laps: R.laps, car: byId(CARS, player.carId).name, date: todayKey() };
        arr.push(entry);
        arr.sort((a, b) => a.time - b.time);
        records[region] = arr.slice(0, 5);
        if (records[region].indexOf(entry) !== -1) newRecords.push({ time: entry.time, laps: entry.laps });

        if (R.bestLap && (!bestLaps[region] || R.bestLap < bestLaps[region])) {
          bestLaps[region] = +R.bestLap.toFixed(2);
          newBestLap = true;
        }
        if (save.ghostOn && R.recArr && R.recArr.length > 60 && (!ghosts[region] || R.time < ghosts[region].time)) {
          ghosts[region] = {
            time: +R.time.toFixed(2), laps: R.laps, stride: GHOST_STRIDE,
            samples: R.recArr.filter((_, i) => i % GHOST_STRIDE === 0)
              .map(([x, y, a]) => [Math.round(x), Math.round(y), +a.toFixed(2)]),
          };
          newGhost = true;
        }
      }

      /* assemble & persist */
      let next = {
        ...save,
        dollars: save.dollars + dollars,
        coins: save.coins + coinsEarned,
        missionsCompleted:
          missionResult && missionResult.success && !activeMission.daily && !save.missionsCompleted.includes(activeMission.id)
            ? [...save.missionsCompleted, activeMission.id]
            : save.missionsCompleted,
        stats: st,
        carXp,
        records, bestLaps, ghosts,
      };
      const dailySuccess = !!(missionResult && missionResult.success && activeMission.daily);
      if (dailySuccess) next.dailyDone = todayKey();

      /* hidden car: finishing all missions unlocks Apex X */
      let unlockedApex = false;
      if (MISSIONS.every((m) => next.missionsCompleted.includes(m.id)) && !next.ownedCars.includes("apexx")) {
        next = { ...next, ownedCars: [...next.ownedCars, "apexx"] };
        unlockedApex = true;
        showToast("👽 Hidden car unlocked: APEX X!");
      }
      next = checkAchievements(next);
      persist(next);

      setResult({
        ranking: ranking.map((c) => ({ label: c.label, isPlayer: c.isPlayer, ai: c.id === "ai" })),
        posP1, time: R.time, raceCoins: R.raceCoins, dollars, coinsEarned, missionResult,
        multiplayer: mode === "multiplayer",
        posP2: mode === "multiplayer" ? rankOf("P2") : null,
        weather: R.weather, bestLap: R.bestLap, newBestLap, newRecords, newGhost, xpGains,
        daily: activeMission && activeMission.daily ? { success: missionResult.success, claimed: dailySuccess } : null,
        unlockedApex,
      });
      setScreen("result");
    }

    function padState(gp) {
      if (!gp) return null;
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
      return {
        up: b(7) || b(0) || b(12),
        down: b(6) || b(13),
        left: (gp.axes[0] < -0.35) || b(14),
        right: (gp.axes[0] > 0.35) || b(15),
        drift: b(4),
        nitro: b(5),
      };
    }

    function loop() {
      const R = raceRef.current;
      if (!R || !R.running) return;
      /* re-acquire the live canvas in case the screen subtree was re-created */
      const live = canvasRef.current;
      if (live !== canvas) {
        canvas = live;
        ctx = live ? live.getContext("2d") : null;
      }
      if (!ctx) { raf = requestAnimationFrame(loop); return; }
      R.frame++;
      if (R.thudCd > 0) R.thudCd--;
      const k = keysRef.current;
      const t1 = touchRef.current.p1 || {};
      const gp = mode === "multiplayer" ? null : padState(navigator.getGamepads ? navigator.getGamepads()[0] : null);
      const p1 = R.players[0];

      /* countdown */
      if (!R.started) {
        R.countdown -= 1 / 60;
        const n = Math.min(3, Math.ceil(R.countdown));
        if (n !== R.lastCountShown) { R.lastCountShown = n; if (n >= 1 && n <= 3) AudioSys.beep(false); }
        if (R.countdown <= 0) {
          R.started = true;
          R.flashText = "GO!"; R.flashT = 44;
          R.lapStartT = 0;
          AudioSys.beep(true);
        }
      }

      if (R.started) {
        R.time += 1 / 60;

        if (mode === "multiplayer") {
          stepPlayer(R.players[0], { up: k["w"], down: k["s"], left: k["a"], right: k["d"], drift: k["e"] || k["ShiftLeft"], nitro: k["q"] }, R);
          stepPlayer(R.players[1], { up: k["arrowup"], down: k["arrowdown"], left: k["arrowleft"], right: k["arrowright"], drift: k["."] || k["ShiftRight"], nitro: k["/"] }, R);
        } else {
          stepPlayer(p1, {
            up: k["w"] || k["arrowup"] || t1.up || (gp && gp.up),
            down: k["s"] || k["arrowdown"] || t1.down || (gp && gp.down),
            left: k["a"] || k["arrowleft"] || t1.left || (gp && gp.left),
            right: k["d"] || k["arrowright"] || t1.right || (gp && gp.right),
            drift: k["shift"] || t1.drift || (gp && gp.drift),
            nitro: k[" "] || t1.nitro || (gp && gp.nitro),
          }, R);
        }

        const baseline = R.players.reduce((a, c) => a + c.stats.top, 0) / R.players.length;
        R.cars.forEach((c) => { if (c.id === "ai") stepAI(c, R, baseline); });
        resolveCollisions(R);

        /* record P1 path for ghost replay */
        if (R.recArr) R.recArr.push([p1.x, p1.y, p1.angle]);

        /* pickups */
        R.players.forEach((pl) => {
          R.coins.forEach((c) => {
            if (!c.taken && dist(pl.x, pl.y, c.x, c.y) < 22) { c.taken = true; R.raceCoins++; AudioSys.coin(); }
          });
          R.nitros.forEach((c) => {
            if (!c.taken && dist(pl.x, pl.y, c.x, c.y) < 24) {
              c.taken = true;
              pl.nitroStock = Math.min(3, pl.nitroStock + 1);
              R.flashText = "+1 NITRO"; R.flashT = 34;
              AudioSys.nitroPickup();
            }
          });
        });

        updateParts(R);
      }

      /* engine audio follows P1 */
      const sp01 = Math.min(1, Math.abs(p1.speed) / Math.max(0.001, p1.stats.top * R.weather.speedMul));
      AudioSys.updateEngine(sp01 * (R.started ? 1 : 0.22), p1.offTrack);
      AudioSys.setDrifting(R.started && !!p1.drifting);

      /* ---------- draw ---------- */
      drawBackground(R);
      ctx.save();
      if (R.shake > 0.08) {
        ctx.translate((Math.random() - 0.5) * R.shake * 2, (Math.random() - 0.5) * R.shake * 2);
        R.shake *= 0.87;
      } else R.shake = 0;
      drawTrack(R);
      drawCoins(R);
      drawNitros(R);
      drawHeadlights(R);
      drawGhostCar(p1, R);
      [...R.cars].sort((a, b) => a.y - b.y).forEach((c) => drawCar(c, R));
      drawParts(R);
      ctx.restore();
      drawRain(R);
      drawVignette(R);
      drawSpeedLines(R);
      drawMinimap(R);
      drawOverlays(R);

      /* finish check */
      const finisher = R.players.find((p) => p.lap >= R.laps);
      if (finisher && !R.finished) { R.finished = true; endRace(R); return; }

      if (R.frame % 6 === 0) {
        const ranking = [...R.cars].sort((a, b) => b.progress - a.progress);
        const pos1 = ranking.findIndex((c) => c.label === R.players[0].label) + 1;
        setHud({
          lap: Math.min(R.players[0].lap + 1, R.laps), laps: R.laps,
          pos: pos1, total: R.cars.length,
          time: R.time, coins: R.raceCoins,
          speed: Math.max(0, R.players[0].speed),
          maxSpeed: p1.stats.top * R.weather.speedMul,
          offTrack: R.players[0].offTrack,
          multi: mode === "multiplayer",
          pos2: mode === "multiplayer" ? ranking.findIndex((c) => c.label === "P2") + 1 : null,
          driftCharge: Math.round(p1.driftCharge),
          drifting: p1.drifting,
          boostActive: p1.boostTime > 0,
          nitroStock: p1.nitroStock,
          nitroActive: p1.nitroTime > 0,
          weather: R.weather.icon + " " + R.weather.label,
          bestLap: R.bestLap,
          started: R.started,
        });
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      AudioSys.stopEngine();
      AudioSys.setDrifting(false);
      if (raceRef.current) raceRef.current.running = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function quitRace() {
    if (raceRef.current) raceRef.current.running = false;
    setScreen("menu");
  }

  /* ============================ UI ============================ */
  const fontDisplay = { fontFamily: "'Oswald', sans-serif" };
  const fontBody = { fontFamily: "'Inter', sans-serif" };

  function CurrencyBadge() {
    return (
      <div className="flex gap-2">
        <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.line}` }}>
          <span style={{ color: COLORS_UI.amber }}>$</span>
          <span style={{ ...fontBody, color: COLORS_UI.text, fontWeight: 600 }}>{save.dollars}</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.line}` }}>
          <span style={{ color: "#ffd23f" }}>●</span>
          <span style={{ ...fontBody, color: COLORS_UI.text, fontWeight: 600 }}>{save.coins}</span>
        </div>
      </div>
    );
  }

  function Shell({ children, title, sub, back }) {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(180deg, ${COLORS_UI.bg0}, ${COLORS_UI.bg1})`, minHeight: "100%" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${COLORS_UI.line}` }}>
          <div className="flex items-center gap-3">
            {back && (
              <button onClick={back} className="px-2 py-1 rounded" style={{ ...fontBody, color: COLORS_UI.sub, border: `1px solid ${COLORS_UI.line}` }}>
                ← Back
              </button>
            )}
            <div>
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{title}</div>
              {sub && <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{sub}</div>}
            </div>
          </div>
          <CurrencyBadge />
        </div>
        <div className="flex-1 overflow-auto px-5 py-5">{children}</div>
        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.amber}`, ...fontBody, color: COLORS_UI.text, fontSize: 13 }}>
            {toast}
          </div>
        )}
      </div>
    );
  }

  /* ---- MENU ---- */
  function MenuScreen() {
    const items = [
      { id: "multiplayer", label: "Multiplayer", sub: "2 players, same device", icon: "◧◨" },
      { id: "offline", label: "Offline", sub: "Race vs 3 AI drivers", icon: "▲" },
      { id: "mission", label: "Mission", sub: "Career objectives", icon: "★" },
      { id: "garage", label: "Garage", sub: "Cars & customization", icon: "⚙" },
      { id: "trophy", label: "Trophies", sub: `${save.achievements.length}/${ACHIEVEMENTS.length} unlocked`, icon: "🏆" },
      { id: "records", label: "Records", sub: "Local leaderboards", icon: "⏱" },
      { id: "howto", label: "How To Play", sub: "Controls & rules", icon: "?" },
    ];
    return (
      <div className="w-full h-full flex flex-col items-center justify-center relative overflow-auto py-8" style={{ background: `radial-gradient(ellipse at 50% -10%, #1a2035, ${COLORS_UI.bg0} 60%)` }}>
        <div className="absolute top-5 right-5"><CurrencyBadge /></div>
        <div className="absolute inset-0" style={{
          background: "repeating-linear-gradient(115deg, rgba(255,176,32,0.05) 0px, rgba(255,176,32,0.05) 2px, transparent 2px, transparent 60px)"
        }} />
        <div className="relative z-10 mb-6 text-center">
          <div style={{ ...fontDisplay, fontSize: 56, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1 }}>
            <span style={{ color: COLORS_UI.amber }}>Apex</span>{" "}
            <span style={{ color: COLORS_UI.cyan }}>Drift</span>
          </div>
          <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 13, marginTop: 6, letterSpacing: 3, textTransform: "uppercase" }}>
            Arcade Racer — Asia · American · European · Nordic
          </div>
        </div>

        {/* daily challenge */}
        <button onClick={pickDaily} className="relative z-10 w-full max-w-xl px-4 mb-4 rounded-xl text-left hover:scale-[1.01] transition-transform"
          style={{ background: dailyDone ? COLORS_UI.panel : COLORS_UI.panel2, border: `1px solid ${dailyDone ? COLORS_UI.line : COLORS_UI.green}`, opacity: 1 }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16 }}>📅</span>
                <span style={{ ...fontDisplay, color: dailyDone ? COLORS_UI.sub : COLORS_UI.text, fontSize: 15, letterSpacing: 1, textTransform: "uppercase" }}>Daily Challenge</span>
              </div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12, marginTop: 3 }}>{dailyMission.desc}</div>
            </div>
            {dailyDone ? (
              <span style={{ color: COLORS_UI.green, fontSize: 12, ...fontBody }}>✓ Claimed</span>
            ) : (
              <span className="flex gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.bg0, color: COLORS_UI.amber }}>+${dailyMission.rewardD}</span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.bg0, color: "#ffd23f" }}>+{dailyMission.rewardC}●</span>
              </span>
            )}
          </div>
        </button>

        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl px-6">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                if (it.id === "garage") setScreen("garage");
                else if (it.id === "howto") setScreen("howto");
                else if (it.id === "trophy") setScreen("trophy");
                else if (it.id === "records") setScreen("records");
                else openMode(it.id);
              }}
              className={`text-left p-3 rounded-xl transition-transform hover:scale-[1.02] ${it.id === "howto" || it.id === "trophy" || it.id === "records" ? "" : ""}`}
              style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}
            >
              <div className="flex items-center justify-between">
                <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 15, letterSpacing: 1, textTransform: "uppercase" }}>{it.label}</div>
                <div style={{ color: COLORS_UI.amber, fontSize: 15 }}>{it.icon}</div>
              </div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 10, marginTop: 3 }}>{it.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, marginTop: 24 }}>Progress saves automatically on this device</div>
      </div>
    );
  }

  function HowToScreen() {
    const rows = [
      ["Accelerate / Brake", "W or ↑  ·  S or ↓"],
      ["Steer", "A/D or ← →"],
      ["Drift (hold)", "SHIFT — hold while turning to slide & charge"],
      ["Nitro", "SPACE — uses 1 ⚡ stock (grab ⚡ canisters on track)"],
      ["Multiplayer", "P1: WASD + E (drift) + Q (nitro) · P2: Arrows + . (drift) + / (nitro)"],
      ["Gamepad", "Left stick steer · RT/A gas · LT brake · LB drift · RB nitro"],
      ["Coins", "Gold coins = bonus currency · ⚡ canisters = +1 nitro stock"],
      ["Dollars", "Earned from race position — spend on new cars"],
      ["Off-track", "Grass/sand slows you down; rain and ice reduce grip further"],
    ];
    const tips = [
      ["🌀 Drift Boost", "Release SHIFT after a charged drift for a speed burst. Longer slides = bigger boost."],
      ["🌧 Weather", "Every race rolls a weather variant: night races have headlights, rain cuts grip. Watch the HUD chip."],
      ["👻 Ghost", "Your best full race per region is recorded — race against it any time (toggle on car select)."],
      ["⏱ Records", "Top-5 race times per region are saved locally under Records."],
      ["📈 Car XP", "Cars earn XP every race and gain small permanent stat bonuses up to level 10."],
    ];
    return (
      <Shell title="How To Play" back={() => setScreen("menu")}>
        <div className="max-w-xl mx-auto flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
              <div style={{ ...fontBody, color: COLORS_UI.text, fontWeight: 600, fontSize: 14 }}>{r[0]}</div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 13, textAlign: "right" }}>{r[1]}</div>
            </div>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            {tips.map((t, i) => (
              <div key={i} className="px-4 py-3 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.amber}` }}>
                <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 13 }}>
                  <b style={{ color: COLORS_UI.amber }}>{t[0]}</b> — {t[1]}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.line}` }}>
            <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 13 }}>
              Regions: <b style={{ color: COLORS_UI.cyan }}>Asia</b> (technical neon nights), <b style={{ color: COLORS_UI.amber }}>American</b> (fast oval),
              <b style={{ color: "#7CFC9A" }}> European</b> (balanced grand circuit), <b style={{ color: "#9fe0ff" }}>Nordic</b> (icy low-grip fjord ring).
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  function RegionSelect() {
    return (
      <Shell title={mode === "multiplayer" ? "Multiplayer — Choose Region" : "Offline — Choose Region"} back={() => setScreen("menu")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {Object.values(REGIONS).map((r) => (
            <button key={r.key} onClick={() => pickRegion(r.key)} className="rounded-xl overflow-hidden text-left hover:scale-[1.02] transition-transform" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
              <div style={{ height: 110, background: `linear-gradient(160deg, ${r.sky[0]}, ${r.sky[1]})` }} className="flex items-center justify-center">
                <TrackThumb region={r} />
              </div>
              <div className="p-3">
                <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 18, textTransform: "uppercase" }}>{r.name}</div>
                <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{r.sub}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: r.accent, border: `1px solid ${r.accent}` }}>{r.tag}</span>
                  {(r.weathers || []).slice(0, 3).filter((w, i, a) => a.indexOf(w) === i).map((w) => (
                    <span key={w} className="inline-block px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: COLORS_UI.sub }}>
                      {WEATHERS[w] ? WEATHERS[w].icon : "☀"}
                    </span>
                  ))}
                </div>
                <div style={{ ...fontBody, color: COLORS_UI.green, fontSize: 10, marginTop: 6 }}>
                  {save.bestLaps && save.bestLaps[r.key] ? "Best lap " + fmtTime(save.bestLaps[r.key]) : "No best lap yet"}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, textAlign: "center", marginTop: 14 }}>
          Weather rolls randomly each race — night races run on headlights, rain and storms cut grip.
        </div>
      </Shell>
    );
  }

  function TrackThumb({ region }) {
    const pts = region.gen();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = 140, h = 80, pad = 10;
    const sx = (w - 2 * pad) / (maxX - minX), sy = (h - 2 * pad) / (maxY - minY);
    const s = Math.min(sx, sy);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${((p.x - minX) * s + pad).toFixed(1)} ${((p.y - minY) * s + pad).toFixed(1)}`).join(" ") + " Z";
    return (
      <svg width={w} height={h}>
        <path d={d} fill="none" stroke={region.accent} strokeWidth={6} strokeLinejoin="round" opacity={0.9} />
      </svg>
    );
  }

  function MissionList() {
    return (
      <Shell title="Mission Mode" sub="Complete objectives to earn bonus rewards" back={() => setScreen("menu")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {MISSIONS.map((m) => {
            const done = save.missionsCompleted.includes(m.id);
            const reg = REGIONS[m.region];
            return (
              <button key={m.id} onClick={() => pickMission(m)} className="text-left p-4 rounded-xl hover:scale-[1.01] transition-transform" style={{ background: COLORS_UI.panel, border: `1px solid ${done ? COLORS_UI.green : COLORS_UI.line}` }}>
                <div className="flex justify-between items-center">
                  <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 17, textTransform: "uppercase" }}>{m.title}</div>
                  {done && <span style={{ color: COLORS_UI.green, fontSize: 12, ...fontBody }}>✓ Complete</span>}
                </div>
                <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12, marginTop: 4 }}>{m.desc}</div>
                <div className="flex gap-2 mt-3">
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: reg.accent, border: `1px solid ${reg.accent}` }}>{reg.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: COLORS_UI.amber }}>+${m.rewardD}</span>
                  {m.rewardC > 0 && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: "#ffd23f" }}>+{m.rewardC} coins</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Shell>
    );
  }

  function StatBar({ label, value, max = 5 }) {
    return (
      <div className="flex items-center gap-2">
        <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, width: 64 }}>{label}</div>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: COLORS_UI.panel2 }}>
          <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: COLORS_UI.amber }} />
        </div>
      </div>
    );
  }

  function CarSelect() {
    const visibleCars = CARS.filter((c) => !c.hidden || save.ownedCars.includes(c.id));
    return (
      <Shell title="Choose Your Car" sub={REGIONS[region].name + " — " + REGIONS[region].sub} back={() => setScreen(activeMission && !activeMission.daily ? "missionList" : activeMission ? "menu" : "regionSelect")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {visibleCars.map((c) => {
            const owned = save.ownedCars.includes(c.id);
            const selected = save.selectedCar === c.id;
            const loadout = save.loadouts[c.id] || { bodykit: "stock", tyre: "standard", paint: "white" };
            const xp = (save.carXp && save.carXp[c.id]) || 0;
            const lv = levelFromXp(xp);
            const stats = computeStats(c, loadout.bodykit, loadout.tyre, lv.level);
            return (
              <div key={c.id} className="p-4 rounded-xl" style={{ background: COLORS_UI.panel, border: `1px solid ${selected ? COLORS_UI.amber : c.hidden ? COLORS_UI.cyan : COLORS_UI.line}` }}>
                <div className="flex items-center justify-center h-16 mb-2 relative">
                  <svg width="90" height="46"><rect x="8" y="12" width="74" height="24" rx="10" fill={byId(PAINTS, loadout.paint).hex} stroke="#0006" /><rect x="30" y="16" width="24" height="14" rx="5" fill="#1a1e28" /></svg>
                  {owned && (
                    <span className="absolute top-0 right-0 px-2 py-0.5 rounded-full" style={{ ...fontBody, fontSize: 10, background: COLORS_UI.panel2, color: lv.level >= MAX_LEVEL ? COLORS_UI.green : COLORS_UI.sub, border: `1px solid ${COLORS_UI.line}` }}>
                      Lv {lv.level}{lv.level >= MAX_LEVEL ? " MAX" : ""}
                    </span>
                  )}
                  {c.hidden && <span className="absolute bottom-0 right-0" style={{ fontSize: 14 }}>👽</span>}
                </div>
                <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 17, textTransform: "uppercase" }}>{c.name}</div>
                <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, marginBottom: 8 }}>{c.tag}</div>
                <div className="flex flex-col gap-1 mb-3">
                  <StatBar label="Top Speed" value={stats.top} max={4.6} />
                  <StatBar label="Accel" value={stats.accel * 60} max={4.8} />
                  <StatBar label="Handling" value={stats.handling * 60} max={5.4} />
                </div>
                {owned ? (
                  <button onClick={() => persist({ ...save, selectedCar: c.id })} className="w-full py-2 rounded-lg" style={{ ...fontBody, fontWeight: 700, fontSize: 13, background: selected ? COLORS_UI.amber : COLORS_UI.panel2, color: selected ? "#1a1200" : COLORS_UI.text }}>
                    {selected ? "Selected" : "Select"}
                  </button>
                ) : (
                  <button onClick={() => buyCar(c.id)} className="w-full py-2 rounded-lg" style={{ ...fontBody, fontWeight: 700, fontSize: 13, background: COLORS_UI.panel2, color: COLORS_UI.amber, border: `1px solid ${COLORS_UI.amber}` }}>
                    Buy — ${c.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="max-w-4xl mx-auto mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => persist({ ...save, ghostOn: !save.ghostOn })} className="px-4 py-2 rounded-lg"
            style={{ ...fontBody, fontSize: 12, color: save.ghostOn ? COLORS_UI.green : COLORS_UI.sub, border: `1px solid ${save.ghostOn ? COLORS_UI.green : COLORS_UI.line}`, background: COLORS_UI.panel }}>
            👻 Ghost rival: {save.ghostOn ? "ON" : "OFF"}
          </button>
          <button onClick={startRace} className="px-8 py-3 rounded-xl" style={{ ...fontDisplay, fontSize: 20, textTransform: "uppercase", letterSpacing: 1, background: COLORS_UI.amber, color: "#1a1200" }}>
            Start Race
          </button>
        </div>
        {save.ghostOn && save.ghosts && save.ghosts[region] && (
          <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, textAlign: "center", marginTop: 8 }}>
            Racing your ghost — beat {fmtTime(save.ghosts[region].time)} to set a new one.
          </div>
        )}
      </Shell>
    );
  }

  /* ---- GARAGE ---- */
  function Garage() {
    const car = byId(CARS, garageCarId);
    const loadout = save.loadouts[garageCarId] || { bodykit: "stock", tyre: "standard", paint: "white" };
    const xp = (save.carXp && save.carXp[garageCarId]) || 0;
    const lv = levelFromXp(xp);
    const stats = computeStats(car, loadout.bodykit, loadout.tyre, lv.level);
    return (
      <Shell title="Garage" sub="Customize bodykit, tyres and paint" back={() => setScreen("menu")}>
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {save.ownedCars.map((id) => {
              const c = byId(CARS, id);
              return (
                <button key={id} onClick={() => setGarageCarId(id)} className="px-3 py-2 rounded-lg" style={{ ...fontBody, fontSize: 13, background: garageCarId === id ? COLORS_UI.amber : COLORS_UI.panel, color: garageCarId === id ? "#1a1200" : COLORS_UI.text, border: `1px solid ${COLORS_UI.line}` }}>
                  {c.name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 p-4 rounded-xl flex flex-col items-center" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
              <svg width="200" height="110">
                <rect x="20" y="35" width="160" height="46" rx="20" fill={byId(PAINTS, loadout.paint).hex} stroke="#0007" />
                <rect x="66" y="42" width="60" height="30" rx="10" fill="#161a24" />
                {byId(BODYKITS, loadout.bodykit).spoiler && <rect x="10" y="30" width="8" height="46" fill="#161616" />}
                <rect x="24" y="30" width="20" height="9" fill={byId(TYRES, loadout.tyre).color} />
                <rect x="24" y="80" width="20" height="9" fill={byId(TYRES, loadout.tyre).color} />
                <rect x="150" y="30" width="20" height="9" fill={byId(TYRES, loadout.tyre).color} />
                <rect x="150" y="80" width="20" height="9" fill={byId(TYRES, loadout.tyre).color} />
              </svg>
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 18, marginTop: 8 }}>{car.name}</div>
              <div className="w-full mt-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>Driver affinity</span>
                  <span style={{ ...fontBody, color: lv.level >= MAX_LEVEL ? COLORS_UI.green : COLORS_UI.amber, fontSize: 12, fontWeight: 700 }}>
                    Lv {lv.level}{lv.level >= MAX_LEVEL ? " MAX" : ""}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden w-full" style={{ background: COLORS_UI.panel2 }}>
                  <div style={{ width: `${lv.level >= MAX_LEVEL ? 100 : (lv.into / lv.need) * 100}%`, height: "100%", background: lv.level >= MAX_LEVEL ? COLORS_UI.green : COLORS_UI.amber }} />
                </div>
                <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 10, marginTop: 2 }}>
                  {lv.level >= MAX_LEVEL ? "Fully tuned by experience" : `${Math.round(lv.into)}/${lv.need} xp to next level`}
                </div>
              </div>
              <div className="flex flex-col gap-1 w-full mt-3">
                <StatBar label="Top Speed" value={stats.top} max={4.6} />
                <StatBar label="Accel" value={stats.accel * 60} max={4.8} />
                <StatBar label="Handling" value={stats.handling * 60} max={5.4} />
                <StatBar label="Grip" value={stats.grip} max={1.6} />
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-4">
              <PartSection title="Bodykit" items={BODYKITS} owned={save.ownedBodykits} selectedId={loadout.bodykit}
                onSelect={(id) => setLoadout(garageCarId, "bodykit", id)}
                onBuy={(id, price) => buyPart(BODYKITS, "ownedBodykits", id, price)} />
              <PartSection title="Tyres" items={TYRES} owned={save.ownedTyres} selectedId={loadout.tyre}
                onSelect={(id) => setLoadout(garageCarId, "tyre", id)}
                onBuy={(id, price) => buyPart(TYRES, "ownedTyres", id, price)} />
              <div>
                <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 15, textTransform: "uppercase", marginBottom: 6 }}>Paint</div>
                <div className="flex flex-wrap gap-2">
                  {PAINTS.map((p) => {
                    const owned = save.ownedPaints.includes(p.id);
                    const sel = loadout.paint === p.id;
                    return (
                      <button key={p.id} onClick={() => (owned ? setLoadout(garageCarId, "paint", p.id) : buyPart(PAINTS, "ownedPaints", p.id, p.price))}
                        className="flex flex-col items-center gap-1" title={p.name}>
                        <div style={{ width: 34, height: 34, borderRadius: 999, background: p.hex, border: `2px solid ${sel ? COLORS_UI.amber : "#0006"}`, boxShadow: sel ? `0 0 0 2px ${COLORS_UI.amber}` : "none", position: "relative" }}>
                          {!owned && <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffd23f", fontSize: 9 }}>{p.price}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }
  function PartSection({ title, items, owned, selectedId, onSelect, onBuy }) {
    return (
      <div>
        <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 15, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map((it) => {
            const isOwned = owned.includes(it.id);
            const sel = selectedId === it.id;
            return (
              <button key={it.id} onClick={() => (isOwned ? onSelect(it.id) : onBuy(it.id, it.price))}
                className="p-2 rounded-lg text-left" style={{ background: COLORS_UI.panel, border: `1px solid ${sel ? COLORS_UI.amber : COLORS_UI.line}` }}>
                <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 12, fontWeight: 600 }}>{it.name}</div>
                <div style={{ ...fontBody, color: isOwned ? COLORS_UI.sub : "#ffd23f", fontSize: 11, marginTop: 2 }}>
                  {isOwned ? (sel ? "Equipped" : "Owned") : `${it.price} coins`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---- RACE ---- */
  function toggleSound() {
    const on = !save.soundOn;
    persist({ ...save, soundOn: on });
    AudioSys.ensure();
    AudioSys.setEnabled(on);
  }
  function TouchBtn({ k, label, extra }) {
    const set = (v) => {
      if (!touchRef.current.p1) touchRef.current.p1 = {};
      touchRef.current.p1[k] = v;
    };
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); AudioSys.ensure(); set(true); }}
        onPointerUp={() => set(false)}
        onPointerLeave={() => set(false)}
        onPointerCancel={() => set(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="select-none touch-none flex items-center justify-center rounded-full active:scale-95 transition-transform"
        style={{ width: 62, height: 62, background: "rgba(23,27,36,0.72)", border: `1px solid ${COLORS_UI.line}`, color: COLORS_UI.text, fontSize: 20, fontWeight: 700, backdropFilter: "blur(4px)", ...(extra || {}) }}
      >{label}</button>
    );
  }
  function RaceScreen() {
    return (
      <div className="w-full h-full flex flex-col relative" style={{ background: COLORS_UI.bg0 }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${COLORS_UI.line}` }}>
          <button onClick={quitRace} className="px-3 py-1 rounded" style={{ ...fontBody, color: COLORS_UI.sub, border: `1px solid ${COLORS_UI.line}`, fontSize: 12 }}>Quit</button>
          {hud && (
            <div className="flex gap-4 items-center flex-wrap justify-center" style={fontBody}>
              <span style={{ color: COLORS_UI.text, fontSize: 13 }}>Lap <b style={{ color: COLORS_UI.amber }}>{hud.lap}</b>/{hud.laps}</span>
              <span style={{ color: COLORS_UI.text, fontSize: 13 }}>
                Pos <b style={{ color: COLORS_UI.cyan }}>{hud.pos}</b>/{hud.total}
                {hud.multi && <span style={{ color: COLORS_UI.sub }}> (P2: {hud.pos2})</span>}
              </span>
              <span style={{ color: COLORS_UI.text, fontSize: 13 }}>⏱ {fmtTime(hud.time)}</span>
              {hud.bestLap != null && <span style={{ color: COLORS_UI.sub, fontSize: 12 }}>Best lap {fmtTime(hud.bestLap)}</span>}
              <span style={{ color: "#ffd23f", fontSize: 13 }}>● {hud.coins}</span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.line}`, fontSize: 11, color: COLORS_UI.sub }}>{hud.weather}</span>
              {hud.offTrack && <span style={{ color: COLORS_UI.red, fontSize: 12, fontWeight: 700 }}>OFF TRACK</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={toggleSound} className="px-2 py-1 rounded" title="Toggle sound" style={{ ...fontBody, color: save.soundOn ? COLORS_UI.green : COLORS_UI.red, border: `1px solid ${COLORS_UI.line}`, fontSize: 13 }}>
              {save.soundOn ? "🔊" : "🔇"}
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-2">
          <canvas ref={canvasRef} width={CW} height={CH} style={{ width: "100%", maxWidth: 1000, aspectRatio: `${CW}/${CH}`, borderRadius: 12, border: `1px solid ${COLORS_UI.line}` }} />
          {/* mobile touch controls */}
          {touchDevice && (
            <>
              <div className="absolute left-5 bottom-16 flex gap-2">
                <TouchBtn k="left" label="◀" />
                <TouchBtn k="right" label="▶" />
              </div>
              <div className="absolute right-5 bottom-16 flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <TouchBtn k="drift" label="DRIFT" extra={{ fontSize: 12, borderColor: "#6b4c00" }} />
                  <TouchBtn k="nitro" label="⚡" extra={{ fontSize: 18 }} />
                </div>
                <div className="flex gap-2">
                  <TouchBtn k="down" label="▼" />
                  <TouchBtn k="up" label="▲" />
                </div>
              </div>
            </>
          )}
        </div>
        {hud && (
          <div className="px-4 pb-3">
            <div className="max-w-md mx-auto flex items-center gap-3">
              <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 10, width: 38 }}>SPD</span>
              <div className="h-2 rounded-full overflow-hidden flex-1" style={{ background: COLORS_UI.panel2 }}>
                <div style={{ width: `${Math.min(100, (hud.speed / Math.max(0.001, hud.maxSpeed || 4.4)) * 100)}%`, height: "100%", background: hud.boostActive ? COLORS_UI.amber : COLORS_UI.cyan }} />
              </div>
              <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 10, width: 44 }}>DRIFT</span>
              <div className={`h-2 rounded-full overflow-hidden w-28`} style={{ background: COLORS_UI.panel2 }}>
                <div style={{ width: `${Math.min(100, hud.driftCharge / 1.2)}%`, height: "100%", background: hud.drifting ? COLORS_UI.amber : hud.boostActive ? COLORS_UI.green : "#5a4620", transition: "width 60ms linear" }} />
              </div>
              <span style={{ ...fontBody, fontSize: 12, color: hud.nitroActive ? COLORS_UI.cyan : "#ffd23f", minWidth: 34 }}>
                {"⚡".repeat(hud.nitroStock || 0)}{hud.nitroStock === 0 && <span style={{ color: COLORS_UI.sub }}>—</span>}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---- RESULT ---- */
  function ResultScreen() {
    if (!result) return null;
    const medal = ["🥇", "🥈", "🥉"];
    return (
      <Shell title="Race Result" back={() => setScreen("menu")}>
        <div className="max-w-lg mx-auto flex flex-col gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
            {result.ranking.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: i < result.ranking.length - 1 ? `1px solid ${COLORS_UI.line}` : "none" }}>
                <div style={{ ...fontBody, color: r.isPlayer ? COLORS_UI.amber : COLORS_UI.text, fontWeight: r.isPlayer ? 700 : 500, fontSize: 14 }}>
                  {medal[i] || `${i + 1}.`} {r.label}
                </div>
                {r.isPlayer && <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>YOU</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2 }}>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>Time</div>
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 17 }}>{fmtTime(result.time)}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2 }}>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>Coins Collected</div>
              <div style={{ ...fontDisplay, color: "#ffd23f", fontSize: 17 }}>{result.raceCoins}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2 }}>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>Position</div>
              <div style={{ ...fontDisplay, color: COLORS_UI.cyan, fontSize: 17 }}>#{result.posP1}</div>
            </div>
          </div>

          {(result.bestLap != null || result.weather) && (
            <div className="flex gap-2 justify-center flex-wrap">
              {result.weather && (
                <span className="px-2 py-0.5 rounded-full" style={{ ...fontBody, fontSize: 11, background: COLORS_UI.panel2, color: COLORS_UI.sub }}>{result.weather.icon} {result.weather.label}</span>
              )}
              {result.bestLap != null && (
                <span className="px-2 py-0.5 rounded-full" style={{ ...fontBody, fontSize: 11, background: COLORS_UI.panel2, color: COLORS_UI.sub }}>
                  Best lap this race: {fmtTime(result.bestLap)}
                </span>
              )}
            </div>
          )}

          {result.xpGains && result.xpGains.length > 0 && (
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2 }}>
              {result.xpGains.map((x, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{x.label} · {x.carName}</span>
                  <span className="flex items-center gap-2">
                    <span style={{ ...fontBody, color: COLORS_UI.cyan, fontSize: 12, fontWeight: 700 }}>+{x.gain} xp</span>
                    {x.levelUp && <span className="px-2 py-0.5 rounded-full" style={{ ...fontBody, fontSize: 10, background: COLORS_UI.green, color: "#06281a", fontWeight: 700 }}>LEVEL UP → {x.levelUp}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(result.newRecords.length > 0 || result.newBestLap || result.newGhost) && (
            <div className="p-3 rounded-lg text-center" style={{ background: "rgba(51,225,237,0.08)", border: `1px solid ${COLORS_UI.cyan}` }}>
              <div style={{ ...fontDisplay, color: COLORS_UI.cyan, fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>New Records!</div>
              {result.newRecords.map((r, i) => (
                <div key={i} style={{ ...fontBody, color: COLORS_UI.text, fontSize: 12 }}>🏁 #{i + 1} all-time — {fmtTime(r.time)} ({r.laps} laps)</div>
              ))}
              {result.newBestLap && <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 12 }}>⭕ Fastest lap on this region</div>}
              {result.newGhost && <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 12 }}>👻 New ghost recorded — beat it next time</div>}
            </div>
          )}

          {result.daily && (
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${result.daily.success ? COLORS_UI.green : COLORS_UI.red}` }}>
              <div style={{ ...fontBody, color: result.daily.success ? COLORS_UI.green : COLORS_UI.red, fontWeight: 700, fontSize: 13 }}>
                {result.daily.success ? "Daily Challenge Complete!" : "Daily Challenge Failed"}
              </div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>
                {activeMission.desc}
                {result.daily.success ? " — reward claimed." : " Try again tomorrow or practice in offline mode."}
              </div>
            </div>
          )}

          {result.missionResult && !result.missionResult.mission.daily && (
            <div className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${result.missionResult.success ? COLORS_UI.green : COLORS_UI.red}` }}>
              <div style={{ ...fontBody, color: result.missionResult.success ? COLORS_UI.green : COLORS_UI.red, fontWeight: 700, fontSize: 13 }}>
                {result.missionResult.success ? "Mission Complete!" : "Mission Not Complete"}
              </div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{result.missionResult.mission.desc}</div>
            </div>
          )}
          <div className="p-3 rounded-lg text-center" style={{ background: COLORS_UI.panel2 }}>
            <span style={{ ...fontBody, color: COLORS_UI.amber, fontWeight: 700 }}>+${result.dollars}</span>{" "}
            <span style={{ ...fontBody, color: COLORS_UI.sub }}>and</span>{" "}
            <span style={{ ...fontBody, color: "#ffd23f", fontWeight: 700 }}>+{result.coinsEarned} coins</span>
          </div>
          <div className="flex gap-3">
            <button onClick={startRace} className="flex-1 py-3 rounded-xl" style={{ ...fontDisplay, fontSize: 16, textTransform: "uppercase", background: COLORS_UI.amber, color: "#1a1200" }}>Race Again</button>
            <button onClick={() => setScreen("menu")} className="flex-1 py-3 rounded-xl" style={{ ...fontDisplay, fontSize: 16, textTransform: "uppercase", background: COLORS_UI.panel2, color: COLORS_UI.text, border: `1px solid ${COLORS_UI.line}` }}>Menu</button>
          </div>
        </div>
      </Shell>
    );
  }

  /* ---- TROPHIES ---- */
  function TrophyScreen() {
    return (
      <Shell title="Trophy Case" sub={`${save.achievements.length} of ${ACHIEVEMENTS.length} unlocked`} back={() => setScreen("menu")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {ACHIEVEMENTS.map((a) => {
            const got = save.achievements.includes(a.id);
            return (
              <div key={a.id} className="flex items-center gap-3 p-4 rounded-xl" style={{ background: COLORS_UI.panel, border: `1px solid ${got ? COLORS_UI.amber : COLORS_UI.line}`, opacity: got ? 1 : 0.55 }}>
                <div className="text-2xl" style={{ filter: got ? "none" : "grayscale(1)" }}>{got ? a.icon : "🔒"}</div>
                <div>
                  <div style={{ ...fontDisplay, color: got ? COLORS_UI.text : COLORS_UI.sub, fontSize: 15, textTransform: "uppercase", letterSpacing: 0.5 }}>{a.name}</div>
                  <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{a.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="max-w-3xl mx-auto mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[["Races", save.stats.races], ["Wins", save.stats.wins], ["Total coins", save.stats.totalCoins], ["Longest drift", (save.stats.longestDriftMs / 1000).toFixed(1) + "s"]].map(([l, v]) => (
            <div key={l} className="p-3 rounded-lg" style={{ background: COLORS_UI.panel2 }}>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>{l}</div>
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 16 }}>{v}</div>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  /* ---- RECORDS ---- */
  function RecordsScreen() {
    const regions = Object.values(REGIONS);
    return (
      <Shell title="Records" sub="Local leaderboards — top 5 race times per region" back={() => setScreen("menu")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {regions.map((r) => {
            const recs = (save.records && save.records[r.key]) || [];
            const bl = save.bestLaps && save.bestLaps[r.key];
            return (
              <div key={r.key} className="p-4 rounded-xl" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
                <div className="flex items-center justify-between">
                  <div style={{ ...fontDisplay, color: r.accent, fontSize: 16, textTransform: "uppercase" }}>{r.name}</div>
                  {bl != null && <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>best lap {fmtTime(bl)}</span>}
                </div>
                {recs.length === 0 ? (
                  <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12, marginTop: 8 }}>No times set yet.</div>
                ) : (
                  <div className="mt-2">
                    {recs.map((rec, i) => (
                      <div key={i} className="flex justify-between py-1" style={{ borderBottom: i < recs.length - 1 ? `1px solid ${COLORS_UI.line}` : "none" }}>
                        <span style={{ ...fontBody, color: i === 0 ? COLORS_UI.amber : COLORS_UI.text, fontWeight: i === 0 ? 700 : 400, fontSize: 13 }}>
                          {i + 1}. {fmtTime(rec.time)} <span style={{ color: COLORS_UI.sub, fontSize: 11 }}>({rec.laps} laps)</span>
                        </span>
                        <span style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11 }}>{rec.car} · {rec.date}</span>
                      </div>
                    ))}
                  </div>
                )}
                {save.ghosts && save.ghosts[r.key] && (
                  <div style={{ ...fontBody, color: "#9fd8ff", fontSize: 11, marginTop: 6 }}>👻 Ghost saved — beat {fmtTime(save.ghosts[r.key].time)}</div>
                )}
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  /* ---------------- render ---------------- */
  if (!loaded) {
    return <div className="w-full h-screen flex items-center justify-center" style={{ background: COLORS_UI.bg0, color: COLORS_UI.text, ...fontBody }}>Loading…</div>;
  }

  return (
    <div className="w-full relative" style={{ height: "100vh", background: COLORS_UI.bg0, ...fontBody }}>
      {/* Screens are invoked as plain functions (not <Component/>) so their host
          trees reconcile in place — defining them inside ApexDrift would give
          them a fresh type identity every render and remount the canvas. */}
      {screen === "menu" && MenuScreen()}
      {screen === "howto" && HowToScreen()}
      {screen === "regionSelect" && RegionSelect()}
      {screen === "missionList" && MissionList()}
      {screen === "carSelect" && CarSelect()}
      {screen === "garage" && Garage()}
      {screen === "trophy" && TrophyScreen()}
      {screen === "records" && RecordsScreen()}
      {screen === "race" && RaceScreen()}
      {screen === "result" && ResultScreen()}
    </div>
  );
}
