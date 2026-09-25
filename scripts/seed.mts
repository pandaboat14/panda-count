// Loads the original roster into an empty database: `npm run db:seed`.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pandas, zoos } from "../src/db/schema.ts";
import { SEED_PANDAS, SEED_UPDATED, SEED_ZOOS } from "../src/db/seed-data.ts";

const db = drizzle(neon(process.env.DATABASE_URL!));

const existing = await db.select({ id: pandas.id }).from(pandas).limit(1);
if (existing.length) {
  console.log("pandas table already has rows; skipping seed.");
  process.exit(0);
}

const zooRows = await db.insert(zoos).values(SEED_ZOOS).onConflictDoNothing().returning();
const zooId = new Map(zooRows.map((z) => [z.name, z.id]));
const at = new Date(`${SEED_UPDATED}T12:00:00Z`);

await db.insert(pandas).values(
  SEED_PANDAS.map(({ zoo, ...p }) => ({ ...p, zooId: zooId.get(zoo)!, createdAt: at, updatedAt: at })),
);
console.log(`Seeded ${zooRows.length} zoos and ${SEED_PANDAS.length} pandas.`);
