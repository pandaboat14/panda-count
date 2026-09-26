import "server-only";
import { defaultAvatar, isAvatar } from "@/lib/avatars";
import { sql } from "./sql";

export async function avatarsFor(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(userIds.map((id) => [id, defaultAvatar(id)]));
  if (!userIds.length) return out;
  const rows = await sql().query(`SELECT user_id, avatar FROM user_profiles WHERE user_id = ANY($1::text[])`, [userIds]);
  for (const r of rows) out[r.user_id as string] = r.avatar as string;
  return out;
}

export async function setAvatar(userId: string, avatar: string) {
  if (!isAvatar(avatar)) throw new Error("Unknown avatar.");
  await sql().query(
    `INSERT INTO user_profiles (user_id, avatar) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = now()`,
    [userId, avatar],
  );
}
