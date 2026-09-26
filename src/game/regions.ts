// The Kirds' world: ~60 real-world regions laid over the globe.
// Gondola lines (the only way to move troops) can only be built between neighbouring regions.

export type Resource = "bamboo" | "stone" | "iron" | "rice" | "gems";

// Who holds a region at the start of every game before the Kirds arrive.
export type NativeNation = "pandas" | "nacams" | "cams" | "wild";

export type RegionDef = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  resource: Resource;
  native: NativeNation;
};

export const REGIONS: RegionDef[] = [
  // ---- North America ----
  { id: "alaska", name: "Alaska", lat: 63, lng: -152, resource: "iron", native: "nacams" },
  { id: "yukon", name: "Yukon", lat: 64, lng: -133, resource: "gems", native: "nacams" },
  { id: "hudson", name: "Hudson Bay", lat: 57, lng: -90, resource: "stone", native: "wild" },
  { id: "greenland", name: "Greenland", lat: 72, lng: -40, resource: "stone", native: "nacams" },
  { id: "pnw", name: "Pacific Northwest", lat: 47, lng: -121, resource: "bamboo", native: "wild" },
  { id: "california", name: "California", lat: 36, lng: -119, resource: "gems", native: "cams" },
  { id: "rockies", name: "Rocky Mountains", lat: 41, lng: -107, resource: "stone", native: "wild" },
  { id: "plains", name: "Great Plains", lat: 42, lng: -98, resource: "rice", native: "wild" },
  { id: "texas", name: "Texas", lat: 31, lng: -99, resource: "iron", native: "wild" },
  { id: "lakes", name: "Great Lakes", lat: 43, lng: -85, resource: "iron", native: "wild" },
  { id: "quebec", name: "Quebec", lat: 50, lng: -72, resource: "bamboo", native: "wild" },
  { id: "eastcoast", name: "East Coast", lat: 39, lng: -76, resource: "rice", native: "wild" },
  { id: "florida", name: "Florida", lat: 28, lng: -82, resource: "rice", native: "cams" },
  { id: "mexico", name: "Mexico", lat: 22, lng: -102, resource: "gems", native: "wild" },
  { id: "centralam", name: "Central America", lat: 14, lng: -88, resource: "bamboo", native: "wild" },
  { id: "caribbean", name: "Caribbean", lat: 19, lng: -72, resource: "rice", native: "cams" },
  { id: "hawaii", name: "Hawaii", lat: 20, lng: -157, resource: "gems", native: "cams" },

  // ---- South America ----
  { id: "colombia", name: "Colombia", lat: 5, lng: -74, resource: "gems", native: "wild" },
  { id: "amazon", name: "Amazon", lat: -4, lng: -62, resource: "bamboo", native: "wild" },
  { id: "peru", name: "Andes", lat: -12, lng: -74, resource: "stone", native: "wild" },
  { id: "brazil", name: "Brazilian Coast", lat: -15, lng: -44, resource: "rice", native: "cams" },
  { id: "pampas", name: "Pampas", lat: -33, lng: -62, resource: "rice", native: "wild" },
  { id: "patagonia", name: "Patagonia", lat: -44, lng: -69, resource: "stone", native: "nacams" },

  // ---- Europe ----
  { id: "iceland", name: "Iceland", lat: 65, lng: -18, resource: "stone", native: "nacams" },
  { id: "britain", name: "British Isles", lat: 54, lng: -3, resource: "iron", native: "wild" },
  { id: "iberia", name: "Iberia", lat: 40, lng: -4, resource: "rice", native: "cams" },
  { id: "france", name: "France", lat: 46.5, lng: 2, resource: "rice", native: "wild" },
  { id: "scandinavia", name: "Scandinavia", lat: 62, lng: 15, resource: "iron", native: "nacams" },
  { id: "centraleu", name: "Central Europe", lat: 50.5, lng: 12, resource: "iron", native: "wild" },
  { id: "italy", name: "Italy & Balkans", lat: 42, lng: 17, resource: "gems", native: "cams" },
  { id: "easteu", name: "Eastern Europe", lat: 50, lng: 29, resource: "rice", native: "wild" },
  { id: "moscow", name: "Moscow", lat: 56, lng: 39, resource: "iron", native: "wild" },

  // ---- Africa ----
  { id: "morocco", name: "Morocco", lat: 31, lng: -7, resource: "stone", native: "wild" },
  { id: "sahara", name: "Sahara", lat: 23, lng: 8, resource: "gems", native: "nacams" },
  { id: "egypt", name: "Egypt", lat: 27, lng: 30, resource: "stone", native: "wild" },
  { id: "westafrica", name: "West Africa", lat: 10, lng: -6, resource: "rice", native: "wild" },
  { id: "congo", name: "Congo", lat: -2, lng: 22, resource: "bamboo", native: "wild" },
  { id: "eastafrica", name: "East Africa", lat: 0, lng: 37, resource: "rice", native: "wild" },
  { id: "horn", name: "Horn of Africa", lat: 8, lng: 45, resource: "stone", native: "nacams" },
  { id: "southafrica", name: "Southern Africa", lat: -29, lng: 25, resource: "gems", native: "wild" },
  { id: "madagascar", name: "Madagascar", lat: -19, lng: 46.5, resource: "bamboo", native: "wild" },

  // ---- Middle East & Asia ----
  { id: "anatolia", name: "Anatolia", lat: 39, lng: 34, resource: "iron", native: "wild" },
  { id: "arabia", name: "Arabia", lat: 24, lng: 45, resource: "gems", native: "cams" },
  { id: "persia", name: "Persia", lat: 32, lng: 54, resource: "stone", native: "wild" },
  { id: "centralasia", name: "Central Asia", lat: 43, lng: 66, resource: "rice", native: "wild" },
  { id: "siberia", name: "Siberia", lat: 62, lng: 97, resource: "iron", native: "nacams" },
  { id: "kamchatka", name: "Kamchatka", lat: 57, lng: 159, resource: "stone", native: "nacams" },
  { id: "mongolia", name: "Mongolia", lat: 47, lng: 104, resource: "stone", native: "nacams" },
  { id: "india", name: "India", lat: 22, lng: 79, resource: "rice", native: "wild" },
  { id: "tibet", name: "Tibet", lat: 31.5, lng: 88, resource: "stone", native: "wild" },
  { id: "sichuan", name: "Sichuan", lat: 30.6, lng: 103.5, resource: "bamboo", native: "pandas" },
  { id: "qinling", name: "Qinling", lat: 33.8, lng: 108.5, resource: "bamboo", native: "pandas" },
  { id: "northchina", name: "North China", lat: 39, lng: 116, resource: "iron", native: "wild" },
  { id: "southchina", name: "South China", lat: 24, lng: 113, resource: "rice", native: "wild" },
  { id: "korea", name: "Korea", lat: 37.5, lng: 127.5, resource: "iron", native: "wild" },
  { id: "japan", name: "Japan", lat: 36.5, lng: 138.5, resource: "gems", native: "cams" },
  { id: "indochina", name: "Indochina", lat: 15, lng: 102, resource: "rice", native: "wild" },
  { id: "philippines", name: "Philippines", lat: 12.5, lng: 122, resource: "bamboo", native: "wild" },
  { id: "indonesia", name: "Indonesia", lat: -2, lng: 113, resource: "bamboo", native: "wild" },

  // ---- Oceania ----
  { id: "papua", name: "Papua", lat: -6, lng: 144, resource: "bamboo", native: "wild" },
  { id: "westaus", name: "Western Australia", lat: -26, lng: 121, resource: "iron", native: "nacams" },
  { id: "eastaus", name: "Eastern Australia", lat: -29, lng: 148, resource: "gems", native: "cams" },
  { id: "newzealand", name: "New Zealand", lat: -42, lng: 173, resource: "stone", native: "wild" },
];

