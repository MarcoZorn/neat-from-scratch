// Tracks: procedurally generated loops, harder variants with obstacles, and
// tracks you draw yourself.
//
// Both kinds answer the same two questions, which is all a car ever asks:
//   contains(x, y)  is this point on the tarmac
//   angleOf(x, y)   how far around the loop is it
// How they answer differs completely, and that is the interesting part.
import { Rng } from "./neat.js";

export const WORLD_W = 900, WORLD_H = 640;

// A generated track's centerline is a polar function r(theta) around a fixed
// centre. A polar function has exactly one radius per angle, so no matter how
// many harmonics you stack on it the loop can never cross itself. Stretching
// it by a positive (sx, sy) is an affine map, which preserves that.
//
// It also makes containment O(1): invert the stretch, take the angle, compare
// radii. No polygon with hundreds of edges to test against, which is what
// makes thousands of sensor rays per frame affordable.
export class Track {
  // `mirror` reflects the track top to bottom, so it is driven the other way
  // round: drivers raised on one direction only cannot drive the other.
  constructor(seed, difficulty = 0.3, hard = false, mirror = false) {
    const rng = new Rng(seed * 2654435761 + 1);
    this.kind = "polar";
    this.seed = seed;
    this.hard = hard;
    this.difficulty = difficulty;
    this.cx = WORLD_W / 2; this.cy = WORLD_H / 2;
    this.baseR = Math.min(WORLD_W, WORLD_H) * 0.31;

    // Hard tracks get more harmonics at higher frequencies, which is what
    // turns gentle sweepers into chicanes you have to actually steer through.
    const nHarm = hard ? 3 + rng.int(3) : 2 + rng.int(3) + Math.round(difficulty * 2);
    const ampScale = (hard ? 1.5 : 1.0) + difficulty * 0.8;
    const maxK = hard ? 9 : 7;
    this.harmonics = [];
    for (let i = 0; i < nHarm; i++) {
      this.harmonics.push({
        k: 2 + rng.int(maxK - 1),
        a: rng.range(0.05, 0.17) * ampScale / nHarm,
        p: rng.range(0, Math.PI * 2),
      });
    }
    this.sx = rng.range(0.85, 1.3);
    this.sy = rng.range(0.8, 1.15);
    if (mirror) this.sy = -this.sy;
    this.widthFrac = hard ? rng.range(0.115, 0.145) : rng.range(0.15, 0.19);
    this.widthK = 2 + rng.int(hard ? 5 : 3);
    this.widthP = rng.range(0, Math.PI * 2);
    this.widthSwing = (hard ? 0.28 : 0.22) * (0.4 + difficulty);

    // Obstacles sit on the track, pushed off the centreline so there is always
    // a way past. A car that only knows "wall ahead" has to learn that the gap
    // is sometimes on the other side.
    this.obstacles = [];
    const nObs = hard ? 3 + rng.int(3) : difficulty > 0.6 ? rng.int(3) : 0;
    for (let i = 0; i < nObs; i++) {
      const t = rng.range(0, Math.PI * 2);
      const r = this.radiusAt(t), hw = this.halfWidthAt(t);
      const side = rng.next() < 0.5 ? -1 : 1;
      const off = side * hw * rng.range(0.48, 0.70);
      const rr = hw * rng.range(0.26, 0.40);
      this.obstacles.push({
        x: this.cx + Math.cos(t) * (r + off) * this.sx,
        y: this.cy + Math.sin(t) * (r + off) * this.sy,
        r: rr,
      });
    }

    const r0 = this.radiusAt(0);
    this.startX = this.cx + r0 * this.sx;
    this.startY = this.cy;
    this.startHeading = this.headingAt(0);
    this.points = this.sample(720);
  }

  radiusAt(t) {
    let r = this.baseR;
    for (const h of this.harmonics) r += this.baseR * h.a * Math.sin(h.k * t + h.p);
    return r;
  }

  halfWidthAt(t) {
    const swing = 1 + this.widthSwing * Math.sin(this.widthK * t + this.widthP);
    return this.baseR * this.widthFrac * Math.max(0.5, Math.min(1.5, swing));
  }

  headingAt(t) {
    const e = 0.01;
    const p0 = this.pointAt(t - e), p1 = this.pointAt(t + e);
    return Math.atan2(p1.y - p0.y, p1.x - p0.x);
  }

  pointAt(t) {
    const r = this.radiusAt(t);
    return { x: this.cx + Math.cos(t) * r * this.sx, y: this.cy + Math.sin(t) * r * this.sy };
  }

