import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Persona contracts...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ── Step 1: Deploy Groth16Verifier ────────────────────────────────────────
  console.log("1/3 Deploying Groth16Verifier...");
  const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("    Groth16Verifier:", verifierAddress);

  // ── Step 2: Deploy PersonaToken ───────────────────────────────────────────
  // Deploy with deployer as initial owner. Registry is set in step 4.
  console.log("2/3 Deploying PersonaToken...");
  const PersonaToken = await ethers.getContractFactory("PersonaToken");
  const token = await PersonaToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("    PersonaToken:", tokenAddress);

  // ── Step 3: Deploy IdentityRegistry ──────────────────────────────────────
  console.log("3/3 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const registry = await IdentityRegistry.deploy(verifierAddress, tokenAddress, deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("    IdentityRegistry:", registryAddress);

  // ── Step 4: Wire up PersonaToken → IdentityRegistry ──────────────────────
  console.log("\nWiring PersonaToken to IdentityRegistry...");
  const tx = await token.setRegistry(registryAddress);
  await tx.wait();
  console.log("    Registry set on PersonaToken. Tx:", tx.hash);

  // ── Save deployment addresses ─────────────────────────────────────────────
  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      Groth16Verifier: verifierAddress,
      PersonaToken: tokenAddress,
      IdentityRegistry: registryAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment saved to: ${outPath}`);

  console.log("\n── Persona Deployment Complete ──");
  console.log("Groth16Verifier:", verifierAddress);
  console.log("PersonaToken   :", tokenAddress);
  console.log("IdentityRegistry:", registryAddress);
  console.log("\nNext steps:");
  console.log("  1. Use IdentityRegistry address in your dApp: await registry.isHuman(address)");
  console.log("  2. Generate a proof: snarkjs groth16 fullprove input.json ageProof.wasm ageProof_final.zkey");
  console.log("  3. Submit proof to IdentityRegistry.verify(a, b, c, input)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
