import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasDatabase } from "@/db";
import { getUser, hasAuth } from "@/lib/auth/server";
import { isEditor } from "@/lib/auth/editors";

// Shared checks for the add/edit pages. Returns a message to show instead of the form, or null.
export async function editorGate(): Promise<React.ReactNode | null> {
  await connection();
  if (!hasAuth() || !hasDatabase()) {
    return <p className="notice">Adding pandas needs the Neon database and Neon Auth set up. See the README.</p>;
  }
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");
  if (!isEditor(user.email)) {
    return (
      <p className="notice">
        You&rsquo;re signed in as {user.email}, which isn&rsquo;t on the editor list yet. Ask whoever runs Panda Count to add
        you, then come back. <Link href="/">Back to the pandas</Link>
      </p>
    );
  }
  return null;
}
