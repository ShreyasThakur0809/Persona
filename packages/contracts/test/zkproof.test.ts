import { expect } from "chai";
import { ethers } from "hardhat";
import * as snarkjs from "snarkjs";
import * as path from "path";
import { IdentityRegistry, PersonaToken, Groth16Verifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/// @notice End-to-end ZK proof test: generates a REAL Groth16 proof from the Phase 2
///         ageProof circuit and verifies it on-chain against the real Groth16Verifier.
///
/// Circuit private inputs: birthYear, birthMonth, birthDay, secret, countryCode, idNumber
/// Circuit public inputs:  currentYear, currentMonth, currentDay, minAge
///
/// Public signals order (snarkjs output-first convention):
///   [0] isOver18       — circuit output (full date-aware)
///   [1] nullifier      — Poseidon(secret)
///   [2] countryHash    — Poseidon(countryCode)
///   [3] uniquenessHash — Poseidon(idNumber, secret)
///   [4] currentYear
///   [5] currentMonth
///   [6] currentDay
///   [7] minAge

const CIRCUIT_BUILD_DIR = path.join(__dirname, "../../circuits/build");
const WASM_PATH = path.join(CIRCUIT_BUILD_DIR, "ageProof_js/ageProof.wasm");
const ZKEY_PATH = path.join(CIRCUIT_BUILD_DIR, "ageProof_final.zkey");

type Signals8 = [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

/// Convert snarkjs proof to Solidity calldata (reverses Fp2 element order for G2).
function proofToSolidity(proof: snarkjs.Groth16Proof): {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
} {
  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  };
}

describe("ZK Proof: Real end-to-end circuit → verifier (Phase 2)", () => {
  let verifier: Groth16Verifier;
  let token: PersonaToken;
  let registry: IdentityRegistry;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async () => {
    [owner, alice] = await ethers.getSigners();

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

    await token.connect(owner).setRegistry(await registry.getAddress());
  });

  it("valid proof: born 2000-06-15, currentDate 2024-03-07 → isOver18=1", async () => {
    const input = {
      birthYear: "2000", birthMonth: "6", birthDay: "15",
      secret: "42",
      countryCode: "91",   // India
      idNumber: "123456789012",
      currentYear: "2024", currentMonth: "3", currentDay: "7",
      minAge: "18",
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);

    expect(publicSignals[0]).to.equal("1"); // isOver18 = 1 (24 years old, birthday passed)

    const { a, b, c } = proofToSolidity(proof);
    const signals = publicSignals.map(BigInt) as unknown as Signals8;

    expect(await verifier.verifyProof(a, b, c, signals)).to.be.true;

    await registry.connect(alice).verify(a, b, c, signals);
    expect(await registry.isHuman(alice.address)).to.be.true;
    expect(await registry.isOver18(alice.address)).to.be.true;
    expect(await token.balanceOf(alice.address)).to.equal(1n);

    // countryHash and uniquenessHash are stored on-chain
    const data = await registry.getIdentityData(alice.address);
    expect(data.countryHash).to.not.equal(ethers.ZeroHash);
    expect(data.uniquenessHash).to.not.equal(ethers.ZeroHash);
  });

  it("edge case: born 2006-03-07, currentDate 2024-03-07 → isOver18=1 (exactly 18 today)", async () => {
    const [, , bob] = await ethers.getSigners();

    const input = {
      birthYear: "2006", birthMonth: "3", birthDay: "7",
      secret: "888",
      countryCode: "1",   // USA
      idNumber: "987654321",
      currentYear: "2024", currentMonth: "3", currentDay: "7",
      minAge: "18",
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    expect(publicSignals[0]).to.equal("1"); // exactly 18 today → isOver18=1

    const { a, b, c } = proofToSolidity(proof);
    const signals = publicSignals.map(BigInt) as unknown as Signals8;

    await registry.connect(bob).verify(a, b, c, signals);
    expect(await registry.isOver18(bob.address)).to.be.true;
  });

  it("edge case: born 2006-03-08, currentDate 2024-03-07 → isOver18=0 (turns 18 tomorrow)", async () => {
    const [, , , charlie] = await ethers.getSigners();

    const input = {
      birthYear: "2006", birthMonth: "3", birthDay: "8",
      secret: "999",
      countryCode: "44",  // UK
      idNumber: "111222333",
      currentYear: "2024", currentMonth: "3", currentDay: "7",
      minAge: "18",
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    expect(publicSignals[0]).to.equal("0"); // birthday is tomorrow → isOver18=0

    const { a, b, c } = proofToSolidity(proof);
    const signals = publicSignals.map(BigInt) as unknown as Signals8;

    await registry.connect(charlie).verify(a, b, c, signals);
    expect(await registry.isHuman(charlie.address)).to.be.true;
    expect(await registry.isOver18(charlie.address)).to.be.false;
  });

  it("tampered signal rejected by verifier", async () => {
    const input = {
      birthYear: "2000", birthMonth: "1", birthDay: "1",
      secret: "777",
      countryCode: "91",
      idNumber: "000111222333",
      currentYear: "2024", currentMonth: "3", currentDay: "7",
      minAge: "18",
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    const { a, b, c } = proofToSolidity(proof);
    const signals = publicSignals.map(BigInt) as unknown as Signals8;

    const tampered = [...signals] as unknown as Signals8;
    tampered[0] = signals[0] === 1n ? 0n : 1n; // flip isOver18

    expect(await verifier.verifyProof(a, b, c, tampered)).to.be.false;
  });

  it("same secret + same ID always produces the same nullifier and uniquenessHash", async () => {
    const base = {
      birthYear: "1995", birthMonth: "3", birthDay: "20",
      secret: "12345", countryCode: "91", idNumber: "555666777888",
      currentYear: "2024", currentMonth: "3", currentDay: "7", minAge: "18",
    };

    const { publicSignals: sig1 } = await snarkjs.groth16.fullProve(base, WASM_PATH, ZKEY_PATH);
    const { publicSignals: sig2 } = await snarkjs.groth16.fullProve(base, WASM_PATH, ZKEY_PATH);

    expect(sig1[1]).to.equal(sig2[1]); // nullifier
    expect(sig1[2]).to.equal(sig2[2]); // countryHash
    expect(sig1[3]).to.equal(sig2[3]); // uniquenessHash
  });
});
