import Link from "next/link";
import { UserMenu } from "./UserMenu";

type Props = { signedIn: boolean; authEnabled: boolean; showAdd?: boolean };

export function TopBar({ signedIn, authEnabled, showAdd = true }: Props) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={44} height={44} />
        <span>Panda Count<em>.net</em></span>
      </Link>
      {authEnabled && (
        <div className="topbar-actions">
          {showAdd && <Link className="btn" href="/add">+ Add a panda</Link>}
          {signedIn ? <UserMenu /> : <Link className="btn ghost" href="/auth/sign-in">Sign in</Link>}
        </div>
      )}
    </header>
  );
}
