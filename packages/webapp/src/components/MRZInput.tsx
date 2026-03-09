"use client";

import { useState } from "react";
import { parseMRZ, type MRZData } from "@/lib/parsers/mrz";

interface Props {
  onParsed: (data: MRZData) => void;
}

const EXAMPLE_TD3 = [
  "P<INDPATEL<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "A1234567<2IND9501011M2801011<<<<<<<<<<<<<<04",
];

export function MRZInput({ onParsed }: Props) {
  const [lines, setLines] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<MRZData | null>(null);

  function handleChange(idx: number, value: string) {
    const upper = value.toUpperCase().replace(/[^A-Z0-9<]/g, "");
    const next = [...lines];
    next[idx] = upper;
    setLines(next);
    setError(null);
    setParsed(null);
  }

  function handleParse() {
    const result = parseMRZ(lines);
    if (!result) {
      setError("Could not parse MRZ. Check the two lines are correct.");
      return;
    }
    setParsed(result);
    onParsed(result);
  }

  function handleExample() {
    setLines(EXAMPLE_TD3);
    setError(null);
    setParsed(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Enter the two lines at the bottom of your passport photo page (the Machine
        Readable Zone). Only the date of birth and document number are used — nothing
        is transmitted.
      </p>

      <div className="space-y-2">
        {["Line 1 (starts with P&lt;)", "Line 2 (document number, DOB…)"].map((label, i) => (
          <div key={i}>
            <label
              className="block text-xs text-zinc-500 mb-1"
              dangerouslySetInnerHTML={{ __html: label }}
            />
            <input
              type="text"
              maxLength={44}
              value={lines[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder={EXAMPLE_TD3[i]}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-white uppercase placeholder-zinc-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 tracking-wider"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleParse}
          disabled={lines[0].length < 30 || lines[1].length < 30}
          className="flex-1 rounded-xl bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-40"
        >
          Parse MRZ
        </button>
        <button
          type="button"
          onClick={handleExample}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Load example
        </button>
      </div>

      {parsed && (
        <div className="rounded-xl border border-green-800/60 bg-green-950/30 p-3 text-xs space-y-1">
          <div className="flex justify-between text-green-400 font-medium">
            <span>MRZ parsed ✓</span>
            <span>{parsed.countryCode3}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Date of birth</span>
            <span className="font-mono">
              {parsed.birthDay.padStart(2,"0")}/{parsed.birthMonth.padStart(2,"0")}/{parsed.birthYear}
            </span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Document ref</span>
            <span className="font-mono">{parsed.docNumber.slice(0, 4)}****</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Visual guide */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <div className="text-xs text-zinc-600 mb-2 font-medium">Where to find the MRZ</div>
        <div className="rounded bg-zinc-800 px-2 py-2 font-mono text-[9px] text-zinc-500 leading-relaxed">
          <div>P&lt;INDPATEL&lt;&lt;RAHUL&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
          <div>A1234567&lt;2IND<span className="text-yellow-500">950101</span>1M<span className="text-zinc-600">2801011&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;04</span></div>
        </div>
        <div className="mt-1 text-[9px] text-yellow-600">↑ DOB: 1995-01-01</div>
      </div>
    </div>
  );
}
