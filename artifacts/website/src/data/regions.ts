/**
 * The two region landing pages: /computer-repairs/central-coast and
 * /computer-repairs/lake-macquarie.
 *
 * These exist because "central coast computer repairs" and "lake macquarie
 * computer repairs" are distinct searches that were previously both aimed at
 * the single /computer-repairs page. They sit between that service hub and the
 * individual suburb pages.
 *
 * Every field below is written per region on purpose. If a future region is
 * added by copying one of these and swapping the name, it will not rank — the
 * suburb pages already demonstrate what that produces.
 *
 * Suburb names must match src/data/suburbs.ts exactly so suburbPath() resolves.
 */

export interface SuburbGroup {
  label: string;
  suburbs: string[];
}

export interface RegionFaq {
  q: string;
  a: string;
}

export interface Region {
  slug: string;
  name: string;
  /** Used in <title> and H1 — the natural word order people actually search. */
  headline: string;
  title: string;
  description: string;
  /** Opening positioning paragraphs, specific to this region's geography. */
  intro: string[];
  /** Honest statement of where the workshop sits relative to the region. */
  proximity: string;
  travel: Array<{ place: string; time: string }>;
  coverage: Array<{ heading: string; body: string }>;
  groups: SuburbGroup[];
  faqs: RegionFaq[];
}

export const CENTRAL_COAST: Region = {
  slug: "central-coast",
  name: "Central Coast",
  headline: "Central Coast Computer Repairs",
  title: "Central Coast Computer Repairs | No Fix, No Fee",
  description:
    "Computer, laptop and Mac repairs across the Central Coast — Gosford, Terrigal, Woy Woy, The Entrance, Wyong and Toukley. Free diagnostic, no fix no fee.",
  intro: [
    "Koastal Kollective has repaired computers for Central Coast households and businesses since 2011. Our workshop is at Mannering Park, at the northern end of the Central Coast local government area, and we cover the region from the Budgewoi lakes down through Wyong and Gosford to the Woy Woy peninsula.",
    "Every job starts with a free diagnostic and a fixed quote before any work begins. If we cannot fix the fault you brought us, you do not pay for the labour — that is the whole of our no fix, no fee policy, with no diagnostic fee and no call-out fee hidden underneath it.",
  ],
  proximity:
    "Being at the northern edge of the Central Coast, we are closest to the Budgewoi, Toukley and Wyong areas. We still travel to Gosford, Terrigal and the Peninsula regularly — it is simply a longer drive, so on-site visits down there are booked by arrangement rather than same-day.",
  travel: [
    { place: "Toukley, Budgewoi, San Remo", time: "about 15 minutes" },
    { place: "Wyong, Tuggerah, Warnervale", time: "about 25 minutes" },
    { place: "The Entrance, Bateau Bay, Long Jetty", time: "about 30 minutes" },
    { place: "Gosford, Erina, Wyoming", time: "about 40 minutes" },
    { place: "Terrigal, Avoca Beach, Kincumber", time: "about 45 minutes" },
    { place: "Woy Woy, Umina Beach, Ettalong", time: "about 50 minutes" },
  ],
  coverage: [
    {
      heading: "Drop it into the workshop",
      body: "Our Mannering Park shop is fully stocked, so common jobs — SSD upgrades, screen replacements, battery swaps, virus removal — are often finished the same day. Parking is at the door, which matters if you are carrying a desktop tower.",
    },
    {
      heading: "We come to you",
      body: "On-site visits across the Central Coast carry no call-out fee within our service area. This is the right option for desktop PCs, office networks, NBN and Wi-Fi faults, and for anyone who would rather not unplug a machine they have to put back together.",
    },
    {
      heading: "Pickup and return",
      body: "For customers who cannot travel — and for a lot of our older Central Coast clients — we collect the machine, repair it in the workshop, and bring it back set up and working. Call to arrange a time.",
    },
  ],
  groups: [
    { label: "Northern lakes", suburbs: ["Mannering Park","Chain Valley Bay","Gwandalan","Summerland Point","Lake Munmorah","San Remo","Doyalson","Budgewoi","Buff Point","Halekulani","Canton Beach","Toukley","Norah Head","Noraville"] },
    { label: "Wyong & Warnervale", suburbs: ["Wyong","Wyongah","Tuggerah","Watanobbi","Tacoma","Mardi","Warnervale","Hamlyn Terrace","Woongarrah","Wadalba","Gorokan","Lake Haven","Charmhaven","Kanwal","Blue Haven"] },
    { label: "The Entrance & Tuggerah Lakes", suburbs: ["The Entrance","The Entrance North","Long Jetty","Bateau Bay","Shelly Beach","Toowoon Bay","Blue Bay","Killarney Vale","Berkeley Vale","Chittaway Bay","Tumbi Umbi","Glenning Valley","Magenta"] },
    { label: "Gosford & Erina", suburbs: ["Gosford","East Gosford","West Gosford","North Gosford","Wyoming","Narara","Niagara Park","Lisarow","Ourimbah","Erina","Erina Heights","Point Clare","Point Frederick","Springfield","Kariong","Somersby"] },
    { label: "Terrigal & the beaches", suburbs: ["Terrigal","Wamberal","Forresters Beach","Avoca Beach","North Avoca","Copacabana","MacMasters Beach","Matcham","Holgate","Green Point"] },
    { label: "Brisbane Water & the Peninsula", suburbs: ["Woy Woy","Umina Beach","Ettalong Beach","Booker Bay","Blackwall","Kincumber","Kincumber South","Saratoga","Davistown","Empire Bay","Bensville","Tascott","Koolewong","St Huberts Island","Pearl Beach","Patonga","Killcare","Hardys Bay","Wagstaffe","Pretty Beach","Daleys Point","Yattalunga"] },
  ],
  faqs: [
    { q: "Do you really come as far south as Woy Woy and Umina?",
      a: "Yes. The Peninsula is about fifty minutes from our Mannering Park workshop, so we book those visits in advance rather than same-day. If the machine is portable, a lot of Peninsula customers find our pickup-and-return service easier than waiting in for a call-out." },
    { q: "Is there a call-out fee anywhere on the Central Coast?",
      a: "No call-out fee within our service area, and no diagnostic fee at the workshop. You get a fixed quote before any work starts, so the number you agree to is the number you pay." },
    { q: "Where exactly is the workshop?",
      a: "Shop 1/64 Vales Road, Mannering Park NSW 2259 — the northern end of the Central Coast, just off the Pacific Highway near Doyalson. Open Monday 10am to 2:00pm and Tuesday to Friday 10am to 5pm." },
    { q: "Can you help with NBN and Wi-Fi problems, not just broken computers?",
      a: "Yes. NBN connection faults, router setup, Wi-Fi dead spots and mesh installs are a large part of what we do on-site across the Central Coast, particularly in the larger homes and semi-rural properties around Kariong, Somersby and Matcham." },
    { q: "Do you repair Apple machines as well as Windows PCs?",
      a: "Yes — MacBook Pro and Air servicing, iMac diagnostics, SSD and RAM upgrades on supported models, and macOS reinstalls. We are also a SolvUp-authorised out-of-warranty repairer for JB Hi-Fi and Officeworks." },
    { q: "Is there a discount for pensioners?",
      a: "Yes, 10% off every service, every time — no need to ask twice or produce paperwork each visit." },
  ],
};

