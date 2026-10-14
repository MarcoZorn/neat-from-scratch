# NEAT from scratch

Cars that evolve their own neural network, and the network's own shape, from
nothing. No libraries, no build step, no training data, about 600 lines of
JavaScript you can read in one sitting.

**[Run it in your browser](https://marcozorn.github.io/neat-from-scratch/)**

![Cars evolved with NEAT driving a procedurally generated track](docs/preview.png)

You can also draw your own track with the mouse and watch a population learn
that specific corner, or turn on hard tracks, which are narrower, sharper, and
have obstacles sitting in the racing line.

Every car sees five distances to the nearest wall and its own speed. Six numbers.
It outputs steering and throttle. Nothing tells it where the track goes, where it
is, or which way is forward, and nothing anywhere in this repository knows how to
drive. The first generation dies at the first corner. Give it twenty generations and
most of the field survives a lap; give it forty and they are holding a line.

## The problem NEAT solves

If you want to evolve a neural network, the easy part is the weights: make a
population, mutate the numbers, keep what scores well. The hard part is the
*shape*. How many hidden neurons should there be? Connected how?

Fix the topology up front and you have guessed the answer to the most important
question. Evolve the topology too and two problems appear immediately, and NEAT
is essentially the answer to both.

**Problem one: you cannot cross over two different shapes.** Take two networks
with different numbers of neurons wired differently. Which weight in one
corresponds to which weight in the other? Line them up wrong and the child is
noise. Without an answer to this, topology evolution loses sexual reproduction
entirely and degrades to a random search.

**Problem two: new structure is always worse at first.** Adding a neuron changes
the network's behaviour before evolution has had any chance to tune the new
weights. A newborn mutant competes against a population that has been refining
itself for fifty generations. It loses, every time, and the population never
gets more complex than it started.

## The four ideas

### 1. A genome is a list of connections, not a matrix

```js
{ inId: 3, outId: 11, w: -0.62, on: true, innov: 27 }
```

Nodes are almost bookkeeping. The connections are the genome, and each one
carries an `innov` number: the moment in the run's history when that connection
was first invented by anyone.

### 2. Historical markings make crossover possible

That innovation number is the whole trick. Two genomes that both contain
innovation 27 contain *the same connection*, inherited from a common ancestor,
no matter how far their shapes have since diverged. So you can line two genomes
up by innovation number, and the alignment is meaningful rather than a guess.

```js
for (const [innov, ca] of a.conns) {
  const cb = b.conns.get(innov);
  if (cb && rng.next() < 0.5) c = { ...cb };   // both have it: coin flip
  else c = { ...ca };                          // only the fitter parent: take it
}
```

Genes both parents have are inherited at random from either. Genes only the
fitter parent has are inherited from the fitter parent. That is all of crossover,
and it works between networks that do not look remotely alike.

### 3. Start minimal and complexify

The first generation has no hidden neurons at all: inputs wired straight to
outputs. Structure only ever arrives through mutation, one piece at a time, and
only survives if it pays for itself. The search starts in the smallest space
that could possibly work and grows outward, instead of starting in a large space
someone guessed at.

Adding a neuron splits an existing connection in two:

```js
c.on = false;                                        // old connection off
g.conns.set(i1, { inId: c.inId,  outId: id, w: 1 });   // in  -> new, weight 1
g.conns.set(i2, { inId: id, outId: c.outId, w: c.w }); // new -> out, old weight
```

Note the weights. The path `in -> new -> out` computes almost exactly what the
old direct connection computed, so the network behaves the same the instant the
neuron appears. A structural mutation that changed behaviour immediately would
be judged before it had a chance, and selected away. This one gets to sit there
harmlessly until mutation finds something for it to do.

### 4. Speciation protects the newborn

This is the part that actually makes it work. Genomes are grouped by similarity,
using a distance built from how many connections they do not share plus how
different the shared weights are:

```js
return (cfg.cDisjoint * disjoint) / norm + cfg.cWeight * averageWeightDifference;
```

Then each genome's fitness is divided by the size of its own species. Being in a
crowded species is expensive; being the only member of a new one is not. A
lineage that stumbles onto a good trick cannot immediately take over the whole
population, and a mutant with an untuned new neuron only competes against
relatives with the same handicap.

Innovation gets a few generations of shelter to become useful. Without fitness
sharing the population collapses onto one lineage within about ten generations
and complexity stops growing. It is worth commenting out `s.adjusted = ... /
s.members.length` and watching that happen.

## About the cycles

Real NEAT needs care to avoid recurrent loops appearing by accident. This
implementation sidesteps it: every node has a `depth`, inputs are at 0, outputs
at 1, and a node created by splitting a connection sits exactly halfway between
its two ends. A new connection may only ever run from a shallower node to a
deeper one.

Cycles become structurally impossible rather than something to detect, and
evaluation is one sweep in depth order with no iteration to convergence. The
cost is that this network cannot have memory. Recurrence is genuinely useful in
NEAT, and leaving it out is a simplification, not an improvement.

That sweep is also cheap to compile: once per mutation the network is
flattened into typed arrays (node values in one buffer, each node's inputs a
run of slot and weight pairs), and evaluating it is a tight loop with the
same arithmetic in the same order, so the outputs are bit for bit what the
straightforward version gives. In the
[gridlock](https://github.com/MarcoZorn/gridlock) city, where the networks are
bigger, that made whole runs 37% faster. Gridlock also tried the cheapest
form of memory on top of this: an extra output fed back in as an input on the
next tick. It helped a little, and is written up there.

## What the car knows

```
inputs:  5 ray distances (normalised), own speed
outputs: steering, throttle
```

The rays are marched outward in coarse steps until they leave the track, then
sharpened with four bisections. Whether a point is on the track is O(1): the
centreline is a polar function `r(theta)`, so you take the angle and compare
radii, rather than testing against a polygon with hundreds of edges. That is the
only reason thousands of rays per frame are affordable in a browser.

Steering authority scales with speed, because a stationary car does not turn by
twisting the wheel. Without that detail the population reliably discovers that
spinning on the spot is safe, and gets stuck there.

**The track changes every generation.** Evolve against a single loop and the
population memorises that loop rather than learning to drive, which you only
discover the first time you show it a corner it has never seen.

### Hard tracks

Press Hard tracks for narrower tarmac, higher-frequency harmonics on the
centreline, and three to five obstacles dropped onto the track, pushed off the
centreline so there is always a way past.

![A hard track with obstacles](docs/hard-track.png)

Obstacles are the interesting part. A car's sensors report distance to the
nearest wall and nothing else, so an obstacle and the outside wall feel
identical. There is no input that says "this one you can go around". The
population has to discover that from the consequences alone, and the wreckage
piles up in front of them for quite a few generations first.

### Drawing your own

Press Draw a track and drag a loop. Release and the population starts on it
immediately, and keeps that track every generation instead of cycling.

![A hand-drawn track](docs/drawn-track.png)

A hand-drawn polyline has no `r(theta)` to invert, so containment cannot use
the trick above. Instead the shape is baked once into a grid: every cell stores
which centreline sample owns it, or -1 for off-track.

```js
const c = this.cellAt(x, y);
return c >= 0 && this.idx[c] >= 0;
```

The cost moves from every query to a single pass at build time, and the answer
is still O(1). The stored sample index does double duty: it is also how far
around the loop the cell is, so progress stays one lookup too, and both track
types can answer `angleOf` without the car knowing which kind it is on.

Because the mask is discs stamped along the centreline, it is exactly a thick
stroke with round caps, which is what gets drawn. What you see and what the
cars crash into cannot drift apart.

## Fitness

```js
const dist  = Math.max(0, this.progress) * 100;
const speed = (this.progress / this.ticks) * 400;
return dist + speed + this.laps * 300;
```

Progress is the *unwrapped* angle travelled around the loop, so reversing costs
you and nothing is gained by oscillating back and forth over the start line.
Nearly every strange behaviour you will see in a run is the population finding a
way to score that you did not intend. That is the normal experience of writing a
fitness function, not a sign you did it wrong.

## Run it

Clone it and open `index.html`. There is no step two.

```bash
git clone https://github.com/MarcoZorn/neat-from-scratch
cd neat-from-scratch
python3 -m http.server        # any static server, or just open the file
```

Headless, without a browser:

```bash
node test.mjs
```

That runs the algorithm end to end from a fixed seed and asserts the cars
actually get better, which is the only test here worth having.

## The files

| file | what is in it |
|---|---|
| `src/genome.js` | the genome, and evaluating a network of arbitrary shape |
| `src/neat.js` | mutation, crossover, distance, speciation, the generation loop |
| `src/track.js` | procedural tracks as polar functions, and drawn tracks as a grid mask |
| `src/car.js` | physics and the raycast sensors |
| `src/world.js` | ties a population to a track and runs generations |
| `src/sim.js` | canvas rendering and the controls |
| `test.mjs` | headless check that evolution works |

## Things worth trying

- [Turn off fitness sharing](https://marcozorn.github.io/neat-from-scratch/?sharing=0). It does not collapse to one
  species, because the compatibility threshold keeps adjusting to hold about
  eight, but the biggest species goes from a third of the population to
  three fifths of it after 60 generations, and the average genetic distance
  between two cars drops by a tenth. On tracks this easy the best car comes
  out just as good; sharing is insurance for problems where the first idea
  that works is not the one that goes furthest. In
  [gridlock](https://github.com/MarcoZorn/gridlock), with the same engine on a
  much harder problem, it turned out to be a cost instead: drivers raised
  without it were half as fit again, so there it is now off. On this demo's
  hard tracks it is the insurance it is meant to be: eight seeds take a
  median of 15 generations to lap three tracks in a row either way, but
  without sharing one seed took 104, and with it none took more than 51.
- [Drop to three sensor rays](https://marcozorn.github.io/neat-from-scratch/?rays=3). It still learns: over eight seeds
  the leader laps three tracks in a row after 4.9 generations, against 3.9
  with five. Going the other way, nine rays take 3.1 and sixteen 3.0, which
  is as fast as that measure can go: on these tracks more eyes are simply
  better. In [gridlock](https://github.com/MarcoZorn/gridlock)'s city it is
  the opposite, because those drivers steer by their route, not their rays.
- Keep the same track every generation and then press New seed. The gap between
  what it scores on a memorised loop and an unseen one is the whole point.
- Reward distance only, with no speed term, and watch cars learn to crawl.
- Take away the car's sense of its own speed (the network has no memory, so
  it then cannot know it). On easy tracks it makes no difference at all, 3.4
  generations to three laps in a row against 3.9. On hard tracks it more than
  doubles the time, 44.8 against 20.8: braking for a hairpin needs to know
  how fast you are going. (The Python
  [cars](https://github.com/MarcoZorn/cars) project barely missed it, but its
  sixteen rays see far more of the road.)
- [Raise the rate of new nodes](https://marcozorn.github.io/neat-from-scratch/?addNode=0.3). More structure is not better structure.
- Draw a track with one very tight hairpin and nothing else, and watch how long
  it takes the population to stop treating it as a wall.

## Reading

- Stanley and Miikkulainen, [Evolving Neural Networks through Augmenting Topologies](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf) (2002), the original NEAT paper and a genuinely readable one.
- [primordial](https://github.com/MarcoZorn/primordial), the same ideas with no fitness function at all.
- [cars](https://github.com/MarcoZorn/cars), the Python version this is a port of, with a thousand cars and fifteen tracks.
- [awesome-artificial-life](https://github.com/MarcoZorn/awesome-artificial-life), more of this kind of thing.

MIT.
