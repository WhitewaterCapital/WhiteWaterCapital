"""Nasdaq public earnings-calendar adapter (free, no key).

Nasdaq's site is backed by a JSON endpoint, one call per date:
    https://api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD
returning rows {symbol, time, epsForecast, noOfEsts, fiscalQuarterEnding, ...}.
We walk each calendar day in [start, end], keep the universe's symbols, and map
to the same event dict shape synthetic.py / fmp_calendar.py use. A day whose
calendar isn't published yet simply returns no rows — the event is absent, never
invented. Polite pacing between requests.
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from datetime import date, timedelta

_URL = "https://api.nasdaq.com/api/calendar/earnings?date={d}"
_SESSION = {"time-pre-market": "bmo", "time-after-hours": "amc"}


def _eps(raw: str | None) -> float | None:
    """'$1.23' -> 1.23, '($0.12)' -> -0.12, '' / 'N/A' -> None."""
    if not raw:
        return None
    s = raw.strip()
    neg = s.startswith("(") and s.endswith(")")
    m = re.search(r"\d+(?:\.\d+)?", s.replace(",", ""))
    if not m:
        return None
    v = float(m.group(0))
    return -v if neg else v


class NasdaqCalendarAdapter:
    name = "nasdaq"

    def _day(self, d: date) -> list[dict]:
        req = urllib.request.Request(
            _URL.format(d=d.isoformat()),
            headers={"User-Agent": "Mozilla/5.0 (Whitewater research)", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            j = json.loads(resp.read().decode("utf-8"))
        return ((j.get("data") or {}).get("rows")) or []

    def get_earnings(self, universe: list[str], start: date, end: date) -> list[dict]:
        want = {t.upper() for t in universe}
        events: list[dict] = []
        d = start
        while d <= end:
            if d.weekday() < 5:  # no weekend calendars
                for r in self._day(d):
                    sym = (r.get("symbol") or "").upper()
                    if sym in want:
                        events.append({
                            "ticker": sym,
                            "report_date": d.isoformat(),
                            "session": _SESSION.get(r.get("time") or ""),  # None when Nasdaq doesn't say
                            "eps_estimate": _eps(r.get("epsForecast")),
                            "eps_actual": None,
                            "fiscal_period": r.get("fiscalQuarterEnding") or None,
                            "source": "nasdaq",
                            "n_estimates": int(r["noOfEsts"]) if str(r.get("noOfEsts") or "").isdigit() else None,
                        })
                time.sleep(0.35)
            d += timedelta(days=1)
        events.sort(key=lambda e: (e["report_date"], e["ticker"]))
        return events
