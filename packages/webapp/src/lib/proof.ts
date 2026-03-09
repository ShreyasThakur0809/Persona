"use client";

export interface CircuitInput {
  // Private — never leave the browser
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  secret: string;
  countryCode: string;  // numeric country identifier (e.g. "91" for India)
  idNumber: string;     // numeric representation of the ID document number
  // Public — appear on-chain as public signals
  currentYear: string;
  currentMonth: string;
  currentDay: string;
  minAge: string;
}

export interface SolidityProof {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
  // [isOver18, nullifier, countryHash, uniquenessHash, currentYear, currentMonth, currentDay, minAge]
  signals: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  isOver18: boolean;
}

export type ProofStep = "idle" | "witness" | "proving" | "done" | "error";

// snarkjs pi_b stores G2 as [[x0,x1],[y0,y1]] but Solidity expects [[x1,x0],[y1,y0]]
function formatProof(proof: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}): Pick<SolidityProof, "a" | "b" | "c"> {
  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  };
}

export async function generateAgeProof(
  input: CircuitInput,
  onStep?: (step: ProofStep) => void
): Promise<SolidityProof> {
  const snarkjs = await import("snarkjs");

  onStep?.("witness");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input as unknown as Record<string, string>,
    "/circuits/ageProof.wasm",
    "/circuits/ageProof_final.zkey"
  );

  onStep?.("proving");
  const { a, b, c } = formatProof(
    proof as { pi_a: string[]; pi_b: string[][]; pi_c: string[] }
  );
  const signals = (publicSignals as string[]).map(BigInt) as unknown as readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
  ];

  onStep?.("done");
  return { a, b, c, signals, isOver18: signals[0] === 1n };
}

/** Country codes mapped to their numeric circuit identifier. */
export const COUNTRIES: { label: string; code: string }[] = [
  { label: "India", code: "91" },
  { label: "United States", code: "1" },
  { label: "United Kingdom", code: "44" },
  { label: "Germany", code: "49" },
  { label: "France", code: "33" },
  { label: "Singapore", code: "65" },
  { label: "UAE", code: "971" },
  { label: "Other", code: "0" },
];

/** Returns the current date split into year/month/day strings. */
export function today(): { year: string; month: string; day: string } {
  const d = new Date();
  return {
    year: d.getFullYear().toString(),
    month: (d.getMonth() + 1).toString(),
    day: d.getDate().toString(),
  };
}
