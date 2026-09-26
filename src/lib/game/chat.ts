import "server-only";
import { randomInt } from "node:crypto";
import { botReply } from "@/game/botChat";
import { GameError, type GameState } from "@/game/engine";
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
  // The sender must be a person in the game; the recipient can be anyone seated in it, computer players included.
  const rows = await sql().query(
    `INSERT INTO game_messages (game_id, from_id, to_id, body)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $2)
        AND ($3::text IS NULL OR EXISTS (
          SELECT 1 FROM games g, jsonb_array_elements(g.state->'players') p WHERE g.id = $1 AND p->>'id' = $3))
     RETURNING ${COLUMNS}`,
    [gameId, fromId, toId, body],
  );
  if (!rows.length) throw new GameError("That Kird isn't in this game.");
  const message = rows[0] as ChatMessage;
  await botsAnswer(gameId, message).catch((e) => console.error("Bot chat failed", e));
  return message;
}

// Computer players answer what's said to them privately, and now and then chime in on the group chat.
async function botsAnswer(gameId: number, m: ChatMessage) {
  const rows = await sql().query(`SELECT state FROM games WHERE id = $1`, [gameId]);
  const state = rows[0]?.state as GameState | undefined;
  if (!state) return;
  const bots = state.players.filter((p) => p.bot);
  const rand = () => randomInt(1_000_000) / 1_000_000;
  const who = m.to ? bots.find((b) => b.id === m.to) : rand() < 0.5 ? bots[Math.floor(rand() * bots.length)] : undefined;
  if (!who?.bot) return;
  await sql().query(`INSERT INTO game_messages (game_id, from_id, to_id, body) VALUES ($1, $2, $3, $4)`, [
    gameId,
    who.id,
    m.to ? m.from : null,
    botReply(who.bot, m.body, rand),
  ]);
}
