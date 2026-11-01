"""Admin blueprint — campaign creation and management."""
import csv
import io
import json
from flask import Blueprint, request, jsonify, current_app

from ..db import get_db
from ..models import (
    create_campaign, get_campaign, list_campaigns,
    insert_recipients, get_recipients, get_campaign_stats
)
from ..merkle import naive as naive_engine
from ..merkle import hardened as hardened_engine

admin_bp = Blueprint('admin', __name__)


def _get_engine(mode: str):
    return hardened_engine if mode == 'hardened' else naive_engine


def _parse_recipients(text: str) -> list[dict]:
    """Parse CSV text: each line is 'address,amount'."""
    recipients = []
    reader = csv.reader(io.StringIO(text.strip()))
    for i, row in enumerate(reader):
        if not row or row[0].startswith('#'):
            continue
        if len(row) < 2:
            raise ValueError(f"Line {i+1}: expected 'address,amount', got: {','.join(row)}")
        address = row[0].strip()
        try:
            amount = int(row[1].strip())
        except ValueError:
            raise ValueError(f"Line {i+1}: amount must be integer, got '{row[1].strip()}'")
        if amount <= 0:
            raise ValueError(f"Line {i+1}: amount must be positive")
        recipients.append({'address': address, 'amount': amount})
    return recipients


@admin_bp.route('/campaigns', methods=['POST'])
def create():
    """Create a new campaign.
    Accepts JSON or multipart form with optional CSV file upload.
    """
    mode = None
    name = None
    csv_text = None

    if request.content_type and 'multipart/form-data' in request.content_type:
        name = request.form.get('name', '').strip()
        mode = request.form.get('mode', '').strip()
        file = request.files.get('file')
        if file:
            csv_text = file.read().decode('utf-8')
        else:
            csv_text = request.form.get('csv_text', '').strip()
    else:
        data = request.get_json(force=True)
        name = data.get('name', '').strip()
        mode = data.get('mode', '').strip()
        csv_text = data.get('csv_text', '').strip()

    if not name:
        return jsonify({'error': 'Campaign name is required'}), 400
    if mode not in ('naive', 'hardened'):
        return jsonify({'error': "Mode must be 'naive' or 'hardened'"}), 400
    if not csv_text:
        return jsonify({'error': 'Recipient list (CSV) is required'}), 400

    try:
        recipients = _parse_recipients(csv_text)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if len(recipients) < 2:
        return jsonify({'error': 'At least 2 recipients required to build a Merkle tree'}), 400
    if len(recipients) > 256:
        return jsonify({'error': 'Max 256 recipients for this educational prototype'}), 400

    engine = _get_engine(mode)
    try:
        levels, root, depth = engine.build_tree(recipients)
    except Exception as e:
        return jsonify({'error': f'Tree build failed: {str(e)}'}), 500

    campaign_id = create_campaign(current_app._get_current_object(), name, mode, root, depth)
    recipients_indexed = [{'idx': i, **r} for i, r in enumerate(recipients)]
    insert_recipients(current_app._get_current_object(), campaign_id, recipients_indexed)

    return jsonify({
        'id': campaign_id,
        'name': name,
        'mode': mode,
        'root': root,
        'depth': depth,
        'total_recipients': len(recipients),
        'message': f'Campaign "{name}" created successfully',
    }), 201


@admin_bp.route('/campaigns', methods=['GET'])
def list_all():
    app = current_app._get_current_object()
    campaigns = list_campaigns(app)
    result = []
    for c in campaigns:
        stats = get_campaign_stats(app, c['id'])
        result.append({**c, **stats})
    return jsonify(result)


@admin_bp.route('/campaigns/<int:campaign_id>', methods=['GET'])
def get_one(campaign_id):
    app = current_app._get_current_object()
    campaign = get_campaign(app, campaign_id)
    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    recipients = get_recipients(app, campaign_id)
    stats = get_campaign_stats(app, campaign_id)

    # Rebuild tree to get full structure for visualization
    engine = _get_engine(campaign['mode'])
    recip_list = [{'address': r['address'], 'amount': r['amount']} for r in recipients]
    levels, root, depth = engine.build_tree(recip_list)

    # Serialize levels for frontend (exclude padding leaves from display)
    serialized_levels = []
    for level in levels:
        serialized_levels.append([{
            'hash': n['hash'],
            'level': n['level'],
            'index': n['index'],
            'is_leaf': n['is_leaf'],
            'is_padding': n.get('is_padding', False),
            'address': n.get('address'),
            'amount': n.get('amount'),
            'left_child_hash': n.get('left_child_hash'),
            'right_child_hash': n.get('right_child_hash'),
        } for n in level])

    return jsonify({
        **campaign,
        **stats,
        'recipients': [{'idx': r['idx'], 'address': r['address'], 'amount': r['amount']} for r in recipients],
        'tree': {
            'depth': depth,
            'root': root,
            'levels': serialized_levels,  # index 0 = leaves, index -1 = root
        }
    })
