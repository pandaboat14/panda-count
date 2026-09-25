// The World tab's starting dataset, compiled from news and zoo announcements in September 2026.
// `npm run db:seed` loads it; the site shows it read-only when DATABASE_URL isn't set.
// Every row carries the date its count was last confirmed and a source link.

export const CAPTIVE_TOTAL = {
  count: 808,
  asOf: "2025-11",
  sourceUrl: "https://english.www.gov.cn/news/202511/22/content_WS69210fd1c6d00ca5f9a07bb3.html",
};

export const WILD_SURVEY = "4th National Giant Panda Survey (2011–2014)";
const WILD_SOURCE = "https://pmc.ncbi.nlm.nih.gov/articles/PMC10033846/";

export const SEED_ZOO_COORDS: Record<string, { lat: number; lng: number }> = {
  "San Diego Zoo": { lat: 32.7353, lng: -117.149 },
  "Smithsonian’s National Zoo": { lat: 38.9296, lng: -77.0498 },
  "Zoo Atlanta": { lat: 33.7331, lng: -84.3723 },
};

type SeedPlace = {
  name: string;
  kind: "zoo" | "breeding_center";
  city: string;
  country: string;
  lat: number;
  lng: number;
  count: number;
  incoming?: number;
  names?: string;
  note?: string;
  asOf: string;
  sourceUrl: string;
};

