"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, hasDatabase } from "@/db";
import { wildRanges, worldPlaces } from "@/db/schema";
import { getEditor } from "@/lib/auth/editors";

export type FormState = { error?: string };

const AS_OF = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function field(form: FormData, key: string, max = 200) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function whole(form: FormData, key: string) {
  const n = Number(field(form, key, 10));
  return Number.isInteger(n) && n >= 0 && n < 100000 ? n : null;
}

async function requireEditor() {
  const user = await getEditor();
  if (!user) redirect("/auth/sign-in");
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set");
  return user;
}

function sourceUrl(form: FormData) {
  const url = field(form, "sourceUrl", 500);
  if (url && !/^https?:\/\//.test(url)) return { error: "The source link should start with https://." };
  return { url: url || null };
}

export async function savePlace(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireEditor();

  const id = Number(form.get("id")) || null;
  const name = field(form, "name", 100);
  const kind = field(form, "kind");
  const city = field(form, "city", 100);
  const country = field(form, "country", 60);
  const lat = Number(field(form, "lat", 20));
  const lng = Number(field(form, "lng", 20));
  const count = whole(form, "count");
  const incoming = whole(form, "incoming") ?? 0;
  const asOf = field(form, "asOf", 10);
  const source = sourceUrl(form);

  if (!name || !city || !country) return { error: "Fill in the place's name, city and country." };
  if (kind !== "zoo" && kind !== "breeding_center") return { error: "Pick zoo or breeding centre." };
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { error: "Latitude should be between -90 and 90, longitude between -180 and 180." };
  }
  if (count === null) return { error: "The panda count should be a whole number (0 is fine)." };
  if (count === 0 && incoming === 0) return { error: "A place needs at least one panda, here or on the way." };
  if (!AS_OF.test(asOf)) return { error: "“As of” should look like 2026, 2026-08 or 2026-08-15." };
  if ("error" in source) return source;
  if (country === "United States") return { error: "US zoos come from the USA tab — add their pandas there instead." };

  const values = {
    name,
    kind,
    city,
    country,
    lat,
    lng,
    count,
    incoming,
    names: field(form, "names", 400),
    note: field(form, "note", 400),
    asOf,
    sourceUrl: source.url,
    updatedBy: user.id,
    updatedByName: user.name || user.email,
    updatedAt: new Date(),
  } as const;

  if (id) await db().update(worldPlaces).set(values).where(eq(worldPlaces.id, id));
  else await db().insert(worldPlaces).values(values);

  revalidatePath("/world");
  redirect("/world");
}

export async function deletePlace(form: FormData) {
  await requireEditor();
  const id = Number(form.get("id"));
  if (id) await db().delete(worldPlaces).where(eq(worldPlaces.id, id));
  revalidatePath("/world");
  redirect("/world");
}

export async function saveWildRange(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireEditor();
  const id = Number(form.get("id"));
  const estimate = whole(form, "estimate");
  const survey = field(form, "survey", 120);
  const source = sourceUrl(form);

  if (!id) return { error: "Missing range." };
  if (!estimate) return { error: "The estimate should be a whole number." };
  if (!survey) return { error: "Say which survey the estimate comes from." };
  if ("error" in source) return source;

  await db()
    .update(wildRanges)
    .set({ estimate, survey, sourceUrl: source.url, updatedBy: user.id, updatedByName: user.name || user.email, updatedAt: new Date() })
    .where(eq(wildRanges.id, id));

  revalidatePath("/world");
  redirect("/world");
}
