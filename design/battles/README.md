# Battles v2 and 3D dice: design prototypes

These are the working prototypes behind the Pokémon-style invasions, the 3D battle scene, battle replays and the
3D start-of-turn dice. They're plain browser pages (three.js and cannon-es from a CDN), not part of the Next.js
app. ESLint ignores this folder, and nothing in `src/` imports it.

## Decisions so far

- **Start-of-turn dice: Map Drop** (variant B in `chance-cubes.html`), shipped in #14. The player throws their dice onto a
  tabletop world map, and a report says what everyone collected. This is built into the game in
  `src/components/game/MapDrop.tsx` and friends.
- **Battles: clashes happen in a 3D scene that shows every unit.** All squads on both sides stand on the field,
  one figure per unit. The squad on point is up front with a ring in its side's colour, and the reserves wait
  behind it, cheer their side's hits, and march up when they're called in. This holds in all three looks.
- Still open: which battle look (Classic Duel, War Table or Showdown), which art style (Toybox, Low-poly or
  Toon) and which catch-up format (Theater, Chronicle or Highlights).

## The pages

| Page | What it shows |
| --- | --- |
| `pages/chance-cubes.html` | Three start-of-turn dice experiences: A Felt Tray, B Map Drop (picked), C Chance Cube Cup. |
| `pages/battle-arena.html` + `arena.js` + `arena.css` | A playable invasion: the move menu, the Bag, reactions, Sun Tzu auto-play, three looks, three art styles, and a replay from the defender's side. |
| `pages/catch-up.html` + `catchup.js` | "Since your last turn": the battles you missed, replayed with the same dice (Theater, Chronicle and Highlights). Reuses the arena in embed mode. |
| `pages/barracks.html` | Every fighter and hero in the three styles, with gear, squads and all nine animations. |
| `pages/war-codex.html` | The rulebook: types, all 52 moves, gear, items, statuses, terrain, Standing Orders, a Dice Lab and the balance numbers. |
| `pages/*-dev.html` | Faster builds of the arena and catch-up that use `shared/models-stub.js` instead of the full models. |

