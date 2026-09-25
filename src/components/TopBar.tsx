import Link from "next/link";
import { UserMenu } from "./UserMenu";

type Props = {
  signedIn: boolean;
  authEnabled: boolean;
  showAdd?: boolean;
  // Which view tab is active; omit on pages outside the two main views.
  tab?: "usa" | "world";
};

export function TopBar({ signedIn, authEnabled, showAdd = true, tab }: Props) {
  const add = tab === "world" ? { href: "/world/places/new", label: "Add a place" } : { href: "/add", label: "Add a panda" };
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={44} height={44} />
        <span>Panda Count<em>.net</em></span>
      </Link>
      {tab && (
        <nav className="tabs" aria-label="Views">
          <Link href="/" className={tab === "usa" ? "on" : ""} aria-current={tab === "usa" ? "page" : undefined}>USA</Link>
          <Link href="/world" className={tab === "world" ? "on" : ""} aria-current={tab === "world" ? "page" : undefined}>World</Link>
        </nav>
      )}
      {authEnabled && (
        <div className="topbar-actions">
          {showAdd && (
            <Link className="btn" href={add.href} aria-label={add.label}>
              +<span className="btn-label"> {add.label}</span>
            </Link>
          )}
          {signedIn ? <UserMenu /> : <Link className="btn ghost" href="/auth/sign-in">Sign in</Link>}
        </div>
      )}
    </header>
  );
}
