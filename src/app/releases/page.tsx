import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { getUser, hasAuth } from "@/lib/auth/server";
import { RELEASES } from "@/lib/releases";

export const metadata = { title: "Release notes · Panda Count", description: "Everything new on Panda Count." };

const REPO = "https://github.com/pandaboat14/panda-count/pull/";
const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function ReleasesPage() {
  await connection();
  const user = await getUser();
  return (
    <>
      <TopBar signedIn={Boolean(user)} authEnabled={hasAuth()} showAdd={false} />
      <main className="page releases">
        <p className="eyebrow">What&rsquo;s new</p>
        <h1>Release notes</h1>
        <p className="lede">Every update to Panda Count, newest first.</p>
        <ol className="release-list">
          {RELEASES.map((r) => (
            <li key={`${r.date}-${r.title}`}>
              <p className="release-date">
                <time dateTime={r.date}>{fmt(r.date)}</time>
                {r.pr && (
                  <>
                    {" · "}
                    <a href={`${REPO}${r.pr}`} target="_blank" rel="noopener noreferrer">#{r.pr}</a>
                  </>
                )}
              </p>
              <h2>{r.title}</h2>
              <ul>
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
