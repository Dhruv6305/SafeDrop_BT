"""Auto-seed sample campaign data on first launch."""
from .db import get_db
from .merkle import naive as naive_engine
from .merkle import hardened as hardened_engine
from .models import create_campaign, insert_recipients, list_campaigns


SEED_RECIPIENTS = [
    {'address': '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B', 'amount': 100},
    {'address': '0x3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D', 'amount': 250},
    {'address': '0x5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F', 'amount': 500},
    {'address': '0x7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B', 'amount': 75},
    {'address': '0x9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D', 'amount': 1000},
    {'address': '0xABCDEF0123456789ABCDEF0123456789ABCDEF01', 'amount': 150},
    {'address': '0xEF0123456789ABCDEF0123456789ABCDEF012345', 'amount': 300},
    {'address': '0x23456789ABCDEF0123456789ABCDEF0123456789', 'amount': 200},
]


def seed_if_empty(app):
    """Seed one naive and one hardened demo campaign if DB is empty."""
    db = get_db(app)
    count = db.execute("SELECT COUNT(*) as c FROM campaigns").fetchone()['c']
    db.close()

    naive_levels, naive_root, naive_depth = naive_engine.build_tree(SEED_RECIPIENTS)
    hardened_levels, hardened_root, hardened_depth = hardened_engine.build_tree(SEED_RECIPIENTS)

    from .blockchain import chain_state
    chain_state.update_campaign_roots(naive_root, hardened_root, hardened_depth)

    if count > 0:
        return  # Already seeded in database

    # Seed NAIVE campaign
    recipients_indexed = [{'idx': i, **r} for i, r in enumerate(SEED_RECIPIENTS)]
    naive_id = create_campaign(app, 'Genesis Airdrop (Naive)', 'naive', naive_root, naive_depth)
    insert_recipients(app, naive_id, recipients_indexed)

    # Seed HARDENED campaign
    hardened_id = create_campaign(app, 'Genesis Airdrop (Hardened)', 'hardened', hardened_root, hardened_depth)
    insert_recipients(app, hardened_id, recipients_indexed)

    print(f"[SafeDrop] Seeded 2 demo campaigns (naive id={naive_id}, hardened id={hardened_id}) & synced to EVM Chain")
