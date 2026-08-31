import React, { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================
   APEX DRIFT — top-down arcade racer
   Single-file React artifact. Canvas-drawn cars & tracks,
   in-memory + persisted (window.storage) progress.
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

const REGIONS = {
  asia: {
    key: "asia", name: "Asia", sub: "Neo Circuit", tag: "Technical",
    gen: genTechnicalTrack, roadWidth: 88,
    sky: ["#0a0e22", "#181c3d"], road: "#232637", curb: "#e7e7ef",
    accent: "#39e6ff", deco: "neon",
    names: ["Kaito", "Mei", "Ravi", "Suri"],
  },
  american: {
    key: "american", name: "American", sub: "Salt Flat Oval", tag: "Easy",
    gen: genOvalTrack, roadWidth: 148,
    sky: ["#2a1608", "#4d2c10"], road: "#2c2620", curb: "#e9d9b8",
    accent: "#ffb020", deco: "desert",
    names: ["Duke", "Rosa", "Hank", "Billie"],
  },
  european: {
    key: "european", name: "European", sub: "Grand Circuit", tag: "Balanced",
    gen: genRoundedRectTrack, roadWidth: 110,
    sky: ["#0b1a10", "#15301e"], road: "#242a25", curb: "#e8ece6",
    accent: "#7CFC9A", deco: "forest",
    names: ["Hugo", "Lena", "Marco", "Elin"],
  },
};

/* ---------------- cars / parts / colors ---------------- */
const CARS = [
  { id: "starter", name: "Vento GT", tag: "Starter Hatch", price: 0, top: 3.2, accel: 0.050, handling: 0.062, color: "#d8d8d8" },
  { id: "furia", name: "Furia V12", tag: "Italian Icon", price: 1800, top: 3.9, accel: 0.058, handling: 0.058, color: "#e2261c" },
  { id: "toro", name: "Toro Rampante", tag: "Raging Bull", price: 2600, top: 4.1, accel: 0.062, handling: 0.052, color: "#f2c200" },
  { id: "nord", name: "Nordschleife R", tag: "German Precision", price: 3400, top: 4.0, accel: 0.056, handling: 0.070, color: "#1c5fd8" },
  { id: "rising", name: "Rising Sun RX", tag: "Drift King", price: 2200, top: 3.6, accel: 0.066, handling: 0.078, color: "#ff7a1a" },
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

/* ---------------- helpers ---------------- */
const byId = (arr, id) => arr.find((x) => x.id === id) || arr[0];
function computeStats(carDef, bodykitId, tyreId) {
  const kit = byId(BODYKITS, bodykitId);
  const tyre = byId(TYRES, tyreId);
  return {
    top: +(carDef.top + kit.top + tyre.top).toFixed(3),
    accel: carDef.accel,
    handling: +(carDef.handling + kit.handling).toFixed(3),
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
  };
}

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

  const canvasRef = useRef(null);
  const raceRef = useRef(null);
  const keysRef = useRef({});

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
        const r = await window.storage.get("apexdrift_save", false);
        if (r && r.value) {
          const parsed = JSON.parse(r.value);
          setSave({ ...defaultSave(), ...parsed });
        }
      } catch (e) { /* no save yet */ }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setSave(next);
    try { await window.storage.set("apexdrift_save", JSON.stringify(next), false); } catch (e) { /* ignore */ }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  /* ---------------- purchase helpers ---------------- */
  function buyCar(carId) {
    const car = byId(CARS, carId);
    if (save.ownedCars.includes(carId)) return;
    if (save.dollars < car.price) { showToast("Not enough dollars"); return; }
    const next = {
      ...save,
      dollars: save.dollars - car.price,
      ownedCars: [...save.ownedCars, carId],
      loadouts: { ...save.loadouts, [carId]: { bodykit: "stock", tyre: "standard", paint: "white" } },
    };
    persist(next);
    showToast(`${car.name} purchased`);
  }
  function buyPart(list, key, id, price) {
    if (save[key].includes(id)) return;
    if (save.coins < price) { showToast("Not enough coins"); return; }
    persist({ ...save, coins: save.coins - price, [key]: [...save[key], id] });
  }
  function setLoadout(carId, field, value) {
    persist({ ...save, loadouts: { ...save.loadouts, [carId]: { ...save.loadouts[carId], [field]: value } } });
  }

  /* ---------------- navigation ---------------- */
  function openMode(m) {
    setMode(m);
    if (m === "mission") setScreen("missionList");
    else setScreen("regionSelect");
  }
  function pickMission(mission) {
    setActiveMission(mission);
    setMode("mission");
    setRegion(mission.region);
    setScreen("carSelect");
  }
  function pickRegion(r) { setRegion(r); setScreen("carSelect"); }

  /* ---------------- race engine ---------------- */
  function startRace() {
    const reg = REGIONS[region];
    const track = reg.gen();
    const N = track.length;
    const fit = computeFit(track, reg.roadWidth);
    const segLen = trackLength(track) / N;
    const laps = activeMission ? activeMission.laps : 3;

    const start = track[0];
    const dir = Math.atan2(track[1].y - track[0].y, track[1].x - track[0].x);
    const perp = dir + Math.PI / 2;

    function mkCar(carId, laneOffset, isPlayer, label, aiSkill) {
      const carDef = byId(CARS, carId);
      const loadout = save.loadouts[carId] || { bodykit: "stock", tyre: "standard", paint: carDef.color ? "white" : "white" };
      const stats = computeStats(carDef, loadout.bodykit, loadout.tyre);
      const paint = byId(PAINTS, loadout.paint).hex;
      const tyreColor = byId(TYRES, loadout.tyre).color;
      return {
        id: label, isPlayer, label,
        x: start.x + Math.cos(perp) * laneOffset,
        y: start.y + Math.sin(perp) * laneOffset,
        angle: dir, speed: 0, lap: 0, lastIndex: 0, progress: 0,
        offTrack: false, stats, paint, tyreColor, spoiler: stats.spoiler,
        t: 0, aiSkill, lateralPhase: Math.random() * 10,
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
      const pool = CARS.filter((c) => c.id !== save.selectedCar);
      const lanes = [-120, 120, -240];
      reg.names.slice(0, 3).forEach((nm, i) => {
        const cd = pool[i % pool.length];
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

    raceRef.current = {
      running: true, track, N, fit, segLen, reg, laps, cars, players, coins, deco,
      time: 0, raceCoins: 0, frame: 0, finished: false,
    };
    setResult(null);
    setScreen("race");
  }

  /* keyboard */
  useEffect(() => {
    function down(e) { keysRef.current[e.key.toLowerCase()] = true; }
    function up(e) { keysRef.current[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  /* main loop */
  useEffect(() => {
    if (screen !== "race") return;
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function updateProgress(car, N, idx) {
      const diff = idx - car.lastIndex;
      if (diff < -N * 0.6) car.lap += 1;
      else if (diff > N * 0.6) car.lap = Math.max(0, car.lap - 1);
      car.lastIndex = idx;
      car.progress = car.lap * N + idx;
    }

    function stepPlayer(car, up, down, left, right, R) {
      const maxSpeed = car.stats.top * (car.offTrack ? 0.5 : 1);
      if (up) car.speed += car.stats.accel;
      else if (down) car.speed -= car.stats.accel * 1.5;
      else car.speed *= 0.985;
      if (car.offTrack) car.speed *= 0.955;
      car.speed = Math.max(-maxSpeed * 0.45, Math.min(maxSpeed, car.speed));
      const turnFactor = 0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / 1.6);
      const steer = car.stats.handling * turnFactor * (car.speed >= 0 ? 1 : -1);
      if (left) car.angle -= steer;
      if (right) car.angle += steer;
      car.x += Math.cos(car.angle) * car.speed;
      car.y += Math.sin(car.angle) * car.speed;
      const { idx, d } = nearestIndex(R.track, car.x, car.y);
      car.offTrack = d > R.reg.roadWidth / 2 + 6 / Math.max(0.4, car.stats.grip);
      updateProgress(car, R.N, idx);
    }

    function stepAI(car, R, baseline) {
      const speedWorld = baseline * (0.78 + 0.35 * car.aiSkill);
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
      car.x = bx + nx * lateral; car.y = by + ny * lateral;
      car.angle = Math.atan2(dy, dx);
      car.lap = Math.floor(car.t / N);
      car.progress = car.t;
      car.speed = speedWorld;
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
      const ranking = [...R.cars].sort((a, b) => b.progress - a.progress);
      const rankOf = (label) => ranking.findIndex((c) => c.label === label) + 1;
      const player = R.players[0];
      const posP1 = rankOf(player.label);
      const rewardsTable = [600, 350, 180, 60];
      let dollars = rewardsTable[Math.min(posP1 - 1, rewardsTable.length - 1)] || 20;
      let coinsEarned = R.raceCoins * 5;
      let missionResult = null;
      if (activeMission) {
        const g = activeMission.goal;
        let success = false;
        if (g.type === "position") success = posP1 <= g.value;
        else if (g.type === "coins") success = R.raceCoins >= g.value;
        else if (g.type === "time") success = R.time <= g.value;
        missionResult = { success, mission: activeMission };
        if (success) { dollars += activeMission.rewardD; coinsEarned += activeMission.rewardC; }
      }
      const nextSave = {
        ...save,
        dollars: save.dollars + dollars,
        coins: save.coins + coinsEarned,
        missionsCompleted:
          missionResult && missionResult.success && !save.missionsCompleted.includes(activeMission.id)
            ? [...save.missionsCompleted, activeMission.id]
            : save.missionsCompleted,
      };
      persist(nextSave);
      setResult({
        ranking: ranking.map((c) => ({ label: c.label, isPlayer: c.isPlayer, ai: c.id === "ai" })),
        posP1, time: R.time, raceCoins: R.raceCoins, dollars, coinsEarned, missionResult,
        multiplayer: mode === "multiplayer",
        posP2: mode === "multiplayer" ? rankOf("P2") : null,
      });
      setScreen("result");
    }

    function loop() {
      const R = raceRef.current;
      if (!R || !R.running) return;
      R.frame++;
      R.time += 1 / 60;
      const k = keysRef.current;

      if (mode === "multiplayer") {
        const p1 = R.players[0], p2 = R.players[1];
        stepPlayer(p1, k["w"], k["s"], k["a"], k["d"], R);
        stepPlayer(p2, k["arrowup"], k["arrowdown"], k["arrowleft"], k["arrowright"], R);
      } else {
        const p1 = R.players[0];
        const up = k["w"] || k["arrowup"], down = k["s"] || k["arrowdown"];
        const left = k["a"] || k["arrowleft"], right = k["d"] || k["arrowright"];
        stepPlayer(p1, up, down, left, right, R);
      }
      const baseline = R.players.reduce((a, c) => a + c.stats.top, 0) / R.players.length;
      R.cars.forEach((c) => { if (c.id === "ai") stepAI(c, R, baseline); });

      // coins
      R.players.forEach((pl) => {
        R.coins.forEach((c) => {
          if (!c.taken && dist(pl.x, pl.y, c.x, c.y) < 22) { c.taken = true; R.raceCoins++; }
        });
      });

      // draw
      drawBackground(R);
      drawTrack(R);
      drawCoins(R);
      [...R.cars].sort((a, b) => a.y - b.y).forEach((c) => drawCar(c, R));

      // finish check
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
          offTrack: R.players[0].offTrack,
          multi: mode === "multiplayer",
          pos2: mode === "multiplayer" ? ranking.findIndex((c) => c.label === "P2") + 1 : null,
        });
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); if (raceRef.current) raceRef.current.running = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function quitRace() {
    if (raceRef.current) raceRef.current.running = false;
    setScreen("menu");
  }

  /* ---------------- render ---------------- */
  if (!loaded) {
    return <div className="w-full h-screen flex items-center justify-center" style={{ background: COLORS_UI.bg0, color: COLORS_UI.text, fontFamily: "'Inter', sans-serif" }}>Loading…</div>;
  }

  return (
    <div className="w-full relative" style={{ height: "100vh", background: COLORS_UI.bg0, fontFamily: "'Inter', sans-serif" }}>
      {screen === "menu" && <MenuScreen save={save} openMode={openMode} setScreen={setScreen} toast={toast} />}
      {screen === "howto" && <HowToScreen setScreen={setScreen} save={save} toast={toast} />}
      {screen === "regionSelect" && <RegionSelect mode={mode} pickRegion={pickRegion} setScreen={setScreen} save={save} toast={toast} />}
      {screen === "missionList" && <MissionList save={save} pickMission={pickMission} setScreen={setScreen} toast={toast} />}
      {screen === "carSelect" && <CarSelect region={region} activeMission={activeMission} save={save} persist={persist} buyCar={buyCar} startRace={startRace} setScreen={setScreen} toast={toast} />}
      {screen === "garage" && <Garage save={save} garageCarId={garageCarId} setGarageCarId={setGarageCarId} setLoadout={setLoadout} buyPart={buyPart} setScreen={setScreen} toast={toast} />}
      {screen === "race" && <RaceScreen hud={hud} quitRace={quitRace} canvasRef={canvasRef} />}
      {screen === "result" && <ResultScreen result={result} startRace={startRace} setScreen={setScreen} toast={toast} />}
    </div>
  );
}

/* ============================ UI (module scope, stable identities) ============================ */
const fontDisplay = { fontFamily: "'Oswald', sans-serif" };
const fontBody = { fontFamily: "'Inter', sans-serif" };

function CurrencyBadge({ save }) {
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

function Shell({ children, title, sub, back, save, toast }) {
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
        <CurrencyBadge save={save} />
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
function MenuScreen({ save, openMode, setScreen }) {
  const items = [
    { id: "multiplayer", label: "Multiplayer", sub: "2 players, same device", icon: "◧◨" },
    { id: "offline", label: "Offline", sub: "Race vs 3 AI drivers", icon: "▲" },
    { id: "mission", label: "Mission", sub: "Career objectives", icon: "★" },
    { id: "garage", label: "Garage", sub: "Cars & customization", icon: "⚙" },
    { id: "howto", label: "How To Play", sub: "Controls & rules", icon: "?" },
  ];
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden" style={{ background: `radial-gradient(ellipse at 50% -10%, #1a2035, ${COLORS_UI.bg0} 60%)` }}>
      <div className="absolute top-5 right-5"><CurrencyBadge save={save} /></div>
      <div className="absolute inset-0" style={{
        background: "repeating-linear-gradient(115deg, rgba(255,176,32,0.05) 0px, rgba(255,176,32,0.05) 2px, transparent 2px, transparent 60px)"
      }} />
      <div className="relative z-10 mb-8 text-center">
        <div style={{ ...fontDisplay, fontSize: 56, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1 }}>
          <span style={{ color: COLORS_UI.amber }}>Apex</span>{" "}
          <span style={{ color: COLORS_UI.cyan }}>Drift</span>
        </div>
        <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 13, marginTop: 6, letterSpacing: 3, textTransform: "uppercase" }}>
          Arcade Racer — Asia · American · European
        </div>
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-3 w-full max-w-xl px-6">
        {items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => (it.id === "garage" ? setScreen("garage") : it.id === "howto" ? setScreen("howto") : openMode(it.id))}
            className={`text-left p-4 rounded-xl transition-transform hover:scale-[1.02] ${i === 4 ? "col-span-2" : ""}`}
            style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}
          >
            <div className="flex items-center justify-between">
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 20, letterSpacing: 1, textTransform: "uppercase" }}>{it.label}</div>
              <div style={{ color: COLORS_UI.amber, fontSize: 20 }}>{it.icon}</div>
            </div>
            <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12, marginTop: 4 }}>{it.sub}</div>
          </button>
        ))}
      </div>
      <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, marginTop: 28 }}>Progress saves automatically on this device</div>
    </div>
  );
}

