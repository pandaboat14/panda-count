import "server-only";
import { asc, eq, max } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { pandas, zoos } from "@/db/schema";
import { SEED_PANDAS, SEED_UPDATED, SEED_ZOOS } from "@/db/seed-data";
import type { Panda, Roster } from "./types";

function seedRoster(): Roster {
  return {
    lastUpdated: SEED_UPDATED,
    pandas: SEED_PANDAS.map((p, i) => {
      const zoo = SEED_ZOOS.find((z) => z.name === p.zoo)!;
      return { ...p, id: i + 1, location: zoo.location, zooUrl: zoo.url, updatedByName: null };
    }),
  };
}

export async function getRoster(): Promise<Roster> {
  if (!hasDatabase()) return seedRoster();
  const [rows, [latest]] = await Promise.all([
    db()
      .select({
        id: pandas.id,
        name: pandas.name,
        chinese: pandas.chinese,
        sex: pandas.sex,
        born: pandas.born,
        origin: pandas.origin,
        birthplace: pandas.birthplace,
        zoo: zoos.name,
        location: zoos.location,
        zooUrl: zoos.url,
        arrived: pandas.arrived,
        status: pandas.status,
        fact: pandas.fact,
        updatedByName: pandas.updatedByName,
      })
      .from(pandas)
      .innerJoin(zoos, eq(pandas.zooId, zoos.id))
      .orderBy(asc(pandas.arrived), asc(pandas.id)),
    db().select({ at: max(pandas.updatedAt) }).from(pandas),
  ]);
  return {
    pandas: rows,
    lastUpdated: (latest?.at ?? new Date()).toISOString().slice(0, 10),
  };
}

export async function getPanda(id: number): Promise<Panda | null> {
  const { pandas } = await getRoster();
  return pandas.find((p) => p.id === id) ?? null;
}

export async function getZoos() {
  if (!hasDatabase()) return SEED_ZOOS;
  return db().select({ name: zoos.name, location: zoos.location, url: zoos.url }).from(zoos).orderBy(asc(zoos.name));
}
