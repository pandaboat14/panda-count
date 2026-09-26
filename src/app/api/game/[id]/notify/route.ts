import { NextResponse } from "next/server";
import { hasDatabase } from "@/db";
import { getUser } from "@/lib/auth/server";
import { isMember, setNotify } from "@/lib/game/store";

// Turns "it's your turn" emails on or off for the signed-in player.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "The game needs a database." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || !(await isMember(id, user.id))) return NextResponse.json({ error: "You're not in this game." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "Say on or off." }, { status: 400 });
  await setNotify(id, user.id, body.on);
  return NextResponse.json({ on: body.on });
}
