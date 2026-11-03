"""Data for the fund-market dashboard, from the local data store that tehran-market-data keeps up to date.

    python _tools/make_market_data.py STORE_DIR

STORE_DIR holds funds.parquet (FIPIRAN daily panel), etf_prices.parquet (TSETMC prices of traded
funds) and shareholders.parquet (TSETMC major-shareholder panel). Writes assets/data/market/.
Amounts are in trillion tomans (10^13 rials, the "hemat" used in Iranian reporting).
"""
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from firm_names import EN  # noqa: E402

store = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "assets" / "data" / "market"
T = 1e13                      # rials per trillion tomans
TYPES = {
    "اوراق بهادار با درآمد ثابت": "Fixed income", "سهام": "Equity", "اختصاصی بازارگردانی": "Market making",
    "اوراق بهادار مبتنی بر سپرده کالایی": "Commodity (gold)", "سهام-بخشی": "Sector equity", "مختلط": "Mixed",
    "سهام-سهامی اهرمی": "Leveraged equity", "سهام-شاخصی": "Index equity", "جسورانه": "Venture capital",
    "صندوق در صندوق": "Fund of funds", "با تضمین اصل مبلغ سرمایه‌گذاری": "Capital guaranteed",
    "املاک و مستغلات": "Real estate", "بازنشستگی تکمیلی": "Pension", "خصوصی": "Private equity", "پروژه ای": "Project",
}
MIX = ["stock", "bond", "deposit", "cash", "commodity", "fundUnit", "other"]
def r2(x, d=2):
    x = None if x is None or x is pd.NA else float(x)
    return None if x is None or not np.isfinite(x) else round(x, d)


def persian(s):
    """One spelling for Arabic and Persian letters, no zero-width joiners or extra spaces."""
    if not isinstance(s, str):
        return s
    s = s.replace("ي", "ی").replace("ك", "ک").replace("‌", " ")
    return re.sub(r"\s+", " ", s).strip()


def firm(name):
    return EN.get(name, name)


# ---------------------------------------------------------------- fund panel
f = pd.read_parquet(store / "funds.parquet")
f["date"] = pd.to_datetime(f["date"])
f["regNo"] = f["regNo"].astype(str)
# FIPIRAN does not always send every field; missing ones become blanks instead of errors
for c in MIX + ["netAsset", "investedUnits", "cancelNav", "statisticalNav", "dividendIntervalPeriod", "daily_return", "index_return"]:
    f[c] = pd.to_numeric(f[c], errors="coerce") if c in f else np.nan
for c in ("typeOfInvest", "smallSymbolName", "manager", "fund_type_name", "name"):
    if c not in f:
        f[c] = None
f = f[f["netAsset"].fillna(0) > 0].copy()
f["regNo"] = f["regNo"].astype(str)      # FIPIRAN sends it as text, older files as numbers
# "the fund's board" is FIPIRAN's placeholder for self-managed funds, not a firm
f.loc[f["manager"].map(persian).eq("هیئت مدیره صندوق"), "manager"] = None
# FIPIRAN sometimes returns only part of the funds for a day, and its history for past dates can
# miss a fifth of the funds; such days would show fake jumps in assets, so a day must have at least
# 90% of the most funds seen on it or in the 30 days after it
per_day = f.groupby("date")["regNo"].nunique()
ahead = per_day[::-1].rolling(30, min_periods=1).max()[::-1]
complete = per_day[per_day >= 0.9 * ahead].index
f = f[f["date"].isin(complete)].sort_values(["regNo", "date"])
TYPES = {persian(k): v for k, v in TYPES.items()}
f["type"] = f["fund_type_name"].map(lambda s: TYPES.get(persian(s), "Other") if isinstance(s, str) else "Other")
f["etf"] = f["typeOfInvest"].eq("Negotiable")
# returns come from the redemption NAV: the reported daily returns disagree with the NAV on many days
# (e.g. +335% while the NAV fell 5%). On payout days the NAV drops by the dividend, so there the
# reported return is used if it is plausible.
nav = f["cancelNav"].where(f["cancelNav"] > 0)
f["ret"] = nav / nav.groupby(f["regNo"]).shift() - 1
payout = (f["dividendIntervalPeriod"].fillna(0) > 0) & (f["ret"] < -0.003) & f["daily_return"].between(-0.03, 0.03) & (f["daily_return"] > f["ret"] + 0.003)
f.loc[payout, "ret"] = f.loc[payout, "daily_return"]
f.loc[f["ret"].abs() > 0.5, "ret"] = np.nan        # NAV entry errors
# gold funds without a commodity field leave their gold certificates out of the other columns
# (older reports put them under "stock"), so the remainder is counted as commodity
gold = f["type"].eq("Commodity (gold)") & f["commodity"].isna()
rest = f.loc[gold, ["bond", "deposit", "cash", "fundUnit", "other"]].fillna(0).sum(axis=1)
f.loc[gold, "commodity"], f.loc[gold, "stock"] = (1 - rest).clip(0, 1), 0
for c in MIX:
    f[c] = f[c].clip(0, 1)
