// Fills an empty database with the starting data: `npm run db:seed`.
// Each part only runs if its table is empty, so it's safe to re-run after new migrations.
import { neon } from "@neondatabase/serverless";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { pandas, wildRanges, worldPlaces, zoos } from "../src/db/schema.ts";
import { SEED_PANDAS, SEED_UPDATED, SEED_ZOOS } from "../src/db/seed-data.ts";
import { SEED_PLACES, SEED_WILD, SEED_ZOO_COORDS } from "../src/db/world-data.ts";

const db = drizzle(neon(process.env.DATABASE_URL!));

if ((await db.select({ id: pandas.id }).from(pandas).limit(1)).length) {
  console.log("pandas: already has rows; skipping.");
} else {
  const zooRows = await db.insert(zoos).values(SEED_ZOOS).onConflictDoNothing().returning();
  const zooId = new Map(zooRows.map((z) => [z.name, z.id]));
  const at = new Date(`${SEED_UPDATED}T12:00:00Z`);
  await db.insert(pandas).values(
    SEED_PANDAS.map(({ zoo, ...p }) => ({ ...p, zooId: zooId.get(zoo)!, createdAt: at, updatedAt: at })),
  );
  console.log(`pandas: seeded ${zooRows.length} zoos and ${SEED_PANDAS.length} pandas.`);
}

for (const [name, { lat, lng }] of Object.entries(SEED_ZOO_COORDS)) {
  await db.update(zoos).set({ lat, lng }).where(and(eq(zoos.name, name), isNull(zoos.lat)));
}
console.log("zoos: filled in missing map coordinates.");

if ((await db.select({ id: worldPlaces.id }).from(worldPlaces).limit(1)).length) {
  console.log("world_places: already has rows; skipping.");
} else {
  await db.insert(worldPlaces).values(SEED_PLACES);
  console.log(`world_places: seeded ${SEED_PLACES.length} places.`);
}

if ((await db.select({ id: wildRanges.id }).from(wildRanges).limit(1)).length) {
  console.log("wild_ranges: already has rows; skipping.");
} else {
  await db.insert(wildRanges).values(SEED_WILD);
  console.log(`wild_ranges: seeded ${SEED_WILD.length} ranges.`);
}
