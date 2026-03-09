import { expect } from "chai";
import { ethers } from "hardhat";
import { IdentityRegistry, PersonaToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/// @notice End-to-end integration test: full verification flow from proof submission
///         to SBT ownership to dApp integration point.
///
/// Uses MockGroth16Verifier (always returns true) to simulate successful proof
/// verification without requiring a real ZK proof. In production, this verifier
/// is replaced with the real snarkjs-generated Groth16Verifier.

const DUMMY_PROOF = {
  a: [1n, 2n] as [bigint, bigint],
  b: [[1n, 2n], [3n, 4n]] as [[bigint, bigint], [bigint, bigint]],
  c: [1n, 2n] as [bigint, bigint],
};

// Signal layout from ageProof.circom Phase 2:
// [isOver18, nullifier, countryHash, uniquenessHash, currentYear, currentMonth, currentDay, minAge]
function buildSignals(overrides: Partial<{
  isOver18: bigint;
  nullifier: bigint;
  countryHash: bigint;
  uniquenessHash: bigint;
  currentYear: bigint;
  currentMonth: bigint;
  currentDay: bigint;
  minAge: bigint;
}> = {}): [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  return [
    overrides.isOver18 ?? 1n,
    overrides.nullifier ?? ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("nullifier1"))),
    overrides.countryHash ?? ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("IND"))),
    overrides.uniquenessHash ?? ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("unique1"))),
    overrides.currentYear ?? 2024n,
    overrides.currentMonth ?? 1n,
    overrides.currentDay ?? 1n,
    overrides.minAge ?? 18n,
  ];
}

describe("Integration: Full Persona Flow", () => {
  let registry: IdentityRegistry;
  let token: PersonaToken;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let dApp: SignerWithAddress;

  beforeEach(async () => {
    [owner, alice, bob, dApp] = await ethers.getSigners();

    // Deploy MockVerifier
    const MockVerifier = await ethers.getContractFactory("MockGroth16Verifier");
    const mockVerifier = await MockVerifier.deploy();

    // Deploy PersonaToken
    const PersonaToken = await ethers.getContractFactory("PersonaToken");
    token = await PersonaToken.deploy(owner.address);

    // Deploy IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    registry = await IdentityRegistry.deploy(
      await mockVerifier.getAddress(),
      await token.getAddress(),
      owner.address
    );

    // Wire up
    await token.connect(owner).setRegistry(await registry.getAddress());
  });

  describe("Happy path: Alice verifies her identity", () => {
    const aliceSignals = (): [bigint, bigint, bigint, bigint, bigint] => buildSignals({
      nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("alice-secret"))),
    });

    it("1. Alice has no identity before verification", async () => {
      expect(await registry.isHuman(alice.address)).to.be.false;
      expect(await token.balanceOf(alice.address)).to.equal(0n);
    });

    it("2. Alice submits proof and gets verified", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());

      expect(await registry.isHuman(alice.address)).to.be.true;
      expect(await registry.isOver18(alice.address)).to.be.true;
    });

    it("3. Alice receives a Soulbound Token", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());

      expect(await token.balanceOf(alice.address)).to.equal(1n);
      expect(await token.ownerOf(1)).to.equal(alice.address);
    });

    it("4. Alice cannot transfer her SBT", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());

      await expect(
        token.connect(alice).transferFrom(alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(token, "SoulboundToken");
    });

    it("5. A dApp can call isHuman(alice) and get true", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());

      // Simulate a dApp integration — dApp signer queries the registry
      const isHuman = await registry.connect(dApp).isHuman(alice.address);
      expect(isHuman).to.be.true;
    });

    it("6. A dApp sees Bob as not human (unverified)", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());
      expect(await registry.connect(dApp).isHuman(bob.address)).to.be.false;
    });

    it("7. Full identity data is accessible", async () => {
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals());

      const data = await registry.getIdentityData(alice.address);
      expect(data.isHuman).to.be.true;
      expect(data.isOver18).to.be.true;
      expect(data.tokenId).to.equal(1n);
      expect(data.verifiedAt).to.be.gt(0n);
    });
  });

  describe("Multiple users verify independently", () => {
    it("Bob and Alice can both verify with unique nullifiers", async () => {
      const aliceSignals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("alice-secret"))),
      });
      const bobSignals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("bob-secret"))),
      });

      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, aliceSignals);
      await registry.connect(bob).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, bobSignals);

      expect(await registry.isHuman(alice.address)).to.be.true;
      expect(await registry.isHuman(bob.address)).to.be.true;
      expect(await token.ownerOf(1)).to.equal(alice.address);
      expect(await token.ownerOf(2)).to.equal(bob.address);
    });

    it("Sybil attack: same nullifier cannot register to two wallets", async () => {
      const sharedSignals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("shared-secret"))),
      });

      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, sharedSignals);

      await expect(
        registry.connect(bob).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, sharedSignals)
      ).to.be.revertedWithCustomError(registry, "NullifierUsed");

      expect(await registry.isHuman(bob.address)).to.be.false;
    });
  });

  describe("Revocation flow", () => {
    beforeEach(async () => {
      const signals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("alice-secret"))),
      });
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
    });

    it("Owner can revoke Alice's identity", async () => {
      expect(await registry.isHuman(alice.address)).to.be.true;

      await registry.connect(owner).revokeIdentity(alice.address);

      expect(await registry.isHuman(alice.address)).to.be.false;
      expect(await token.balanceOf(alice.address)).to.equal(0n);
    });

    it("dApp sees Alice as not human after revocation", async () => {
      await registry.connect(owner).revokeIdentity(alice.address);
      expect(await registry.connect(dApp).isHuman(alice.address)).to.be.false;
    });

    it("Alice cannot re-register after revocation (nullifier still used)", async () => {
      const signals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("alice-secret"))),
      });
      await registry.connect(owner).revokeIdentity(alice.address);

      await expect(
        registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      ).to.be.revertedWithCustomError(registry, "NullifierUsed");
    });
  });

  describe("tokenURI contains no PII", () => {
    it("token metadata only exposes non-PII attributes", async () => {
      const signals = buildSignals({
        nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("alice-secret"))),
      });
      await registry.connect(alice).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);

      const uri = await token.tokenURI(1);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      // No PII should be in the metadata (actual personal data fields, not ERC-721 "name")
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).not.to.include("birthYear");
      expect(jsonStr).not.to.include("birthDay");
      expect(jsonStr).not.to.include("passport");
      expect(jsonStr).not.to.include("nationalId");
      expect(jsonStr).not.to.include("aadhaar");

      // Should contain protocol info
      expect(json.attributes.some((a: { trait_type: string }) => a.trait_type === "Protocol")).to.be.true;
    });
  });
});
