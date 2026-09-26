# The Common Room

A living tavern in the tradition of the Prancing Pony and the Inn of the Last
Home. Evening falls, the candles get lit, and the common room fills with
locals, travelers, a company of adventurers and a hooded stranger in the corner.
Somebody has something to hide.

You don't control anyone. You **listen**:

- Click a person to follow them and hear everything they say.
- Click anywhere else to rest your ear on that spot.
- Every night one of three mysteries plays out (The Sealed Map, The Stolen
  Relic, The Bitter Cup). Clues only reach your journal if you happen to be
  listening when they happen.
- At dawn, name the guilty.

## Run it

It's static files with no build step. ES modules need to be served over http:

```
python3 -m http.server
```

Then open http://localhost:8000.

## Layout

| File | What it does |
| --- | --- |
| `js/world.js` | Tile map, furniture, seats, light fixtures, A* pathfinding, town lore |
| `js/sprites.js` | Procedural pixel-art people (kin, build, clothes, hats, weapons) |
| `js/sim.js` | Agents and their routines (generators), conversations, the evening's clock |
| `js/plot.js` | The three mysteries: roles, scripted beats, clues, outcomes |
| `js/talk.js` | Everything anyone says |
| `js/render.js` | Room art, y-sorted drawing, light map, particles, speech bubbles |
| `js/audio.js` | Procedural fire, rain, murmur, thunder, and a Karplus-Strong lute |
| `js/ui.js` | Panels, journal, guest list, intro and dawn modals |
