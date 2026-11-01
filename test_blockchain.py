"""SafeDrop Blockchain & Smart Contract Automated Test Suite.
Run directly with: python test_blockchain.py
"""

import sys
from app.blockchain.chain import BlockchainState
from app.merkle import naive as naive_engine
from app.merkle import hardened as hardened_engine

SEED_RECIPIENTS = [
    {'address': '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B', 'amount': 100},
    {'address': '0x3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D', 'amount': 250},
    {'address': '0x5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F', 'amount': 500},
    {'address': '0x7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B', 'amount': 75},
]


def run_tests():
    print("=" * 70)
    print("  SAFEDROP SMART CONTRACTS & BLOCKCHAIN VERIFICATION SUITE")
    print("=" * 70)

    chain = BlockchainState()
    passed = 0
    total = 0

    # 1. Build Merkle Trees
    naive_levels, naive_root, naive_depth = naive_engine.build_tree(SEED_RECIPIENTS)
    hardened_levels, hardened_root, hardened_depth = hardened_engine.build_tree(SEED_RECIPIENTS)
    chain.update_campaign_roots(naive_root, hardened_root, hardened_depth)

    # TEST 1: Token Initialization
    total += 1
    print("\n[TEST 1] SafeDropToken (ERC-20) Deployment & Initial Balances:")
    try:
        assert chain.token_total_supply == 1000000.0
        assert chain.token_symbol == "SFT"
        assert chain.contract_token_balances[chain.naive_airdrop_address] == 50000.0
        assert chain.contract_token_balances[chain.hardened_airdrop_address] == 50000.0
        print(f"  ✓ ERC-20 Token: {chain.token_name} ({chain.token_symbol})")
        print(f"  ✓ Contract Token Balance: 50,000 SFT funded per Airdrop Contract")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    # TEST 2: Legitimate Claim on Naive Contract
    total += 1
    print("\n[TEST 2] Legitimate Claim on NaiveAirdrop Contract:")
    try:
        claimant = SEED_RECIPIENTS[0]['address']
        amount = SEED_RECIPIENTS[0]['amount']
        proof = naive_engine.get_proof(0, naive_levels)

        res = chain.execute_claim('naive', claimant, amount, proof)
        assert res['success'] is True
        assert res['tx']['status'] == 1
        assert chain.accounts[claimant]['sft'] == 100.0
        print(f"  ✓ Tx Hash: {res['tx']['tx_hash'][:18]}...")
        print(f"  ✓ Block #{res['tx']['block_number']} | Gas Used: {res['tx']['gas_used']}")
        print(f"  ✓ Token Transfer: 100 SFT transferred to {claimant[:10]}...")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    # TEST 3: Double-Claim Prevention on Naive Contract
    total += 1
    print("\n[TEST 3] Double-Claim Prevention (EVM Revert):")
    try:
        res = chain.execute_claim('naive', claimant, amount, proof)
        assert res['success'] is False
        assert res['tx']['status'] == 0
        assert "Already claimed" in res['error']
        print(f"  ✓ EVM Revert Caught: \"{res['error']}\"")
        print(f"  ✓ Double spend prevented on-chain")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    # TEST 4: Legitimate Claim on Hardened Contract
    total += 1
    print("\n[TEST 4] Legitimate Claim on HardenedAirdrop Contract:")
    try:
        claimant2 = SEED_RECIPIENTS[1]['address']
        amount2 = SEED_RECIPIENTS[1]['amount']
        proof2 = hardened_engine.get_proof(1, hardened_levels)

        res = chain.execute_claim('hardened', claimant2, amount2, proof2)
        assert res['success'] is True
        assert res['tx']['status'] == 1
        assert chain.accounts[claimant2]['sft'] == 250.0
        print(f"  ✓ Tx Hash: {res['tx']['tx_hash'][:18]}...")
        print(f"  ✓ Verified depth = {hardened_depth} & LEAF: domain prefix")
        print(f"  ✓ Transferred {amount2} SFT to {claimant2[:10]}...")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    # TEST 5: Secondary Preimage Attack on Naive Contract
    total += 1
    print("\n[TEST 5] Secondary Preimage Exploit on NaiveAirdrop Contract:")
    try:
        # Forge an entry from internal node at level 1
        node = naive_levels[1][0]
        forged_addr = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
        forged_amount = 500
        forged_proof = [{'position': 'right', 'hash': naive_levels[1][1]['hash']}]

        res = chain.execute_attack(1, 0, forged_addr, forged_amount, forged_proof)
        assert res['naive_tx']['status'] == 1
        print(f"  ⚠ VULNERABILITY CONFIRMED: Naive contract accepted intermediate node as leaf!")
        print(f"  ⚠ Naive Tx Hash: {res['naive_tx']['tx_hash'][:18]}... (Status: 1 SUCCESS)")
        print(f"  ⚠ Tokens Stolen on-chain: {forged_amount} SFT")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    # TEST 6: Secondary Preimage Attack on Hardened Contract
    total += 1
    print("\n[TEST 6] Defense Verification on HardenedAirdrop Contract:")
    try:
        assert res['hardened_tx']['status'] == 0
        assert "Invalid proof length" in res['hardened_tx']['error']
        print(f"  🛡 DEFENSE CONFIRMED: Hardened contract reverted forged transaction!")
        print(f"  🛡 Hardened Tx Status: 0 REVERTED")
        print(f"  🛡 Revert Reason: \"{res['hardened_tx']['error']}\"")
        passed += 1
    except Exception as e:
        print(f"  ✕ FAILED: {e}")

    pct = int((passed / total) * 100) if total else 0
    print("\n" + "=" * 70)
    print(f"  TEST RESULTS: {passed}/{total} TESTS PASSED ({pct}% SUCCESS)")
    print("=" * 70)
    sys.exit(0 if passed == total else 1)


if __name__ == '__main__':
    run_tests()
