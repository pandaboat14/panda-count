import "server-only";
import { asc, desc } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { wildRanges, worldPlaces } from "@/db/schema";
import { CAPTIVE_TOTAL, SEED_PLACES, SEED_WILD, SEED_ZOO_COORDS } from "@/db/world-data";
import { getRoster, getZoos } from "./roster";
import type { WildRange, World, WorldPlace } from "./types";

// US zoos, built from the main roster so the globe always agrees with the headline count.
async function usPlaces(): Promise<WorldPlace[]> {
  const [{ pandas, lastUpdated }, zooRows] = await Promise.all([getRoster(), getZoos()]);
  const byZoo = new Map<string, WorldPlace>();
  for (const p of pandas) {
    const zoo = zooRows.find((z) => z.name === p.zoo);
    const coords = zoo?.lat != null && zoo.lng != null ? { lat: zoo.lat, lng: zoo.lng } : SEED_ZOO_COORDS[p.zoo];
    if (!coords) continue;
    if (!byZoo.has(p.zoo)) {
      byZoo.set(p.zoo, {
        id: -(byZoo.size + 1),
        name: p.zoo,
        kind: "zoo",
        city: p.location,
        country: "United States",
        ...coords,
        count: 0,
        incoming: 0,
        names: "",
        note: "",
        asOf: lastUpdated,
        sourceUrl: p.zooUrl,
        us: true,
      });
    }
    const place = byZoo.get(p.zoo)!;
    if (p.status === "resident") place.count++;
    else place.incoming++;
    place.names = place.names ? `${place.names}, ${p.name}` : p.name;
  }
  return [...byZoo.values()];
}

function seedWorld(): Pick<World, "places" | "wild"> {
  return {
    places: SEED_PLACES.map((p, i) => ({ incoming: 0, names: "", note: "", ...p, id: i + 1 })),
    wild: SEED_WILD.map((r, i) => ({ ...r, id: i + 1 })),
  };
}

export async function getWorld(): Promise<World> {
  const [base, us] = await Promise.all([
    hasDatabase()
      ? Promise.all([
          db().select().from(worldPlaces).orderBy(desc(worldPlaces.count), asc(worldPlaces.name)),
          db().select().from(wildRanges).orderBy(desc(wildRanges.estimate)),
        ]).then(([places, wild]) => ({ places: places as WorldPlace[], wild: wild as WildRange[] }))
      : Promise.resolve(seedWorld()),
    usPlaces(),
  ]);
  return { places: [...base.places, ...us], wild: base.wild, captive: CAPTIVE_TOTAL };
}

export async function getPlace(id: number) {
  const { places } = await getWorld();
  return places.find((p) => p.id === id && !p.us) ?? null;
}

export async function getWildRange(id: number) {
  const { wild } = await getWorld();
  return wild.find((r) => r.id === id) ?? null;
}
