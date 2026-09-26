import Link from "next/link";
import { RELEASES } from "@/lib/releases";

// A one-line footer pointing at the release notes, with the date of the latest update.
export function SiteFooter({ className = "" }: { className?: string }) {
  const latest = RELEASES[0];
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <Link href="/releases">Release notes</Link>
      {latest && (
        <span>
          {" "}
          · Updated{" "}
          <time dateTime={latest.date}>
            {new Date(`${latest.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
          </time>
        </span>
      )}
    </footer>
  );
}
