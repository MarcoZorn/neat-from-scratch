// Ties the population to the track: run a generation, score it, evolve, repeat.
import { Population } from "./neat.js";
import { Track } from "./track.js";
import { Car, CAR, N_INPUTS, N_OUTPUTS, rayAngles } from "./car.js";

export const TICKS_PER_GEN = 900;
export const DT = 1 / 60;

export class World {
  // eyes: each car's ray angles and range are genes too, starting from the fixed fan
  constructor({ seed = 1, popSize = 120, tracks = 12, hard = false, bothWays = false, eyes = false } = {}) {
    this.pop = new Population(N_INPUTS, N_OUTPUTS, { popSize, eyes: eyes ? { angles: rayAngles(), range: CAR.rayRange } : null }, seed);
    this.trackSeeds = Array.from({ length: tracks }, (_, i) => seed * 100 + i);
    this.trackCount = tracks;
    this.hard = hard;
    this.bothWays = bothWays;   // every other track mirrored, driven the other way round
    this.custom = null;
    this.history = [];
    this.newGeneration();
  }

  // A track you drew is used every generation, since the whole point of
  // drawing one is to watch the population learn that particular corner.
  useTrack(track) {
    this.custom = track;
    this.history = [];   // fitness on a new track is not comparable to the old one
    this.newGeneration();
  }

  // The track changes every generation. Evolve on one loop and the population
  // memorises that loop instead of learning to drive; the difference shows up
  // the first time you hand it a corner it has never seen.
  newGeneration() {
    const i = this.pop.generation % this.trackCount;
    const difficulty = i / Math.max(1, this.trackCount - 1);
    this.track = this.custom || new Track(this.trackSeeds[i], difficulty, this.hard, this.bothWays && i % 2 === 1);
    this.cars = this.pop.genomes.map((g) => new Car(g, this.track));
    this.tick = 0;
    this.done = false;
  }

  step() {
    if (this.done) return false;
    let alive = 0;
    for (const c of this.cars) { c.step(this.track, DT); if (c.alive) alive++; }
    this.tick++;
    if (alive === 0 || this.tick >= TICKS_PER_GEN) this.done = true;
    return true;
  }

  finish() {
    for (const c of this.cars) c.genome.fitness = c.fitness();
    const best = this.cars.reduce((a, b) => (b.fitness() > a.fitness() ? b : a));
    this.history.push({
      gen: this.pop.generation,
      best: best.fitness(),
      mean: this.cars.reduce((t, c) => t + c.fitness(), 0) / this.cars.length,
      laps: Math.max(...this.cars.map((c) => c.laps)),
      species: this.pop.species.length,
    });
    this.pop.evolve();
    this.newGeneration();
  }

  runGeneration() {
    while (this.step()) {}
    this.finish();
    return this.history[this.history.length - 1];
  }

  leader() {
    let best = null, bf = -Infinity;
    for (const c of this.cars) {
      const f = c.fitness();
      if (f > bf) { bf = f; best = c; }
    }
    return best;
  }
}
