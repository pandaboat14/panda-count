import { doublePrecision, integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pandaStatus = pgEnum("panda_status", ["resident", "incoming"]);
export const pandaSex = pgEnum("panda_sex", ["Male", "Female"]);

export const zoos = pgTable("zoos", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location").notNull(),
  // The zoo's giant panda page.
  url: text("url"),
  // Where the zoo sits on the World globe.
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
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

// World tab: places outside the US that hold giant pandas, tracked as counts rather than individuals.
export const placeKind = pgEnum("place_kind", ["zoo", "breeding_center"]);

export const worldPlaces = pgTable("world_places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: placeKind("kind").notNull().default("zoo"),
  city: text("city").notNull(),
  country: text("country").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  count: integer("count").notNull(),
  // Announced but not yet arrived.
  incoming: integer("incoming").notNull().default(0),
  // Comma-separated names, when known.
  names: text("names").notNull().default(""),
  note: text("note").notNull().default(""),
  // "YYYY-MM" or "YYYY-MM-DD": when the count was last confirmed.
  asOf: text("as_of").notNull(),
  sourceUrl: text("source_url"),
  updatedBy: text("updated_by"),
  updatedByName: text("updated_by_name"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// World tab: wild populations by mountain range, drawn as a heat glow over an ellipse.
export const wildRanges = pgTable("wild_ranges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  province: text("province").notNull(),
  estimate: integer("estimate").notNull(),
  survey: text("survey").notNull(),
  sourceUrl: text("source_url"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // Half-extent of the range in degrees.
  spanLat: doublePrecision("span_lat").notNull(),
  spanLng: doublePrecision("span_lng").notNull(),
  // Rotation of the ellipse in degrees, counter-clockwise from east.
  angle: doublePrecision("angle").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedByName: text("updated_by_name"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
