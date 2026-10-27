// Browser front end: run the world, draw it, wire up the controls.
import { World, TICKS_PER_GEN } from "./world.js";
import { DrawnTrack, WORLD_W, WORLD_H } from "./track.js";
import { CAR, rayAngles } from "./car.js";
import { drawNetwork } from "./netview.js";
import { drawSparkline } from "./sparkline.js";
import { DEFAULTS } from "./neat.js";

// The experiments in the README as links: ?sharing=0, ?addNode=0.2, ?rays=3,
// ?speed=0, ?hard=1, ?bothways=1, ?eyes=1
// (rays are read in car.js, since the network's inputs depend on them).
const query = new URLSearchParams(location.search);
if (query.get("sharing") === "0") DEFAULTS.sharing = false;
if (query.has("addNode")) DEFAULTS.pAddNode = +query.get("addNode");

const ANGLES = rayAngles();
const $ = (id) => document.getElementById(id);

const view = $("view"), vctx = view.getContext("2d");
const brain = $("brain"), bctx = brain.getContext("2d");
const spark = $("spark"), sctx = spark.getContext("2d");

let world, running = true, speed = 1, showRays = true, showAll = true;
let hard = query.get("hard") === "1", drawMode = false, stroke = null, fit = { k: 1, ox: 0, oy: 0 };
let pending = 0; // generations queued for fast-forward

function fitCanvas(c, cssW, cssH) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = cssW * dpr; c.height = cssH * dpr;
  c.style.width = cssW + "px"; c.style.height = cssH + "px";
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layout() {
  const wrap = view.parentElement.getBoundingClientRect();
  const w = Math.max(320, Math.floor(wrap.width));
  const h = Math.round(w * 0.71);
  fitCanvas(view, w, h);
  const bw = brain.parentElement.getBoundingClientRect().width;
  fitCanvas(brain, bw, 150);
  fitCanvas(spark, bw, 60);
}

function reset(seed) {
  world = new World({ seed, popSize: 120, tracks: 12, hard, bothWays: query.get("bothways") === "1", eyes: query.get("eyes") === "1" });
  $("seed").textContent = seed;
}

function polyPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// Fit whatever track we have into whatever canvas the browser gave us, rather
// than picking a radius that happens to look right on one screen.
function fitToBounds(x0, y0, x1, y1) {
  const cw = view.clientWidth, ch = view.clientHeight;
  const k = Math.min(cw / (x1 - x0), ch / (y1 - y0)) * 0.95;
  return { k, ox: (cw - (x1 - x0) * k) / 2 - x0 * k, oy: (ch - (y1 - y0) * k) / 2 - y0 * k };
}

