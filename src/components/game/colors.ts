// Colours shared by the globe and the dice table.
import type { Resource } from "@/game/regions";
import type { Good } from "@/game/rules";

export const RESOURCE_COLORS: Record<Resource, string> = {
  bamboo: "#5f9a4a",
  stone: "#9a968c",
  iron: "#5d6b7a",
  rice: "#e2cf8a",
  gems: "#9b6fc7",
};
export const NATIVE_COLORS = { pandas: "#f7f4ec", nacams: "#6f8a3a", cams: "#e8b64a", wild: "#c9d6bf" } as const;
// Fog of war, and land nobody holds.
export const FOG_COLORS = { tile: "#8c939b", rim: "#6e757d" } as const;
export const EMPTY_RIM = "#d9d2bf";

// Every good, for chips and tokens.
export const GOOD_COLORS: Record<Good, string> = { ...RESOURCE_COLORS, coin: "#d9b441", pandaCoin: "#8f8a7e", camCoin: "#d98a6a" };

// Ink that reads on top of a colour: dark on light colours (like the amber Kird's), cream on the rest.
export function inkOn(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16) || 0;
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.35 ? "#1c1b17" : "#fffaf3";
}
