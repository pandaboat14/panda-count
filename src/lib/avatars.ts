// Built-in avatars: a face on a coloured backdrop, stored as "kind:color".
export const AVATAR_KINDS = ["panda", "redpanda", "ogre", "cam", "viking", "gondola"] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];
export const AVATAR_KIND_LABEL: Record<AvatarKind, string> = {
  panda: "Panda",
  redpanda: "Red panda",
  ogre: "NACAM ogre",
  cam: "CAM",
  viking: "Norse god",
  gondola: "Gondola",
};
export const AVATAR_COLORS = ["#e7d7b4", "#cfe0cf", "#ecd3c4", "#c9d8ee", "#e2d5e6", "#f3e3a2", "#2b2a5c", "#1f4b35"];

export function isAvatar(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const [kind, color] = v.split(":");
  return (AVATAR_KINDS as readonly string[]).includes(kind) && AVATAR_COLORS.includes(color);
}

// Everyone gets a stable default until they pick one.
export function defaultAvatar(userId: string) {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${AVATAR_KINDS[h % 4]}:${AVATAR_COLORS[(h >>> 3) % 6]}`;
}
