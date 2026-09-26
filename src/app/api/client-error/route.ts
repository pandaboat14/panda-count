import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/server";
import { logError } from "@/lib/errors";

// Browsers report what went wrong for them (failed requests, crashed panels) so it can be traced later.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { where?: unknown; message?: unknown; detail?: unknown } | null;
  if (!body || typeof body.message !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  // Only signed-in players can write to the log, so it can't be flooded from outside.
  const user = await getUser().catch(() => null);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await logError(`client.${String(body.where ?? "unknown").slice(0, 40)}`, body.message, { ...(body.detail as object), ua: req.headers.get("user-agent") }, user?.id);
  return NextResponse.json({ ok: true });
}