# net flow = change in units outstanding x redemption NAV; uses snapshot fields only, so it works for ETFs too
g = f.groupby("regNo")
f["flow"] = (f["investedUnits"] - g["investedUnits"].shift()) * f["cancelNav"]
f.loc[f["flow"].abs() > g["netAsset"].shift(), "flow"] = np.nan   # more than the whole fund in one day: bad data
asof = f["date"].max()
dates = sorted(f["date"].unique())

# --- market totals by type, daily
aum = f.pivot_table(index="date", columns="type", values="netAsset", aggfunc="sum").fillna(0) / T
order = aum.iloc[-1].sort_values(ascending=False).index.tolist()
week = lambda s: s.dt.to_period("W-FRI").dt.end_time.dt.normalize()   # Iranian week, Saturday to Friday
f["week"] = week(f["date"])
flows = f.pivot_table(index="week", columns="type", values="flow", aggfunc="sum").reindex(columns=order).fillna(0) / T
counts = f.groupby("date")["regNo"].nunique()

# --- asset mix, weighted by fund assets, weekly (last day of each week)
last_day = f.groupby("week")["date"].transform("max")
wk = f[f["date"].eq(last_day)]
def mix_of(d):
    d = d[d[MIX].fillna(0).sum(axis=1) >= 0.5]   # many funds report no holdings at all; leave them out
    if d.empty:
        return None
    w = d["netAsset"]
    return {c: r2((d[c].fillna(0) * w).sum() / w.sum(), 4) for c in MIX}
all_weeks = sorted(wk["week"].unique())
mix = {"All funds": [mix_of(wk[wk["week"] == w]) for w in all_weeks]}
for t in order[:8]:
    sub = wk[wk["type"] == t]
    mix[t] = [mix_of(sub[sub["week"] == w]) if (sub["week"] == w).any() else None for w in all_weeks]
mix_weeks = [str(pd.Timestamp(w).date()) for w in all_weeks]

# --- managers
last = f[f["date"].eq(asof)]
first = f[f["date"].eq(f["date"].min())]
mgr_now = last.groupby("manager").agg(aum=("netAsset", "sum"), funds=("regNo", "nunique"))
mgr_now["share"] = mgr_now["aum"] / mgr_now["aum"].sum()
mgr_then = first.groupby("manager")["netAsset"].sum()
mgr_flow = f.groupby("manager")["flow"].sum()
top = mgr_now.sort_values("aum", ascending=False).head(15)
managers = [{"name": firm(n), "fa": n, "aum": r2(r.aum / T, 1), "share": r2(r.share, 4), "funds": int(r.funds),
             "growth": r2(r.aum / mgr_then.get(n, np.nan) - 1, 3), "flow": r2(mgr_flow.get(n, 0) / T, 1)}
            for n, r in top.iterrows()]
hhi = f.groupby("date").apply(lambda d: ((d.groupby("manager")["netAsset"].sum() / d["netAsset"].sum() * 100) ** 2).sum())

# --- index (TEDPIX) path
idx = f.groupby("date")["index_return"].first().reindex(dates)

# ---------------------------------------------------------------- ETF prices and holders
px = pd.read_parquet(store / "etf_prices.parquet") if (store / "etf_prices.parquet").exists() else pd.DataFrame(columns=["regNo", "date", "close"])
px["date"] = pd.to_datetime(px["date"])
px["regNo"] = px["regNo"].astype(str)
# premium over NAV uses the actual traded close, not the dividend-adjusted price
px = px[["regNo", "date", "close"]].merge(f[["regNo", "date", "statisticalNav", "type"]], on=["regNo", "date"])
px["premium"] = (px["close"] / px["statisticalNav"] - 1).where(px["statisticalNav"] > 0)
# leveraged funds trade a different unit class, and venture, private, project and real-estate funds
# report NAVs that do not match their traded units, so their gaps say nothing about pricing
px.loc[px["type"].isin(["Leveraged equity", "Venture capital", "Private equity", "Project", "Real estate"]), "premium"] = np.nan
px.loc[px["premium"].abs() > 0.5, "premium"] = np.nan   # mismatched units or garbled prices
px = px.drop_duplicates(["regNo", "date"], keep="last")

