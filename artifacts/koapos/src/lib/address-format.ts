/**
 * Address abbreviation expansion.
 *
 * When a user types an Australian street-type abbreviation (e.g. "St", "Rd",
 * "Ave") or a state abbreviation (e.g. "NSW", "QLD"), we automatically expand
 * it to the full name. Expansion is case-insensitive on input and produces a
 * naturally-cased ("Title Case") result.
 *
 * Street-type list sourced from:
 *   https://api-doc.cacheinvest.com.au/street_type_guideline.html
 *
 * Wire these into address inputs on `onBlur` (not on every keystroke) so the
 * user is never fighting the cursor while typing.
 */

/* ── Street types: ABBREVIATION → FULL NAME (upper-case source values) ─────── */

const STREET_TYPE_MAP: Record<string, string> = {
  ALLY: "ALLEY", ALWY: "ALLEYWAY", AMBL: "AMBLE", ANCG: "ANCHORAGE",
  APP: "APPROACH", ARC: "ARCADE", ART: "ARTERY", AVE: "AVENUE",
  BASN: "BASIN", BCH: "BEACH", BEND: "BEND", BLK: "BLOCK",
  BVD: "BOULEVARD", BRCE: "BRACE", BRAE: "BRAE", BRK: "BREAK",
  BDGE: "BRIDGE", BDWY: "BROADWAY", BROW: "BROW", BYPA: "BYPASS",
  BYWY: "BYWAY", CAUS: "CAUSEWAY", CTR: "CENTRE", CNWY: "CENTREWAY",
  CH: "CHASE", CIR: "CIRCLE", CLT: "CIRCLET", CCT: "CIRCUIT",
  CRCS: "CIRCUS", CL: "CLOSE", CLDE: "COLONNADE", CMMN: "COMMON",
  CON: "CONCOURSE", CPS: "COPSE", CNR: "CORNER", CSO: "CORSO",
  CT: "COURT", CTYD: "COURTYARD", COVE: "COVE", CRES: "CRESCENT",
  CRST: "CREST", CRSS: "CROSS", CRSG: "CROSSING", CRD: "CROSSROAD",
  COWY: "CROSSWAY", CUWY: "CRUISEWAY", CDS: "CUL-DE-SAC", CTTG: "CUTTING",
  DALE: "DALE", DELL: "DELL", DEVN: "DEVIATION", DIP: "DIP",
  DSTR: "DISTRIBUTOR", DR: "DRIVE", DRWY: "DRIVEWAY", EDGE: "EDGE",
  ELB: "ELBOW", END: "END", ENT: "ENTRANCE", ESP: "ESPLANADE",
  EST: "ESTATE", EXP: "EXPRESSWAY", EXTN: "EXTENSION", FAWY: "FAIRWAY",
  FTRK: "FIRE", FITR: "FIRETRAIL", FLAT: "FLAT", FOLW: "FOLLOW",
  FTWY: "FOOTWAY", FSHR: "FORESHORE", FORM: "FORMATION", FWY: "FREEWAY",
  FRNT: "FRONT", FRTG: "FRONTAGE", GAP: "GAP", GDN: "GARDEN",
  GTE: "GATE", GDNS: "GARDENS", GTES: "GATES", GLD: "GLADE",
  GLEN: "GLEN", GRA: "GRANGE", GRN: "GREEN", GRND: "GROUND",
  GR: "GROVE", GLY: "GULLY", HTS: "HEIGHTS", HRD: "HIGHROAD",
  HWY: "HIGHWAY", HILL: "HILL", INTG: "INTERCHANGE", INTN: "INTERSECTION",
  JNC: "JUNCTION", KEY: "KEY", LDG: "LANDING", LANE: "LANE",
  LNWY: "LANEWAY", LEES: "LEES", LINE: "LINE", LINK: "LINK",
  LT: "LITTLE", LKT: "LOOKOUT", LOOP: "LOOP", LWR: "LOWER",
  MALL: "MALL", MNDR: "MEANDER", MEW: "MEW", MEWS: "MEWS",
  MWY: "MOTORWAY", MT: "MOUNT", NOOK: "NOOK", OTLK: "OUTLOOK",
  PDE: "PARADE", PARK: "PARK", PKLD: "PARKLANDS", PKWY: "PARKWAY",
  PART: "PART", PASS: "PASS", PATH: "PATH", PHWY: "PATHWAY",
  PIAZ: "PIAZZA", PL: "PLACE", PLAT: "PLATEAU", PLZA: "PLAZA",
  PKT: "POCKET", PNT: "POINT", PORT: "PORT", PROM: "PROMENADE",
  QUAD: "QUAD", QDGL: "QUADRANGLE", QDRT: "QUADRANT", QY: "QUAY",
  QYS: "QUAYS", RMBL: "RAMBLE", RAMP: "RAMP", RNGE: "RANGE",
  RCH: "REACH", RES: "RESERVE", REST: "REST", RTT: "RETREAT",
  RIDE: "RIDE", RDGE: "RIDGE", RGWY: "RIDGEWAY", ROWY: "RIGHT",
  RING: "RING", RISE: "RISE", RVR: "RIVER", RVWY: "RIVERWAY",
  RVRA: "RIVIERA", RD: "ROAD", RDS: "ROADS", RDSD: "ROADSIDE",
  RDWY: "ROADWAY", RNDE: "RONDE", RSBL: "ROSEBOWL", RTY: "ROTARY",
  RND: "ROUND", RTE: "ROUTE", ROW: "ROW", RUE: "RUE",
  RUN: "RUN", SWY: "SERVICE", SDNG: "SIDING", SLPE: "SLOPE",
  SND: "SOUND", SPUR: "SPUR", SQ: "SQUARE", STRS: "STAIRS",
  SHWY: "STATE", STPS: "STEPS", STRA: "STRAND", ST: "STREET",
  STRP: "STRIP", SBWY: "SUBWAY", TARN: "TARN", TCE: "TERRACE",
  THOR: "THOROUGHFARE", TLWY: "TOLLWAY", TOP: "TOP", TOR: "TOR",
  TWRS: "TOWERS", TRK: "TRACK", TRL: "TRAIL", TRLR: "TRAILER",
  TRI: "TRIANGLE", TKWY: "TRUNKWAY", TURN: "TURN", UPAS: "UNDERPASS",
  UPR: "UPPER", VALE: "VALE", VDCT: "VIADUCT", VIEW: "VIEW",
  VLLS: "VILLAS", VSTA: "VISTA", WADE: "WADE", WALK: "WALK",
  WKWY: "WALKWAY", WAY: "WAY", WHRF: "WHARF", WYND: "WYND",
  YARD: "YARD",
};

