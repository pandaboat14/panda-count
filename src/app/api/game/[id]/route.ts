import { NextResponse, after } from "next/server";
import { hasDatabase } from "@/db";
import { GameError, type Action } from "@/game/engine";
import { getUser } from "@/lib/auth/server";
import { describe, logError } from "@/lib/errors";
import { latestMessageId } from "@/lib/game/chat";
import { act, deleteGame, endGame, gameVersion, payloadFor } from "@/lib/game/store";

type Ctx = { params: Promise<{ id: string }> };

async function who(ctx: Ctx) {
  if (!hasDatabase()) return { error: NextResponse.json({ error: "The game needs a database." }, { status: 503 }) };
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to play.", signedOut: true }, { status: 401 }) };
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return { error: NextResponse.json({ error: "No such game." }, { status: 404 }) };
  return { user, id };
}

// Anything unexpected is recorded and answered with JSON, so the game can say something useful.
async function oops(where: string, e: unknown, userId?: string) {
  await logError(where, e instanceof Error ? e.message : String(e), describe(e), userId);
  return NextResponse.json({ error: "Something went wrong on our side. Try that again." }, { status: 500 });
}

// Poll: returns nothing new unless the game's version moved past `v`.
export async function GET(req: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  try {
    const url = new URL(req.url);
    const v = Number(url.searchParams.get("v") ?? 0);
    const m = Number(url.searchParams.get("m") ?? 0);
    const since = url.searchParams.has("since") ? Number(url.searchParams.get("since")) : undefined;
    if (v) {
      // Nothing new unless the world moved on or someone said something. Only the version number is read.
      const [version, lastMsg] = await Promise.all([gameVersion(w.id), latestMessageId(w.id, w.user.id)]);
      if (version === v && lastMsg <= m) return NextResponse.json({ changed: false });
    }
    const payload = await payloadFor(w.id, w.user.id, since);
    if (!payload) return NextResponse.json({ error: "You're not in this game." }, { status: 403 });
    return NextResponse.json({ changed: true, ...payload });
  } catch (e) {
    return oops("game.poll", e, w.user.id);
  }
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
    if (followUp) after(() => followUp().catch((e) => logError("game.email", String(e), describe(e))));
    const payload = await payloadFor(w.id, w.user.id, body.since);
    return NextResponse.json({ changed: true, ...payload });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 422 });
    return oops(`game.act.${body.action.type}`, e, w.user.id);
  }
}

// The host ends the game for everyone (it stays in the lobby as complete); ?forever=1 deletes a finished one.
export async function DELETE(req: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  try {
    if (new URL(req.url).searchParams.get("forever")) await deleteGame(w.id, w.user.id);
    else await endGame(w.id, w.user.id);
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 403 });
    return oops("game.end", e, w.user.id);
  }
  return NextResponse.json({ ok: true });
}
