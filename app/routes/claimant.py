"""Claimant blueprint — proof generation and claim submission."""
from flask import Blueprint, request, jsonify, current_app

from ..models import (
    get_campaign, get_recipients, get_recipient_by_address,
    has_claimed, record_claim, get_claims
)
from ..merkle import naive as naive_engine
from ..merkle import hardened as hardened_engine

claimant_bp = Blueprint('claimant', __name__)


def _get_engine(mode: str):
    return hardened_engine if mode == 'hardened' else naive_engine


@claimant_bp.route('/campaigns/<int:campaign_id>/proof/<path:address>', methods=['GET'])
def get_proof(campaign_id, address):
    """Return the Merkle proof for an address in a campaign."""
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    recipient = get_recipient_by_address(app, campaign_id, address)
    if not recipient:
        return jsonify({'error': f'Address {address} not found in this campaign'}), 404

    # Rebuild tree
    recipients = get_recipients(app, campaign_id)
    recip_list = [{'address': r['address'], 'amount': r['amount']} for r in recipients]
    engine = _get_engine(campaign['mode'])
    levels, root, depth = engine.build_tree(recip_list)

    proof = engine.get_proof(recipient['idx'], levels)
    already_claimed = has_claimed(app, campaign_id, address)

    return jsonify({
        'address': recipient['address'],
        'amount': recipient['amount'],
        'idx': recipient['idx'],
        'proof': proof,
        'proof_length': len(proof),
        'tree_depth': depth,
        'root': root,
        'already_claimed': already_claimed,
        'campaign_mode': campaign['mode'],
    })


@claimant_bp.route('/campaigns/<int:campaign_id>/claim', methods=['POST'])
def submit_claim(campaign_id):
    """Submit a claim with address and proof."""
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    data = request.get_json(force=True)
    address = data.get('address', '').strip()
    amount = data.get('amount')
    proof = data.get('proof', [])

    if not address:
        return jsonify({'error': 'address is required'}), 400
    if amount is None:
        return jsonify({'error': 'amount is required'}), 400

    try:
        amount = int(amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'amount must be an integer'}), 400

    # Duplicate claim check
    if has_claimed(app, campaign_id, address):
        return jsonify({
            'status': 'rejected',
            'reason': 'This address has already claimed tokens from this campaign.',
            'address': address,
            'amount': amount,
        }), 200

    # Rebuild tree for verification
    recipients = get_recipients(app, campaign_id)
    recip_list = [{'address': r['address'], 'amount': r['amount']} for r in recipients]
    engine = _get_engine(campaign['mode'])
    levels, root, depth = engine.build_tree(recip_list)

    valid, reason = engine.verify_proof(address, amount, proof, root, depth)
    status = 'accepted' if valid else 'rejected'
    record_claim(app, campaign_id, address, amount, status, None if valid else reason)

    return jsonify({
        'status': status,
        'reason': reason if not valid else 'Proof verified successfully',
        'address': address,
        'amount': amount,
        'campaign_mode': campaign['mode'],
    })


@claimant_bp.route('/campaigns/<int:campaign_id>/claims', methods=['GET'])
def list_claims(campaign_id):
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404
    claims = get_claims(app, campaign_id)
    return jsonify(claims)