export const LAKE_MACQUARIE: Region = {
  slug: "lake-macquarie",
  name: "Lake Macquarie",
  headline: "Lake Macquarie Computer Repairs",
  title: "Lake Macquarie Computer Repairs | No Fix, No Fee",
  description:
    "Computer, laptop and Mac repairs across Lake Macquarie — Swansea, Belmont, Warners Bay, Toronto, Morisset and Charlestown. Free diagnostic, no fix no fee.",
  intro: [
    "Our workshop sits at Mannering Park, directly on the southern boundary of Lake Macquarie — which makes the lake our closest patch of work, not an outer edge of it. We repair computers, laptops and Macs for homes and businesses right around the lake, from Swansea and Belmont through Warners Bay and Toronto to Morisset and Cooranbong.",
    "Free diagnostic, a fixed quote before anything is touched, and no fix, no fee if we cannot repair the fault. The person who answers the phone is the person who works on your machine — there is no counter staff passing jobs to a workshop you never see.",
  ],
  proximity:
    "Swansea is roughly fifteen minutes from the workshop and the eastern side of the lake is comfortably within half an hour, so same-day on-site visits around Belmont, Swansea and Caves Beach are usually possible. The western and northern shores — Toronto, Warners Bay, Charlestown — are a slightly longer run and are normally booked a day ahead.",
  travel: [
    { place: "Swansea, Caves Beach, Blacksmiths", time: "about 15 minutes" },
    { place: "Morisset, Cooranbong, Dora Creek", time: "about 25 minutes" },
    { place: "Belmont, Marks Point, Valentine area", time: "about 25 minutes" },
    { place: "Toronto, Rathmines, Wangi Wangi", time: "about 30 minutes" },
    { place: "Warners Bay, Speers Point, Boolaroo", time: "about 30 minutes" },
    { place: "Charlestown, Cardiff, Glendale", time: "about 35 minutes" },
  ],
  coverage: [
    {
      heading: "Same-day on the eastern shore",
      body: "Swansea, Caves Beach, Blacksmiths, Pelican and Belmont are close enough that a morning call often means a same-day visit. Handy when a small business loses its point-of-sale machine or its internet mid-trade.",
    },
    {
      heading: "Business IT around the lake",
      body: "We look after small-business networks, servers, backups and Microsoft 365 for trades, cafés and offices through Warners Bay, Toronto, Cardiff and Charlestown. No lock-in contracts — you call us when something needs doing.",
    },
    {
      heading: "Workshop repairs and pickup",
      body: "Bring the machine to Mannering Park, or we will collect it and return it working. Lake Macquarie customers are usually surprised how close the shop is — it is just past Doyalson, before the highway turns south.",
    },
  ],
  groups: [
    { label: "Swansea & the eastern lake", suburbs: ["Swansea","Swansea Heads","Caves Beach","Blacksmiths","Pelican","Little Pelican","Cams Wharf","Catherine Hill Bay","Nords Wharf","Murrays Beach","Pinny Beach"] },
    { label: "Belmont & Valentine", suburbs: ["Belmont","Belmont North","Belmont South","Marks Point","Croudace Bay","Floraville","Eleebana","Mount Hutton","Windale","Gateshead","Tingira Heights","Bennetts Green"] },
    { label: "Warners Bay & Speers Point", suburbs: ["Warners Bay","Boolaroo","Speers Point","Booragul","Teralba","Macquarie Hills","Lakelands","Marmong Point","Woodrising","Hillsborough","Highfields"] },
    { label: "Toronto & the western lake", suburbs: ["Toronto","Blackalls Park","Fassifern","Fennell Bay","Bolton Point","Coal Point","Carey Bay","Kilaben Bay","Rathmines","Wangi Wangi","Arcadia Vale","Buttaba","Balmoral","Fishing Point","Myuna Bay","Awaba"] },
    { label: "Morisset & the southern lake", suburbs: ["Morisset","Morisset Park","Dora Creek","Cooranbong","Martinsville","Bonnells Bay","Brightwaters","Balcolyn","Silverwater","Windermere Park","Wyee","Wyee Point","Mandalong","Sunshine","Eraring","Ryhope","Yarrawonga Park","Mirrabooka"] },
    { label: "Cardiff, Glendale & West Wallsend", suburbs: ["Cardiff","Cardiff South","Cardiff Heights","Glendale","Argenton","Edgeworth","Cameron Park","West Wallsend","Holmesville","Barnsley","Killingworth","Seahampton","Charlestown","Kahibah","Whitebridge","Dudley","Redhead"] },
  ],
  faqs: [
    { q: "You are in Mannering Park — is that actually Lake Macquarie?",
      a: "Mannering Park is the last suburb of the Central Coast before the Lake Macquarie boundary, on the southern shore. In practice that puts us closer to Swansea and Belmont than most Newcastle repair shops are, which is why the lake makes up a large share of our work." },
    { q: "How quickly can you get to Swansea or Belmont?",
      a: "Usually the same day for the eastern shore. Swansea is about fifteen minutes away and Belmont around twenty-five, so a morning call can often be seen that afternoon." },
    { q: "Do you cover the western side — Toronto, Rathmines, Wangi Wangi?",
      a: "Yes, right around to Cooranbong and Martinsville. The western shore is a slightly longer drive, so those visits are usually booked a day in advance rather than same-day." },
    { q: "Can you help a small business without a support contract?",
      a: "That is most of our business work. We handle networks, servers, backups, Microsoft 365 and day-to-day faults for lake businesses on a call-us-when-you-need-us basis, with a free technology assessment to start." },
    { q: "What about data recovery from a drive that will not read?",
      a: "Software-level recovery happens in our workshop on a no-recovery-no-fee basis. Physically damaged drives that need a clean room are quoted transparently before anything is sent to our recovery partner." },
    { q: "Do you sell refurbished machines as well as repair them?",
      a: "Yes. We keep tested refurbished laptops and desktops in stock with a fresh Windows install and a three-month warranty — often the sensible answer when an older machine is not worth repairing." },
  ],
};

export const REGIONS: Region[] = [CENTRAL_COAST, LAKE_MACQUARIE];

export function findRegionBySlug(slug: string): Region | undefined {
  return REGIONS.find((r) => r.slug === slug.toLowerCase());
}

export function regionPath(region: Region): string {
  return `/computer-repairs/${region.slug}`;
}