function HowToScreen({ setScreen, save, toast }) {
  const rows = [
    ["Accelerate / Brake", "W or ↑  ·  S or ↓"],
    ["Steer", "A/D or ← →"],
    ["Multiplayer", "P1: W A S D   ·   P2: Arrow keys"],
    ["Coins", "Drive through gold coins on track for bonus currency"],
    ["Dollars", "Earned from race position — spend on new cars"],
    ["Off-track", "Grass/sand slows you down — stay on the asphalt"],
    ["Garage", "Spend coins on bodykits, tyres and paint colors"],
  ];
  return (
    <Shell title="How To Play" back={() => setScreen("menu")} save={save} toast={toast}>
      <div className="max-w-xl mx-auto flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
            <div style={{ ...fontBody, color: COLORS_UI.text, fontWeight: 600, fontSize: 14 }}>{r[0]}</div>
            <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 13 }}>{r[1]}</div>
          </div>
        ))}
        <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.amber}` }}>
          <div style={{ ...fontBody, color: COLORS_UI.text, fontSize: 13 }}>
            Regions: <b style={{ color: COLORS_UI.cyan }}>Asia</b> (tight, technical), <b style={{ color: COLORS_UI.amber }}>American</b> (wide, fast oval), <b style={{ color: "#7CFC9A" }}>European</b> (balanced grand circuit).
          </div>
        </div>
      </div>
    </Shell>
  );
}

function RegionSelect({ mode, pickRegion, setScreen, save, toast }) {
  return (
    <Shell title={mode === "multiplayer" ? "Multiplayer — Choose Region" : "Offline — Choose Region"} back={() => setScreen("menu")} save={save} toast={toast}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {Object.values(REGIONS).map((r) => (
          <button key={r.key} onClick={() => pickRegion(r.key)} className="rounded-xl overflow-hidden text-left hover:scale-[1.02] transition-transform" style={{ background: COLORS_UI.panel, border: `1px solid ${COLORS_UI.line}` }}>
            <div style={{ height: 110, background: `linear-gradient(160deg, ${r.sky[0]}, ${r.sky[1]})` }} className="flex items-center justify-center">
              <TrackThumb region={r} />
            </div>
            <div className="p-3">
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 18, textTransform: "uppercase" }}>{r.name}</div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 12 }}>{r.sub}</div>
              <div className="mt-2 inline-block px-2 py-0.5 rounded-full text-xs" style={{ background: COLORS_UI.panel2, color: r.accent, border: `1px solid ${r.accent}` }}>{r.tag}</div>
            </div>
          </button>
        ))}
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

function MissionList({ save, pickMission, setScreen, toast }) {
  return (
    <Shell title="Mission Mode" sub="Complete objectives to earn bonus rewards" back={() => setScreen("menu")} save={save} toast={toast}>
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

function CarSelect({ region, activeMission, save, persist, buyCar, startRace, setScreen, toast }) {
  return (
    <Shell title="Choose Your Car" sub={REGIONS[region].name + " — " + REGIONS[region].sub} back={() => setScreen(activeMission ? "missionList" : "regionSelect")} save={save} toast={toast}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
        {CARS.map((c) => {
          const owned = save.ownedCars.includes(c.id);
          const selected = save.selectedCar === c.id;
          const loadout = save.loadouts[c.id] || { bodykit: "stock", tyre: "standard", paint: "white" };
          const stats = computeStats(c, loadout.bodykit, loadout.tyre);
          return (
            <div key={c.id} className="p-4 rounded-xl" style={{ background: COLORS_UI.panel, border: `1px solid ${selected ? COLORS_UI.amber : COLORS_UI.line}` }}>
              <div className="flex items-center justify-center h-16 mb-2">
                <svg width="90" height="46"><rect x="8" y="12" width="74" height="24" rx="10" fill={byId(PAINTS, loadout.paint).hex} stroke="#0006" /><rect x="30" y="16" width="24" height="14" rx="5" fill="#1a1e28" /></svg>
              </div>
              <div style={{ ...fontDisplay, color: COLORS_UI.text, fontSize: 17, textTransform: "uppercase" }}>{c.name}</div>
              <div style={{ ...fontBody, color: COLORS_UI.sub, fontSize: 11, marginBottom: 8 }}>{c.tag}</div>
              <div className="flex flex-col gap-1 mb-3">
                <StatBar label="Top Speed" value={stats.top} max={4.4} />
                <StatBar label="Accel" value={stats.accel * 60} max={4.2} />
                <StatBar label="Handling" value={stats.handling * 60} max={5} />
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
      <div className="max-w-4xl mx-auto mt-5 flex justify-center">
        <button onClick={startRace} className="px-8 py-3 rounded-xl" style={{ ...fontDisplay, fontSize: 20, textTransform: "uppercase", letterSpacing: 1, background: COLORS_UI.amber, color: "#1a1200" }}>
          Start Race
        </button>
      </div>
    </Shell>
  );
}

/* ---- GARAGE ---- */
function Garage({ save, garageCarId, setGarageCarId, setLoadout, buyPart, setScreen, toast }) {
  const car = byId(CARS, garageCarId);
  const loadout = save.loadouts[garageCarId] || { bodykit: "stock", tyre: "standard", paint: "white" };
  const stats = computeStats(car, loadout.bodykit, loadout.tyre);
  return (
    <Shell title="Garage" sub="Customize bodykit, tyres and paint" back={() => setScreen("menu")} save={save} toast={toast}>
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
            <div className="flex flex-col gap-1 w-full mt-3">
              <StatBar label="Top Speed" value={stats.top} max={4.4} />
              <StatBar label="Accel" value={stats.accel * 60} max={4.2} />
              <StatBar label="Handling" value={stats.handling * 60} max={5} />
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
function RaceScreen({ hud, quitRace, canvasRef }) {
  return (
    <div className="w-full h-full flex flex-col" style={{ background: COLORS_UI.bg0 }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${COLORS_UI.line}` }}>
        <button onClick={quitRace} className="px-3 py-1 rounded" style={{ ...fontBody, color: COLORS_UI.text, background: COLORS_UI.panel2, border: `1px solid ${COLORS_UI.line}`, fontSize: 12 }}>Quit</button>
        {hud && (
          <div className="flex gap-4 items-center" style={fontBody}>
            <span style={{ color: COLORS_UI.text, fontSize: 13 }}>Lap <b style={{ color: COLORS_UI.amber }}>{hud.lap}</b>/{hud.laps}</span>
            <span style={{ color: COLORS_UI.text, fontSize: 13 }}>
              Pos <b style={{ color: COLORS_UI.cyan }}>{hud.pos}</b>/{hud.total}
              {hud.multi && <span style={{ color: COLORS_UI.sub }}> (P2: {hud.pos2})</span>}
            </span>
            <span style={{ color: COLORS_UI.text, fontSize: 13 }}>⏱ {fmtTime(hud.time)}</span>
            <span style={{ color: "#ffd23f", fontSize: 13 }}>● {hud.coins}</span>
            {hud.offTrack && <span style={{ color: COLORS_UI.red, fontSize: 12, fontWeight: 700 }}>OFF TRACK</span>}
          </div>
        )}
        <div style={{ width: 60 }} />
      </div>
      <div className="flex-1 flex items-center justify-center p-2">
        <canvas ref={canvasRef} width={CW} height={CH} style={{ width: "100%", maxWidth: 1000, aspectRatio: `${CW}/${CH}`, borderRadius: 12, border: `1px solid ${COLORS_UI.line}`, background: "#000" }} />
      </div>
      {hud && (
        <div className="px-4 pb-3">
          <div className="h-2 rounded-full overflow-hidden max-w-xs mx-auto" style={{ background: COLORS_UI.panel2 }}>
            <div style={{ width: `${Math.min(100, (hud.speed / 4.4) * 100)}%`, height: "100%", background: COLORS_UI.cyan }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- RESULT ---- */
function ResultScreen({ result, startRace, setScreen, toast }) {
  if (!result) return null;
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <Shell title="Race Result" back={() => setScreen("menu")} toast={toast}>
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
        {result.missionResult && (
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
