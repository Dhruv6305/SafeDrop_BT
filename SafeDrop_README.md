# SafeDrop: Secure Airdrop Distribution and Vulnerability Testing System

A minor project demonstrating, end-to-end, how Merkle proof-based airdrops
can be exploited by a secondary preimage attack, and how two low-cost
mitigations close the gap.

**Based on:** Songsom, N., Suaboot, J., & Werapun, W. (2025). *FSA: A
Framework for Analyzing Secondary Preimage Attacks on Merkle Proof-Based
Airdrops.* Blockchain: Research and Applications.
https://doi.org/10.1016/j.bcra.2025.100368

---

## 1. Background: why airdrops use Merkle proofs

An airdrop gives free tokens to a list of eligible addresses — early users,
testers, or holders of a related token. Projects use this to bootstrap a
user base, spread ownership, and generate attention without any upfront
cost, since new tokens are simply recorded into existence rather than
manufactured.

Naively, verifying eligibility means either:
- storing the entire recipient list on-chain, which is expensive, since
  blockchain storage costs scale with every byte written, or
- trusting one central server to check a private database, which defeats
  the purpose of a decentralized system.

**Merkle proofs solve this cheaply.** Instead of storing the full list, the
project stores a single hash — the **Merkle root** — that represents the
entire list. A recipient claims by submitting a short **proof**: a handful
of sibling hashes that let the system recompute the root from the
recipient's own entry. If the recomputed root matches the stored root, the
claim is valid. For a list of 5,000 recipients, a proof is only about 13
hashes long, regardless of list size.

## 2. The vulnerability

A Merkle tree has two kinds of hashes:
- **Leaves** — hashes of real recipient entries (address + amount)
- **Internal nodes** — hashes formed by combining two child hashes; these
  don't represent any real person

If a system hashes leaves and internal nodes through the *same* function,
with no marker distinguishing the two, an attacker can take an internal
node's two children, present them as if they were their own "entry," and
the resulting hash will exactly equal that internal node — because that's
literally how the internal node was computed in the first place. No
cryptography is actually broken; the ambiguity is a design flaw, not a
weakness in the hash function.

This is called a **secondary preimage attack**, and it's the exact
vulnerability the FSA paper analyzes.

## 3. SafeDrop's two modes

| | Naive mode | Hardened mode |
|---|---|---|
| Leaf hash | `SHA256(data)` | `SHA256("LEAF:" + data)` |
| Node hash | `SHA256(left + right)` | `SHA256("NODE:" + left + right)` |
| Proof length check | None | Must equal tree depth |
| Forged claim result | **Accepted** | **Rejected** |

The hardened mode applies two mitigations described in the paper:
1. **Domain separation (leaf prefixing)** — leaves and nodes can never
   collide, since they're hashed in different "namespaces."
2. **Proof-length validation** — a forged proof starting partway up the
   tree is always shorter than a genuine leaf-level proof, so an
   unexpected length is rejected outright.

## 4. System actors

- **Admin** — creates a campaign, uploads the recipient list, chooses naive
  or hardened mode, and publishes the resulting root.
- **Claimant** — a normal recipient who checks eligibility and claims
  tokens using their proof.
- **Attacker (simulated)** — a role triggered from the Attack Lab, not a
  real external threat. It builds a forged claim from an internal node and
  submits it through the same public claim process a real user would use.

## 5. Architecture

```
Actors (Admin / Claimant / Attacker)
            │
     Web frontend (HTML/JS, or React for the advanced build)
            │
     Flask REST API
            │
   ┌────────┴────────┐
Naive engine     Hardened engine
   └────────┬────────┘
            │
     SQLite database
```

Only one engine is active per campaign, chosen at creation time. Both
engines share the same claim flow and the same attack-lab flow — only the
hashing and validation rules differ.

## 6. Database schema

| Table | Columns |
|---|---|
| `campaigns` | id, name, mode, root, depth, created_at |
| `recipients` | id, campaign_id, idx, address, amount |
| `claims` | id, campaign_id, address, amount, status, reason, timestamp |
| `attack_attempts` | id, campaign_id, result, genuine_proof_length, forged_proof_length, timestamp |

## 7. Claim workflow

1. Admin uploads the recipient list → system builds the Merkle tree →
   root is published.
2. Claimant requests their proof for their address.
3. Claimant submits address + proof to the claim endpoint.
4. System recomputes the root from the address and proof, and compares it
   to the stored root.
