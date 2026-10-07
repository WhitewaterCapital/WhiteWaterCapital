"""Yahoo Finance daily closes (free, no key) — same output shape as
alpaca_bars.fetch_universe_daily_closes: {ticker: {"YYYY-MM-DD": adj_close}}.

Selected with PRICES_PROVIDER=yahoo when Alpaca keys aren't set, so the pairs
screen runs on real prices instead of the synthetic-demo panel. Uses the
split+dividend adjusted close (log-price cointegration on raw closes would be
broken by splits). Raises on a failed fetch — never returns partial data
silently.
"""

from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone

_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1={p1}&period2={p2}&interval=1d"
_NY = timezone(timedelta(hours=-4))


def fetch_daily_closes(ticker: str, lookback_days: int) -> dict[str, float]:
    now = datetime.now(timezone.utc)
    p1 = int((now - timedelta(days=lookback_days)).timestamp())
    p2 = int(now.timestamp()) + 86400
    req = urllib.request.Request(
        _BASE.format(ticker=ticker.upper().replace(".", "-"), p1=p1, p2=p2),
        headers={"User-Agent": "Mozilla/5.0 (Whitewater research)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        j = json.loads(resp.read().decode("utf-8"))
    res = (j.get("chart") or {}).get("result") or []
    if not res:
        raise RuntimeError(f"Yahoo returned no data for {ticker}")
    r = res[0]
    ts = r.get("timestamp") or []
    adj = ((r.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
    today = datetime.now(_NY).date()
    out: dict[str, float] = {}
    for t, c in zip(ts, adj):
        if c is None or c <= 0:
            continue
        d = datetime.fromtimestamp(t, _NY).date()
        if d >= today:  # drop the unsettled intraday bar
            continue
        out[d.isoformat()] = float(c)
    return out


def fetch_universe_daily_closes(universe: list[str], lookback_days: int) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for t in universe:
        out[t] = fetch_daily_closes(t, lookback_days)
        time.sleep(0.4)
    return out
