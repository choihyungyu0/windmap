"""
SQLite 저장 계층 — 기능명세 ⑥ 데이터모델 준수.

시계열: emission_ts(TMS) · weather_ts(기상) · station_ts(측정소 실측)
운영: quality_log(품질 감시 AUTO-03) · pipeline_run(사이클 이력 AUTO-01)
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS emission_ts (
  source_id TEXT NOT NULL,
  item      TEXT NOT NULL,
  val       REAL,
  op_status INTEGER,           -- 운영상태 (가동/정지 자연실험 — 검증 방법 A의 핵심)
  ts        TEXT NOT NULL,     -- ISO8601
  PRIMARY KEY (source_id, item, ts)
);
CREATE INDEX IF NOT EXISTS idx_emission ON emission_ts (source_id, ts);

CREATE TABLE IF NOT EXISTS weather_ts (
  site TEXT NOT NULL,
  wd   REAL,                   -- 풍향 (도)
  ws   REAL,                   -- 풍속 (m/s)
  temp REAL,                   -- 기온 (℃)
  stab TEXT,                   -- P-G 안정도 계급 (A~F)
  ts   TEXT NOT NULL,
  PRIMARY KEY (site, ts)
);
CREATE INDEX IF NOT EXISTS idx_weather ON weather_ts (ts);

CREATE TABLE IF NOT EXISTS station_ts (
  station_id TEXT NOT NULL,
  item       TEXT NOT NULL,
  val        REAL,
  ts         TEXT NOT NULL,
  PRIMARY KEY (station_id, item, ts)
);
CREATE INDEX IF NOT EXISTS idx_station ON station_ts (ts);

CREATE TABLE IF NOT EXISTS quality_log (
  ts        TEXT NOT NULL,
  collector TEXT NOT NULL,
  level     TEXT NOT NULL,     -- info | warn | error
  message   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_run (
  ts      TEXT NOT NULL,
  mode    TEXT NOT NULL,       -- mock | live | live-fallback
  ok      INTEGER NOT NULL,
  summary TEXT NOT NULL        -- JSON
);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    con = sqlite3.connect(DB_PATH)
    try:
        con.executescript(SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()


def upsert_many(con: sqlite3.Connection, table: str, cols: list[str], rows: list[tuple]) -> int:
    if not rows:
        return 0
    ph = ",".join("?" * len(cols))
    con.executemany(
        f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({ph})", rows
    )
    return len(rows)


def log_quality(con: sqlite3.Connection, ts: str, collector: str, level: str, message: str) -> None:
    con.execute(
        "INSERT INTO quality_log (ts, collector, level, message) VALUES (?,?,?,?)",
        (ts, collector, level, message),
    )