// Ocean crossings that are too long for the automatic neighbour rule but make the map playable.
const EXTRA_LINKS: [string, string][] = [
  ["alaska", "kamchatka"],
  ["greenland", "iceland"],
  ["iceland", "britain"],
  ["greenland", "quebec"],
  ["greenland", "hudson"],
  ["brazil", "westafrica"],
  ["hawaii", "california"],
  ["hawaii", "japan"],
  ["madagascar", "southafrica"],
  ["newzealand", "eastaus"],
  ["florida", "caribbean"],
  ["westaus", "indonesia"],
  ["papua", "eastaus"],
  ["morocco", "iberia"],
  ["egypt", "anatolia"],
  ["japan", "kamchatka"],
  ["philippines", "southchina"],
  ["centralam", "colombia"],
  ["caribbean", "colombia"],
];

const LINK_KM = 2300;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function buildNeighbors() {
  const map = new Map<string, Set<string>>(REGIONS.map((r) => [r.id, new Set<string>()]));
  const link = (a: string, b: string) => {
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  };
  for (const a of REGIONS) {
    const near = REGIONS.filter((b) => b.id !== a.id)
      .map((b) => ({ id: b.id, d: distanceKm(a, b) }))
      .sort((x, y) => x.d - y.d);
    for (const b of near) if (b.d <= LINK_KM) link(a.id, b.id);
    // Every region gets at least two ways out.
    for (const b of near.slice(0, 2)) link(a.id, b.id);
  }
  for (const [a, b] of EXTRA_LINKS) link(a, b);
  return new Map([...map].map(([k, v]) => [k, [...v].sort()]));
}

export const NEIGHBORS: Map<string, string[]> = buildNeighbors();
export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export const areNeighbors = (a: string, b: string) => NEIGHBORS.get(a)?.includes(b) ?? false;

// A gondola line is identified by its two endpoints in alphabetical order.
export const lineId = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);
export const lineEnds = (id: string) => id.split("~") as [string, string];