HOLDER_KINDS = [  # first match wins; names are only used to group holders, never published
    ("ETF reserve (unissued units)", r"^ETF|کدرزرو"),
    ("Market-making funds", r"^BFM|بازارگردان"),
    ("Individuals", r"شخص حقیقی"),
    ("Insurance", r"بیمه"),
    ("Pension & social security", r"بازنشستگی|تامین اجتماعی|صندوق بیمه اجتماعی|کشوری|لشکری"),
    ("Banks", r"^بانک|شرکت بانک|\bبانک\b(?!.*صندوق)"),
    ("Other funds", r"صندوق"),
    ("Managed portfolios", r"^PRX|سبد"),
    ("Investment & holding firms", r"سرمایه ?گذاری|هلدینگ|گروه|توسعه|مالی|تامین سرمایه|کارگزاری|سبدگردان"),
]
def kind(name):
    n = persian(name)
    for k, pat in HOLDER_KINDS:
        if re.search(pat, n):
            return k
    return "Other companies"
KINDS = [k for k, _ in HOLDER_KINDS] + ["Other companies", "Small holders (<1%)"]

sh_path = store / "shareholders.parquet"
sh = pd.read_parquet(sh_path) if sh_path.exists() else pd.DataFrame(columns=["date", "symbol", "shareHolderName", "perOfShares"])
sh["date"] = pd.to_datetime(sh["date"])
sh["kind"] = sh["shareHolderName"].map(kind)
sh["sym"] = sh["symbol"].map(persian)
sym2reg = (f.assign(sym=f["smallSymbolName"].map(persian)).dropna(subset=["sym"])
           .sort_values("date").groupby("sym")["regNo"].last())
sh["regNo"] = sh["sym"].map(sym2reg)
sh = sh.dropna(subset=["regNo"])
sh["week"] = week(sh["date"])
sh = sh[sh["date"].eq(sh.groupby(["regNo", "week"])["date"].transform("max"))]
if sh.empty:
    hold = pd.DataFrame(columns=KINDS, index=pd.MultiIndex.from_tuples([], names=["regNo", "week"]))
    top1 = pd.Series(dtype=float)
    mkt_hold = pd.DataFrame(columns=KINDS)
else:
    hold = sh.pivot_table(index=["regNo", "week"], columns="kind", values="perOfShares", aggfunc="sum").fillna(0) / 100
    hold["Small holders (<1%)"] = (1 - hold.sum(axis=1)).clip(lower=0)
    hold = hold.reindex(columns=KINDS, fill_value=0)
    top1 = sh.groupby(["regNo", "week"])["perOfShares"].max() / 100
    # market-wide: weight each ETF's ownership by its assets that week
    etf_aum = wk.set_index(["regNo", "week"])["netAsset"]
    hw = hold.join(etf_aum, how="inner")
    mkt_hold = hw.groupby("week").apply(lambda d: (d[KINDS].mul(d["netAsset"], axis=0).sum() / d["netAsset"].sum())) if len(hw) else pd.DataFrame(columns=KINDS)

# ---------------------------------------------------------------- per-fund metrics and series
def drawdown(path):
    return float((path / path.cummax() - 1).min())

idx_ret = idx.rename("m")
# risk-free proxy: the median yearly return of fixed-income funds, which hold deposits and government bonds
year = f[f["date"] > asof - pd.Timedelta(days=365)]
fi = year[year["type"].eq("Fixed income")].groupby("regNo")["ret"].agg(
    lambda s: (1 + s.dropna()).prod() ** (252 / s.notna().sum()) - 1 if s.notna().sum() >= 40 else np.nan)
