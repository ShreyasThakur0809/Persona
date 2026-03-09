import { expect } from "chai";
import { ethers } from "hardhat";
import { PersonaToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PersonaToken", () => {
  let token: PersonaToken;
  let owner: SignerWithAddress;
  let registry: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [owner, registry, user1, user2] = await ethers.getSigners();

    const PersonaToken = await ethers.getContractFactory("PersonaToken");
    token = await PersonaToken.deploy(owner.address);
    await token.waitForDeployment();

    // Wire up registry
    await token.connect(owner).setRegistry(registry.address);
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("deployment", () => {
    it("sets the correct name and symbol", async () => {
      expect(await token.name()).to.equal("Persona Human Token");
      expect(await token.symbol()).to.equal("PHT");
    });

    it("sets the owner correctly", async () => {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("sets the registry correctly", async () => {
      expect(await token.identityRegistry()).to.equal(registry.address);
    });
  });

  // ── setRegistry ────────────────────────────────────────────────────────────

  describe("setRegistry", () => {
    it("reverts if called by non-owner", async () => {
      const TokenFactory = await ethers.getContractFactory("PersonaToken");
      const freshToken = await TokenFactory.deploy(owner.address);

      await expect(
        freshToken.connect(user1).setRegistry(registry.address)
      ).to.be.revertedWithCustomError(freshToken, "OwnableUnauthorizedAccount");
    });

    it("reverts if registry is zero address", async () => {
      const TokenFactory = await ethers.getContractFactory("PersonaToken");
      const freshToken = await TokenFactory.deploy(owner.address);

      await expect(
        freshToken.connect(owner).setRegistry(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(freshToken, "ZeroAddress");
    });

    it("reverts if registry is already set", async () => {
      await expect(
        token.connect(owner).setRegistry(user1.address)
      ).to.be.revertedWithCustomError(token, "RegistryAlreadySet");
    });
  });

  // ── Minting ────────────────────────────────────────────────────────────────

  describe("mint", () => {
    it("mints a token when called by registry", async () => {
      await expect(token.connect(registry).mint(user1.address))
        .to.emit(token, "PersonaMinted")
        .withArgs(user1.address, 1n);

      expect(await token.ownerOf(1)).to.equal(user1.address);
      expect(await token.balanceOf(user1.address)).to.equal(1n);
    });

    it("increments token IDs correctly", async () => {
      await token.connect(registry).mint(user1.address);
      await token.connect(registry).mint(user2.address);

      expect(await token.ownerOf(1)).to.equal(user1.address);
      expect(await token.ownerOf(2)).to.equal(user2.address);
      expect(await token.totalMinted()).to.equal(2n);
    });

    it("reverts if called by non-registry", async () => {
      await expect(
        token.connect(user1).mint(user1.address)
      ).to.be.revertedWithCustomError(token, "OnlyRegistry");
    });

    it("reverts if address is zero", async () => {
      await expect(
        token.connect(registry).mint(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });

    it("reverts if address already has a token (AlreadyMinted)", async () => {
      await token.connect(registry).mint(user1.address);
      await expect(
        token.connect(registry).mint(user1.address)
      ).to.be.revertedWithCustomError(token, "AlreadyMinted");
    });
  });

  // ── Burning ────────────────────────────────────────────────────────────────

  describe("burn", () => {
    it("burns a token when called by registry", async () => {
      await token.connect(registry).mint(user1.address);
      await expect(token.connect(registry).burn(1))
        .to.emit(token, "PersonaBurned")
        .withArgs(1n);

      expect(await token.balanceOf(user1.address)).to.equal(0n);
    });

    it("reverts if called by non-registry", async () => {
      await token.connect(registry).mint(user1.address);
      await expect(
        token.connect(user1).burn(1)
      ).to.be.revertedWithCustomError(token, "OnlyRegistry");
    });
  });

  // ── Soulbound: Transfers Disabled ─────────────────────────────────────────

  describe("soulbound: transfers disabled", () => {
    beforeEach(async () => {
      await token.connect(registry).mint(user1.address);
    });

    it("transferFrom reverts with SoulboundToken", async () => {
      await expect(
        token.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWithCustomError(token, "SoulboundToken");
    });

    it("safeTransferFrom reverts with SoulboundToken", async () => {
      await expect(
        token.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](
          user1.address, user2.address, 1, "0x"
        )
      ).to.be.revertedWithCustomError(token, "SoulboundToken");
    });

    it("approve reverts with SoulboundToken", async () => {
      await expect(
        token.connect(user1).approve(user2.address, 1)
      ).to.be.revertedWithCustomError(token, "SoulboundToken");
    });

    it("setApprovalForAll reverts with SoulboundToken", async () => {
      await expect(
        token.connect(user1).setApprovalForAll(user2.address, true)
      ).to.be.revertedWithCustomError(token, "SoulboundToken");
    });
  });

  // ── tokenURI ───────────────────────────────────────────────────────────────

  describe("tokenURI", () => {
    it("returns a valid base64-encoded JSON URI", async () => {
      await token.connect(registry).mint(user1.address);
      const uri = await token.tokenURI(1);

      expect(uri).to.match(/^data:application\/json;base64,/);

      const base64 = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      expect(json.name).to.include("Persona Human Token #1");
      expect(json.description).to.be.a("string");
      expect(json.attributes).to.be.an("array");
    });

    it("reverts for non-existent token", async () => {
      await expect(token.tokenURI(999)).to.be.reverted;
    });
  });
});
