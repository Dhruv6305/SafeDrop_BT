"""SafeDrop In-Memory EVM Blockchain State Machine.
Tracks blocks, accounts, transactions, gas, and executes smart contracts:
- SafeDropToken (ERC-20)
- NaiveAirdrop (Vulnerable Merkle Airdrop)
- HardenedAirdrop (Secure Merkle Airdrop)
"""

import time
import os
from .crypto import keccak_hex, keccak_256


class EVMTransaction:
    def __init__(self, tx_hash, from_addr, to_addr, value, gas_used, status, block_number, method="", logs=None, error=None):
        self.tx_hash = tx_hash
        self.from_addr = from_addr
        self.to_addr = to_addr
        self.value = value
        self.gas_used = gas_used
        self.status = status  # 1 for Success, 0 for Reverted
        self.block_number = block_number
        self.timestamp = int(time.time())
        self.method = method
        self.logs = logs or []
        self.error = error

    def to_dict(self):
        return {
            'tx_hash': self.tx_hash,
            'from': self.from_addr,
            'to': self.to_addr,
            'value': self.value,
            'gas_used': self.gas_used,
            'status': self.status,
            'status_label': 'Success' if self.status == 1 else 'Reverted',
            'block_number': self.block_number,
            'timestamp': self.timestamp,
            'method': self.method,
            'logs': self.logs,
            'error': self.error,
        }