Published copies: [Chance Cubes](https://claude.ai/artifact/Mpq5ehStBRWQX12ddhrPUP),
[Battle arena](https://claude.ai/artifact/SRaT7PTPsKkJVL9j1eddHm),
[Since your last turn](https://claude.ai/artifact/C9rX3cAjK7KW78wieJGAJa),
[The Barracks](https://claude.ai/artifact/4K51kcp7txPRZ5nXJs2mvd),
[War Codex](https://claude.ai/artifact/8VngrBhpjEyjDaf3Ae3E8U).

## Shared modules

| File | What it is |
| --- | --- |
| `shared/codex-data.js` | `CODEX`: every number in the battle rules (types, units, heroes, moves, weapons, items, statuses, terrain, buildings, events, doctrines, `RULES`). |
| `shared/battle-engine.js` | `Battle`: the rules engine. `createBattle`, then per round `beginRound(b, atkAction, defAction)`, optional `react`/`aiReact`, and `finishRound(b)`. Also the AI (`aiAction`, `autoRound`), `preview`/`estimate` odds and `summary`. Every event carries a snapshot so replays need nothing else. |
| `shared/balance-data.js` | Win rates from `balance-json.cjs`, shown in the War Codex. |
| `shared/dice.js` | `Dice`: physics dice. A throw is pre-simulated with cannon-es from a seed, then each die is turned so the face that lands up is the server's number. The same record replays the same tumble for everyone. |
| `shared/models.js` | `Models`: the figures (`buildFigure`, `buildSquad`, `buildProp`, `buildProjectile`), built from primitives in code, rigged and animated procedurally in three styles. |
| `shared/models-stub.js` | A light stand-in with the same API, for quick iteration. |

## Building and testing

Pages include shared modules with `/*@include shared/x.js*/`. To build them into single files in `dist/`:

```sh
node build.mjs                    # every page
node build.mjs battle-arena.html  # one page
```

Open `dist/<page>.html` in a browser (it needs the network for three.js, cannon-es and Google Fonts).

Tests and tools (install the local copies of three and cannon-es first with `npm install --prefix lib`):

- `node fuzz.cjs` plays 3000 random battles through the engine and counts errors (0 today).
- `node balance.cjs` and `node balance-json.cjs` compare win rates with today's Risk rules.
- `node seeds.cjs` finds seeds for the catch-up page's sample battles.
- `node test/smoke.mjs` builds every figure, gear and style combination and plays every animation.
- `node test-sim.mjs`, `node test-pack.mjs` and `node tune.mjs` exercise and tune the dice physics.
- `NODE_PATH=<global node_modules> node shoot.cjs dist/battle-arena.html steps.json shots/name 1280 800` loads
  a page in headless Chromium, runs steps such as
  `[{"waitFor":"window.__arena && !window.__arena.S.busy","timeout":90000},{"shot":"start"}]`, and saves
  screenshots. The `executablePath` inside points at this environment's Chromium; change it for yours.

## Design notes

Source of truth for numbers: `shared/codex-data.js` and `shared/battle-engine.js`. This section explains why.

### Goals

- Invasions become Pokémon-style battles: your squad on one side, theirs on the other, a deep menu of moves, and
  3D dice that decide how well each move lands.
- Keep Risk's heart so the economy and pacing still work: dice pair off highest against highest, ties go to the
  defender, attackers roll 3 to the defender's 2, Forts and heroes add to every die, and every loss is a real unit
  lost on the map.
- Work in an asynchronous game. The defender is usually asleep, so their **Standing Orders** fight for them.
  Everyone can replay the whole battle later.
- Give resources new jobs: weapons and armour (the Armory), power-ups (the Bag), and moves that burn resources.

### One round

1. Both sides choose at the same time: a move (Strike, Guard, Tactic or Signature), a Bag item, a switch to
   another squad, or (attackers only) a retreat. The defender's choice comes from their Standing Orders, or from
   them directly if they're online (Live Defence).
2. Support lands first: switches, heals, reinforcements, smoke, caltrops, Thunder.
3. Both sides throw their dice together. The dice count and bonus come from the move, the unit's attack
   (attackers) or defence (defenders), hero aura, Forts, statuses, terrain and gear.
4. Reactions: after seeing the dice, either side may spend a Lucky Gem (re-throw one die), a Chance Cube
   Blessing (ties go to you), or the Josserkid's Loaded Dice (one die becomes a 6).
5. Pair off highest against highest. Higher total wins the pair; ties go to the defender (Guard moves,
   Blessings and Dazzled can change that).
6. Every pair you win deals your move's power to their squad on point: x1.5 if your type beats theirs,
   x0.75 if theirs beats yours, x0.75 against Legends, x1.5 on a crit (a winning natural 6). Every 10 damage
   fells one unit; wounds carry over.
7. Effects fire, statuses tick down, and a wiped squad is replaced by the next in line.
8. Momentum: +1 per pair won, up to 5. At 5, the squad on point can unleash its Signature move.
9. The battle ends when one side has nobody standing, the attackers retreat (parting shot: 2 dice, each 5+ deals
   8, unless the line was cut or smoked), a Ceasefire, or after 20 rounds (the invasion stalls).

### Core numbers and why

- **HP 10 per unit, for every unit.** Different HP per unit double-counted the attack and defence stats the game
  already has, and made armed pandas beat pandas 100% of the time. With equal HP, "a lost pair costs about one
  unit" (Risk) still holds, and moves shift it (heavy hits 13-16, ranged 7-8, guards 7-8).
- **Attackers add attack, defenders add defence, exactly as today.** Pandas stay stubborn defenders; ogres stay
  terrible ones.
- **Defenders roll one die fewer from Strikes and Signatures** (3 becomes 2, 2 becomes 1): Risk's 3-against-2.
- **Guard moves** add no dice bonus. Instead ties go to you and lost pairs hurt 25% less (Phalanx 40%, Bamboo
  Wall 50%). **Ranged** strikes protect less (15%) but still deal damage.
- **Types:** Fluff (pandas) beats Glam (CAMs), Glam beats Brute (ogres), Brute beats Steel (armed pandas), Steel
  beats Fluff. Heroes are Legend: they take x0.75 from everything and hit every type evenly.
- **Max 4 dice.** Crits on a natural 6 (5+ in Gem Caves and for some moves).

### Balance check

Computer against computer, 400 battles per matchup, next to the same fight under today's Risk rules
(`shared/balance-data.js`). Mirror matches track today's odds within a few points (5 pandas against 5 pandas:
17% against 16%; Fort defence 5% against 9%; a 10-against-10 war 56% against 57%). Type advantage moves a fight
by about 10 to 35 points.

### Standing Orders (async defence)

Set per region on your own turn:
- **Doctrine**: Hold the Walls, Counterpunch, All In or Soft Power. Natives have fixed doctrines.
- **Lead squad**: who meets the invaders first.
- **Traps**: caltrops laid in advance (paid now).
- **Item budget**: how many Bag items the defenders may spend.
- **Live Defence**: if you're online when invaded, you can take command, with a 20-second clock per round.

### Replays and catching up

A battle stores the starting armies, each round's two actions, every die value, rerolls, and each throw's seed.
The server rolls; the browser throws real-physics dice pre-simulated to land on the server's numbers, so the same
seed replays the identical tumble for everyone. "Since your last turn" lists every battle you're allowed to see
(fog rules). Defenders see what their Standing Orders chose, and why.

### How it plugs into the game

- `src/game/engine.ts`: a `move` into an enemy region opens `s.battle` instead of resolving it. New actions:
  `battleRound { action, prep? }`, `battleReact { id, die }`, `battleAuto`. The server rolls with the game's
  seeded RNG. Ending your turn with a battle open lets Sun Tzu finish it. The `battle` event carries the full
  round log; old battles still replay in today's `BattleView`.
- Standing Orders live on each owned region: `orders: { doctrine, lead, traps, budget }`.
- Computer players use the same battle AI with their doctrine.
- The Bank gets an Armory tab (gear per region stack, breaks after 3 battles) and a Bag (items per player).
- `odds.ts` previews become `Battle.preview`.
- A new 3D battle screen replaces `BattleView`, showing every unit on the field, and shares its dice with the
  start-of-turn roll.
