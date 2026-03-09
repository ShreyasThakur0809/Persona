"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useRouter } from "next/navigation";
import {
  generateAgeProof,
  today,
  COUNTRIES,
  type CircuitInput,
  type ProofStep,
  type SolidityProof,
} from "@/lib/proof";
import { IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_ADDRESS } from "@/lib/contracts";
import { AadhaarScanner } from "./AadhaarScanner";
import { MRZInput } from "./MRZInput";
import type { AadhaarData } from "@/lib/parsers/aadhaar";
import type { MRZData } from "@/lib/parsers/mrz";

type Tab = "aadhaar" | "passport" | "manual";

function randomSecret(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return BigInt(
    "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("")
  ).toString();
}

const STEP_LABELS: Record<ProofStep, string> = {
  idle: "",
  witness: "Computing witness…",
  proving: "Generating Groth16 proof…",
  done: "Proof ready",
  error: "Error",
};

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "aadhaar", label: "Aadhaar QR", emoji: "🇮🇳" },
  { id: "passport", label: "Passport MRZ", emoji: "🛂" },
  { id: "manual", label: "Manual", emoji: "✏️" },
];

export function VerifyForm() {
  const router = useRouter();
  const { writeContract, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const now = today();
  const [tab, setTab] = useState<Tab>("aadhaar");
  const [form, setForm] = useState({
    birthYear: "", birthMonth: "", birthDay: "",
    secret: "",
    countryCode: COUNTRIES[0].code,
    idNumber: "",
  });
  const [step, setStep] = useState<ProofStep>("idle");
  const [proof, setProof] = useState<SolidityProof | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setProof(null);
    setError(null);
    if (step !== "idle") setStep("idle");
  }

  function applyAadhaar(data: AadhaarData) {
    setForm((f) => ({
      ...f,
      birthYear: data.birthYear,
      birthMonth: data.birthMonth,
      birthDay: data.birthDay,
      countryCode: "91",
      idNumber: data.aadhaarRef,
    }));
    setProof(null);
    setError(null);
    setStep("idle");
  }

  function applyMRZ(data: MRZData) {
    setForm((f) => ({
      ...f,
      birthYear: data.birthYear,
      birthMonth: data.birthMonth,
      birthDay: data.birthDay,
      countryCode: data.countryCodeNumeric,
      idNumber: data.docNumber,
    }));
    setProof(null);
    setError(null);
    setStep("idle");
  }

  async function handleGenerateProof() {
    setError(null);
    setProof(null);
    const input: CircuitInput = {
      birthYear: form.birthYear,
      birthMonth: form.birthMonth,
      birthDay: form.birthDay,
      secret: form.secret,
      countryCode: form.countryCode,
      idNumber: form.idNumber,
      currentYear: now.year,
      currentMonth: now.month,
      currentDay: now.day,
      minAge: "18",
    };

    try {
      const result = await generateAgeProof(input, setStep);
      setProof(result);
    } catch (e) {
      setStep("error");
      setError(e instanceof Error ? e.message : "Proof generation failed");
    }
  }

  function handleSubmit() {
    if (!proof) return;
    writeContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "verify",
      args: [proof.a, proof.b, proof.c, proof.signals],
    });
  }

  if (isSuccess) setTimeout(() => router.push("/"), 2000);

  const formFilled =
    form.birthYear.length === 4 &&
    form.birthMonth.length > 0 &&
    form.birthDay.length > 0 &&
    form.secret.length > 0 &&
    form.idNumber.length > 0;

  const canGenerate = formFilled && step !== "witness" && step !== "proving";
  const isGenerating = step === "witness" || step === "proving";

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex rounded-xl bg-zinc-800/60 p-1 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setProof(null);
              setError(null);
              setStep("idle");
            }}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition ${
              tab === t.id ? "bg-zinc-700 text-white shadow" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="mr-1">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Aadhaar QR */}
      {tab === "aadhaar" && <AadhaarScanner onParsed={applyAadhaar} />}

      {/* Passport MRZ */}
      {tab === "passport" && <MRZInput onParsed={applyMRZ} />}

      {/* Form fields — shown for manual tab, or after scan populates data */}
      {(tab === "manual" || formFilled) && (
        <div className="space-y-4">
          {(tab === "aadhaar" || tab === "passport") && formFilled && (
            <div className="rounded-lg border border-violet-800/50 bg-violet-950/20 px-3 py-2 text-xs text-violet-300">
              ✓ Document data extracted — review below then add a secret and generate proof
            </div>
          )}

          {/* Birth date */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Date of Birth</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "birthYear", label: "Year", placeholder: "1995" },
                { key: "birthMonth", label: "Month", placeholder: "6" },
                { key: "birthDay", label: "Day", placeholder: "15" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                  <input
                    type="number"
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setField(key, e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Issuing Country</label>
            <select
              value={form.countryCode}
              onChange={(e) => setField("countryCode", e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* ID Number */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">ID Document Number</label>
            <input
              type="text"
              placeholder="Digits from Aadhaar / passport…"
              value={form.idNumber}
              onChange={(e) => setField("idNumber", e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Secret */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">Secret (salt)</label>
              <button
                type="button"
                onClick={() => setField("secret", randomSecret())}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                Generate random
              </button>
            </div>
            <input
              type="text"
              placeholder="Random number — save this!"
              value={form.secret}
              onChange={(e) => setField("secret", e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Save this value — it generates your nullifier.
            </p>
          </div>

          {/* Privacy note */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500">
            🔒 All inputs stay in your browser. Only the ZK proof is sent on-chain — never the raw data.
          </div>
        </div>
      )}

      {/* Generate proof */}
      {step !== "done" && !isSuccess && (
        <button
          onClick={handleGenerateProof}
          disabled={!canGenerate}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {STEP_LABELS[step]}
            </span>
          ) : "Generate ZK Proof"}
        </button>
      )}

      {/* Proof ready */}
      {proof && step === "done" && !isSuccess && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-800/60 bg-green-950/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-green-400">Proof generated</span>
            </div>
            <div className="space-y-1 text-xs text-zinc-500">
              {[
                ["Age 18+", proof.isOver18 ? <span className="text-green-400">Yes ✓</span> : <span className="text-zinc-400">No</span>],
                ["Nullifier", <span className="font-mono text-zinc-600">{proof.signals[1].toString(16).slice(0,16)}…</span>],
                ["Country hash", <span className="font-mono text-zinc-600">{proof.signals[2].toString(16).slice(0,16)}…</span>],
                ["Uniqueness hash", <span className="font-mono text-zinc-600">{proof.signals[3].toString(16).slice(0,16)}…</span>],
              ].map(([label, val], i) => (
                <div key={i} className="flex justify-between items-center">
                  <span>{label}</span>{val}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isTxPending || isConfirming}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 active:scale-95"
          >
            {isTxPending ? "Waiting for wallet…" : isConfirming ? "Confirming…" : "Submit to Monad →"}
          </button>
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="rounded-xl border border-green-700 bg-green-950/40 p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <div className="font-semibold text-green-400">Identity Verified!</div>
          <div className="mt-1 text-sm text-zinc-400">PHT Soulbound Token minted. Redirecting…</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
