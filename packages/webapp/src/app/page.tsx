"use client";

export const dynamic = "force-dynamic";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { IdentityCard } from "@/components/IdentityCard";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">
              Persona
            </span>
            <span className="rounded-full bg-violet-900/60 px-2 py-0.5 text-xs text-violet-300">
              Monad Testnet
            </span>
          </div>
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="address"
          />
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-16">
        {!isConnected ? (
          /* Hero — wallet not connected */
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-900/40 ring-1 ring-violet-700/50">
              <svg
                className="h-8 w-8 text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white">
              ZK Proof of Humanity
            </h1>
            <p className="mx-auto mt-4 max-w-md text-zinc-400">
              Verify your identity on-chain using zero-knowledge proofs. Your
              personal data never leaves your device.
            </p>

            {/* Feature grid */}
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: "🔒",
                  title: "Zero Knowledge",
                  desc: "Prove facts about yourself without revealing the underlying data",
                },
                {
                  icon: "⛓️",
                  title: "On-chain",
                  desc: "Verification stored on Monad — any dApp can query isHuman()",
                },
                {
                  icon: "🪙",
                  title: "Soulbound Token",
                  desc: "Receive a non-transferable PHT token as proof of verification",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-left"
                >
                  <div className="mb-2 text-2xl">{f.icon}</div>
                  <div className="font-semibold text-zinc-100">{f.title}</div>
                  <div className="mt-1 text-sm text-zinc-500">{f.desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <ConnectButton label="Connect Wallet to Get Started" />
            </div>
          </div>
        ) : (
          /* Dashboard — wallet connected */
          <div className="mx-auto max-w-md">
            <h2 className="mb-6 text-xl font-semibold text-zinc-100">
              Your Identity
            </h2>
            <IdentityCard />

            {/* Protocol info */}
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">
              <div className="font-medium text-zinc-400 mb-2">Contracts on Monad Testnet</div>
              <div className="space-y-1 font-mono">
                <div className="flex justify-between gap-4">
                  <span>IdentityRegistry</span>
                  <span className="text-zinc-600 truncate">0xE050...f18b</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>PersonaToken (PHT)</span>
                  <span className="text-zinc-600 truncate">0xF458...8974</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
