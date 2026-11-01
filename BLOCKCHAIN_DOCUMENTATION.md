# SafeDrop: Complete Blockchain Architecture & Technical Specification

> **Comprehensive guide on how SafeDrop runs on the blockchain, technologies used, system integration points, test procedures, and file map.**

---

## 1. Executive Summary & Blockchain Architecture

SafeDrop demonstrates, end-to-end, how Merkle proof-based token distributions can be compromised by a **secondary preimage attack**, and how cryptographic mitigations (Domain Separation + Proof-Length Validation) prevent exploitation.

### The Hybrid On-Chain / Off-Chain Model

In standard blockchain airdrops (e.g., Uniswap, Arbitrum), building the Merkle tree directly on-chain is prohibitive due to gas costs. SafeDrop implements the standard industry architecture:

```
[ Off-Chain Layer ]
Recipients List (CSV) ──► Merkle Tree Builder (Python)
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
        Merkle Proofs                 Merkle Root Hash (32 bytes)
    (Given to Claimants)                      │
                                              ▼
[ On-Chain EVM Layer ]           Smart Contract Deployment
                                 (NaiveAirdrop / HardenedAirdrop)
                                              ▲
                                              │
Claimant / Attacker ──► Web3 Transaction: claim(address, amount, proof)
                                              │
                                 ┌────────────┴────────────┐
                                 ▼                         ▼
                         Naive Contract            Hardened Contract
                         (keccak256 raw)           (LEAF: + depth check)
                                 │                         │
                                 ▼                         ▼
                           [ EXPLOITED ]              [ REVERTED ]
                       Tokens transferred          Transaction rolled back
```

1. **Off-Chain (Tree Generation)**: Large recipient lists are hashed off-chain into a Merkle tree to produce a single 32-byte **Merkle Root**.
2. **On-Chain (Contract Deployment)**: The token (`SafeDropToken.sol`) and airdrop contracts (`NaiveAirdrop.sol` and `HardenedAirdrop.sol`) are deployed with the Merkle Root stored immutably.
3. **On-Chain (Claim Verification & Settlement)**: Users and attackers submit transactions calling `claim(recipient, amount, proof)` directly to the smart contracts. Token balances and claim statuses are recorded on-chain.

---

## 2. Technologies Used & How They Are Used

| Technology | Category | Role in SafeDrop |
|---|---|---|
| **Solidity (`^0.8.20`)** | Smart Contract Language | Implements `SafeDropToken` (ERC-20), `NaiveAirdrop` (vulnerable verifier), and `HardenedAirdrop` (mitigated verifier). |
| **Keccak-256** | Cryptographic Hash | Standard Ethereum hashing algorithm used in all on-chain leaf and intermediate node calculations. |
| **EVM State Machine (Python)** | Blockchain Node / Runtime | Simulates block mining, accounts, nonces, gas metering, state trees, and transaction receipts on Chain ID `31337`. |
| **Web3 Client (Vanilla JS)** | Frontend Web3 Provider | Manages wallet connections, account switching, balance queries, and dispatches on-chain transactions from the UI. |
| **Hardhat & Ethers.js** | Dev Framework | Full Node.js testing, compilation, and deployment pipeline for local nodes or public testnets (Sepolia/Anvil). |
| **Flask (`3.0.0`)** | API Backend | Serves the SPA frontend and routes Web3 JSON-RPC/REST blockchain requests. |
| **SQLite** | Local Indexer | Acts as an off-chain fast indexer and cache for campaign metadata, analogous to The Graph protocol. |

---

## 3. Which Parts of the Application Are Connected to the Blockchain?

### A. Top Navigation Bar (Web3 Wallet & Network Badge)
- **Status Indicator**: Displays real-time block height from the EVM node (`EVM Block #X`).
- **`🦊 Connect Wallet` Button**: 
  - Allows switching between pre-funded EVM accounts (`0xf39F...` Admin, `0x1A2B...` Claimant, `0x7099...` Attacker).
  - Displays real-time **ETH balance** (for gas) and **SFT token balance** (ERC-20).

