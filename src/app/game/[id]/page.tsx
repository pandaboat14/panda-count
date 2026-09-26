import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { GameClient } from "@/components/game/GameClient";
import { getUser } from "@/lib/auth/server";
import { loadGame, payloadFor } from "@/lib/game/store";

export const metadata = { title: "Panda Diplomacy · Panda Count" };

export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const user = await getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=/game/${id}`);
  const payload = await payloadFor(id, user.id);
  if (!payload) {
    const row = await loadGame(id);
    if (!row) notFound();
    return (
      <main className="page">
        <h1>{row.name}</h1>
        <p className="lede">You&rsquo;re not in this game yet.</p>
        <Link className="btn" href={`/game/join/${row.code}`}>Join the game</Link>
      </main>
    );
  }
  return <GameClient initial={payload} />;
}
