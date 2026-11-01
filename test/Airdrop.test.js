const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SafeDrop Smart Contracts Suite", function () {
  let token;
  let naiveAirdrop;
  let hardenedAirdrop;
  let owner, claimant1, claimant2, attacker;

  const initialSupply = ethers.parseEther("1000000");
  const airdropAmount = ethers.parseEther("100");

  // Helper to compute Keccak256 leaf
  function computeNaiveLeaf(account, amount) {
    return ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]);
  }

  function computeHardenedLeaf(account, amount) {
    const inner = ethers.solidityPacked(["address", "uint256"], [account, amount]);
    return ethers.keccak256(ethers.concat([ethers.toUtf8Bytes("LEAF:"), inner]));
  }

  function combineNodes(left, right, prefix = "") {
    let combined;
    if (left <= right) {
      combined = ethers.solidityPacked(["bytes32", "bytes32"], [left, right]);
    } else {
      combined = ethers.solidityPacked(["bytes32", "bytes32"], [right, left]);
    }
    if (prefix) {
      return ethers.keccak256(ethers.concat([ethers.toUtf8Bytes(prefix), combined]));
    }
    return ethers.keccak256(combined);
  }

  beforeEach(async function () {
    [owner, claimant1, claimant2, attacker] = await ethers.getSigners();

    // Deploy ERC-20 Token
    const SafeDropToken = await ethers.getContractFactory("SafeDropToken");
    token = await SafeDropToken.deploy(initialSupply);
    await token.waitForDeployment();

    // Construct 2-leaf Naive Merkle Tree
    const leaf1Naive = computeNaiveLeaf(claimant1.address, airdropAmount);
    const leaf2Naive = computeNaiveLeaf(claimant2.address, airdropAmount);
    const naiveRoot = combineNodes(leaf1Naive, leaf2Naive);

    // Construct 2-leaf Hardened Merkle Tree
    const leaf1Hardened = computeHardenedLeaf(claimant1.address, airdropAmount);
    const leaf2Hardened = computeHardenedLeaf(claimant2.address, airdropAmount);
    const hardenedRoot = combineNodes(leaf1Hardened, leaf2Hardened, "NODE:");

    // Deploy NaiveAirdrop
    const NaiveAirdrop = await ethers.getContractFactory("NaiveAirdrop");
    naiveAirdrop = await NaiveAirdrop.deploy(await token.getAddress(), naiveRoot);
    await naiveAirdrop.waitForDeployment();

    // Deploy HardenedAirdrop (depth = 1 for 2 leaves)
    const HardenedAirdrop = await ethers.getContractFactory("HardenedAirdrop");
    hardenedAirdrop = await HardenedAirdrop.deploy(await token.getAddress(), hardenedRoot, 1);
    await hardenedAirdrop.waitForDeployment();

    // Fund both airdrops with 10,000 tokens
    await token.transfer(await naiveAirdrop.getAddress(), ethers.parseEther("10000"));
    await token.transfer(await hardenedAirdrop.getAddress(), ethers.parseEther("10000"));
  });

  describe("Token Deployment", function () {
    it("should have correct name, symbol, and initial supply", async function () {
      expect(await token.name()).to.equal("SafeDrop Token");
      expect(await token.symbol()).to.equal("SFT");
      expect(await token.totalSupply()).to.equal(initialSupply);
    });
  });

  describe("NaiveAirdrop Contract", function () {
    it("should allow a legitimate claimant to claim tokens", async function () {
      const leaf2Naive = computeNaiveLeaf(claimant2.address, airdropAmount);
      const proof = [leaf2Naive];

      const balanceBefore = await token.balanceOf(claimant1.address);
      await naiveAirdrop.connect(claimant1).claim(claimant1.address, airdropAmount, proof);
      const balanceAfter = await token.balanceOf(claimant1.address);

      expect(balanceAfter - balanceBefore).to.equal(airdropAmount);
      expect(await naiveAirdrop.hasClaimed(claimant1.address)).to.be.true;
    });

    it("should prevent double-claiming", async function () {
      const leaf2Naive = computeNaiveLeaf(claimant2.address, airdropAmount);
      const proof = [leaf2Naive];

      await naiveAirdrop.connect(claimant1).claim(claimant1.address, airdropAmount, proof);
      await expect(
        naiveAirdrop.connect(claimant1).claim(claimant1.address, airdropAmount, proof)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("HardenedAirdrop Contract", function () {
    it("should allow a legitimate claimant to claim tokens with depth validation", async function () {
      const leaf2Hardened = computeHardenedLeaf(claimant2.address, airdropAmount);
      const proof = [leaf2Hardened];

      const balanceBefore = await token.balanceOf(claimant1.address);
      await hardenedAirdrop.connect(claimant1).claim(claimant1.address, airdropAmount, proof);
      const balanceAfter = await token.balanceOf(claimant1.address);

      expect(balanceAfter - balanceBefore).to.equal(airdropAmount);
      expect(await hardenedAirdrop.hasClaimed(claimant1.address)).to.be.true;
    });

    it("should reject proofs with incorrect length", async function () {
      // Empty proof or forged shorter proof
      const forgedProof = [];
      await expect(
        hardenedAirdrop.connect(attacker).claim(attacker.address, airdropAmount, forgedProof)
      ).to.be.revertedWith("Invalid proof length: does not match tree depth");
    });
  });
});