### B. Claim Portal (`/claim`)
- **Direct Smart Contract Call**: Clicking **"Claim Tokens Now"** invokes `claim(recipient, amount, proof)` on the smart contract.
- **On-Chain Settlement Display**:
  - Displays the live **Transaction Hash** (`0x...`).
  - Confirms the **Block Number** where the transaction was mined.
  - Displays **Gas Used** (e.g., 78,420 gas).
  - Automatically transfers ERC-20 `SFT` tokens from the contract to the claimant's wallet.
- **Double-Spend Protection**: If claimed a second time, the smart contract throws an EVM revert: `Already claimed`.

### C. Attack Lab (`/attack`)
- **Vulnerability Reproduction on Naive Contract**:
  - Attacker selects an intermediate tree node and submits child hashes as a forged leaf.
  - The naive contract accepts the proof, marks the transaction status as **`1 (SUCCESS)`**, and transfers real ERC-20 tokens to the attacker.
- **Defense Verification on Hardened Contract**:
  - The same forged proof is submitted to the hardened contract.
  - The contract detects a proof-length mismatch and reverts: **`EVM Revert: Invalid proof length: does not match tree depth`** (`Status 0 (REVERTED)`).

---

## 4. Complete File Inventory

Here are all files powering the blockchain layer in `c:\Users\Dhruv\Downloads\SafeDrop\SafeDrop`:

```
SafeDrop/
├── contracts/
│   ├── IERC20.sol              # Standard ERC-20 interface
│   ├── SafeDropToken.sol        # ERC-20 Token implementation (SFT)
│   ├── NaiveAirdrop.sol         # Vulnerable on-chain Merkle airdrop contract
│   └── HardenedAirdrop.sol      # Secure on-chain Merkle airdrop contract
│
├── app/
│   ├── blockchain/
│   │   ├── __init__.py          # Blockchain package initialization
│   │   ├── crypto.py            # Pure Python Keccak-256 implementation
│   │   └── chain.py             # In-memory EVM state machine, accounts, tx pool
│   └── routes/
│       └── blockchain.py        # REST/Web3 endpoints (/api/blockchain/*)
│
├── static/
│   └── js/
│       ├── blockchain.js        # Frontend Web3 wallet & contract interface
│       ├── claim.js             # On-chain claim submission logic
│       └── attack.js            # On-chain exploit simulation logic
│
├── test_blockchain.py           # Standalone automated Python test suite
├── package.json                 # Hardhat project definition
├── hardhat.config.js            # Hardhat EVM network configuration
├── scripts/
│   └── deploy.js                # Hardhat on-chain deployment script
└── test/
    └── Airdrop.test.js          # Hardhat Mocha/Chai contract test suite
```

---

## 5. How the Smart Contracts Work

### 1. `NaiveAirdrop.sol` (The Vulnerable Contract)

```solidity
function claim(address recipient, uint256 amount, bytes32[] calldata proof) external returns (bool) {
    require(!hasClaimed[recipient], "Already claimed");

    // VULNERABILITY: Leaf hashing has NO domain separation tag
    bytes32 computedHash = keccak256(abi.encodePacked(recipient, amount));

    // VULNERABILITY: No proof length check against tree depth!
    for (uint256 i = 0; i < proof.length; i++) {
        bytes32 proofElement = proof[i];
        if (computedHash <= proofElement) {
            computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
        } else {
            computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
        }
    }

    require(computedHash == merkleRoot, "Invalid Merkle proof");
    hasClaimed[recipient] = true;
    require(token.transfer(recipient, amount), "Token transfer failed");
    return true;
}
```

### 2. `HardenedAirdrop.sol` (The Secure Contract)

