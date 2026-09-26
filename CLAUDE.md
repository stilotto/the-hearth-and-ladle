# The Common Room

A tavern simulation served by GitHub Pages. It's plain static files with ES
modules and no build step, so a push to `main` is a deploy.

## How we work

- Push straight to `main`; a push is how the human reviews the game.
- No bundler, no npm dependencies. Google Fonts is the only external request.
- It must work at phone width and honor prefers-reduced-motion (`G.reduced`).
- Test locally with `python3 -m http.server` (modules won't load from file://).

## Architecture notes

- `G` in `js/state.js` is the single world state; `emit`/`on` connect sim → UI.
- Time is in game minutes (`G.t`); 1× speed is one game minute per real second.
  Each evening runs 16:00 → ~02:30, then the dawn accusation modal.
- Agent routines are generators that yield instructions: a number (wait
  minutes), `{walk:[x,y]}`, `{cond:fn, max}`. `agent.interrupt(gen)` pushes a
  plot beat on top of the routine and resumes it afterwards.
- Clues come from `speak(..., {clue})` or `witness(...)` and are only recorded
  if the player's ear (selected agent, or the clicked spot) is within range.
- No gendered pronouns for characters in generated text; use names or "they".