5. Match → claim accepted, recorded, tokens marked distributed.
   No match → claim rejected.
6. A duplicate-claim check blocks the same address from claiming twice,
   in both modes — this is a standard airdrop safeguard, separate from the
   Merkle-specific vulnerability.

## 8. Attack lab workflow

1. Attacker selects an internal node from the (public) tree — not a real
   recipient entry.
2. Attacker constructs a forged "leaf" from that node's two children, and
   a proof consisting only of the remaining siblings from that node's
   level up to the root (shorter than a genuine leaf-level proof).
3. The forged claim is submitted through the same public claim process.
4. **Naive mode:** the forged hash matches the internal node exactly →
   accepted → tokens released to a non-recipient.
5. **Hardened mode:** the domain tag mismatch and/or the proof-length
   check fails → rejected.
6. The attempt and its result are logged in `attack_attempts`.

## 9. Tech stack (base version)

| Component | Tool |
|---|---|
| Backend | Python, Flask |
| Database | SQLite |
| Frontend | HTML, CSS, JavaScript (Jinja2 templates) |
| Hashing | Python `hashlib` (SHA-256) |

## 10. Comparison with the base paper

| Parameter | FSA Paper (Songsom et al., 2025) | SafeDrop (this system) |
|---|---|---|
| Focus | Theoretical / damage analysis | Working end-to-end demonstration |
| Attack demonstrated | Proof-of-concept experiments | Interactive, runnable attack lab |
| Mitigations covered | Leaf prefixing, proof-length validation, non-64-byte leaves | Leaf prefixing + proof-length validation implemented |
| Deployment | Research analysis | Simulated local system (SQLite) |
| Scope | Research framework | Lightweight educational prototype |

## 11. Blockchain & Smart Contracts Implementation

SafeDrop now includes full on-chain EVM smart contracts and testing suites:

| Contract | File | Description |
|---|---|---|
| `IERC20.sol` | `contracts/IERC20.sol` | Standard ERC-20 token interface |
| `SafeDropToken.sol` | `contracts/SafeDropToken.sol` | Complete ERC-20 token with minting and transfers (symbol: `SFT`) |
| `NaiveAirdrop.sol` | `contracts/NaiveAirdrop.sol` | **Vulnerable** on-chain contract demonstrating secondary preimage vulnerability |
| `HardenedAirdrop.sol` | `contracts/HardenedAirdrop.sol` | **Hardened** on-chain contract with domain separation (`LEAF:` / `NODE:`) and strict depth validation |

### Running the Blockchain Automated Test Suite:
Run the standalone test suite directly from your project terminal:
```bash
python test_blockchain.py
```
This tests:
1. SafeDropToken ERC-20 deployment & supply verification
2. Legitimate claim on Naive contract (transfers tokens on-chain)
3. Double-claim prevention (EVM revert: `"Already claimed"`)
4. Legitimate claim on Hardened contract (verifies depth & domain separation)
5. Secondary Preimage Exploit on Naive contract (confirms vulnerability on-chain: tokens stolen)
6. Secondary Preimage Exploit on Hardened contract (confirms defense: EVM revert `"Invalid proof length"`)

### Hardhat Setup (Optional for Node / Hardhat users):
The project includes a complete Hardhat configuration:
```bash
npm install
npx hardhat test
npx hardhat run scripts/deploy.js
```

## 13. References

1. Songsom, N., Suaboot, J., & Werapun, W. (2025). FSA: A Framework for
   Analyzing Secondary Preimage Attacks on Merkle Proof-Based Airdrops.
   *Blockchain: Research and Applications*.
   https://doi.org/10.1016/j.bcra.2025.100368
2. Kelsey, J., & Schneier, B. (2005). Second Preimages on n-bit Hash
   Functions for Much Less than 2ⁿ Work. *EUROCRYPT 2005*, LNCS 3494,
   474–490. https://doi.org/10.1007/11426639_28
3. Merkle, R. C. (1980). Protocols for Public Key Cryptosystems.
   *IEEE Symposium on Security and Privacy*, 122–134.
   https://doi.org/10.1109/SP.1980.10006
4. Kelsey, J., & Kohno, T. (2006). Herding Hash Functions and the
   Nostradamus Attack. *EUROCRYPT 2006*, LNCS 4004, 183–200.
5. Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System.
   *bitcoin.org whitepaper*. (General reference for Merkle tree usage in
   real-world blockchain transaction verification.)
