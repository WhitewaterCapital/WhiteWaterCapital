"""Yahoo Finance daily price adapter (free, no API key).

Why: Stooq now sits behind a JS bot-detection wall and Tiingo needs a key the
team hasn't set, which left every price-driven read (momentum, vol, factor
betas, levels) running on synthetic demo prices. Yahoo's public chart endpoint
returns full daily history with a split+dividend adjusted close.

Adjustment: Yahoo gives raw OHLC plus `adjclose`. We scale open/high/low/close
by adjclose/close for each bar so the whole bar is on the same fully-adjusted
basis (what Tiingo's adj* fields provide). Volume is left as reported.

INTEGRITY NOTES:
  - Unofficial endpoint: fine for research, check terms before redistributing.
  - Listed names only — not a survivorship-free universe (same as Tiingo).
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests

from ..pit import PriceBar

_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
_TIMEOUT = 30
_MIN_INTERVAL_S = 0.4
_NY = timezone(timedelta(hours=-4))


class YahooClient:
    name = "yahoo"

    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "Mozilla/5.0 (Whitewater research)"})
        self._last_ts = 0.0

    def _get(self, url: str, params: dict) -> dict:
        gap = time.monotonic() - self._last_ts
        if gap < _MIN_INTERVAL_S:
            time.sleep(_MIN_INTERVAL_S - gap)
        self._last_ts = time.monotonic()
        resp = self._session.get(url, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def fetch_prices(
        self, ticker: str, start: Optional[date] = None, end: Optional[date] = None
    ) -> list[PriceBar]:
        start = start or date(1990, 1, 1)
        end = end or date.today()
        p1 = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp())
        p2 = int(datetime(end.year, end.month, end.day, tzinfo=timezone.utc).timestamp()) + 86400
        sym = ticker.upper().replace(".", "-")  # BRK.B -> BRK-B
        j = self._get(_BASE.format(ticker=sym), {"period1": p1, "period2": p2, "interval": "1d"})
        res = (j.get("chart") or {}).get("result") or []
        if not res:
            err = (j.get("chart") or {}).get("error") or {}
            raise RuntimeError(f"Yahoo returned no data for {ticker}: {err.get('description', 'unknown')}")
        r = res[0]
        ts = r.get("timestamp") or []
        q = ((r.get("indicators") or {}).get("quote") or [{}])[0]
        adj = ((r.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
        ingested = date.today()
        bars: list[PriceBar] = []
        for i, t in enumerate(ts):
            try:
                c, o, h, l = q["close"][i], q["open"][i], q["high"][i], q["low"][i]
                if None in (c, o, h, l) or c <= 0:
                    continue
                a = adj[i] if i < len(adj) and adj[i] is not None else c
                f = a / c
                d = datetime.fromtimestamp(t, _NY).date()
                bars.append(
                    PriceBar(
                        ticker=ticker.upper(),
                        date=d,
                        open=float(o) * f,
                        high=float(h) * f,
                        low=float(l) * f,
                        close=float(a),
                        volume=float(q.get("volume", [0])[i] or 0.0),
                        source=self.name,
                        adjusted=True,
                        ingested_at=ingested,
                    )
                )
            except (KeyError, IndexError, TypeError, ZeroDivisionError):
                continue
        bars.sort(key=lambda b: b.date)
        # Same trust fix as Tiingo: drop today's unsettled intraday bar.
        if bars and bars[-1].date >= date.today():
            bars = bars[:-1]
        return bars