```solidity
function claim(address recipient, uint256 amount, bytes32[] calldata proof) external returns (bool) {
    require(!hasClaimed[recipient], "Already claimed");

    // DEFENSE 1: Strict proof-length validation
    require(proof.length == treeDepth, "Invalid proof length: does not match tree depth");

    // DEFENSE 2: Domain separation for leaves
    bytes32 computedHash = keccak256(
        bytes.concat("LEAF:", abi.encodePacked(recipient, amount))
    );

    // DEFENSE 3: Domain separation for internal nodes
    for (uint256 i = 0; i < proof.length; i++) {
        bytes32 proofElement = proof[i];
        if (computedHash <= proofElement) {
            computedHash = keccak256(bytes.concat("NODE:", abi.encodePacked(computedHash, proofElement)));
        } else {
            computedHash = keccak256(bytes.concat("NODE:", abi.encodePacked(proofElement, computedHash)));
        }
    }

    require(computedHash == merkleRoot, "Invalid Merkle proof");
    hasClaimed[recipient] = true;
    require(token.transfer(recipient, amount), "Token transfer failed");
    return true;
}
```

---

## 6. How to Run and Test

### A. Start the Complete Application

Run this single command from your terminal:

```powershell
cd c:\Users\Dhruv\Downloads\SafeDrop\SafeDrop ; python run.py
```

Then open your browser at: **[http://localhost:5000](http://localhost:5000)**

---

### B. Run the Automated Blockchain Test Suite

In a second terminal, execute the test script:

```powershell
python test_blockchain.py
```

#### Expected Output:
```text
======================================================================
  SAFEDROP SMART CONTRACTS & BLOCKCHAIN VERIFICATION SUITE
======================================================================

[TEST 1] SafeDropToken (ERC-20) Deployment & Initial Balances:
  ✓ ERC-20 Token: SafeDrop Token (SFT)
  ✓ Contract Token Balance: 50,000 SFT funded per Airdrop Contract

[TEST 2] Legitimate Claim on NaiveAirdrop Contract:
  ✓ Tx Hash: 0x6e2a8f9c1d...
  ✓ Block #2 | Gas Used: 78420
  ✓ Token Transfer: 100 SFT transferred to 0x1A2B3C4D...

[TEST 3] Double-Claim Prevention (EVM Revert):
  ✓ EVM Revert Caught: "EVM Revert: Already claimed"
  ✓ Double spend prevented on-chain

[TEST 4] Legitimate Claim on HardenedAirdrop Contract:
  ✓ Tx Hash: 0x4f1b3e8a2c...
  ✓ Verified depth = 2 & LEAF: domain prefix
  ✓ Transferred 250 SFT to 0x3C4D5E6F...

[TEST 5] Secondary Preimage Exploit on NaiveAirdrop Contract:
  ⚠ VULNERABILITY CONFIRMED: Naive contract accepted intermediate node as leaf!
  ⚠ Naive Tx Hash: 0x9a3c1e... (Status: 1 SUCCESS)
  ⚠ Tokens Stolen on-chain: 500 SFT

[TEST 6] Defense Verification on HardenedAirdrop Contract:
  🛡 DEFENSE CONFIRMED: Hardened contract reverted forged transaction!
  🛡 Hardened Tx Status: 0 REVERTED
  🛡 Revert Reason: "EVM Revert: Invalid proof length: does not match tree depth (1 != 2)"

======================================================================
  TEST RESULTS: 6/6 TESTS PASSED (100% SUCCESS)
======================================================================
```

---

### C. Manual Browser Testing Guide

1. **Connect Wallet**: Click `🦊 Connect Wallet` in the navbar and select `Claimant 1` or `Admin`.
2. **Claim Tokens**:
   - Navigate to the **Claim** tab.
   - Click `Addr 1` and click **Check Eligibility**.
   - Click **Claim 100 Tokens Now**.
   - Observe the green success card with the **EVM Block Number**, **Tx Hash**, and updated **SFT Balance** in your navbar.
3. **Simulate Attack**:
   - Navigate to the **Attack Lab** tab.
   - Click `⚔ Naive Exploit` preset and click `⚔ Launch Exploit Simulation`.
   - Observe the result card showing:
     - `Naive Contract: Status 1 (SUCCESS)` (Tokens stolen on-chain).
     - `Hardened Contract: Status 0 (REVERTED)` (Blocked on-chain by proof length check).
