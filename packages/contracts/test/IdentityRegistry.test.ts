import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { IdentityRegistry, PersonaToken, Groth16Verifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Helper: build a dummy proof that will be accepted via a mocked verifier
const DUMMY_PROOF = {
  a: [1n, 2n] as [bigint, bigint],
  b: [[1n, 2n], [3n, 4n]] as [[bigint, bigint], [bigint, bigint]],
  c: [1n, 2n] as [bigint, bigint],
};

// Helper: build public signals matching ageProof.circom Phase 2 output:
// [isOver18, nullifier, countryHash, uniquenessHash, currentYear, currentMonth, currentDay, minAge]
function buildSignals({
  isOver18 = 1n,
  nullifier = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("nullifier1"))),
  countryHash = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("IND"))),
  uniquenessHash = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("unique1"))),
  currentYear = 2024n,
  currentMonth = 1n,
  currentDay = 1n,
  minAge = 18n,
} = {}): [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  return [isOver18, nullifier, countryHash, uniquenessHash, currentYear, currentMonth, currentDay, minAge];
}

describe("IdentityRegistry", () => {
  let verifier: Groth16Verifier;
  let token: PersonaToken;
  let registry: IdentityRegistry;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy contracts
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();

    const Token = await ethers.getContractFactory("PersonaToken");
    token = await Token.deploy(owner.address);

    const Registry = await ethers.getContractFactory("IdentityRegistry");
    registry = await Registry.deploy(
      await verifier.getAddress(),
      await token.getAddress(),
      owner.address
    );

    // Wire token → registry
    await token.connect(owner).setRegistry(await registry.getAddress());
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("deployment", () => {
    it("sets verifier and token addresses", async () => {
      expect(await registry.verifier()).to.equal(await verifier.getAddress());
      expect(await registry.token()).to.equal(await token.getAddress());
    });

    it("sets the owner", async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("reverts with ZeroAddress if verifier is zero", async () => {
      const Registry = await ethers.getContractFactory("IdentityRegistry");
      await expect(
        Registry.deploy(ethers.ZeroAddress, await token.getAddress(), owner.address)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts with ZeroAddress if token is zero", async () => {
      const Registry = await ethers.getContractFactory("IdentityRegistry");
      await expect(
        Registry.deploy(await verifier.getAddress(), ethers.ZeroAddress, owner.address)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ── verify() — success path ────────────────────────────────────────────────

  describe("verify — with mocked verifier (always returns true)", () => {
    let mockVerifier: Groth16Verifier;
    let registryWithMock: IdentityRegistry;

    beforeEach(async () => {
      // Deploy a fresh registry with a mocked verifier
      // We use a second deployment where we impersonate a signer to
      // override verifyProof. Instead, we directly test with the real
      // verifier returning false (proof will fail). For "success" tests,
      // we deploy a MockVerifier helper inline.

      // Deploy MockVerifier (always returns true) by deploying a contract
      // that wraps a simple always-true verifyProof
      const MockVerifierFactory = await ethers.getContractFactory("MockGroth16Verifier");
      mockVerifier = await MockVerifierFactory.deploy() as unknown as Groth16Verifier;

      const Token2 = await ethers.getContractFactory("PersonaToken");
      const token2 = await Token2.deploy(owner.address);

      const Registry2 = await ethers.getContractFactory("IdentityRegistry");
      registryWithMock = await Registry2.deploy(
        await mockVerifier.getAddress(),
        await token2.getAddress(),
        owner.address
      );
      await token2.connect(owner).setRegistry(await registryWithMock.getAddress());
    });

    it("verifies successfully and stores identity", async () => {
      const signals = buildSignals();
      await expect(
        registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      )
        .to.emit(registryWithMock, "IdentityVerified")
        .withArgs(user1.address, ethers.toBeHex(signals[1], 32), 1n, anyValue);

      const data = await registryWithMock.getIdentityData(user1.address);
      expect(data.isHuman).to.be.true;
      expect(data.isOver18).to.be.true;
      expect(data.tokenId).to.equal(1n);
    });

    it("isHuman returns true after verification", async () => {
      const signals = buildSignals();
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
      expect(await registryWithMock.isHuman(user1.address)).to.be.true;
    });

    it("isOver18 returns true when isOver18 signal is 1", async () => {
      const signals = buildSignals({ isOver18: 1n });
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
      expect(await registryWithMock.isOver18(user1.address)).to.be.true;
    });

    it("isOver18 returns false when isOver18 signal is 0", async () => {
      const signals = buildSignals({ isOver18: 0n });
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
      expect(await registryWithMock.isOver18(user1.address)).to.be.false;
    });

    it("reverts with AlreadyVerified on second verify call", async () => {
      const signals = buildSignals();
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
      await expect(
        registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      ).to.be.revertedWithCustomError(registryWithMock, "AlreadyVerified");
    });

    it("reverts with NullifierUsed when same nullifier submitted by different wallet", async () => {
      const signals = buildSignals();
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);

      // Same nullifier, different user
      await expect(
        registryWithMock.connect(user2).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      ).to.be.revertedWithCustomError(registryWithMock, "NullifierUsed");
    });

    it("allows two different wallets with different nullifiers", async () => {
      const signals1 = buildSignals({ nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("n1"))) });
      const signals2 = buildSignals({ nullifier: ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes("n2"))) });

      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals1);
      await registryWithMock.connect(user2).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals2);

      expect(await registryWithMock.isHuman(user1.address)).to.be.true;
      expect(await registryWithMock.isHuman(user2.address)).to.be.true;
    });
  });

  // ── verify() — invalid proof ───────────────────────────────────────────────

  describe("verify — with real verifier (invalid proofs)", () => {
    it("reverts with InvalidProof when proof is garbage", async () => {
      const signals = buildSignals();
      await expect(
        registry.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      ).to.be.revertedWithCustomError(registry, "InvalidProof");
    });
  });

  // ── revokeIdentity() ───────────────────────────────────────────────────────

  describe("revokeIdentity", () => {
    let registryWithMock: IdentityRegistry;
    let tokenForRevoke: PersonaToken;

    beforeEach(async () => {
      const MockVerifierFactory = await ethers.getContractFactory("MockGroth16Verifier");
      const mockVerifier = await MockVerifierFactory.deploy();

      const TokenFactory = await ethers.getContractFactory("PersonaToken");
      tokenForRevoke = await TokenFactory.deploy(owner.address);

      const Registry = await ethers.getContractFactory("IdentityRegistry");
      registryWithMock = await Registry.deploy(
        await mockVerifier.getAddress(),
        await tokenForRevoke.getAddress(),
        owner.address
      );
      await tokenForRevoke.connect(owner).setRegistry(await registryWithMock.getAddress());

      // Verify user1 first
      const signals = buildSignals();
      await registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals);
    });

    it("revokes identity and burns token", async () => {
      expect(await registryWithMock.isHuman(user1.address)).to.be.true;

      await expect(registryWithMock.connect(owner).revokeIdentity(user1.address))
        .to.emit(registryWithMock, "IdentityRevoked")
        .withArgs(user1.address, 1n);

      expect(await registryWithMock.isHuman(user1.address)).to.be.false;
      expect(await tokenForRevoke.balanceOf(user1.address)).to.equal(0n);
    });

    it("reverts if called by non-owner", async () => {
      await expect(
        registryWithMock.connect(user1).revokeIdentity(user1.address)
      ).to.be.revertedWithCustomError(registryWithMock, "OwnableUnauthorizedAccount");
    });

    it("reverts if account is not verified", async () => {
      await expect(
        registryWithMock.connect(owner).revokeIdentity(user2.address)
      ).to.be.revertedWithCustomError(registryWithMock, "NotVerified");
    });

    it("nullifier remains used after revocation (cannot re-register same identity)", async () => {
      const signals = buildSignals();
      await registryWithMock.connect(owner).revokeIdentity(user1.address);

      // Same nullifier — should still be blocked
      await expect(
        registryWithMock.connect(user1).verify(DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, signals)
      ).to.be.revertedWithCustomError(registryWithMock, "NullifierUsed");
    });
  });

  // ── View helpers ───────────────────────────────────────────────────────────

  describe("view helpers", () => {
    it("isHuman returns false for unverified address", async () => {
      expect(await registry.isHuman(user1.address)).to.be.false;
    });

    it("isOver18 returns false for unverified address", async () => {
      expect(await registry.isOver18(user1.address)).to.be.false;
    });

    it("getCountryHash returns zero bytes for unverified address", async () => {
      expect(await registry.getCountryHash(user1.address)).to.equal(ethers.ZeroHash);
    });

    it("isNullifierUsed returns false for unused nullifier", async () => {
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("unused"));
      expect(await registry.isNullifierUsed(nullifier)).to.be.false;
    });
  });
});

