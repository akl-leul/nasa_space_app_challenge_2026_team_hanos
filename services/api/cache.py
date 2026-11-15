"""SQLite cache for REAL archive results.

Rules:
* Only valid, parsed archive answers are stored. Failures are never stored.
* A schema version guards against results produced by older, buggy code (version 1 cached
  empty observation lists after timeouts and cutouts with invented default metadata). When the
  version changes the old tables and cutout files are removed.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import zlib
from typing import Any, Dict, Optional

from .config import CUTOUTS_DIR, DB_PATH, SQLITE_WAL

SCHEMA_VERSION = 2
_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    # WAL lets the API keep reading while the pre-compute script (another process) writes. Without it a long write
    # blocked every request that touched the cache, which froze the whole server.
    # On a network share (SMB or NFS) WAL is unsafe because it needs shared memory; set HANOS_SQLITE_WAL=0
    # there, and the rollback journal is used instead (the file is then switched back if it was in WAL before).
    try:
        conn.execute(f"PRAGMA journal_mode={'WAL' if SQLITE_WAL else 'DELETE'}")
        conn.execute("PRAGMA synchronous=NORMAL" if SQLITE_WAL else "PRAGMA synchronous=FULL")
        conn.execute("PRAGMA busy_timeout=15000")
    except sqlite3.OperationalError:
        pass  # another process holds the file right now; the settings are stored in the file and apply next time
    return conn


def init_db() -> None:
    with _lock, get_db() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        row = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
        if row is None or int(row["value"]) != SCHEMA_VERSION:
            conn.execute("DROP TABLE IF EXISTS api_cache")
            conn.execute("DROP TABLE IF EXISTS cutout_cache")
            conn.execute("DROP TABLE IF EXISTS frame_static")
            shutil.rmtree(CUTOUTS_DIR, ignore_errors=True)
            CUTOUTS_DIR.mkdir(exist_ok=True)
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
                (str(SCHEMA_VERSION),),
            )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS api_cache (
                   cache_key TEXT PRIMARY KEY, endpoint TEXT, release TEXT,
                   data_json TEXT, created_at REAL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS cutout_cache (
                   cutout_id TEXT PRIMARY KEY, uri TEXT, ra REAL, dec REAL, size_deg REAL,
                   compact_path TEXT, meta_json TEXT, created_at REAL,
                   raw_bytes INTEGER, compact_bytes INTEGER)"""
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS frame_static (url TEXT PRIMARY KEY, blob BLOB, created_at REAL)"
        )
        conn.commit()


init_db()


def get_cache(cache_key: str, max_age_sec: float = 6 * 3600, allow_stale: bool = False) -> Optional[Dict[str, Any]]:
    """Return a cached valid result. With allow_stale the age limit is ignored (used as the
    fallback when the archive is unreachable) and ``_age_sec`` is added to the payload."""
    with _lock, get_db() as conn:
        row = conn.execute(
            "SELECT data_json, created_at FROM api_cache WHERE cache_key = ?", (cache_key,)
        ).fetchone()
    if not row:
        return None
    age = time.time() - row["created_at"]
    if age < max_age_sec or allow_stale:
        data = json.loads(row["data_json"])
        if isinstance(data, dict):
            data["_age_sec"] = round(age, 1)
        return data
    return None


def set_cache(cache_key: str, endpoint: str, release: str, data: Any) -> None:
    payload = dict(data) if isinstance(data, dict) else data
    if isinstance(payload, dict):
        payload.pop("_age_sec", None)
    with _lock, get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO api_cache (cache_key, endpoint, release, data_json, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (cache_key, endpoint, release, json.dumps(payload), time.time()),
        )
        conn.commit()


def get_frame_static(url: str) -> Optional[Dict[str, Any]]:
    """Position-independent facts about one spectral image (headers and wavelength table)."""
    with _lock, get_db() as conn:
        row = conn.execute("SELECT blob FROM frame_static WHERE url = ?", (url,)).fetchone()
    if not row:
        return None
    return json.loads(zlib.decompress(row["blob"]).decode("utf-8"))


def set_frame_static(url: str, data: Dict[str, Any]) -> None:
    blob = zlib.compress(json.dumps(data).encode("utf-8"), 6)
    with _lock, get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO frame_static (url, blob, created_at) VALUES (?, ?, ?)",
            (url, blob, time.time()),
        )
        conn.commit()


def get_cached_cutout(cutout_id: str) -> Optional[Dict[str, Any]]:
    with _lock, get_db() as conn:
        row = conn.execute("SELECT * FROM cutout_cache WHERE cutout_id = ?", (cutout_id,)).fetchone()
    if row:
        res = dict(row)
        res["meta"] = json.loads(row["meta_json"]) if row["meta_json"] else {}
        return res
    return None


def set_cached_cutout(cutout_id: str, uri: str, ra: float, dec: float, size_deg: float,
                      compact_path: str, meta: Dict[str, Any], raw_bytes: int, compact_bytes: int) -> None:
    with _lock, get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO cutout_cache
               (cutout_id, uri, ra, dec, size_deg, compact_path, meta_json, created_at, raw_bytes, compact_bytes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (cutout_id, uri, ra, dec, size_deg, compact_path, json.dumps(meta), time.time(),
             raw_bytes, compact_bytes),
        )
        conn.commit()


def cache_stats() -> Dict[str, Any]:
    with _lock, get_db() as conn:
        n_cut = conn.execute("SELECT COUNT(*) c, COALESCE(SUM(compact_bytes),0) b, COALESCE(SUM(raw_bytes),0) r FROM cutout_cache").fetchone()
        n_api = conn.execute("SELECT COUNT(*) c FROM api_cache").fetchone()
        n_fs = conn.execute("SELECT COUNT(*) c FROM frame_static").fetchone()
    return {
        "schema_version": SCHEMA_VERSION,
        "cutouts": n_cut["c"],
        "cutouts_compact_bytes": n_cut["b"],
        "cutouts_raw_bytes_downloaded": n_cut["r"],
        "api_results": n_api["c"],
        "frame_headers": n_fs["c"],
    }
