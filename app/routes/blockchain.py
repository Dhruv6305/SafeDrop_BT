"""Blockchain Blueprint — Web3 / On-Chain interaction endpoints."""
from flask import Blueprint, jsonify, request
from ..blockchain import chain_state

blockchain_bp = Blueprint('blockchain', __name__)


@blockchain_bp.route('/blockchain/status', methods=['GET'])
def get_status():
    """Returns network status, block height, contracts, and accounts."""
    return jsonify(chain_state.get_status())


@blockchain_bp.route('/blockchain/accounts', methods=['GET'])
def get_accounts():
    """Returns all accounts and their ETH / SFT balances."""
    return jsonify(chain_state.accounts)


@blockchain_bp.route('/blockchain/transactions', methods=['GET'])
def get_transactions():
    """Returns transaction history."""
    return jsonify([t.to_dict() for t in chain_state.transactions])


@blockchain_bp.route('/blockchain/claim', methods=['POST'])
def onchain_claim():
    """Executes a claim transaction on the on-chain smart contract."""
    data = request.get_json(force=True)
    mode = data.get('mode', 'hardened')
    recipient = data.get('recipient', '')
    amount = int(data.get('amount', 0))
    proof = data.get('proof', [])
    sender = data.get('sender', recipient)

    if not recipient or amount <= 0:
        return jsonify({'error': 'Invalid recipient or amount'}), 400

    result = chain_state.execute_claim(mode, recipient, amount, proof, sender)
    return jsonify(result)


@blockchain_bp.route('/blockchain/attack', methods=['POST'])
def onchain_attack():
    """Simulates on-chain execution of secondary preimage exploit against both contracts."""
    data = request.get_json(force=True)
    target_level = int(data.get('level', 1))
    target_index = int(data.get('index', 0))
    forged_address = data.get('forged_address', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    forged_amount = int(data.get('forged_amount', 500))
    forged_proof = data.get('forged_proof', [])

    result = chain_state.execute_attack(target_level, target_index, forged_address, forged_amount, forged_proof)
    return jsonify(result)
