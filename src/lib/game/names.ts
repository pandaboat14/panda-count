export const displayName = (u: { name?: string | null; email?: string | null }) =>
  (u.name || u.email?.split("@")[0] || "Kird").slice(0, 40);