export const SEED_PLACES: SeedPlace[] = [
  // ---- China: the two big breeding centres ----
  {
    name: "Chengdu Research Base of Giant Panda Breeding",
    kind: "breeding_center",
    city: "Chengdu, Sichuan",
    country: "China",
    lat: 30.733,
    lng: 104.146,
    count: 244,
    note: "The world's largest captive population at a single site.",
    asOf: "2024-12",
    sourceUrl: "https://www.panda.org.cn/en/",
  },
  {
    name: "China Conservation and Research Center for the Giant Panda",
    kind: "breeding_center",
    city: "Wolong, Sichuan",
    country: "China",
    lat: 31.047,
    lng: 103.33,
    count: 387,
    note: "Spread across its Wolong, Ya'an (Bifengxia), Dujiangyan and Mianyang bases.",
    asOf: "2023-12",
    sourceUrl: "https://baike.baidu.com/en/item/China%20Conservation%20and%20Research%20Center%20for%20Giant%20Panda/38145",
  },

  // ---- Asia ----
  {
    name: "Everland",
    kind: "zoo",
    city: "Yongin",
    country: "South Korea",
    lat: 37.2941,
    lng: 127.2019,
    count: 5,
    names: "Ai Bao, Le Bao, Rui Bao, Hui Bao, Shu Bao",
    note: "Shu Bao was born on June 3, 2026.",
    asOf: "2026-09",
    sourceUrl: "https://en.sedaily.com/culture/2026/09/11/everlands-newest-panda-cub-named-shubao-by-230000-voters",
  },
  {
    name: "Ocean Park",
    kind: "zoo",
    city: "Hong Kong",
    country: "China (Hong Kong)",
    lat: 22.2467,
    lng: 114.1757,
    count: 6,
    names: "Ying Ying, Le Le, Jia Jia, De De, An An, Ke Ke",
    asOf: "2026-06",
    sourceUrl: "https://news.rthk.hk/rthk/en/component/k2/1860515-20260630.htm",
  },
  {
    name: "Macao Giant Panda Pavilion",
    kind: "zoo",
    city: "Coloane",
    country: "China (Macau)",
    lat: 22.1263,
    lng: 113.555,
    count: 4,
    names: "Kai Kai, Xin Xin, Jian Jian, Kang Kang",
    asOf: "2026-07",
    sourceUrl: "https://macaulifestyle.com/city-guide/macao-giant-panda-pavilion/",
  },
  {
    name: "Taipei Zoo",
    kind: "zoo",
    city: "Taipei",
    country: "Taiwan",
    lat: 24.9983,
    lng: 121.581,
    count: 3,
    names: "Yuan Yuan, Yuan Zai, Yuan Bao",
    asOf: "2026-08",
    sourceUrl: "https://english.news.cn/20260830/3bf9340cfcb7457aa92352a1e2b3119e/c.html",
  },
  {
    name: "River Wonders",
    kind: "zoo",
    city: "Singapore",
    country: "Singapore",
    lat: 1.404,
    lng: 103.789,
    count: 2,
    names: "Kai Kai, Jia Jia",
    note: "Panda house closed for renovation Sep 14 – Nov 30, 2026.",
    asOf: "2026-09",
    sourceUrl: "https://www.mandai.com/en/river-wonders/animals-and-zones/giant-panda.html",
  },
  {
    name: "Zoo Negara",
    kind: "zoo",
    city: "Kuala Lumpur",
    country: "Malaysia",
    lat: 3.2097,
    lng: 101.758,
    count: 2,
    names: "Chen Xing, Xiao Yue",
    note: "Arrived November 18, 2025 for a 10-year stay.",
    asOf: "2026-01",
    sourceUrl: "https://www.thestar.com.my/news/nation/2025/11/18/new-giant-pandas-chen-xing-and-xiao-yue-set-for-10-year-stay-at-zoo-negara",
  },
  {
    name: "Taman Safari Indonesia",
    kind: "zoo",
    city: "Bogor",
    country: "Indonesia",
    lat: -6.72,
    lng: 106.95,
    count: 3,
    names: "Cai Tao, Hu Chun, Satrio Wiratama (Rio)",
    note: "Rio, born November 27, 2025, is the first panda born in Indonesia.",
    asOf: "2026-06",
    sourceUrl: "https://en.tempo.co/read/2107681/indonesias-first-giant-panda-cub-debuts-at-taman-safari",
  },
  {
    name: "Chiang Mai Zoo",
    kind: "zoo",
    city: "Chiang Mai",
    country: "Thailand",
    lat: 18.81,
    lng: 98.948,
    count: 0,
    incoming: 2,
    note: "A new pair has been promised to mark 50 years of Thai–Chinese ties; debut expected in 2027.",
    asOf: "2026",
    sourceUrl: "https://thai.news/news/thailand/chiang-mai-zoo-set-to-welcome-new-pandas-in-2027-a-milestone-in-thai-chinese-relations",
  },
  {
    name: "Panda House, Al Khor Park",
    kind: "zoo",
    city: "Al Khor",
    country: "Qatar",
    lat: 25.665,
    lng: 51.49,
    count: 2,
    names: "Suhail (Jing Jing), Thuraya (Si Hai)",
    asOf: "2026-07",
    sourceUrl: "https://visitqatar.com/intl-en/things-to-do/family-break/parks/panda-park",
  },

  // ---- Europe ----
  {
    name: "Zoo Berlin",
    kind: "zoo",
    city: "Berlin",
    country: "Germany",
    lat: 52.5079,
    lng: 13.3377,
    count: 4,
    names: "Meng Meng, Jiao Qing, Leni, Lotti",
    asOf: "2026-08",
    sourceUrl: "https://english.news.cn/europe/20260822/bfc98509655340bfad2c1131af50b709/c.html",
  },
  {
    name: "Schönbrunn Zoo",
    kind: "zoo",
    city: "Vienna",
    country: "Austria",
    lat: 48.1822,
    lng: 16.3029,
    count: 2,
    names: "Lan Yun, He Feng",
    asOf: "2025-05",
    sourceUrl: "https://www.zoovienna.at/en/tiere-und-anlagen/giant-pandas-are-back/",
  },
  {
    name: "ZooParc de Beauval",
    kind: "zoo",
    city: "Saint-Aignan",
    country: "France",
    lat: 47.2471,
    lng: 1.353,
    count: 2,
    names: "Huanlili, Yuandudu",
    note: "Their parents returned to China in November 2025; the twins stay until January 2027.",
    asOf: "2025-11",
    sourceUrl: "https://actus.zoobeauval.com/en/the-first-giant-pandas-to-be-housed-at-beauval-huan-huan-and-yuan-zi-are-soon-to-return-to-china/",
  },
  {
    name: "Ouwehands Dierenpark",
    kind: "zoo",
    city: "Rhenen",
    country: "Netherlands",
    lat: 51.96,
    lng: 5.579,
    count: 2,
    names: "Wu Wen, Xing Ya",
    asOf: "2026",
    sourceUrl: "https://www.derijnpost.nl/lokaal/dieren/897356/ouwehands-dierenpark-verwacht-dit-jaar-geen-nieuwe-jonge-panda",
  },
  {
    name: "Copenhagen Zoo",
    kind: "zoo",
    city: "Copenhagen",
    country: "Denmark",
    lat: 55.6725,
    lng: 12.5213,
    count: 2,
    names: "Mao Sun, Xing Er",
    asOf: "2026-07",
    sourceUrl: "https://nyheder.tv2.dk/samfund/2026-07-24-pandaunge-kan-vaere-paa-vej-melder-koebenhavn-zoo",
  },
  {
    name: "Pairi Daiza",
    kind: "zoo",
    city: "Brugelette",
    country: "Belgium",
    lat: 50.5856,
    lng: 3.8864,
    count: 1,
    names: "Xing Hui",
    note: "Hao Hao returned to China for medical care in December 2025.",
    asOf: "2025-12",
    sourceUrl: "https://www.chinadaily.com.cn/a/202512/04/WS693152ffa310d6866eb2cebe.html",
  },
  {
    name: "Zoo Aquarium de Madrid",
    kind: "zoo",
    city: "Madrid",
    country: "Spain",
    lat: 40.409,
    lng: -3.7625,
    count: 2,
    names: "Jin Xi, Zhu Yu",
    asOf: "2025-09",
    sourceUrl: "https://weather.com/nature/wild-animals/news/2025-09-23-panda-party-time-madrid",
  },
  {
    name: "Moscow Zoo",
    kind: "zoo",
    city: "Moscow",
    country: "Russia",
    lat: 55.7612,
    lng: 37.579,
    count: 3,
    names: "Ru Yi, Ding Ding, Katyusha",
    asOf: "2026-08",
    sourceUrl: "https://english.news.cn/20260826/81eaef3dd5ca4e7a9e62d54383e07e23/c.html",
  },

  // ---- Americas & Oceania (US zoos come from the main roster) ----
  {
    name: "Chapultepec Zoo",
    kind: "zoo",
    city: "Mexico City",
    country: "Mexico",
    lat: 19.4231,
    lng: -99.1873,
    count: 1,
    names: "Xin Xin",
    note: "Turned 36 in July 2026, and is one of the very few giant pandas not owned by China.",
    asOf: "2026-07",
    sourceUrl: "https://www.infobae.com/mexico/2026/07/08/xin-xin-la-panda-mas-longeva-de-mexico-cumplio-36-anos-y-chapultepec-lo-celebra-con-exposicion-especial/",
  },
  {
    name: "Adelaide Zoo",
    kind: "zoo",
    city: "Adelaide",
    country: "Australia",
    lat: -34.9147,
    lng: 138.6053,
    count: 2,
    names: "Xing Qiu, Yi Lan",
    asOf: "2026-08",
    sourceUrl: "https://www.adelaidezoo.com.au/animals/giant-panda-xing-qiu-and-yi-lan/",
  },
];