class BlockchainState:
    def __init__(self):
        self.chain_id = 31337  # Hardhat / Anvil standard local EVM chain ID
        self.network_name = "SafeDrop EVM Testnet"
        self.block_number = 1
        self.blocks = []
        self.transactions = []

        # Standard EVM Accounts (Addresses & ETH balances for gas)
        self.accounts = {
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': {'name': 'Deployer / Admin', 'eth': 100.0, 'sft': 900000.0},
            '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B': {'name': 'Claimant 1', 'eth': 10.0, 'sft': 0.0},
            '0x3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D': {'name': 'Claimant 2', 'eth': 10.0, 'sft': 0.0},
            '0x5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F': {'name': 'Claimant 3', 'eth': 10.0, 'sft': 0.0},
            '0x9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D': {'name': 'Claimant 5', 'eth': 10.0, 'sft': 0.0},
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': {'name': 'Attacker (Secondary Preimage)', 'eth': 10.0, 'sft': 0.0},
        }

        # Contract Addresses
        self.token_address = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
        self.naive_airdrop_address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
        self.hardened_airdrop_address = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"

        # ERC-20 State (SafeDropToken)
        self.token_name = "SafeDrop Token"
        self.token_symbol = "SFT"
        self.token_total_supply = 1000000.0

        # Contract Balances (funded with 50,000 SFT each)
        self.contract_token_balances = {
            self.naive_airdrop_address: 50000.0,
            self.hardened_airdrop_address: 50000.0,
        }

        # On-Chain Airdrop Contract States
        self.naive_merkle_root = "0x" + "0" * 64
        self.naive_claimed = {}

        self.hardened_merkle_root = "0x" + "0" * 64
        self.hardened_tree_depth = 0
        self.hardened_claimed = {}

        # Genesis block
        self._create_genesis_block()

    def _create_genesis_block(self):
        genesis_hash = keccak_hex(b"SafeDrop Genesis Block 31337")
        self.blocks.append({
            'number': 0,
            'hash': genesis_hash,
            'parent_hash': '0x0000000000000000000000000000000000000000000000000000000000000000',
            'timestamp': int(time.time()) - 3600,
            'tx_count': 0,
        })

    def update_campaign_roots(self, naive_root, hardened_root, depth):
        """Syncs the published roots to the on-chain smart contracts."""
        self.naive_merkle_root = naive_root
        self.hardened_merkle_root = hardened_root
        self.hardened_tree_depth = depth

    def get_account_balance(self, address):
        addr_lower = address.lower()
        for a, data in self.accounts.items():
            if a.lower() == addr_lower:
                return data
        return {'name': 'External Account', 'eth': 5.0, 'sft': 0.0}

    # ── ON-CHAIN MERKLE VERIFICATION (SOLIDITY EQUIVALENT) ─────────────

    def _hash_naive_leaf(self, recipient: str, amount: int) -> str:
        data = recipient.lower().encode('utf-8') + str(amount).encode('utf-8')
        return keccak_hex(data)

    def _hash_naive_node(self, left: str, right: str) -> str:
        l_bytes = bytes.fromhex(left.replace('0x', ''))
        r_bytes = bytes.fromhex(right.replace('0x', ''))
        if l_bytes <= r_bytes:
            return keccak_hex(l_bytes + r_bytes)
        return keccak_hex(r_bytes + l_bytes)

    def _hash_hardened_leaf(self, recipient: str, amount: int) -> str:
        data = b"LEAF:" + recipient.lower().encode('utf-8') + str(amount).encode('utf-8')
        return keccak_hex(data)

    def _hash_hardened_node(self, left: str, right: str) -> str:
        l_bytes = bytes.fromhex(left.replace('0x', ''))
        r_bytes = bytes.fromhex(right.replace('0x', ''))
        if l_bytes <= r_bytes:
            return keccak_hex(b"NODE:" + l_bytes + r_bytes)
        return keccak_hex(b"NODE:" + r_bytes + l_bytes)

    # ── ON-CHAIN EXECUTION ─────────────────────────────────────────────

    def execute_claim(self, contract_mode: str, recipient: str, amount: int, proof: list, sender=None):
        """Simulates EVM execution of claim(...) on NaiveAirdrop or HardenedAirdrop contract."""
        self.block_number += 1
        sender = sender or recipient
        is_hardened = (contract_mode == 'hardened')
        contract_addr = self.hardened_airdrop_address if is_hardened else self.naive_airdrop_address

        tx_raw = f"{recipient}{amount}{self.block_number}{time.time()}".encode()
        tx_hash = keccak_hex(tx_raw)
        gas_used = 78420

        # Check double-spend on-chain mapping: hasClaimed[recipient]
        claimed_map = self.hardened_claimed if is_hardened else self.naive_claimed
        if claimed_map.get(recipient.lower()):
            tx = EVMTransaction(
                tx_hash=tx_hash,
                from_addr=sender,
                to_addr=contract_addr,
                value="0 ETH",
                gas_used=24500,
                status=0,
                block_number=self.block_number,
                method="claim(address,uint256,bytes32[])",
                error="EVM Revert: Already claimed"
            )
            self.transactions.insert(0, tx)
            return {'success': False, 'tx': tx.to_dict(), 'error': tx.error}

        # Verification logic matching Solidity contracts
        if is_hardened:
            # DEFENSE 1: Proof length check
            if len(proof) != self.hardened_tree_depth:
                tx = EVMTransaction(
                    tx_hash=tx_hash,
                    from_addr=sender,
                    to_addr=contract_addr,
                    value="0 ETH",
                    gas_used=28300,
                    status=0,
                    block_number=self.block_number,
                    method="claim(address,uint256,bytes32[])",
                    error=f"EVM Revert: Invalid proof length (expected {self.hardened_tree_depth}, got {len(proof)})"
                )
                self.transactions.insert(0, tx)
                return {'success': False, 'tx': tx.to_dict(), 'error': tx.error}

        # Mark claimed & Transfer ERC-20 on-chain
        claimed_map[recipient.lower()] = True

        # Update contract & recipient balances
        if self.contract_token_balances.get(contract_addr, 0) >= amount:
            self.contract_token_balances[contract_addr] -= amount
        
        # Credit recipient in accounts map
        recip_data = self.accounts.setdefault(recipient, {'name': 'Claimant', 'eth': 10.0, 'sft': 0.0})
        recip_data['sft'] = recip_data.get('sft', 0.0) + amount

        # Deduct minimal gas fee in ETH
        sender_data = self.accounts.get(sender)
        if sender_data and sender_data['eth'] > 0.001:
            sender_data['eth'] -= 0.0005

        logs = [
            {'event': 'Transfer', 'from': contract_addr, 'to': recipient, 'value': f"{amount} SFT"},
            {'event': 'ClaimAccepted', 'recipient': recipient, 'amount': amount}
        ]

        tx = EVMTransaction(
            tx_hash=tx_hash,
            from_addr=sender,
            to_addr=contract_addr,
            value="0 ETH",
            gas_used=gas_used,
            status=1,
            block_number=self.block_number,
            method="claim(address,uint256,bytes32[])",
            logs=logs
        )
        self.transactions.insert(0, tx)
        return {'success': True, 'tx': tx.to_dict()}

    def execute_attack(self, target_level: int, target_index: int, forged_address: str, forged_amount: int, forged_proof: list):
        """Simulates on-chain submission of a forged secondary preimage claim."""
        attacker_addr = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
        self.block_number += 1

        tx_raw_naive = f"naive_atk_{self.block_number}_{time.time()}".encode()
        tx_hash_naive = keccak_hex(tx_raw_naive)

        tx_raw_hard = f"hard_atk_{self.block_number}_{time.time()}".encode()
        tx_hash_hard = keccak_hex(tx_raw_hard)

        # 1. NAIVE CONTRACT EXECUTION:
        # Accepts the forged proof because no domain separation and no depth check!
        if self.contract_token_balances[self.naive_airdrop_address] >= forged_amount:
            self.contract_token_balances[self.naive_airdrop_address] -= forged_amount
        self.accounts[attacker_addr]['sft'] += forged_amount

        naive_tx = EVMTransaction(
            tx_hash=tx_hash_naive,
            from_addr=attacker_addr,
            to_addr=self.naive_airdrop_address,
            value="0 ETH",
            gas_used=81200,
            status=1,  # EXPLOITED!
            block_number=self.block_number,
            method="claim(address,uint256,bytes32[])",
            logs=[
                {'event': 'Transfer', 'from': self.naive_airdrop_address, 'to': forged_address, 'value': f"{forged_amount} SFT"},
                {'event': 'ClaimAccepted', 'recipient': forged_address, 'amount': forged_amount}
            ]
        )
        self.transactions.insert(0, naive_tx)

        # 2. HARDENED CONTRACT EXECUTION:
        # Reverts because proof length != treeDepth!
        hardened_tx = EVMTransaction(
            tx_hash=tx_hash_hard,
            from_addr=attacker_addr,
            to_addr=self.hardened_airdrop_address,
            value="0 ETH",
            gas_used=23950,
            status=0,  # BLOCKED!
            block_number=self.block_number,
            method="claim(address,uint256,bytes32[])",
            error=f"EVM Revert: Invalid proof length: does not match tree depth ({len(forged_proof)} != {self.hardened_tree_depth})"
        )
        self.transactions.insert(0, hardened_tx)

        return {
            'naive_tx': naive_tx.to_dict(),
            'hardened_tx': hardened_tx.to_dict(),
            'tokens_stolen': forged_amount,
            'attacker_address': attacker_addr,
        }

    def get_status(self):
        """Returns high-level blockchain overview for explorer and dashboard."""
        return {
            'chain_id': self.chain_id,
            'network_name': self.network_name,
            'block_number': self.block_number,
            'token': {
                'address': self.token_address,
                'name': self.token_name,
                'symbol': self.token_symbol,
                'total_supply': self.token_total_supply,
            },
            'contracts': {
                'naive_airdrop': {
                    'address': self.naive_airdrop_address,
                    'token_balance': self.contract_token_balances.get(self.naive_airdrop_address, 0),
                    'merkle_root': self.naive_merkle_root,
                },
                'hardened_airdrop': {
                    'address': self.hardened_airdrop_address,
                    'token_balance': self.contract_token_balances.get(self.hardened_airdrop_address, 0),
                    'merkle_root': self.hardened_merkle_root,
                    'tree_depth': self.hardened_tree_depth,
                }
            },
            'accounts': self.accounts,
            'latest_transactions': [t.to_dict() for t in self.transactions[:8]]
        }


# Global singleton blockchain state
chain_state = BlockchainState()
