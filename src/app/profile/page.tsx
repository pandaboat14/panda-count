import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasDatabase } from "@/db";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import { getUser, hasAuth } from "@/lib/auth/server";
import { AVATAR_COLORS, AVATAR_KINDS, AVATAR_KIND_LABEL } from "@/lib/avatars";
import { avatarsFor } from "@/lib/game/profiles";
import { chooseAvatar } from "./actions";

export const metadata = { title: "Your avatar · Panda Count" };

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  await connection();
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=/profile");
  const back = String((await searchParams).back ?? "");
  const current = hasDatabase() ? (await avatarsFor([user.id]))[user.id] : null;
  return (
    <>
      <TopBar signedIn authEnabled={hasAuth()} showAdd={false} />
      <main className="page profile">
        <div className="profile-head">
          <Avatar value={current} userId={user.id} size={88} title="Your avatar" />
          <div>
            <h1>{user.name || user.email}</h1>
            <p className="lede">Pick the face the Kirds see next to your name in games and chat.</p>
          </div>
        </div>
        {AVATAR_KINDS.map((kind) => (
          <section key={kind} className="avatar-row">
            <h2>{AVATAR_KIND_LABEL[kind]}</h2>
            <div className="avatar-grid">
              {AVATAR_COLORS.map((color) => {
                const value = `${kind}:${color}`;
                return (
                  <form key={value} action={chooseAvatar}>
                    <input type="hidden" name="avatar" value={value} />
                    <input type="hidden" name="back" value={back} />
                    <button className={`avatar-pick${current === value ? " on" : ""}`} aria-label={`${AVATAR_KIND_LABEL[kind]} on ${color}`} aria-pressed={current === value}>
                      <Avatar value={value} size={56} />
                    </button>
                  </form>
                );
              })}
            </div>
          </section>
        ))}
        <p className="muted small">
          Change your name, email or password in <Link href="/account/settings">account settings</Link>.
          {back.startsWith("/game") && (
            <>
              {" "}
              · <Link href={back}>Back to the game</Link>
            </>
          )}
        </p>
      </main>
    </>
  );
}
