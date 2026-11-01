const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy Token
  const initialSupply = hre.ethers.parseEther("1000000");
  const SafeDropToken = await hre.ethers.getContractFactory("SafeDropToken");
  const token = await SafeDropToken.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("SafeDropToken deployed to:", tokenAddress);

  // Sample Roots (Genesis Airdrop Demo)
  const naiveRoot = "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b";
  const hardenedRoot = "0x1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f";
  const treeDepth = 3;

  // 2. Deploy Naive Airdrop
  const NaiveAirdrop = await hre.ethers.getContractFactory("NaiveAirdrop");
  const naiveAirdrop = await NaiveAirdrop.deploy(tokenAddress, naiveRoot);
  await naiveAirdrop.waitForDeployment();
  console.log("NaiveAirdrop deployed to:", await naiveAirdrop.getAddress());

  // 3. Deploy Hardened Airdrop
  const HardenedAirdrop = await hre.ethers.getContractFactory("HardenedAirdrop");
  const hardenedAirdrop = await HardenedAirdrop.deploy(tokenAddress, hardenedRoot, treeDepth);
  await hardenedAirdrop.waitForDeployment();
  console.log("HardenedAirdrop deployed to:", await hardenedAirdrop.getAddress());

  // 4. Fund airdrop contracts
  const fundAmount = hre.ethers.parseEther("50000");
  await token.transfer(await naiveAirdrop.getAddress(), fundAmount);
  await token.transfer(await hardenedAirdrop.getAddress(), fundAmount);
  console.log(`Funded both airdrop contracts with ${hre.ethers.formatEther(fundAmount)} SFT`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
