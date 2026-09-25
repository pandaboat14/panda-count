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
