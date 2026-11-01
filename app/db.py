"""SQLite database initialization and connection helpers."""
import sqlite3
import os


def get_db(app):
    """Open a new database connection."""
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(app):
    """Create all tables if they don't exist."""
    db = get_db(app)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            mode        TEXT NOT NULL CHECK(mode IN ('naive','hardened')),
            root        TEXT NOT NULL,
            depth       INTEGER NOT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS recipients (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            idx         INTEGER NOT NULL,
            address     TEXT NOT NULL,
            amount      INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS claims (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            address     TEXT NOT NULL,
            amount      INTEGER NOT NULL,
            status      TEXT NOT NULL CHECK(status IN ('accepted','rejected')),
            reason      TEXT,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS attack_attempts (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id          INTEGER NOT NULL REFERENCES campaigns(id),
            result               TEXT NOT NULL CHECK(result IN ('success','blocked')),
            genuine_proof_length INTEGER,
            forged_proof_length  INTEGER,
            forged_address       TEXT,
            forged_amount        TEXT,
            timestamp            DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    db.commit()
    db.close()
