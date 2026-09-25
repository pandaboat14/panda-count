export const BACKDROPS = ["#e7d7b4", "#cfe0cf", "#ecd3c4", "#d6dcc0", "#e2d5e6", "#d4e2e4"];

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  if (/^\d{4}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function age(iso: string) {
  const [y, m = 1, d = 1] = iso.split("-").map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now < new Date(now.getFullYear(), m - 1, d)) a--;
  return a;
}
