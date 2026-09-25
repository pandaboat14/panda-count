"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, hasDatabase } from "@/db";
import { pandas, zoos } from "@/db/schema";
import { getEditor } from "@/lib/auth/editors";

export type FormState = { error?: string };

const DATE = /^\d{4}(-\d{2}-\d{2})?$/;
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function field(form: FormData, key: string, max = 200) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

async function requireEditor() {
  const user = await getEditor();
  if (!user) redirect("/auth/sign-in");
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set");
  return user;
}

export async function savePanda(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireEditor();

  const id = Number(form.get("id")) || null;
  const name = field(form, "name", 60);
  const sex = field(form, "sex");
  const status = field(form, "status");
  const born = field(form, "born", 10);
  const arrived = field(form, "arrived", 10) || null;
  const zooName = field(form, "zoo", 100);
  const location = field(form, "location", 100);
  const zooUrl = field(form, "zooUrl", 300) || null;

  if (!name) return { error: "Every panda needs a name." };
  if (sex !== "Male" && sex !== "Female") return { error: "Pick male or female." };
  if (status !== "resident" && status !== "incoming") return { error: "Pick a status." };
  if (!DATE.test(born)) return { error: "Birthday should look like 2021-08-04, or just the year." };
  if (arrived && !FULL_DATE.test(arrived)) return { error: "Arrival date should look like 2024-10-15." };
  if (status === "resident" && !arrived) return { error: "Pandas in the count need an arrival date." };
  if (!zooName || !location) return { error: "Say which zoo and where it is." };
  if (zooUrl && !/^https?:\/\//.test(zooUrl)) return { error: "The zoo link should start with https://." };

  const [zoo] = await db()
    .insert(zoos)
    .values({ name: zooName, location, url: zooUrl })
    .onConflictDoUpdate({
      target: zoos.name,
      set: { location, url: sql`coalesce(excluded.url, ${zoos.url})` },
    })
    .returning({ id: zoos.id });

  const values = {
    name,
    chinese: field(form, "chinese", 20),
    sex,
    born,
    origin: field(form, "origin", 100) || "Sichuan Province",
    birthplace: field(form, "birthplace", 150),
    zooId: zoo.id,
    arrived: status === "resident" ? arrived : null,
    status,
    fact: field(form, "fact", 400),
    updatedBy: user.id,
    updatedByName: user.name || user.email,
    updatedAt: new Date(),
  } as const;

  if (id) await db().update(pandas).set(values).where(eq(pandas.id, id));
  else await db().insert(pandas).values(values);

  revalidatePath("/");
  redirect("/");
}

export async function deletePanda(form: FormData) {
  await requireEditor();
  const id = Number(form.get("id"));
  if (id) await db().delete(pandas).where(eq(pandas.id, id));
  revalidatePath("/");
  redirect("/");
}
