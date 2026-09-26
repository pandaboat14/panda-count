import "server-only";
import { GameError } from "@/game/engine";
import { sql } from "./sql";

export type ChatMessage = { id: number; from: string; to: string | null; body: string; at: string };

const COLUMNS = `id, from_id AS "from", to_id AS "to", body, created_at AS "at"`;

// Everything said to everyone, plus private messages to or from this player.
export async function messagesFor(gameId: number, userId: string, afterId = 0): Promise<ChatMessage[]> {
  const rows = await sql().query(
    `SELECT ${COLUMNS} FROM game_messages
      WHERE game_id = $1 AND id > $3 AND (to_id IS NULL OR to_id = $2 OR from_id = $2)
      ORDER BY id DESC LIMIT 200`,
    [gameId, userId, afterId],
  );
  return (rows as ChatMessage[]).reverse();
}

export async function latestMessageId(gameId: number, userId: string): Promise<number> {
  const rows = await sql().query(
    `SELECT coalesce(max(id), 0)::int AS id FROM game_messages
      WHERE game_id = $1 AND (to_id IS NULL OR to_id = $2 OR from_id = $2)`,
    [gameId, userId],
  );
  return rows[0]?.id ?? 0;
}

export async function postMessage(gameId: number, fromId: string, toId: string | null, raw: string) {
  const body = raw.replace(/\s+$/g, "").slice(0, 600);
  if (!body.trim()) throw new GameError("Say something first.");
  // Both ends must be in the game; the insert only happens if they are.
  const rows = await sql().query(
    `INSERT INTO game_messages (game_id, from_id, to_id, body)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $2)
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $3))
     RETURNING ${COLUMNS}`,
    [gameId, fromId, toId, body],
  );
  if (!rows.length) throw new GameError("That Kird isn't in this game.");
  return rows[0] as ChatMessage;
}
