import { NextResponse, after } from "next/server";
import { hasDatabase } from "@/db";
import { GameError, type Action } from "@/game/engine";
import { getUser } from "@/lib/auth/server";
import { latestMessageId } from "@/lib/game/chat";
import { act, deleteGame, loadGame, payloadFor } from "@/lib/game/store";

type Ctx = { params: Promise<{ id: string }> };

async function who(ctx: Ctx) {
  if (!hasDatabase()) return { error: NextResponse.json({ error: "The game needs a database." }, { status: 503 }) };
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to play." }, { status: 401 }) };
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return { error: NextResponse.json({ error: "No such game." }, { status: 404 }) };
  return { user, id };
}

// Poll: returns nothing new unless the game's version moved past `v`.
export async function GET(req: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  const url = new URL(req.url);
  const v = Number(url.searchParams.get("v") ?? 0);
  const m = Number(url.searchParams.get("m") ?? 0);
  const since = url.searchParams.has("since") ? Number(url.searchParams.get("since")) : undefined;
  if (v) {
    // Nothing new unless the world moved on or someone said something.
    const [row, lastMsg] = await Promise.all([loadGame(w.id), latestMessageId(w.id, w.user.id)]);
    if (row && row.version === v && lastMsg <= m) return NextResponse.json({ changed: false });
  }
  const payload = await payloadFor(w.id, w.user.id, since);
  if (!payload) return NextResponse.json({ error: "You're not in this game." }, { status: 403 });
  return NextResponse.json({ changed: true, ...payload });
}

export async function POST(req: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  let body: { action?: Action; since?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body.action || typeof body.action !== "object") return NextResponse.json({ error: "Missing action." }, { status: 400 });
  try {
    const followUp = await act(w.id, w.user.id, body.action, process.env.SITE_URL || new URL(req.url).origin);
    if (followUp) after(() => followUp().catch((e) => console.error("Turn email failed", e)));
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
  const payload = await payloadFor(w.id, w.user.id, body.since);
  return NextResponse.json({ changed: true, ...payload });
}

// The host ends the game for everyone.
export async function DELETE(_req: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  try {
    await deleteGame(w.id, w.user.id);
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
