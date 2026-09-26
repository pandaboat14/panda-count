import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { GameError } from "@/game/engine";
import { displayName } from "@/lib/game/names";
import { getUser } from "@/lib/auth/server";
import { gameIdForCode, joinGame } from "@/lib/game/store";

export default async function JoinPage({ params }: PageProps<"/game/join/[code]">) {
  await connection();
  const code = (await params).code.toUpperCase();
  const user = await getUser();
  if (!user) redirect(`/auth/sign-up?redirectTo=/game/join/${code}`);
  const id = await gameIdForCode(code);
  if (!id) notFound();
  try {
    await joinGame(id, { id: user.id, name: displayName(user), email: user.email });
  } catch (e) {
    // A full or finished game: say so instead of crashing.
    if (!(e instanceof GameError)) throw e;
    return (
      <main className="page">
        <h1>Can&rsquo;t join that game</h1>
        <p className="lede">{e.message}</p>
        <Link className="btn" href="/game">Back to your games</Link>
      </main>
    );
  }
  redirect(`/game/${id}`);
}