RF = float(fi.median()) if fi.notna().any() else np.nan
MIN_DAYS = 60   # risk measures need about three months of daily data
rows, series = [], {}
for reg, d in f.groupby("regNo"):
    d = d.set_index("date")
    r = d["ret"]
    yr = r[r.index > asof - pd.Timedelta(days=365)].dropna()
    path = (1 + r.fillna(0)).cumprod()
    lastrow = d.iloc[-1]
    def period(days):
        if (asof - d.index[0]).days < days - 4:      # the fund's history is shorter than the period
            return None
        s = r[r.index > asof - pd.Timedelta(days=days)].dropna()
        return r2((1 + s).prod() - 1, 4) if len(s) > days * 0.4 else None
    stats = {}
    if len(yr) >= MIN_DAYS:
        ann_ret = (1 + yr).prod() ** (252 / len(yr)) - 1
        vol = yr.std() * np.sqrt(252)
        var = -np.quantile(yr, 0.05)
        both = pd.concat([yr, idx_ret], axis=1, join="inner").dropna()
        beta = both.cov().iloc[0, 1] / both["m"].var() if len(both) > 60 else np.nan
        # Sharpe and beta say little about funds that barely move (fixed income, market making), so skip them
        risky = vol >= 0.05
        stats = {"vol": r2(vol, 4), "sharpe": r2((ann_ret - RF) / vol) if risky and np.isfinite(RF) else None,
                 "var": r2(max(var, 0), 4), "es": r2(max(-yr[yr <= -var].mean(), 0), 4), "beta": r2(beta) if risky else None,
                 "mdd": r2(drawdown((1 + yr).cumprod()), 4)}
    prem = px[px["regNo"] == reg].set_index("date")["premium"]
    row = {"id": int(reg), "name": persian(lastrow["name"]), "type": lastrow["type"], "etf": bool(lastrow["etf"]),
           "mgr": firm(lastrow["manager"]) if isinstance(lastrow["manager"], str) else None,
           "aum": r2(lastrow["netAsset"] / T, 3), "live": bool(d.index[-1] == asof),
           "r1m": period(30), "r3m": period(91), "r1y": period(365),
           "rall": r2(path.iloc[-1] - 1, 4) if r.notna().any() else None,
           "flow3m": r2(d.loc[d.index > asof - pd.Timedelta(days=91), "flow"].sum() / T, 3),
           "prem": r2(prem.dropna().iloc[-1], 4) if prem.notna().any() else None, **stats}
    rows.append(row)
    weekly = d.groupby("week").agg(aum=("netAsset", "last"), flow=("flow", "sum"), **{c: (c, "last") for c in MIX})
    s = {"d": [str(x.date()) for x in d.index], "nav": [r2(v, 4) for v in path],
         "aum": [r2(v / T, 4) for v in d["netAsset"]],
         "w": [str(x.date()) for x in weekly.index], "flow": [r2(v / T, 4) for v in weekly["flow"]],
         "mix": {c: [r2(v, 3) for v in weekly[c]] for c in MIX}}
    if prem.notna().any():
        s["prem"] = [r2(prem.get(x), 4) for x in d.index]
    if reg in hold.index.get_level_values(0):
        h = hold.loc[reg]
        s["hw"] = [str(x.date()) for x in h.index]
        s["hold"] = {k: [r2(v, 4) for v in h[k]] for k in KINDS if h[k].max() > 0.005}
        s["top1"] = [r2(v, 4) for v in top1.loc[reg].reindex(h.index)]
    series[int(reg)] = s

# ---------------------------------------------------------------- write
if out.exists():
    shutil.rmtree(out)
(out / "fund").mkdir(parents=True)
dump = lambda obj, p: json.dump(obj, open(p, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
idx_path = (1 + idx.fillna(0)).cumprod()
dump({"asof": str(asof.date()), "start": str(pd.Timestamp(dates[0]).date()), "rf": r2(RF, 4), "min_days": MIN_DAYS, "types": order,
      "dates": [str(pd.Timestamp(x).date()) for x in dates],
      "aum": {t: [r2(v, 1) for v in aum[t]] for t in order}, "count": [int(v) for v in counts],
      "index": [r2(v, 4) for v in idx_path],
      "weeks": [str(w.date()) for w in flows.index], "flows": {t: [r2(v, 2) for v in flows[t]] for t in order},
      "mix_weeks": mix_weeks, "mix": mix, "managers": managers, "hhi": [r2(v, 0) for v in hhi],
      "n_managers": int(mgr_now.shape[0]),
      "holders": {"weeks": [str(w.date()) for w in mkt_hold.index], "kinds": KINDS,
                  "share": {k: [r2(v, 4) for v in mkt_hold[k]] for k in KINDS},
                  "asof": str(sh["date"].max().date()) if not sh.empty else None, "n_etfs": int(sh["regNo"].nunique())},
      "funds": sorted(rows, key=lambda x: -(x["aum"] or 0))}, out / "overview.json")
for reg, s in series.items():
    dump(s, out / "fund" / f"{reg}.json")
size = sum(p.stat().st_size for p in out.rglob("*.json"))
print(f"{len(series)} funds, data through {asof.date()}, {size / 1e6:.1f} MB in {out}")
print(f"overview.json {(out / 'overview.json').stat().st_size / 1024:.0f} KB")
missing = [m["fa"] for m in managers if m["fa"] not in EN]
if missing:
    print("managers without an English name:", missing)