// Mountain ranges from the 4th national survey (wild pandas older than ~1.5 years).
// Ellipses are rough outlines of each range for the heat glow, not habitat maps.
export const SEED_WILD = [
  { name: "Minshan", province: "Sichuan & Gansu", estimate: 797, lat: 32.8, lng: 104.0, spanLat: 1.0, spanLng: 0.55, angle: -15 },
  { name: "Qionglai", province: "Sichuan", estimate: 528, lat: 30.8, lng: 102.9, spanLat: 0.8, spanLng: 0.45, angle: -20 },
  { name: "Qinling", province: "Shaanxi", estimate: 347, lat: 33.7, lng: 107.6, spanLat: 0.3, spanLng: 1.3, angle: 0 },
  { name: "Liangshan", province: "Sichuan", estimate: 124, lat: 28.5, lng: 103.3, spanLat: 0.5, spanLng: 0.3, angle: -20 },
  { name: "Daxiangling", province: "Sichuan", estimate: 38, lat: 29.6, lng: 102.9, spanLat: 0.25, spanLng: 0.2, angle: 0 },
  { name: "Xiaoxiangling", province: "Sichuan", estimate: 30, lat: 29.0, lng: 102.5, spanLat: 0.25, spanLng: 0.2, angle: 0 },
].map((r) => ({ ...r, survey: WILD_SURVEY, sourceUrl: WILD_SOURCE }));
