"""Data for the thesis, fund-risk and fund-network demos.

    python _tools/make_small_data.py THESIS_REPO FUND_RISK_REPO FIPIRAN_SNAPSHOT.json
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tehran-market-data" / "src"))
from tehran_data import flatten_funds, manager_concentration  # noqa: E402

thesis, fundrisk, snapshot = map(Path, sys.argv[1:4])
out = Path(__file__).resolve().parents[1] / "assets" / "data"

# --- thesis: corrected and thesis-style estimates (per 1 degree F, in basis points / x1e4)
cor = pd.read_csv(thesis / "output" / "tables" / "corrected_results.csv")
rob = pd.read_csv(thesis / "output" / "tables" / "robustness_results.csv")
label = {"tmean_anom_hq": "Mean temperature anomaly", "hot_hq": "Hotter than usual", "cold_hq": "Colder than usual",
         "tmax_anom_hq": "Daytime highs", "tmin_anom_hq": "Night-time lows", "tmean_absanom_hq": "Size of anomaly (either way)"}
def rows(df, mask):
    d = df[mask]
    return [{"y": r.y, "var": label.get(r.variable, r.variable), "coef": round(r.coef * 1e4, 3),
             "low": round((r.coef - 1.96 * r.se) * 1e4, 3), "high": round((r.coef + 1.96 * r.se) * 1e4, 3), "p": round(r.p, 3)}
            for r in d.itertuples()]
main = cor["spec"].isin(["signed mean anomaly", "hot / cold split", "tmax / tmin anomalies", "|mean anomaly| (thesis concept, fixed)"])
val = (thesis / "output" / "logs" / "validation.txt").read_text()
import re
same = float(re.search(r"same location: ([\d.]+)%", val).group(1))
json.dump({"corrected": rows(cor, main),
           "thesis_fe": rows(rob, (rob["check"] == "thesis_fe") & (rob["variable"] == "tmean_anom_hq")),
           "baseline": rows(cor, cor["spec"] == "signed mean anomaly"),
           "same_location_pct": same, "n_firms": 18043, "n_obs": 1963007},
          open(out / "thesis.json", "w"), separators=(",", ":"))

# --- fund risk: synthetic example prices
prices = pd.read_csv(fundrisk / "examples" / "prices.csv", parse_dates=["date"])
json.dump({"dates": prices["date"].dt.strftime("%Y-%m-%d").tolist(),
           "series": {c: prices[c].round(2).tolist() for c in prices.columns if c != "date"}},
          open(out / "fundrisk.json", "w"), separators=(",", ":"))

# --- fund network (public FIPIRAN registry snapshot)
funds = flatten_funds(json.loads(snapshot.read_text(encoding="utf-8"))["items"])
funds = funds[funds["netAsset"].fillna(0) > 0].copy()
snap_date = str(pd.to_datetime(funds["date"]).max().date())
summary = {}
for role in ("manager", "guarantor"):
    table, hhi = manager_concentration(funds, role)
    has = funds[role].notna()
    summary[role] = {"firms": int(len(table)), "hhi": round(hhi), "top5": round(float(table["share"].head(5).sum()), 4),
                     # shares above are of the assets of funds that report this role; coverage says how much that is
                     "coverage_funds": int(has.sum()), "coverage_assets": round(float(funds.loc[has, "netAsset"].sum() / funds["netAsset"].sum()), 4),
                     "top": [{"name": n, "funds": int(r.funds), "share": round(float(r.share), 4)} for n, r in table.head(10).iterrows()]}
nodes = [{"id": f"f{i}", "type": "fund", "name": r["name"], "assets": float(r["netAsset"]), "guarantor": r["guarantor"]}
         for i, r in funds.reset_index(drop=True).iterrows()]
json.dump({"date": snap_date, "n_funds": int(len(funds)), "total_assets": float(funds["netAsset"].sum()),
           "summary": summary, "funds": [{"a": round(n["assets"] / 1e10), "g": n["guarantor"]} for n in nodes]},
          open(out / "funds.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
for f in ("thesis.json", "fundrisk.json", "funds.json"):
    print(f, f"{(out / f).stat().st_size/1024:.0f} KB")