/* ── Australian states & territories: ABBREVIATION → FULL NAME ─────────────── */

const STATE_MAP: Record<string, string> = {
  NSW: "New South Wales",
  QLD: "Queensland",
  WA:  "Western Australia",
  NT:  "Northern Territory",
  SA:  "South Australia",
  VIC: "Victoria",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  AU:  "Australia",
};

/** Title-case a word, preserving hyphens (e.g. "CUL-DE-SAC" → "Cul-De-Sac"). */
function titleCaseWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-/])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Expand a street-type abbreviation in an address line. Only the final word is
 * considered, since the street type always trails the line — this leaves
 * leading tokens like the "St" in "St Kilda Rd" (Saint) untouched while still
 * expanding the real type ("Rd" → "Road"). Trailing punctuation (e.g. "St.")
 * is tolerated. Returns the value unchanged when the last word is not a known
 * abbreviation.
 */
export function expandStreetType(value: string): string {
  if (!value) return value;
  // Capture: leading text, the last word, any trailing punctuation/space.
  const m = value.match(/^(.*?)([A-Za-z][A-Za-z-]*)([.\s]*)$/);
  if (!m) return value;
  const [, head, word, tail] = m;
  const full = STREET_TYPE_MAP[word.toUpperCase()];
  if (!full) return value;
  return head + titleCaseWord(full) + tail.replace(/\./g, "");
}

/**
 * Expand a state/territory abbreviation. The whole field value is matched
 * (case-insensitively) against the known abbreviations. Returns the value
 * unchanged when it is not a recognised abbreviation.
 */
export function expandState(value: string): string {
  if (!value) return value;
  const full = STATE_MAP[value.trim().toUpperCase()];
  return full ?? value;
}
