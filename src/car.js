// One car: arcade physics and the only thing it ever knows about the world.
//
// The brain is never handed its position, the track shape, or where the
// finish is. It gets a fan of ray distances and its own speed, and that is
// the entire input. Everything it does has to be built out of that.
// ?rays=3 on the page tries a different number of sensors
const query = globalThis.location ? new URLSearchParams(location.search) : null;
export const N_RAYS = Math.max(2, Math.min(16, +query?.get("rays") || 5));
export const N_INPUTS = N_RAYS + 1;
export const N_OUTPUTS = 2; // steering, throttle

export const CAR = {
  accel: 260, brake: 340, drag: 0.7,
  maxSpeed: 250, maxReverse: 50,
  turnRate: 3.1, minTurnSpeed: 20,
  len: 13, wid: 6,
  rayRange: 190, rayStep: 9,
  fov: Math.PI * 1.35,
  stallSpeed: 12, stallTicks: 55,
};

export function rayAngles() {
  const half = CAR.fov / 2;
  return Array.from({ length: N_RAYS }, (_, i) => -half + (CAR.fov * i) / (N_RAYS - 1));
}
const ANGLES = rayAngles();

export class Car {
  constructor(genome, track) {
    this.genome = genome;
    this.x = track.startX; this.y = track.startY;
    this.a = track.startHeading;
    this.v = 0;
    this.alive = true;
    this.ticks = 0;
    this.stall = 0;
    this.progress = 0;
    this.laps = 0;
    this.lastT = track.angleOf(this.x, this.y);
    this.unwrapped = 0;
    this.rays = new Float64Array(N_RAYS);
    this.inputs = new Float64Array(N_INPUTS);
    this.out = new Float64Array(N_OUTPUTS);
  }

  // March each ray outward until it leaves the track. Coarse steps, then one
  // bisection pass to sharpen the hit, which is far cheaper than a fine march
  // and accurate enough that the car cannot feel the difference.
  sense(track) {
    for (let i = 0; i < N_RAYS; i++) {
      const ang = this.a + ANGLES[i];
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let d = 0, hit = CAR.rayRange;
      while (d < CAR.rayRange) {
        d += CAR.rayStep;
        if (!track.contains(this.x + cx * d, this.y + cy * d)) {
          let lo = d - CAR.rayStep, hi = d;
          for (let k = 0; k < 4; k++) {
            const m = (lo + hi) / 2;
            if (track.contains(this.x + cx * m, this.y + cy * m)) lo = m; else hi = m;
          }
          hit = lo;
          break;
        }
      }
      this.rays[i] = hit;
    }
  }

  step(track, dt) {
    if (!this.alive) return;
    this.sense(track);
    for (let i = 0; i < N_RAYS; i++) this.inputs[i] = this.rays[i] / CAR.rayRange;
    this.inputs[N_RAYS] = this.v / CAR.maxSpeed;

    this.genome.activate(this.inputs, this.out);
    const steer = this.out[0], throttle = this.out[1];

    // Steering authority scales with speed: a stationary car does not turn by
    // twisting the wheel, and without this the population converges on
    // spinning in place, which is a local optimum that is hard to leave.
    const grip = Math.min(1, Math.abs(this.v) / CAR.minTurnSpeed);
    this.a += steer * CAR.turnRate * grip * dt * Math.sign(this.v || 1);

    const acc = throttle >= 0 ? throttle * CAR.accel : throttle * CAR.brake;
    this.v += acc * dt;
    this.v -= this.v * CAR.drag * dt;
    this.v = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, this.v));

    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;
    this.ticks++;

    // Progress is the unwrapped angle around the track, so going the wrong way
    // costs you and cannot be farmed by oscillating over the start line.
    const t = track.angleOf(this.x, this.y);
    let dT = t - this.lastT;
    if (dT > Math.PI) dT -= Math.PI * 2;
    if (dT < -Math.PI) dT += Math.PI * 2;
    this.unwrapped += dT;
    this.lastT = t;
    this.progress = Math.max(this.progress, this.unwrapped);
    if (this.progress >= Math.PI * 2 * (this.laps + 1)) this.laps++;

    if (Math.abs(this.v) < CAR.stallSpeed) { if (++this.stall > CAR.stallTicks) this.alive = false; }
    else this.stall = 0;

    if (!track.contains(this.x, this.y)) this.alive = false;
  }

  fitness() {
    // Distance covered along the loop, plus a bonus for doing it quickly.
    const dist = Math.max(0, this.progress) * 100;
    const speed = this.ticks ? (Math.max(0, this.progress) / this.ticks) * 400 : 0;
    return dist + speed + this.laps * 300;
  }
}
