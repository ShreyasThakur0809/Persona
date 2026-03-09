// Contract addresses — Phase 2 deployment on Monad Testnet (chainId 10143)
export const IDENTITY_REGISTRY_ADDRESS =
  "0xE050F7307F035BE9cB5d077792Bd5133b9B2f18b" as const;

export const PERSONA_TOKEN_ADDRESS =
  "0xF4587c4E87d2a46031d872048F7eB014d73d8974" as const;

// ── ABIs (minimal — only what the frontend calls) ───────────────────────────

export const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "verify",
    stateMutability: "nonpayable",
    inputs: [
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "input", type: "uint256[8]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isHuman",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isOver18",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getIdentityData",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "isHuman", type: "bool" },
          { name: "isOver18", type: "bool" },
          { name: "countryHash", type: "bytes32" },
          { name: "uniquenessHash", type: "bytes32" },
          { name: "verifiedAt", type: "uint64" },
          { name: "tokenId", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "IdentityVerified",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "timestamp", type: "uint64", indexed: false },
    ],
  },
] as const;

export const PERSONA_TOKEN_ABI = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
