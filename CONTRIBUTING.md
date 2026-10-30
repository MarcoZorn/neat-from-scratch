# Working on neat-from-scratch

No build step, no dependencies: Node and a browser.

## Tests

```
node test.mjs
```

Prints `ok ...` per check and `all checks passed`; the exit code is the verdict. It runs evolution end to
end from a fixed seed and asserts the cars get better, so a change to the algorithm that breaks learning
fails here. Every new feature comes with a check in `test.mjs`.

## Where results go

- Experiments are scripts in `tmp/` (not committed), with their logs next to them.
- What is worth keeping goes into `README.md` under "Things worth trying", with the numbers copied from
  the log and the seeds and generations that produced them.

## Rules

- More than one seed. A result on one or two seeds is a hint; say so.
- A change that did not help is written up as plainly as one that did.
- Every number you write is copied from a command's output, not typed from memory.

## Commits

Small, one idea each, terse messages. Check `git status` before committing.
