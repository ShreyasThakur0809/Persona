/**
 * Passport MRZ (Machine Readable Zone) parser — Phase 2.5
 *
 * Supports TD3 format (standard passport — 2 lines × 44 chars):
 *
 *   Line 1: P<COUNTRY_CODEsurname<<given_names<<<<<<<<<<<<<<<<<
 *   Line 2: PASSPORT_NUMBER_CHECK_DATENATIONALITYDOB_CHECK_SEX_EXPIRY_CHECK_PERSONAL_NUM_CHECK_COMPOSITE
 *
 *   Line 2 breakdown (0-indexed):
 *     0-8   passport number (9 chars)
 *     9     check digit
 *     10-12 nationality (3 chars)
 *     13-18 DOB — YYMMDD
 *     19    check digit
 *     20    sex
 *     21-26 expiry — YYMMDD
 *     27    check digit
 *     28-41 personal number / optional data
 *     42    check digit
 *     43    composite check digit
 *
 * Also supports TD1 (ID cards — 3 lines × 30 chars) with DOB on line 2 pos 0-5.
 */

export interface MRZData {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  /** Passport/document number (digits only) used as idNumber in circuit */
  docNumber: string;
  /** ISO 3166-1 alpha-3 country code from the MRZ */
  countryCode3: string;
  /** Numeric country code for circuit (mapped from alpha-3) */
  countryCodeNumeric: string;
}

// ISO 3166-1 alpha-3 → ISD dial code (used as circuit countryCode)
const COUNTRY_MAP: Record<string, string> = {
  IND: "91", USA: "1", GBR: "44", DEU: "49", FRA: "33",
  SGP: "65", ARE: "971", AUS: "61", CAN: "1", CHN: "86",
  JPN: "81", KOR: "82", BRA: "55", ZAF: "27", NGA: "234",
  PAK: "92", BGD: "880", IDN: "62", MYS: "60", THA: "66",
  PHL: "63", VNM: "84", MEX: "52", ARG: "54", EGY: "20",
  ETH: "251", KEN: "254", TZA: "255", GHA: "233",
};

function mrzYear(yy: string): string {
  const y = parseInt(yy);
  // Cut-off: 2-digit year > 30 → 1900s, otherwise 2000s
  return y > 30 ? `19${yy}` : `20${yy}`;
}

function stripFiller(s: string): string {
  return s.replace(/</g, "").trim();
}

/** Parse TD3 passport MRZ (2 lines × 44 chars). */
export function parseTD3(line1: string, line2: string): MRZData | null {
  if (line1.length < 44 || line2.length < 44) return null;

  // Country from line 1: chars 2-4
  const countryCode3 = line1.slice(2, 5).replace(/</g, "");

  // DOB: line 2 chars 13-18 → YYMMDD
  const dobRaw = line2.slice(13, 19);
  if (!/^\d{6}$/.test(dobRaw)) return null;

  const year = mrzYear(dobRaw.slice(0, 2));
  const month = String(parseInt(dobRaw.slice(2, 4)));
  const day = String(parseInt(dobRaw.slice(4, 6)));

  // Passport number: line 2 chars 0-8 (strip fillers, digits only for circuit)
  const raw = stripFiller(line2.slice(0, 9));
  const docNumber = raw.replace(/\D/g, "") || raw;

  return {
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    docNumber,
    countryCode3,
    countryCodeNumeric: COUNTRY_MAP[countryCode3] ?? "0",
  };
}

/** Parse TD1 ID card MRZ (3 lines × 30 chars). */
export function parseTD1(line1: string, line2: string): MRZData | null {
  if (line1.length < 30 || line2.length < 30) return null;

  // DOB: line 2 chars 0-5 → YYMMDD
  const dobRaw = line2.slice(0, 6);
  if (!/^\d{6}$/.test(dobRaw)) return null;

  const year = mrzYear(dobRaw.slice(0, 2));
  const month = String(parseInt(dobRaw.slice(2, 4)));
  const day = String(parseInt(dobRaw.slice(4, 6)));

  // Country: line 1 chars 2-4
  const countryCode3 = line1.slice(2, 5).replace(/</g, "");

  // Document number: line 1 chars 5-13
  const raw = stripFiller(line1.slice(5, 14));
  const docNumber = raw.replace(/\D/g, "") || raw;

  return {
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    docNumber,
    countryCode3,
    countryCodeNumeric: COUNTRY_MAP[countryCode3] ?? "0",
  };
}

/** Auto-detect TD3 vs TD1 and parse. */
export function parseMRZ(lines: string[]): MRZData | null {
  const clean = lines.map((l) => l.trim().toUpperCase());
  if (clean.length >= 2 && clean[0].length >= 44) {
    return parseTD3(clean[0], clean[1]);
  }
  if (clean.length >= 2 && clean[0].length >= 30) {
    return parseTD1(clean[0], clean[1]);
  }
  return null;
}
