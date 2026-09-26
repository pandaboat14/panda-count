import "server-only";
import { sql } from "./game/sql";

// Records a problem in app_errors so it can be looked up later. Never throws: logging must not break the game.
export async function logError(source: string, message: string, detail?: unknown, userId?: string | null) {
  console.error(`[${source}] ${message}`, detail ?? "");
  if (!process.env.DATABASE_URL) return;
  try {
    await sql().query(`INSERT INTO app_errors (source, message, detail, user_id) VALUES ($1, $2, $3::jsonb, $4)`, [
      source.slice(0, 80),
      message.slice(0, 1000),
      JSON.stringify(detail ?? null).slice(0, 8000),
      userId ?? null,
    ]);
  } catch (e) {
    console.error("Couldn't record an error", e);
  }
}

export function describe(e: unknown) {
  return e instanceof Error ? { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 8).join("\n") } : { value: String(e) };
}
