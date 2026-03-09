"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { VerifyForm } from "@/components/VerifyForm";

export default function VerifyPage() {
  const { isConnected } = useAccount();

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">
              Persona
            </span>
            <span className="rounded-full bg-violet-900/60 px-2 py-0.5 text-xs text-violet-300">
              Monad Testnet
            </span>
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Back
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Verify Your Identity
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Enter your birth date and a secret to generate a ZK proof. The proof
            is verified on-chain — no personal data is ever sent or stored.
          </p>
        </div>

        {!isConnected ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="mb-4 text-sm text-zinc-400">
              Connect your wallet to continue
            </p>
            <ConnectButton label="Connect Wallet" />
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <VerifyForm />
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 space-y-3 text-xs text-zinc-600">
          <div className="font-medium text-zinc-500">How it works</div>
          {[
            "Your birth date and secret are used as private inputs to a Circom circuit",
            "A Groth16 zero-knowledge proof is generated entirely in your browser (~20s)",
            "The proof is submitted to IdentityRegistry on Monad; the contract verifies it using BN254 pairing",
            "If valid, a non-transferable Soulbound Token (PHT) is minted to your wallet",
          ].map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-violet-700 font-mono">{i + 1}.</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
