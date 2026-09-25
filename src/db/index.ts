import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let client: ReturnType<typeof drizzle<typeof schema>> | undefined;

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  client ??= drizzle(neon(process.env.DATABASE_URL), { schema });
  return client;
}