function fitToTrack(t) {
  // While drawing, the frame is the whole world, so the canvas does not jump
  // under the cursor as the stroke grows.
  if (drawMode) return fitToBounds(0, 0, WORLD_W, WORLD_H);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pts = t.kind === "drawn" ? t.mid : t.points.outer;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = t.kind === "drawn" ? t.halfWidth + 6 : 0;
  return fitToBounds(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
}

function toWorld(e) {
  const r = view.getBoundingClientRect();
  return [(e.clientX - r.left - fit.ox) / fit.k, (e.clientY - r.top - fit.oy) / fit.k];
}

function drawObstacles(t, k) {
  for (const o of t.obstacles) {
    vctx.beginPath();
    vctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    vctx.fillStyle = "#3a2b2b";
    vctx.fill();
    vctx.strokeStyle = "#7d4a41";
    vctx.lineWidth = 1.5 / k;
    vctx.stroke();
  }
}

// A drawn track is exactly a thick stroke along its centreline with round
// caps, which is the same shape the grid mask was baked from, so what you see
// and what the cars collide with cannot drift apart.
function drawDrawnTrack(t, k) {
  vctx.lineJoin = "round";
  vctx.lineCap = "round";
  vctx.beginPath();
  polyPath(vctx, t.mid);
  vctx.strokeStyle = "rgba(255,255,255,0.22)";
  vctx.lineWidth = t.halfWidth * 2 + 3 / k;
  vctx.stroke();
  vctx.strokeStyle = "#1b1d24";
  vctx.lineWidth = t.halfWidth * 2;
  vctx.stroke();

  vctx.setLineDash([9, 13]);
  vctx.strokeStyle = "rgba(255,255,255,0.13)";
  vctx.lineWidth = 1.5 / k;
  vctx.beginPath();
  polyPath(vctx, t.mid);
  vctx.stroke();
  vctx.setLineDash([]);

  drawObstacles(t, k);

  const a = Math.atan2(t.mid[1][1] - t.mid[0][1], t.mid[1][0] - t.mid[0][0]) + Math.PI / 2;
  vctx.strokeStyle = "#ff8a5c";
  vctx.lineWidth = 3 / k;
  vctx.beginPath();
  vctx.moveTo(t.startX + Math.cos(a) * t.halfWidth, t.startY + Math.sin(a) * t.halfWidth);
  vctx.lineTo(t.startX - Math.cos(a) * t.halfWidth, t.startY - Math.sin(a) * t.halfWidth);
  vctx.stroke();
}

function drawTrack(t, k) {
  if (t.kind === "drawn") return drawDrawnTrack(t, k);
  // Outer loop and inner loop in one path with the even-odd rule gives the
  // tarmac band in a single fill, no masking needed.
  vctx.beginPath();
  polyPath(vctx, t.points.outer);
  polyPath(vctx, t.points.inner);
  vctx.fillStyle = "#1b1d24";
  vctx.fill("evenodd");

  vctx.setLineDash([9, 13]);
  vctx.strokeStyle = "rgba(255,255,255,0.13)";
  vctx.lineWidth = 1.5 / k;
  vctx.beginPath();
  polyPath(vctx, t.points.mid);
  vctx.stroke();
  vctx.setLineDash([]);

  vctx.strokeStyle = "rgba(255,255,255,0.22)";
  vctx.beginPath(); polyPath(vctx, t.points.outer); vctx.stroke();
  vctx.beginPath(); polyPath(vctx, t.points.inner); vctx.stroke();

  drawObstacles(t, k);

  const r = t.radiusAt(0), hw = t.halfWidthAt(0);
  vctx.strokeStyle = "#ff8a5c";
  vctx.lineWidth = 3 / k;
  vctx.beginPath();
  vctx.moveTo(t.cx + (r - hw) * t.sx, t.cy);
  vctx.lineTo(t.cx + (r + hw) * t.sx, t.cy);
  vctx.stroke();
}

function drawCar(c, colour, alpha) {
  vctx.save();
  vctx.translate(c.x, c.y);
  vctx.rotate(c.a);
  vctx.globalAlpha = alpha;
  vctx.fillStyle = colour;
  vctx.beginPath();
  vctx.moveTo(CAR.len * 0.6, 0);
  vctx.lineTo(-CAR.len * 0.4, -CAR.wid * 0.5);
  vctx.lineTo(-CAR.len * 0.4, CAR.wid * 0.5);
  vctx.closePath();
  vctx.fill();
  vctx.restore();
}

function draw() {
  vctx.clearRect(0, 0, view.clientWidth, view.clientHeight);
  fit = fitToTrack(world.track);
  const { k, ox, oy } = fit;
  vctx.save();
  vctx.translate(ox, oy);
  vctx.scale(k, k);

  if (drawMode) {
    drawCanvasFrame(k);
    if (stroke && stroke.length > 1) {
      vctx.lineJoin = vctx.lineCap = "round";
      vctx.strokeStyle = "rgba(255,138,92,0.28)";
      vctx.lineWidth = 68;
      vctx.beginPath();
      polyPath(vctx, stroke);
      vctx.stroke();
      vctx.strokeStyle = "#ff8a5c";
      vctx.lineWidth = 2 / k;
      vctx.stroke();
    }
    vctx.restore();
    return;
  }

  drawTrack(world.track, k);

  const lead = world.leader();
  if (showAll) {
    for (const c of world.cars) {
      if (c === lead) continue;
      drawCar(c, c.alive ? "#5a6a8a" : "#3a3f4d", c.alive ? 0.75 : 0.22);
    }
  }

  if (lead) {
    if (showRays && lead.alive) {
      vctx.strokeStyle = "rgba(110,168,255,0.4)";
      vctx.lineWidth = 1 / k;
      for (let i = 0; i < ANGLES.length; i++) {
        const ang = lead.a + (lead.genome.eyes ? lead.genome.eyes.angles : ANGLES)[i], d = lead.rays[i];
        vctx.beginPath();
        vctx.moveTo(lead.x, lead.y);
        vctx.lineTo(lead.x + Math.cos(ang) * d, lead.y + Math.sin(ang) * d);
        vctx.stroke();
      }
    }
    drawCar(lead, "#ff8a5c", 1);
  }
  vctx.restore();

  drawNetwork(bctx, lead ? lead.genome : null, brain.clientWidth, brain.clientHeight);
  drawSparkline(sctx, world.history, spark.clientWidth, spark.clientHeight);

  const alive = world.cars.filter((c) => c.alive).length;
  const last = world.history[world.history.length - 1];
  $("gen").textContent = world.pop.generation;
  $("alive").textContent = `${alive}/${world.cars.length}`;
  $("tick").textContent = pending > 0
    ? `fast-forward ${pending}`
    : `${Math.round((world.tick / TICKS_PER_GEN) * 100)}%`;
  $("species").textContent = world.pop.species.length || "-";
  $("best").textContent = last ? Math.round(last.best) : "-";
  $("mean").textContent = last ? Math.round(last.mean) : "-";
  $("laps").textContent = lead ? lead.laps : 0;
  const cx = lead ? lead.genome.complexity() : null;
  $("size").textContent = cx ? `${cx.nodes} / ${cx.conns}` : "-";
}

function drawCanvasFrame(k) {
  vctx.strokeStyle = "rgba(255,255,255,0.10)";
  vctx.lineWidth = 1 / k;
  vctx.strokeRect(0, 0, WORLD_W, WORLD_H);
}

function frame() {
  // Fast-forward is spread across frames on a time budget. Running 25
  // generations inside a click handler blocks the main thread long enough
  // that the tab stops responding, which is a worse bug than it is slow.
  if (pending > 0) {
    const until = performance.now() + 24;
    while (pending > 0 && performance.now() < until) {
      while (world.step()) {}
      world.finish();
      pending--;
    }
  } else if (running) {
    for (let i = 0; i < speed; i++) {
      if (!world.step()) { world.finish(); break; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

// Drawing a track: collect world-space points while the pointer is down, then
// hand the polyline to DrawnTrack, which bakes it into a collision grid.
function setDrawMode(on) {
  drawMode = on;
  stroke = null;
  $("draw").dataset.on = on;
  $("hint").hidden = !on;
  view.dataset.draw = on;
  if (on) { running = false; $("play").textContent = "Play"; }
}

view.addEventListener("pointerdown", (e) => {
  if (!drawMode) return;
  e.preventDefault();
  view.setPointerCapture(e.pointerId);
  stroke = [toWorld(e)];
});

view.addEventListener("pointermove", (e) => {
  if (!drawMode || !stroke) return;
  const p = toWorld(e), last = stroke[stroke.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 5) stroke.push(p);
});

view.addEventListener("pointerup", () => {
  if (!drawMode || !stroke) return;
  if (stroke.length < 12) { stroke = null; return; }  // a stray click is not a track
  const track = new DrawnTrack(stroke, 34);
  setDrawMode(false);
  world.useTrack(track);
  running = true;
  $("play").textContent = "Pause";
});

$("draw").onclick = () => setDrawMode(!drawMode);
$("hardmode").onclick = (e) => {
  hard = !hard;
  pending = 0;
  e.target.dataset.on = hard;
  reset(Math.floor(Math.random() * 9999) + 1);
};
$("play").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause" : "Play"; };
$("skip").onclick = () => { pending += 1; };
$("jump").onclick = () => { pending += 25; };
$("again").onclick = () => { pending = 0; setDrawMode(false); reset(Math.floor(Math.random() * 9999) + 1); };
$("rays").onclick = (e) => { showRays = !showRays; e.target.dataset.on = showRays; };
$("crowd").onclick = (e) => { showAll = !showAll; e.target.dataset.on = showAll; };
for (const b of document.querySelectorAll("[data-speed]")) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((x) => (x.dataset.on = x === b));
  };
}
window.addEventListener("resize", layout);

layout();
$("hardmode").dataset.on = hard;
reset(7);
frame();
