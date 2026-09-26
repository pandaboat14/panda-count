import Link from "next/link";
import { connection } from "next/server";
import { hasDatabase } from "@/db";
import { TopBar } from "@/components/TopBar";
import { Lobby } from "@/components/game/Lobby";
import { getUser, hasAuth } from "@/lib/auth/server";
import { myGames } from "@/lib/game/store";

export const metadata = { title: "Panda Diplomacy · Panda Count", description: "The Kirds' never-ending 3D strategy game." };

export default async function GameLobbyPage() {
  await connection();
  const user = await getUser();
  const games = user && hasDatabase() ? await myGames(user.id) : [];
  return (
    <>
      <TopBar signedIn={Boolean(user)} authEnabled={hasAuth()} tab="game" />
      <main className="page lobby">
        <p className="eyebrow">The Kirds present</p>
        <h1>Panda Diplomacy</h1>
        <p className="lede">
          A turn-based 3D war for the globe. Build urban gondolas, recruit pandas, NACAM ogres and CAMs, hire heroes like Casey the
          Norse God, trade, betray, and loan pandas for peace. It never ends.
        </p>
        {!user ? (
          <div className="notice">
            <p style={{ marginTop: 0 }}>Make an account to play. It takes 20 seconds.</p>
            <div className="form-actions">
              <Link className="btn" href="/auth/sign-up?redirectTo=/game">Sign up</Link>
              <Link className="btn ghost" href="/auth/sign-in?redirectTo=/game">Sign in</Link>
            </div>
          </div>
        ) : !hasDatabase() ? (
          <p className="notice">The game needs the Neon database set up.</p>
        ) : (
          <Lobby games={games} />
        )}
      </main>
    </>
  );
}
