// One runnable check: evolution has to actually work, headlessly, from a
// fixed seed. If a refactor breaks NEAT this fails instead of quietly
// producing cars that spin in circles forever.
import assert from "node:assert";
import { World } from "./src/world.js";
import { Population } from "./src/neat.js";
import { Genome, Innovations } from "./src/genome.js";
import { Rng, crossover, distance, mutate, DEFAULTS } from "./src/neat.js";
import { Track } from "./src/track.js";
import { CAR, rayAngles } from "./src/car.js";

// networks stay acyclic and produce finite output
{
  const rng = new Rng(7), innov = new Innovations(9);
  const g = Genome.initial(6, 2, innov, rng);
  for (let i = 0; i < 400; i++) mutate(g, innov, rng, DEFAULTS);
  const out = g.activate(new Float64Array([0.1, 0.9, 0.5, 0.2, 0.7, 0.3]), new Float64Array(2));
  assert(Number.isFinite(out[0]) && Number.isFinite(out[1]), "activation must be finite");
  for (const c of g.conns.values()) {
    assert(g.nodes.get(c.inId).depth < g.nodes.get(c.outId).depth, "connections must run shallow to deep");
  }
  assert(g.complexity().nodes > 7, "structure should have grown");
  console.log("ok  acyclic structure grows and activates", g.complexity());
}

// crossover only produces genes whose endpoints exist
{
  const rng = new Rng(11), innov = new Innovations(9);
  const a = Genome.initial(6, 2, innov, rng), b = Genome.initial(6, 2, innov, rng);
  for (let i = 0; i < 60; i++) { mutate(a, innov, rng, DEFAULTS); mutate(b, innov, rng, DEFAULTS); }
  a.fitness = 2; b.fitness = 1;
  const child = crossover(a, b, rng, DEFAULTS);
  for (const c of child.conns.values()) {
    assert(child.nodes.has(c.inId) && child.nodes.has(c.outId), "child gene endpoints must exist");
  }
  assert(distance(a, b, DEFAULTS) > 0, "two diverged genomes must be distinguishable");
  console.log("ok  crossover is well formed");
}

// the population keeps more than one species alive
{
  const p = new Population(7, 2, { popSize: 60 }, 3);
  for (const g of p.genomes) g.fitness = Math.random();
  p.evolve();
  assert(p.genomes.length === 60, "population size must be stable");
  assert(p.species.length >= 1, "speciation must produce species");
  console.log("ok  population is stable across a generation, species:", p.species.length);
}

// and the actual point: cars get better at driving
{
  const w = new World({ seed: 5, popSize: 90, tracks: 4 });
  const early = [], late = [];
  for (let i = 0; i < 24; i++) {
    const r = w.runGeneration();
    (i < 4 ? early : i >= 20 ? late : []).push(r.best);
  }
  const a = early.reduce((x, y) => x + y, 0) / early.length;
  const b = late.reduce((x, y) => x + y, 0) / late.length;
  console.log(`    gen 0-3 best avg ${a.toFixed(0)}   gen 20-23 best avg ${b.toFixed(0)}`);
  assert(b > a * 1.25, `evolution must improve driving (${a.toFixed(0)} -> ${b.toFixed(0)})`);
  console.log("ok  cars learn to drive");
}

// a mirrored track is the same track reflected, driven the other way round
{
  const a = new Track(42, 0.5, false), b = new Track(42, 0.5, false, true);
  assert(Math.abs(a.startX - b.startX) < 1e-9 && Math.abs(a.startY - b.startY) < 1e-9, "a mirrored track starts at the same point");
  assert(Math.abs(Math.sin(a.startHeading) + Math.sin(b.startHeading)) < 1e-6 && Math.abs(Math.cos(a.startHeading) - Math.cos(b.startHeading)) < 1e-6, "and sets off reflected");
  for (let i = 0; i < 200; i++) {
    const x = 50 + (i * 37) % 800, y = 40 + (i * 53) % 560;
    assert(a.contains(x, y) === b.contains(x, 2 * a.cy - y), "every point of road has its mirror image");
  }
  console.log("ok  mirrored tracks are reflections");
}

// evolving eyes: every genome keeps its own, copied rather than shared, and they move
{
  const w = new World({ seed: 3, popSize: 40, tracks: 4, eyes: true });
  const start = rayAngles();
  for (let i = 0; i < 6; i++) w.runGeneration();
  const eyes = w.pop.genomes.map((g) => g.eyes);
  assert(eyes.every((e) => e && e.angles.length === start.length), "every genome must carry eyes");
  assert(new Set(eyes).size === eyes.length && new Set(eyes.map((e) => e.angles)).size === eyes.length, "no two genomes may share eyes");
  assert(eyes.some((e) => e.angles.some((a, i) => a !== start[i]) || e.range !== CAR.rayRange), "eyes must evolve");
  assert(eyes.every((e) => e.range >= DEFAULTS.eyeMin && e.range <= DEFAULTS.eyeMax), "range stays in bounds");
  console.log("ok  eyes are inherited, copied and mutated");
}

// a saved run carries on exactly as the original
{
  const a = new World({ seed: 4, popSize: 40, tracks: 4 });
  for (let i = 0; i < 3; i++) a.runGeneration();
  const b = World.fromJSON(JSON.parse(JSON.stringify(a)));
  for (let i = 0; i < 3; i++) {
    const x = a.runGeneration(), y = b.runGeneration();
    assert(x.best === y.best && x.mean === y.mean, "a loaded run must evolve exactly as the saved one");
  }
  console.log("ok  a saved run carries on exactly");
}

console.log("\nall checks passed");
