"""Shared database loader using direct Postgres (psycopg) with Supabase REST fallback.

When DATABASE_URL is configured (e.g. Supabase's Session/Transaction Pooler URI),
tables are fetched in a single Postgres query instead of 1,000-row paginated
PostgREST HTTP calls. If DATABASE_URL is unset or a Postgres query fails, it
falls back to the provided supabase-py client.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


@contextmanager
def pg_connection():
    """Yield a psycopg connection if DATABASE_URL is set, otherwise yield None."""
    db_url = get_database_url()
    if not db_url:
        yield None
        return
    import psycopg
    from psycopg.rows import dict_row

    # prepare_threshold=None disables server-side prepared statements for PgBouncer/pooler compatibility.
    with psycopg.connect(
        db_url,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    ) as conn:
        yield conn


def _normalize_pg_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Match PostgREST JSON types: convert date/datetime to ISO strings and Decimal to float."""
    if not rows:
        return rows
    sample = rows[0]
    date_cols = [k for k, v in sample.items() if isinstance(v, (date, datetime))]
    dec_cols = [k for k, v in sample.items() if isinstance(v, Decimal)]
    if not date_cols and not dec_cols:
        return rows
    for row in rows:
        for k in date_cols:
            v = row[k]
            if isinstance(v, (date, datetime)):
                row[k] = v.isoformat()
        for k in dec_cols:
            v = row[k]
            if isinstance(v, Decimal):
                row[k] = float(v)
    return rows


def _fetch_via_pg(
    conn,
    table: str,
    columns: list[str] | None = None,
    where_eq: tuple[str, Any] | None = None,
) -> list[dict[str, Any]]:
    from psycopg import sql

    cols_sql = (
        sql.SQL(", ").join(sql.Identifier(c) for c in columns)
        if columns
        else sql.SQL("*")
    )
    query = sql.SQL("SELECT {cols} FROM {table}").format(
        cols=cols_sql,
        table=sql.Identifier(table),
    )
    params: list[Any] = []
    if where_eq is not None:
        col, val = where_eq
        query += sql.SQL(" WHERE {col} = %s").format(col=sql.Identifier(col))
        params.append(val)

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    return _normalize_pg_rows(rows)


def _fetch_via_rest(
    sb_client,
    table: str,
    columns: list[str] | None = None,
    where_eq: tuple[str, Any] | None = None,
    page_size: int = 1000,
) -> list[dict[str, Any]]:
    select_expr = ",".join(columns) if columns else "*"
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        q = sb_client.table(table).select(select_expr)
        if where_eq is not None:
            q = q.eq(where_eq[0], where_eq[1])
        resp = q.range(start, start + page_size - 1).execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def fetch_table_rows(
    table: str,
    columns: list[str] | None = None,
    where_eq: tuple[str, Any] | None = None,
    sb_client=None,
    page_size: int = 1000,
    conn=None,
) -> list[dict[str, Any]]:
    """Fetch rows from a table using direct Postgres when available, else Supabase REST."""
    if conn is not None:
        try:
            return _fetch_via_pg(conn, table, columns=columns, where_eq=where_eq)
        except Exception as e:
            if sb_client is None:
                raise
            print(f"[db_loader] Postgres read failed for {table} ({e}), falling back to REST.")

    if get_database_url() and conn is None:
        try:
            with pg_connection() as new_conn:
                if new_conn is not None:
                    return _fetch_via_pg(new_conn, table, columns=columns, where_eq=where_eq)
        except Exception as e:
            if sb_client is None:
                raise
            print(f"[db_loader] Postgres read failed for {table} ({e}), falling back to REST.")

    if sb_client is None:
        raise RuntimeError(f"Neither DATABASE_URL nor Supabase REST client is configured for {table}.")

    return _fetch_via_rest(
        sb_client,
        table,
        columns=columns,
        where_eq=where_eq,
        page_size=page_size,
    )
