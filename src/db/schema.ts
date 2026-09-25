import { pgEnum, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const pandaStatus = pgEnum("panda_status", ["resident", "incoming"]);
export const pandaSex = pgEnum("panda_sex", ["Male", "Female"]);

export const zoos = pgTable("zoos", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location").notNull(),
  // The zoo's giant panda page.
  url: text("url"),
});

export const pandas = pgTable("pandas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  chinese: text("chinese").notNull().default(""),
  sex: pandaSex("sex").notNull(),
  // "YYYY-MM-DD", or just "YYYY" when only the year is known.
  born: text("born").notNull(),
  origin: text("origin").notNull().default("Sichuan Province"),
  birthplace: text("birthplace").notNull().default(""),
  zooId: integer("zoo_id")
    .notNull()
    .references(() => zoos.id),
  // "YYYY-MM-DD"; null until the panda arrives.
  arrived: text("arrived"),
  // "resident" = in a US zoo now (counted), "incoming" = announced / in transit (shown, not counted).
  status: pandaStatus("status").notNull(),
  fact: text("fact").notNull().default(""),
  // Neon Auth user (neon_auth.user.id) who last saved this panda; null for seeded rows.
  updatedBy: text("updated_by"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
