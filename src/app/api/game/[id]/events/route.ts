import { NextResponse } from "next/server";
import { hasDatabase } from "@/db";
import { getUser } from "@/lib/auth/server";
import { olderEvents } from "@/lib/game/store";

// Pages back through the full event history for the log.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "The game needs a database." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const id = Number((await ctx.params).id);
  const before = Number(new URL(req.url).searchParams.get("before"));
  if (!Number.isInteger(id) || !Number.isInteger(before)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const page = await olderEvents(id, user.id, before);
  if (!page) return NextResponse.json({ error: "You're not in this game." }, { status: 403 });
  return NextResponse.json(page);
}
