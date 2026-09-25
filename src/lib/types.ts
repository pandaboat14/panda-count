export type Panda = {
  id: number;
  name: string;
  chinese: string;
  sex: "Male" | "Female";
  born: string;
  origin: string;
  birthplace: string;
  zoo: string;
  location: string;
  zooUrl: string | null;
  arrived: string | null;
  status: "resident" | "incoming";
  fact: string;
  updatedByName: string | null;
};

export type Roster = { pandas: Panda[]; lastUpdated: string };

export type WorldPlace = {
  id: number;
  name: string;
  kind: "zoo" | "breeding_center";
  city: string;
  country: string;
  lat: number;
  lng: number;
  count: number;
  incoming: number;
  names: string;
  note: string;
  asOf: string;
  sourceUrl: string | null;
  // US zoos come from the main roster; their cards link back to the trading cards.
  us?: boolean;
};

export type WildRange = {
  id: number;
  name: string;
  province: string;
  estimate: number;
  survey: string;
  sourceUrl: string | null;
  lat: number;
  lng: number;
  spanLat: number;
  spanLng: number;
  angle: number;
};

export type World = {
  places: WorldPlace[];
  wild: WildRange[];
  captive: { count: number; asOf: string; sourceUrl: string };
};
