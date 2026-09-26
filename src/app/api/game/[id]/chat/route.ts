import { NextResponse } from "next/server";
import { hasDatabase } from "@/db";
import { GameError } from "@/game/engine";
import { getUser } from "@/lib/auth/server";
import { postMessage } from "@/lib/game/chat";

// Send a chat message to everyone in the game (to: null) or privately to one Kird.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "The game needs a database." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  if (!Number.isInteger(id) || typeof body.body !== "string" || (body.to !== null && typeof body.to !== "string")) {
    return NextResponse.json({ error: "Bad message." }, { status: 400 });
  }
  try {
    const message = await postMessage(id, user.id, body.to, body.body);
    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
