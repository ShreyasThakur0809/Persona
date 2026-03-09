"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import {
  IDENTITY_REGISTRY_ABI,
  IDENTITY_REGISTRY_ADDRESS,
} from "@/lib/contracts";

export function IdentityCard() {
  const { address } = useAccount();

  const { data: identityData, isLoading } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getIdentityData",
    args: [address!],
    query: { enabled: !!address },
  });

  if (!address) return null;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 animate-pulse">
        <div className="h-5 w-32 rounded bg-zinc-800" />
        <div className="mt-4 h-4 w-48 rounded bg-zinc-800" />
      </div>
    );
  }

  const verified = identityData?.isHuman ?? false;
  const verifiedAt = identityData?.verifiedAt
    ? new Date(Number(identityData.verifiedAt) * 1000).toLocaleDateString()
    : null;

  return (
    <div
      className={`rounded-2xl border p-6 transition-colors ${
        verified
          ? "border-violet-700 bg-violet-950/30"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            verified ? "bg-green-400" : "bg-zinc-600"
          }`}
        />
        <span
          className={`text-sm font-medium ${
            verified ? "text-green-400" : "text-zinc-500"
          }`}
        >
          {verified ? "Verified Human" : "Not Verified"}
        </span>
      </div>

      {/* Address */}
      <p className="mt-3 font-mono text-xs text-zinc-500 break-all">
        {address}
      </p>

      {verified ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Age 18+</span>
            <span
              className={`text-sm font-medium ${
                identityData?.isOver18 ? "text-green-400" : "text-zinc-500"
              }`}
            >
              {identityData?.isOver18 ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Token ID</span>
            <span className="text-sm font-mono text-zinc-300">
              #{identityData?.tokenId?.toString()}
            </span>
          </div>
          {verifiedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Verified on</span>
              <span className="text-sm text-zinc-300">{verifiedAt}</span>
            </div>
          )}
          <div className="mt-4 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-500">
            PHT Soulbound Token — non-transferable
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-zinc-500">
            Generate a ZK proof from your birth date to verify your identity
            on-chain. No personal data is stored.
          </p>
          <Link
            href="/verify"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 active:scale-95"
          >
            Verify Identity →
          </Link>
        </div>
      )}
    </div>
  );
}
