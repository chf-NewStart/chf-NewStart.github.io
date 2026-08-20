# Saddle escape — the honest local-minimum animation

A remake of the "ball stuck in a local minimum escapes through a higher
dimension" animation, with the two things fixed that the original fudged:

1. The starting point is a **real saddle** of the surface (a true minimum
   along x, gently downhill along y) — found numerically, not painted on.
2. The ball **lands**: it rolls around the barrier into a genuinely lower
   bowl, sloshes, and comes to rest at the global minimum. No falling off
   the edge of the world forever.

The whole journey is rigid-body physics from frame 1. The ball has no
animation keyframes at all — it tips off the saddle, arcs around the hill,
and is captured by the well entirely on its own.

## How to run it

1. Install Blender (blender.org, it's free — any 4.x works, tested on 4.5).
2. Open Blender → **Scripting** tab → **Open** → `saddle_ball.py` → **Run Script**.
3. Hover the viewport and press **Spacebar** to watch it live.
4. **Ctrl+F12** renders the full animation (set the output path in
   Output Properties first — default writes to `/tmp`).

**Before rendering**: play the animation through once (or Scene Properties →
Rigid Body World → Cache → **Bake All Dynamics**). Rendering with a cold
physics cache gives you 345 frames of the ball sitting perfectly still —
the renderer does not run the simulation on its own.

Every run rebuilds the scene from scratch, so tweak a number, run again,
and play. Nothing you do in the file can wreck a saved scene.

## The surface

Three terms, that's the whole trick (in `height()`):

| term | what it does |
|---|---|
| `bowl` | wide paraboloid centered on the true minimum at (2.4, 0) |
| `barrier` | Gaussian hill blocking the straight path. Its skirt **is** the fake valley: walls you in along x, falls away along y — a saddle |
| `well` | deeper Gaussian dip at the bowl center, so the ball is visibly captured and rests below everything else |

## Knobs worth turning

- `BALL_START` y-offset (±0.08): which side it escapes, and how long it
  hesitates — smaller magnitude = longer dramatic pause.
- `barrier` height `2.2` / y-width `0.7`: taller or wider-skirted hill.
  If you widen y a lot the saddle can turn into a true minimum and the
  ball will (correctly!) stay stuck forever.
- `well` depth `-1.2` / width `0.6`: how emphatic the landing is.
- `rb.linear_damping` / `rb.angular_damping`: how quickly the final slosh
  dies out.
- `cam_key(...)` lines at the bottom: the camera move — starts side-on
  (reads like a 2D curve), swings up and around as the ball escapes.
- `FRAME_END = 345` at 30 fps ≈ 11.5 s.

## The ascending version

A ball can't roll uphill, but a balloon can rise: `saddle_balloon.py` is the
mirror image — the surface flipped into a hanging canopy, gravity pointed up.
The balloon starts trapped in a pocket (the same saddle, upside down), slips
sideways through the dimension it wasn't using, rises around the hanging
ridge, and lodges in the **highest** dome. Identical equations, identical
honesty, opposite direction. Runs exactly like the ball version.

It gets the full balloon treatment: a sky gradient, a couple of clouds, and
a string with a knot. The string hangs from an anchor that copies the
balloon's position but not its rotation — so it trails the flight without
spinning as the balloon rolls along the canopy.

## The stages version

`saddle_balloon_stages.py` — from a sticky-note sketch: instead of one
escape, the ceiling rises like a staircase. The balloon escapes its first
pocket, is caught AGAIN behind a second barrier — this one walled on the
side it arrives on — weaves across to the open side, climbs around, and
settles under the highest dome. Total rise: about four units, three stages,
still pure physics from frame 1.

The trick that makes stage two work without knife-edge tuning: the barrier
is lopsided (a wall on the arrival side, a channel on the other), and the
middle section of the canopy leans gently toward the open side, so the
weave always has somewhere to go.

## Files

- `saddle_ball.py` — the scene builder (everything above).
- `preview.mp4` — headless-rendered preview of exactly what the script produces.
- `reply.mp4` — the captioned cut: opens with the heckle ("a graph of going
  down in life"), lets the physics answer it, ends on "you were reading the
  axis. i was watching the ball."
- `saddle_balloon.py` / `balloon.mp4` — the ascending version: the balloon
  rises out of its pocket and settles at the top.
- `saddle_balloon_stages.py` / `stages.mp4` — the staircase: stuck, rise,
  caught again, weave, rise, summit.
