"""Attack Lab blueprint — secondary preimage attack simulation."""
from flask import Blueprint, request, jsonify, current_app

from ..models import (
    get_campaign, get_recipients, get_attacks, record_attack
)
from ..merkle import naive as naive_engine
from ..merkle import hardened as hardened_engine

attack_bp = Blueprint('attack', __name__)


def _build_tree_both(recip_list):
    """Build both naive and hardened trees for a split-view simulation."""
    naive_levels, naive_root, naive_depth = naive_engine.build_tree(recip_list)
    hardened_levels, hardened_root, hardened_depth = hardened_engine.build_tree(recip_list)
    return (naive_levels, naive_root, naive_depth), (hardened_levels, hardened_root, hardened_depth)


@attack_bp.route('/campaigns/<int:campaign_id>/tree', methods=['GET'])
def get_tree(campaign_id):
    """Return the full Merkle tree structure for Attack Lab visualization."""
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    recipients = get_recipients(app, campaign_id)
    recip_list = [{'address': r['address'], 'amount': r['amount']} for r in recipients]

    # Always return both tree structures for split-view
    (naive_levels, naive_root, naive_depth), (hardened_levels, hardened_root, hardened_depth) = \
        _build_tree_both(recip_list)

    def serialize_levels(levels):
        return [[{
            'hash': n['hash'],
            'level': n['level'],
            'index': n['index'],
            'is_leaf': n['is_leaf'],
            'is_padding': n.get('is_padding', False),
            'address': n.get('address'),
            'amount': n.get('amount'),
            'left_child_hash': n.get('left_child_hash'),
            'right_child_hash': n.get('right_child_hash'),
        } for n in level] for level in levels]

    return jsonify({
        'campaign_id': campaign_id,
        'campaign_name': campaign['name'],
        'campaign_mode': campaign['mode'],
        'naive': {
            'root': naive_root,
            'depth': naive_depth,
            'levels': serialize_levels(naive_levels),
        },
        'hardened': {
            'root': hardened_root,
            'depth': hardened_depth,
            'levels': serialize_levels(hardened_levels),
        }
    })


@attack_bp.route('/campaigns/<int:campaign_id>/attack', methods=['POST'])
def launch_attack(campaign_id):
    """
    Simulate a secondary preimage attack.

    Body: { node_level: int, node_index: int }
    Returns split-view results for both naive and hardened modes.
    """
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    data = request.get_json(force=True)
    node_level = data.get('node_level')
    node_index = data.get('node_index')

    if node_level is None or node_index is None:
        return jsonify({'error': 'node_level and node_index are required'}), 400

    try:
        node_level = int(node_level)
        node_index = int(node_index)
    except (ValueError, TypeError):
        return jsonify({'error': 'node_level and node_index must be integers'}), 400

    if node_level <= 0:
        return jsonify({'error': 'Must select an internal node (level > 0). Leaves cannot be attack targets.'}), 400

    recipients = get_recipients(app, campaign_id)
    recip_list = [{'address': r['address'], 'amount': r['amount']} for r in recipients]

    (naive_levels, naive_root, naive_depth), (hardened_levels, hardened_root, hardened_depth) = \
        _build_tree_both(recip_list)

    # Validate node exists in naive tree (both trees have same structure, different hashes)
    if node_level >= len(naive_levels):
        return jsonify({'error': f'node_level {node_level} out of range (max: {len(naive_levels) - 1})'}), 400
    if node_index >= len(naive_levels[node_level]):
        return jsonify({'error': f'node_index {node_index} out of range for level {node_level}'}), 400

    try:
        naive_result = naive_engine.simulate_attack(node_level, node_index, naive_levels, naive_root, naive_depth)
        hardened_result = hardened_engine.simulate_attack(node_level, node_index, hardened_levels, hardened_root, hardened_depth)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    # Log the attack attempt (use naive result as primary)
    record_attack(
        app, campaign_id,
        naive_result['result'],  # 'success' if naive is exploited
        naive_result['genuine_proof_length'],
        naive_result['forged_proof_length'],
        naive_result['forged_address'],
        str(naive_result['forged_amount'])
    )

    return jsonify({
        'node_level': node_level,
        'node_index': node_index,
        'genuine_proof_length': naive_result['genuine_proof_length'],
        'forged_proof_length': naive_result['forged_proof_length'],
        'forged_address': naive_result['forged_address'],
        'forged_amount': naive_result['forged_amount'],
        'naive': {
            'result': naive_result['result'],
            'steps': naive_result['steps'],
            'forged_proof': naive_result['forged_proof'],
            'root': naive_root,
        },
        'hardened': {
            'result': hardened_result['result'],
            'steps': hardened_result['steps'],
            'rejection_reasons': hardened_result.get('rejection_reasons', []),
            'forged_proof': hardened_result['forged_proof'],
            'root': hardened_root,
        }
    })


@attack_bp.route('/campaigns/<int:campaign_id>/attacks', methods=['GET'])
def list_attacks(campaign_id):
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404
    attacks = get_attacks(app, campaign_id)
    return jsonify(attacks)