  angleOf(x, y) {
    return Math.atan2((y - this.cy) / this.sy, (x - this.cx) / this.sx);
  }

  contains(x, y) {
    const dx = (x - this.cx) / this.sx, dy = (y - this.cy) / this.sy;
    const t = Math.atan2(dy, dx);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - this.radiusAt(t)) >= this.halfWidthAt(t)) return false;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const ox = x - o.x, oy = y - o.y;
      if (ox * ox + oy * oy < o.r * o.r) return false;
    }
    return true;
  }

  sample(n) {
    const inner = [], outer = [], mid = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = this.radiusAt(t), hw = this.halfWidthAt(t);
      const c = Math.cos(t), s = Math.sin(t);
      inner.push([this.cx + c * (r - hw) * this.sx, this.cy + s * (r - hw) * this.sy]);
      outer.push([this.cx + c * (r + hw) * this.sx, this.cy + s * (r + hw) * this.sy]);
      mid.push([this.cx + c * r * this.sx, this.cy + s * r * this.sy]);
    }
    return { inner, outer, mid };
  }
}

// A track someone drew with the mouse. An arbitrary polyline has no r(theta)
// to invert, so containment is answered by baking the shape into a grid once
// and then reading one cell per query. Same O(1) answer, different trick:
// the cost moves from every query to a single pass at build time.
const CELL = 3;

export class DrawnTrack {
  constructor(rawPoints, halfWidth = 34) {
    this.kind = "drawn";
    this.halfWidth = halfWidth;
    this.obstacles = [];
    this.mid = resample(smooth(rawPoints, 2), 7);
    this.n = this.mid.length;

    this.gw = Math.ceil(WORLD_W / CELL);
    this.gh = Math.ceil(WORLD_H / CELL);
    this.idx = new Int32Array(this.gw * this.gh).fill(-1);
    const best = new Float32Array(this.gw * this.gh).fill(Infinity);

    // Stamp a disc around every centreline sample, remembering which sample
    // owns each cell. That ownership is what replaces angleOf: a cell knows
    // how far around the loop it is, so progress stays a single lookup.
    const hw2 = halfWidth * halfWidth;
    for (let i = 0; i < this.n; i++) {
      const [px, py] = this.mid[i];
      const x0 = Math.max(0, Math.floor((px - halfWidth) / CELL));
      const x1 = Math.min(this.gw - 1, Math.ceil((px + halfWidth) / CELL));
      const y0 = Math.max(0, Math.floor((py - halfWidth) / CELL));
      const y1 = Math.min(this.gh - 1, Math.ceil((py + halfWidth) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const dx = (gx + 0.5) * CELL - px, dy = (gy + 0.5) * CELL - py;
          const d2 = dx * dx + dy * dy;
          if (d2 > hw2) continue;
          const c = gy * this.gw + gx;
          if (d2 < best[c]) { best[c] = d2; this.idx[c] = i; }
        }
      }
    }

    this.startX = this.mid[0][0];
    this.startY = this.mid[0][1];
    const nxt = this.mid[Math.min(3, this.n - 1)];
    this.startHeading = Math.atan2(nxt[1] - this.startY, nxt[0] - this.startX);
  }

  cellAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return -1;
    return ((y / CELL) | 0) * this.gw + ((x / CELL) | 0);
  }

  contains(x, y) {
    const c = this.cellAt(x, y);
    if (c < 0 || this.idx[c] < 0) return false;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const ox = x - o.x, oy = y - o.y;
      if (ox * ox + oy * oy < o.r * o.r) return false;
    }
    return true;
  }

  // Same contract as the polar version: an angle that increases once per lap.
  angleOf(x, y) {
    const c = this.cellAt(x, y);
    const i = c < 0 ? 0 : Math.max(0, this.idx[c]);
    return (i / this.n) * Math.PI * 2 - Math.PI;
  }
}

function smooth(pts, passes) {
  let out = pts;
  for (let p = 0; p < passes; p++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      next.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
    }
    out = next;
  }
  return out;
}

// Even spacing along the closed loop, so a fast mouse drag and a slow one
// produce the same track and progress advances at a constant rate.
function resample(pts, step) {
  const loop = [...pts, pts[0]];
  const out = [];
  let carry = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const [ax, ay] = loop[i], [bx, by] = loop[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    for (let d = carry; d < len; d += step) {
      out.push([ax + (dx * d) / len, ay + (dy * d) / len]);
    }
    carry = (carry - len) % step;
    if (carry < 0) carry += step;
  }
  return out.length > 8 ? out : pts;
}
