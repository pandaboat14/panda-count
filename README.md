# Panda Count

A running count of every giant panda living in the United States, shown as a 3D scene: one bamboo
island per zoo, a panda for each resident, and a canoe for pandas on their way. Friends can sign
in to add pandas or update them.

- **Next.js 16** (App Router) on **Vercel**
- **React Three Fiber** + **drei** + **three.js** for the scene (`src/components/world/`)
- **Neon Postgres** through **Drizzle ORM** (`src/db/`)
- **Neon Auth** for sign-in (`src/lib/auth/`, pages under `/auth/*` and `/account/*`)

Without `DATABASE_URL`, the site shows the original roster (`src/db/seed-data.ts`) read-only. That
covers local tinkering and preview deploys that have no database.

## One-time setup

1. **Import the repo into Vercel.** Go to vercel.com/new and pick `pandaboat14/panda-count`. The
   Next.js preset needs no extra settings.
2. **Add Neon.** In the Vercel project, open **Storage**, choose **Create Database**, then **Neon**.
   Connect the database to all environments. This sets `DATABASE_URL` for you.
3. **Turn on Neon Auth.** In the Neon Console, open the project, go to **Auth**, and enable it.
   Copy the **Auth URL**. You can also switch on Google/GitHub sign-in there.
4. **Add the auth env vars** in Vercel under **Settings**, then **Environment Variables**:
   - `NEON_AUTH_BASE_URL`: the Auth URL from step 3
   - `NEON_AUTH_COOKIE_SECRET`: 32+ random characters (`openssl rand -base64 32`)
   - `EDITOR_EMAILS` (optional, recommended): comma-separated emails of the friends allowed to
     edit. If you leave it unset, anyone who signs up can edit.
5. **Create the tables and load the current pandas.** Run this once from your machine:
   ```sh
   npm install
   npx vercel link && npx vercel env pull .env.local
   npm run db:migrate
   npm run db:seed
   ```
6. **Redeploy** so the new env vars take effect.
7. **Move the domain.** In Vercel, open **Settings**, then **Domains**, and add `pandacount.net`.
   Then update DNS as Vercel shows. Once it's live on Vercel, turn off GitHub Pages for this repo.

## World tab

`/world` is a 3D globe of every giant panda on Earth:
- a heat glow over the six wild mountain ranges in China, using the 4th national survey estimates
- columns for China's two big breeding centres, every zoo abroad, and the US zoos (from the USA roster)

Its data lives in the `world_places` and `wild_ranges` tables. The starting dataset, with a source link and "as of" date per place, is in `src/db/world-data.ts`. Editors can update counts from each place's card, add a place with **+ Add a place**, and update wild estimates when a new survey comes out.

## Game tab: Panda Diplomacy

`/game` is the Kirds' online, turn-based, never-ending 3D strategy game (Risk meets Catan on the globe).
- Anyone with an account can create a world and share its invite link (`/game/join/CODE`), and players can join at any time.
- **Rules:** all of them live in `src/game/`.
  - `regions.ts`: the ~60-region map and its gondola neighbours.
  - `rules.ts`: every cost and number, the units, buildings and heroes.
  - `worldEvents.ts`: the round-by-round event deck.
  - `engine.ts`: the pure rules engine, including fog of war.
- **Where it runs:** the engine runs only on the server (`src/lib/game/store.ts`, `src/app/api/game/[id]`). Browsers get a fog-filtered view, and every move is validated and saved atomically with optimistic locking.
- **Tests:** `npm test` runs the engine tests, including a fuzzer that plays thousands of random actions and checks the world never breaks.
- **Turn emails:** when a turn passes, the next player gets an email with a "since your last turn" summary, sent through [Resend](https://resend.com). Set `RESEND_API_KEY` (and optionally `EMAIL_FROM`, default `Panda Diplomacy <turns@pandacount.net>`) in Vercel, and verify pandacount.net in Resend. Without the key, emails are simply skipped. Players can switch emails off with the 🔔 button in a game.
- **Adding a season:** add cards to `worldEvents.ts` with a higher `season`, then bump `season` in a game's state to put them in its deck.

## Everyday use

- Anyone can view the count. Signed-in editors see **+ Add a panda**, and an **Edit** button on
  each trading card.
- When an incoming panda arrives, edit it and set the status to **Here now** with an arrival date.
  It joins the count and moves from the canoe onto its zoo's island.

## Development

```sh
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build
```

Schema changes: edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in
`drizzle/`. After that, run `npm run db:migrate`.
