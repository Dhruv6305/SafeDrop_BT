"""Database model helpers — all DB interactions live here."""
import json
from .db import get_db


# ─────────────────────────── Campaigns ────────────────────────────

def create_campaign(app, name: str, mode: str, root: str, depth: int) -> int:
    db = get_db(app)
    cur = db.execute(
        "INSERT INTO campaigns (name, mode, root, depth) VALUES (?, ?, ?, ?)",
        (name, mode, root, depth)
    )
    db.commit()
    campaign_id = cur.lastrowid
    db.close()
    return campaign_id


def get_campaign(app, campaign_id: int) -> dict | None:
    db = get_db(app)
    row = db.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    db.close()
    return dict(row) if row else None


def list_campaigns(app) -> list[dict]:
    db = get_db(app)
    rows = db.execute("SELECT * FROM campaigns ORDER BY created_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


# ─────────────────────────── Recipients ───────────────────────────

def insert_recipients(app, campaign_id: int, recipients: list[dict]):
    db = get_db(app)
    db.executemany(
        "INSERT INTO recipients (campaign_id, idx, address, amount) VALUES (?, ?, ?, ?)",
        [(campaign_id, r['idx'], r['address'], r['amount']) for r in recipients]
    )
    db.commit()
    db.close()


def get_recipients(app, campaign_id: int) -> list[dict]:
    db = get_db(app)
    rows = db.execute(
        "SELECT * FROM recipients WHERE campaign_id = ? ORDER BY idx",
        (campaign_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


def get_recipient_by_address(app, campaign_id: int, address: str) -> dict | None:
    db = get_db(app)
    row = db.execute(
        "SELECT * FROM recipients WHERE campaign_id = ? AND lower(address) = lower(?)",
        (campaign_id, address)
    ).fetchone()
    db.close()
    return dict(row) if row else None


# ─────────────────────────── Claims ───────────────────────────────

def has_claimed(app, campaign_id: int, address: str) -> bool:
    db = get_db(app)
    row = db.execute(
        "SELECT id FROM claims WHERE campaign_id = ? AND lower(address) = lower(?) AND status = 'accepted'",
        (campaign_id, address)
    ).fetchone()
    db.close()
    return row is not None


def record_claim(app, campaign_id: int, address: str, amount: int, status: str, reason: str = None) -> int:
    db = get_db(app)
    cur = db.execute(
        "INSERT INTO claims (campaign_id, address, amount, status, reason) VALUES (?, ?, ?, ?, ?)",
        (campaign_id, address, amount, status, reason)
    )
    db.commit()
    claim_id = cur.lastrowid
    db.close()
    return claim_id


def get_claims(app, campaign_id: int) -> list[dict]:
    db = get_db(app)
    rows = db.execute(
        "SELECT * FROM claims WHERE campaign_id = ? ORDER BY timestamp DESC",
        (campaign_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ─────────────────────────── Attack Attempts ─────────────────────

def record_attack(app, campaign_id: int, result: str, genuine_len: int, forged_len: int,
                  forged_address: str, forged_amount: str) -> int:
    db = get_db(app)
    cur = db.execute(
        """INSERT INTO attack_attempts
           (campaign_id, result, genuine_proof_length, forged_proof_length, forged_address, forged_amount)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (campaign_id, result, genuine_len, forged_len, forged_address, str(forged_amount))
    )
    db.commit()
    attack_id = cur.lastrowid
    db.close()
    return attack_id


def get_attacks(app, campaign_id: int) -> list[dict]:
    db = get_db(app)
    rows = db.execute(
        "SELECT * FROM attack_attempts WHERE campaign_id = ? ORDER BY timestamp DESC",
        (campaign_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ─────────────────────────── Stats ────────────────────────────────

def get_campaign_stats(app, campaign_id: int) -> dict:
    db = get_db(app)
    total_recipients = db.execute(
        "SELECT COUNT(*) as c FROM recipients WHERE campaign_id = ?", (campaign_id,)
    ).fetchone()['c']
    total_claims = db.execute(
        "SELECT COUNT(*) as c FROM claims WHERE campaign_id = ? AND status='accepted'", (campaign_id,)
    ).fetchone()['c']
    total_attacks = db.execute(
        "SELECT COUNT(*) as c FROM attack_attempts WHERE campaign_id = ?", (campaign_id,)
    ).fetchone()['c']
    db.close()
    return {
        'total_recipients': total_recipients,
        'total_claims': total_claims,
        'total_attacks': total_attacks,
    }
