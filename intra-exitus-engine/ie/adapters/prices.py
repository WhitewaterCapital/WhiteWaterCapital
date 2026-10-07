"""Pick the price source: PRICES_PROVIDER=tiingo|yahoo. Default: Tiingo when
TIINGO_API_KEY is set, else Yahoo (free, no key)."""

from __future__ import annotations

import os


def price_client():
    choice = os.environ.get("PRICES_PROVIDER", "").strip().lower()
    if choice == "tiingo" or (not choice and os.environ.get("TIINGO_API_KEY")):
        from .prices_tiingo import TiingoClient
        return TiingoClient()
    from .prices_yahoo import YahooClient
    return YahooClient()
