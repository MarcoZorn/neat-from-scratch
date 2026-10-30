// A guided tour of the live run: six short steps, each pointing at the part
// of the page it explains, for someone who has never seen NEAT. The run keeps
// going underneath, so what the text describes is happening as you read it.

export const STEPS = [
  {
    el: "view",
    title: "120 cars, 120 brains",
    text: "Every car is driven by its own small neural network. It sees the track through a fan of rays (the lines in front of it) and its own speed, and decides how to steer and how hard to accelerate. Nobody told any of them how to drive.",
  },
  {
    el: "brain",
    title: "The leader's brain",
    text: "Inputs on the left (the rays and speed), outputs on the right (steering and throttle). At the start every brain is just inputs wired straight to outputs: no hidden neurons at all. The genome is a list of connections, each with a weight.",
  },
  {
    el: "size",
    title: "Brains grow",
    text: "Each generation the survivors breed, and their children mutate: weights shift, new connections appear, and now and then a connection is split by a new neuron. Watch these two numbers climb as the run goes on. NEAT starts minimal and only adds structure that pays.",
  },
  {
    el: "species",
    title: "Species protect newcomers",
    text: "A fresh structural mutation usually makes a car worse before it makes it better. So NEAT groups similar brains into species and has them compete mostly among themselves, giving a new idea a few generations to prove itself.",
  },
  {
    el: "spark",
    title: "Fitness over time",
    text: "How far the best car and the average car got, generation by generation. The track changes every generation, so this is learning to drive, not memorising one road. When two parents breed, their genes line up by an innovation number each connection got when it first appeared.",
  },
  {
    el: "replay",
    title: "Replay the tape",
    text: "Press Mark here at any generation, let the run carry on, then press Replay, new seed: the population goes back to the mark and evolves again with fresh randomness. If it finds the same kind of driver twice, the outcome was nearly decided by the mark; if it finds a different one, it was luck along the way. This is how biologists replay the tape of life.",
  },
];

export class Tour {
  constructor(doc = document) { this.doc = doc; this.i = -1; this.card = null; }

  start() { this.show(0); }

  show(i) {
    const d = this.doc;
    this.clear();
    if (i < 0 || i >= STEPS.length) { this.end(); return; }
    this.i = i;
    const s = STEPS[i], target = d.getElementById(s.el);
    if (target) {
      target.classList.add("tour-on");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (!this.card) {
      this.card = d.createElement("div");
      this.card.className = "tour-card";
      this.card.setAttribute("role", "dialog");
      this.card.setAttribute("aria-live", "polite");
      d.body.appendChild(this.card);
      this.keys = (e) => {
        if (e.key === "Escape") this.end();
        else if (e.key === "ArrowRight") this.show(this.i + 1);
        else if (e.key === "ArrowLeft" && this.i > 0) this.show(this.i - 1);
      };
      d.addEventListener("keydown", this.keys);
    }
    this.card.innerHTML = `<div class="tour-n">${i + 1} / ${STEPS.length}</div><h3>${s.title}</h3><p>${s.text}</p>
      <div class="tour-b"><button data-t="back"${i === 0 ? " disabled" : ""}>Back</button><button data-t="end">Close</button><button data-t="next">${i === STEPS.length - 1 ? "Done" : "Next"}</button></div>`;
    this.card.querySelector('[data-t="back"]').onclick = () => this.show(this.i - 1);
    this.card.querySelector('[data-t="next"]').onclick = () => this.show(this.i + 1);
    this.card.querySelector('[data-t="end"]').onclick = () => this.end();
    this.card.querySelector('[data-t="next"]').focus();
  }

  clear() { for (const e of this.doc.querySelectorAll(".tour-on")) e.classList.remove("tour-on"); }

  end() {
    this.clear();
    if (this.card) { this.card.remove(); this.card = null; this.doc.removeEventListener("keydown", this.keys); }
    this.i = -1;
  }
}
