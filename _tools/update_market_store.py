"""Bring the local market-data store up to date for the fund-market dashboard.

    python _tools/update_market_store.py STORE_DIR [--days 14]

1. funds.parquet         daily FIPIRAN fund panel; the first run starts --days ago, later runs add the new days
2. etf_prices.parquet    closing prices of every traded fund from TSETMC, from the panel's first day
3. shareholders.parquet  major holders of traded funds on the last trading day of each new week

FIPIRAN only answers from Iranian internet addresses, so run this without a VPN. If it cannot be
reached the script stops with an error, so nothing half-updated gets published.
"""
import argparse
import logging
import re
import socket
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from tehran_data import TsetmcClient
from tehran_data.fund_panel import FundPanelBuilder, update_panel, write_panel
from tehran_data.tsetmc import tse_trading_days

log = logging.getLogger("update")


def persian(s):
    if not isinstance(s, str):
        return s
    return re.sub(r"\s+", " ", s.replace("ي", "ی").replace("ك", "ک").replace("‌", " ")).strip()


def update_funds(store: Path, days: int) -> pd.DataFrame:
    builder = FundPanelBuilder()
    try:
        builder.fund_types()
    except Exception as exc:  # noqa: BLE001 - report connectivity failures before updating anything
        # requests/urllib3 wrap socket.gaierror several layers deep, so inspect the
        # exception chain rather than labelling every failure as a VPN problem.
        cause = exc
        dns_failure = False
        while cause is not None:
            if isinstance(cause, socket.gaierror) or "Failed to resolve" in str(cause):
                dns_failure = True
                break
            cause = cause.__cause__ or cause.__context__
        if dns_failure:
            log.error(
                "DNS could not resolve fund.fipiran.ir (%s). This is not proof that a VPN is on. "
                "Reconnect Wi-Fi, disable any custom/secure DNS or proxy, flush the macOS DNS "
                "cache, and try again using your ISP's Iranian DNS.",
                exc,
            )
        else:
            log.error(
                "FIPIRAN is not reachable (%s). If you are outside Iran or using a VPN/proxy, "
                "connect through an Iranian network and try again.",
                exc,
            )
        sys.exit(1)
    path = store / "funds.parquet"
    if path.exists():
        panel = update_panel(path, builder=builder)
    else:
        start = date.today() - timedelta(days=days)
        log.info("no fund panel yet: building it from %s", start)
        panel = builder.build(start, date.today())
        if panel.empty:
            log.error("FIPIRAN returned no funds for %s to %s", start, date.today())
            sys.exit(1)
        write_panel(panel, path)
    log.info("funds: %d funds, %s to %s", panel["regNo"].nunique(), panel["date"].min().date(), panel["date"].max().date())
    return panel


def traded_funds(funds: pd.DataFrame, store: Path) -> pd.DataFrame:
    """inscode, symbol and regNo of every exchange-traded fund in the panel."""
    last = funds.sort_values("date").groupby("regNo").last().reset_index()
    # FIPIRAN can temporarily expose two registrations for the same traded
    # symbol/inscode.  Prefer the registration carrying the larger asset value
    # and make the lookup index unique before Series.map uses it.
    symbol_rows = last.assign(sym=last["smallSymbolName"].map(persian)).dropna(subset=["sym"])
    symbol_rows = symbol_rows.sort_values("netAsset", ascending=False, na_position="last").drop_duplicates("sym")
    sym2reg = symbol_rows.set_index("sym")["regNo"]
    etf = last[last["typeOfInvest"].eq("Negotiable") & last["insCode"].notna()]
    ins = pd.DataFrame({"inscode": etf["insCode"].astype(str), "symbol": etf["smallSymbolName"]})
    extra = store / "instruments.csv"          # TSETMC instrument list, a fallback for funds FIPIRAN gives no code for
    if extra.exists():
        more = pd.read_csv(extra, dtype={"inscode": str})
        ins = pd.concat([ins, more.loc[more["paper_type_number"] == 8, ["inscode", "symbol"]]]).drop_duplicates("inscode")
    ins["symbol"] = ins["symbol"].map(lambda s: re.sub(r"\d+$", "", persian(str(s))))
    ins["regNo"] = ins["symbol"].map(sym2reg)
    ins = ins.dropna(subset=["regNo"]).drop_duplicates("regNo")
    log.info("%d exchange-traded funds", len(ins))
    return ins


def update_prices(store: Path, tse: TsetmcClient, ins: pd.DataFrame, start: pd.Timestamp) -> None:
    frames = []
    for row in ins.itertuples():
        try:
            p = tse.closing_prices(row.inscode)
        except Exception as exc:  # noqa: BLE001
            log.warning("prices %s: %s", row.symbol, exc)
            continue
        p = p[p.index >= start]
        if not p.empty:
            frames.append(pd.DataFrame({"regNo": str(row.regNo), "symbol": row.symbol, "date": p.index, "close": p["pClosing"].to_numpy()}))
    if len(frames) < len(ins) / 2:
        log.error("prices: only %d of %d funds loaded; prices not updated", len(frames), len(ins))
        return
    prices = pd.concat(frames, ignore_index=True)
    prices.sort_values(["regNo", "date"]).to_parquet(store / "etf_prices.parquet", index=False)
    log.info("prices: %d funds, to %s", len(frames), prices["date"].max().date())


def update_holders(store: Path, tse: TsetmcClient, ins: pd.DataFrame, start: pd.Timestamp) -> None:
    path = store / "shareholders.parquet"
    old = pd.read_parquet(path) if path.exists() else pd.DataFrame()
    first = old["date"].max() + pd.Timedelta(days=1) if not old.empty else start
    days = pd.to_datetime(pd.Series(tse_trading_days(first.strftime("%Y%m%d"), date.today().strftime("%Y%m%d"))), format="%Y%m%d")
    if days.empty:
        return
    probes = ins["inscode"].head(5).tolist()
    for _, week in days.groupby(days.dt.to_period("W-FRI")):
        # the last weekday is not always a trading day (holidays), so step back until a list comes back
        for day in week.sort_values(ascending=False):
            on = day.strftime("%Y%m%d")
            if any(not tse.shareholders(p, on).empty for p in probes):
                break
        else:
            log.warning("holders: no trading day in the week to %s", week.max().date())
            continue
        panel = tse.shareholder_panel(ins[["inscode", "symbol"]], on, on)
        old = pd.concat([old, panel], ignore_index=True)
        old.to_parquet(path, index=False)          # saved every week, so an interrupted run keeps its progress
        log.info("holders %s: %d funds", on, panel["inscode"].nunique() if not panel.empty else 0)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M")
    logging.getLogger("tehran_data").setLevel(logging.ERROR)
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("store", type=Path)
    a.add_argument("--days", type=int, default=14, help="history to collect on the first run (default 14 days)")
    args = a.parse_args()
    args.store.mkdir(parents=True, exist_ok=True)
    funds = update_funds(args.store, args.days)
    start = funds["date"].min()
    tse = TsetmcClient()
    ins = traded_funds(funds, args.store)
    update_prices(args.store, tse, ins, start)
    update_holders(args.store, tse, ins, start)
