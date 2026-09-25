import "server-only";
import { getUser } from "./server";

// Optional allowlist: when EDITOR_EMAILS is set, only those accounts can change the roster.
export function isEditor(email: string | null | undefined) {
  const list = (process.env.EDITOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  return Boolean(email && list.includes(email.toLowerCase()));
}

export async function getEditor() {
  const user = await getUser();
  return user && isEditor(user.email) ? user : null;
}
