function sortAlpha(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

const rawSuburbs: Record<string, string[]> = {
  A: [
    "Alison", "Avoca Beach", "Adamstown Heights", "Arcadia Vale", "Argenton", "Awaba",
  ],
  B: [
    "Bar Point", "Bateau Bay", "Bensville", "Berkeley Vale", "Blackwall",
    "Blue Bay", "Blue Haven", "Booker Bay", "Bouddi", "Box Head", "Budgewoi",
    "Budgewoi Peninsula", "Buff Point", "Bushells Ridge",
    "Balcolyn", "Balmoral", "Barnsley", "Belmont", "Belmont North", "Belmont South",
    "Bennetts Green", "Blackalls Park", "Blacksmiths", "Bolton Point",
    "Bonnells Bay", "Boolaroo", "Booragul", "Brightwaters", "Buttaba",
  ],
  C: [
    "Calga", "Canton Beach", "Cedar Brush Creek", "Central Mangrove", "Chain Valley Bay",
    "Charmhaven", "Cheero Point", "Chittaway Bay", "Chittaway Point",
    "Cogra Bay", "Colongra", "Copacabana", "Crangan Bay",
    "Cameron Park", "Cams Wharf", "Cardiff", "Cardiff Heights", "Cardiff South",
    "Carey Bay", "Catherine Hill Bay", "Caves Beach", "Charlestown", "Coal Point",
    "Cooranbong", "Croudace Bay",
  ],
  D: [
    "Daleys Point", "Davistown", "Dooralong", "Doyalson", "Doyalson North", "Durren Durren",
    "Dora Creek", "Dudley",
  ],
  E: [
    "East Gosford", "Empire Bay", "Erina", "Erina Heights", "Ettalong Beach",
    "Edgeworth", "Eleebana", "Eraring",
  ],
  F: [
    "Forresters Beach", "Fountaindale",
    "Fassifern", "Fennell Bay", "Fishing Point", "Floraville", "Freemans Waterhole",
  ],
  G: [
    "Glenning Valley", "Glenworth Valley", "Gorokan", "Gosford",
    "Green Point", "Greengrove", "Gunderman", "Gwandalan",
    "Garden Suburb", "Gateshead", "Glendale",
  ],
  H: [
    "Halekulani", "Halloran", "Hamlyn Terrace", "Hardys Bay", "Holgate", "Horsfield Bay",
    "Highfields", "Hillsborough", "Holmesville",
  ],
  J: ["Jilliby"],
  K: [
    "Kangy Angy", "Kanwal", "Kariong", "Kiar", "Killarney Vale",
    "Killcare", "Killcare Heights", "Kincumber", "Kincumber South",
    "Kingfisher Shores", "Koolewong", "Kulnura",
    "Kahibah", "Kilaben Bay", "Killingworth", "Kotara South",
  ],
  L: [
    "Lake Haven", "Lake Munmorah", "Lemon Tree", "Lisarow",
    "Little Jilliby", "Little Wobby", "Long Jetty", "Lower Mangrove",
    "Lakelands", "Little Pelican",
  ],
  M: [
    "MacMasters Beach", "Magenta", "Mangrove Creek", "Mangrove Mountain",
    "Mannering Park", "Mardi", "Marlow", "Matcham", "Mooney Mooney",
    "Mooney Mooney Creek", "Mount Elliot", "Mount White", "Moonee",
    "Macquarie Hills", "Mandalong", "Marks Point", "Marmong Point",
    "Martinsville", "Mirrabooka", "Morisset", "Morisset Park",
    "Mount Hutton", "Murrays Beach", "Myuna Bay",
  ],
  N: [
    "Narara", "Niagara Park", "Norah Head", "Noraville", "North Avoca", "North Gosford",
    "New Lambton Heights", "Nords Wharf",
  ],
  O: ["Ourimbah"],
  P: [
    "Palm Grove", "Palmdale", "Patonga", "Pearl Beach", "Peats Ridge",
    "Phegans Bay", "Picketts Valley", "Point Clare", "Point Frederick", "Pretty Beach",
    "Pelican", "Pinny Beach",
  ],
  R: [
    "Ravensdale", "Rocky Point",
    "Rankin Park", "Rathmines", "Redhead", "Ryhope",
  ],
  S: [
    "St Huberts Island", "San Remo", "Saratoga", "Shelly Beach",
    "Somersby", "Spencer", "Springfield", "Summerland Point",
    "Seahampton", "Silverwater", "Speers Point", "Sunshine",
    "Swansea", "Swansea Heads",
  ],
  T: [
    "Tacoma", "Tacoma South", "Tascott", "Terrigal", "The Entrance",
    "The Entrance North", "Toowoon Bay", "Toukley", "Tuggerah",
    "Tuggerawong", "Tumbi Umbi",
    "Ten Mile Hollow", "Teralba", "Tingira Heights", "Toronto",
  ],
  U: [
    "Umina Beach", "Upper Mangrove",
  ],
  W: [
    "Wadalba", "Wagstaffe", "Wallarah", "Wamberal", "Warnervale",
    "Watanobbi", "Wendoree Park", "West Gosford", "Wondabyne",
    "Woongarrah", "Woy Woy", "Woy Woy Bay", "Wyoming",
    "Wyong", "Wyong Creek", "Wyongah",
    "Wakefield", "Wangi Wangi", "Warners Bay", "West Wallsend",
    "Whitebridge", "Windale", "Windermere Park", "Woodrising",
    "Wyee", "Wyee Point",
  ],
  Y: [
    "Yarramalong", "Yattalunga",
    "Yarrawonga Park",
  ],
};

export const suburbs: Record<string, string[]> = Object.fromEntries(
  Object.entries(rawSuburbs).map(([letter, names]) => [letter, sortAlpha(names)]),
);

export function toSuburbSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const slugToName: Record<string, string> = {};
for (const names of Object.values(suburbs)) {
  for (const name of names) {
    slugToName[toSuburbSlug(name)] = name;
  }
}

export function findSuburbBySlug(slug: string): string | undefined {
  return slugToName[slug.toLowerCase()];
}

export function suburbPath(name: string): string {
  return `/computer-repairs/${toSuburbSlug(name)}`;
}
