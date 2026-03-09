/**
 * Aadhaar QR parser — Phase 2.5
 *
 * Handles two Aadhaar QR formats produced by UIDAI:
 *
 * Format A — Offline e-KYC XML (most modern Aadhaar cards, 2018+)
 *   QR text is a very large decimal integer. When converted to bytes, the payload
 *   is a gzip-compressed XML string. Because decompression requires Node zlib or
 *   a browser DecompressionStream (Chrome 80+), we try DecompressionStream and
 *   fall back gracefully.
 *
 * Format B — Legacy signed XML (cards before 2018)
 *   QR text is raw XML containing dob="" and uid="" attributes.
 *
 * Format C — Plain delimited text (old development/test QRs)
 *   tab-separated: uid\tname\tgender\tDOB (DD/MM/YYYY)\t...
 *
 * In all cases we extract: birthYear, birthMonth, birthDay, aadhaarRef (numeric).
 */

export interface AadhaarData {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  /** Last 4 digits of UID or reference ID — used as idNumber in circuit */
  aadhaarRef: string;
  /** Raw parsing note for UI debug */
  format: "xml-offline" | "xml-legacy" | "delimited" | "unknown";
}

// ── Helper: parse DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD ──────────────
function parseDOB(raw: string): { y: string; m: string; d: string } | null {
  // YYYY-MM-DD or YYYY/MM/DD
  let m = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (m) return { y: m[1], m: String(parseInt(m[2])), d: String(parseInt(m[3])) };

  // DD-MM-YYYY or DD/MM/YYYY
  m = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return { y: m[3], m: String(parseInt(m[2])), d: String(parseInt(m[1])) };

  return null;
}

// ── Format B / inline XML: look for dob and uid attributes ───────────────────
function parseXML(xml: string): AadhaarData | null {
  const dobMatch = xml.match(/\bdob=["']([^"']+)["']/i);
  const uidMatch =
    xml.match(/\buid=["'](\d+)["']/i) ||
    xml.match(/\breferenceId=["'](\d+)["']/i);

  if (!dobMatch) return null;

  const dob = parseDOB(dobMatch[1]);
  if (!dob) return null;

  const uid = uidMatch ? uidMatch[1].slice(-4) : "0000";
  return {
    birthYear: dob.y,
    birthMonth: dob.m,
    birthDay: dob.d,
    aadhaarRef: uid,
    format: "xml-legacy",
  };
}

// ── Format A: big-int → gzip bytes → XML (Chrome 80+) ────────────────────────
async function decompressOfflineQR(bigIntStr: string): Promise<string | null> {
  try {
    if (typeof DecompressionStream === "undefined") return null;

    // Convert decimal string → Uint8Array
    let n = BigInt(bigIntStr);
    const bytes: number[] = [];
    while (n > 0n) {
      bytes.unshift(Number(n & 0xffn));
      n >>= 8n;
    }
    const compressed = new Uint8Array(bytes);

    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(compressed);
    writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

// ── Format C: tab/pipe-delimited ─────────────────────────────────────────────
function parseDelimited(raw: string): AadhaarData | null {
  const parts = raw.split(/[\t|,]/);
  if (parts.length < 4) return null;

  // Heuristic: find the DOB field (DD/MM/YYYY or YYYY-MM-DD)
  for (let i = 0; i < parts.length; i++) {
    const dob = parseDOB(parts[i].trim());
    if (dob) {
      // UID is usually the first long numeric field
      const uid = parts.find((p) => /^\d{12}$/.test(p.trim()))?.slice(-4) ?? "0000";
      return {
        birthYear: dob.y,
        birthMonth: dob.m,
        birthDay: dob.d,
        aadhaarRef: uid,
        format: "delimited",
      };
    }
  }
  return null;
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function parseAadhaarQR(raw: string): Promise<AadhaarData | null> {
  const trimmed = raw.trim();

  // Format A: large decimal integer (Offline e-KYC)
  if (/^\d{100,}$/.test(trimmed)) {
    const xml = await decompressOfflineQR(trimmed);
    if (xml) {
      const result = parseXML(xml);
      if (result) return { ...result, format: "xml-offline" };
    }
  }

  // Format B: raw XML
  if (trimmed.startsWith("<") || trimmed.includes("dob=")) {
    return parseXML(trimmed);
  }

  // Format C: delimited
  return parseDelimited(trimmed);
}
