import { NextResponse } from "next/server";
import { hasDatabase } from "@/db";
import { GameError } from "@/game/engine";
import { getUser } from "@/lib/auth/server";
import { leaveGame } from "@/lib/game/store";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "The game needs a database." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const id = Number((await ctx.params).id);
  try {
    await leaveGame(id, user.id);
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
