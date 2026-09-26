import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomInt } from "node:crypto";
import {
  GameError,
  addPlayer,
  applyAction,
  createGame,
  eventVisible,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type GameView,
} from "@/game/engine";

const sql = () => neon(process.env.DATABASE_URL!);

export type GameRow = { id: number; name: string; code: string; hostId: string; state: GameState; version: number };

export type GamePayload = {
  id: number;
  name: string;
  code: string;
  hostId: string;
  version: number;
  view: GameView;
  events: GameEvent[];
};

export async function loadGame(id: number): Promise<GameRow | null> {
  const rows = await sql().query(
    `SELECT id, name, code, host_id AS "hostId", state, version FROM games WHERE id = $1`,
    [id],
  );
  return (rows[0] as GameRow | undefined) ?? null;
}

export async function gameIdForCode(code: string): Promise<number | null> {
  const rows = await sql().query(`SELECT id FROM games WHERE code = $1`, [code.toUpperCase()]);
  return (rows[0]?.id as number | undefined) ?? null;
}

export async function isMember(gameId: number, userId: string) {
  const rows = await sql().query(`SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $2`, [gameId, userId]);
  return rows.length > 0;
}

// Saves the new state and its events in one statement, but only if nobody else moved first.
async function commit(
  row: GameRow,
  state: GameState,
  events: GameEvent[],
  newPlayer?: { userId: string; name: string },
): Promise<boolean> {
  const rows = await sql().query(
    `WITH upd AS (
       UPDATE games SET state = $1::jsonb, version = version + 1, updated_at = now()
       WHERE id = $2 AND version = $3
       RETURNING id
     ),
     ev AS (
       INSERT INTO game_events (game_id, seq, event)
       SELECT upd.id, (e->>'seq')::int, e FROM upd, jsonb_array_elements($4::jsonb) AS e
       RETURNING 1
     ),
     pl AS (
       INSERT INTO game_players (game_id, user_id, name)
       SELECT upd.id, $5, $6 FROM upd WHERE $5::text IS NOT NULL
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM upd)::int AS updated`,
    [JSON.stringify(state), row.id, row.version, JSON.stringify(events), newPlayer?.userId ?? null, newPlayer?.name ?? null],
  );
  return rows[0]?.updated === 1;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

export async function createNewGame(name: string, host: { id: string; name: string }) {
  const state = createGame(randomInt(2 ** 31), Date.now());
  const events = addPlayer(state, host.id, host.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await sql().query(
        `WITH g AS (
           INSERT INTO games (name, code, host_id, state) VALUES ($1, $2, $3, $4::jsonb) RETURNING id
         ),
         ev AS (
           INSERT INTO game_events (game_id, seq, event)
           SELECT g.id, (e->>'seq')::int, e FROM g, jsonb_array_elements($5::jsonb) AS e
         ),
         pl AS (
           INSERT INTO game_players (game_id, user_id, name) SELECT g.id, $3, $6 FROM g
         )
         SELECT id FROM g`,
        [name, newCode(), host.id, JSON.stringify(state), JSON.stringify(events), host.name],
      );
      return rows[0].id as number;
    } catch (e) {
      // Retry only on an invite-code collision.
      if (!String((e as Error).message).includes("games_code_unique")) throw e;
    }
  }
  throw new Error("Couldn't pick an invite code, try again.");
}

// Runs an engine step against the latest state, retrying if someone else saved in between.
async function mutate(
  gameId: number,
  step: (s: GameState) => GameEvent[],
  newPlayer?: { userId: string; name: string },
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await loadGame(gameId);
    if (!row) throw new GameError("That game doesn't exist.");
    const state = row.state;
    const events = step(state);
    if (await commit(row, state, events, newPlayer)) return;
  }
  throw new GameError("Lots going on right now. Try that again.");
}

export async function joinGame(gameId: number, user: { id: string; name: string }) {
  if (await isMember(gameId, user.id)) return;
  await mutate(gameId, (s) => addPlayer(s, user.id, user.name), { userId: user.id, name: user.name });
}

export async function act(gameId: number, userId: string, action: Action) {
  await mutate(gameId, (s) => applyAction(s, userId, action, Date.now()));
}

export async function payloadFor(gameId: number, userId: string, sinceSeq?: number): Promise<GamePayload | null> {
  const row = await loadGame(gameId);
  if (!row) return null;
  const me = row.state.players.find((p) => p.id === userId);
  if (!me) return null;
  // By default send everything since a little before this Kird's last turn, for the replay.
  const from = sinceSeq ?? Math.max(0, me.lastTurnEndSeq - 40);
  const rows = await sql().query(
    `SELECT event FROM game_events WHERE game_id = $1 AND seq > $2 ORDER BY seq DESC LIMIT 400`,
    [gameId, from],
  );
  const events = (rows.map((r) => r.event) as GameEvent[]).reverse().filter((e) => eventVisible(row.state, e, userId));
  return { id: row.id, name: row.name, code: row.code, hostId: row.hostId, version: row.version, view: viewFor(row.state, userId), events };
}

export async function myGames(userId: string) {
  const rows = await sql().query(
    `SELECT g.id, g.name, g.code, g.state, g.updated_at AS "updatedAt"
       FROM games g JOIN game_players p ON p.game_id = g.id
      WHERE p.user_id = $1
      ORDER BY g.updated_at DESC
      LIMIT 50`,
    [userId],
  );
  return rows.map((r) => {
    const s = r.state as GameState;
    const active = s.players.find((p) => p.seat === s.activeSeat);
    return {
      id: r.id as number,
      name: r.name as string,
      code: r.code as string,
      round: s.round,
      players: s.players.map((p) => ({ name: p.name, color: p.color })),
      activeName: active?.name ?? "",
      myTurn: active?.id === userId,
      updatedAt: r.updatedAt as string,
    };
  });
}
