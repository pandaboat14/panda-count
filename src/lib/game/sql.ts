import "server-only";
import { neon } from "@neondatabase/serverless";

// Raw SQL over Neon's HTTP driver, for the game's multi-statement writes.
export const sql = () => neon(process.env.DATABASE_URL!);
