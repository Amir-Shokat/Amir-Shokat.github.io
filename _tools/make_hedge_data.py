"""Data for the Bitcoin-vs-gold demo: weekly series, regression estimates and shock-day averages.

    PYTHONPATH=../bitcoin-gold-geopolitical-risk/src python _tools/make_hedge_data.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from geo_hedge.data import build_dataset, fetch_gpr
from geo_hedge.models import CONTROLS, fit

out = Path(__file__).resolve().parents[1] / "assets" / "data" / "hedge.json"
START, END = "2014-09-17", "2024-12-31"
df = build_dataset(START, END)
base = ["d_log_gpr", *CONTROLS]
specs = {
    "Full sample, 2014-2024": (df, base),
    "2014-2019": (df.loc[:"2019-06-30"], base),
    "2019-2024": (df.loc["2019-07-01":], base),
    "Biggest 10% GPR jumps": (df[df["d_log_gpr"] >= df["d_log_gpr"].quantile(0.9)], base),
}
estimates = []
for label, (frame, regs) in specs.items():
    for asset, dep in (("Gold", "gold_ret"), ("Bitcoin", "btc_ret")):
        res, _ = fit(frame, dep, regs)
        # effect of a 10% jump in the GPR index, in percent return
        b, se = res.params["d_log_gpr"], res.bse["d_log_gpr"]
        estimates.append({"spec": label, "asset": asset, "effect": round(float(b * 0.1), 4),
                          "low": round(float((b - 1.96 * se) * 0.1), 4), "high": round(float((b + 1.96 * se) * 0.1), 4),
                          "p": round(float(res.pvalues["d_log_gpr"]), 3)})
lag, _ = fit(df, "gold_ret", ["d_log_gpr", "d_log_gpr_lag1", *CONTROLS])

shock = df["d_log_gpr"] >= df["d_log_gpr"].quantile(0.9)
def avg(col, mask):
    x = df.loc[mask, col].dropna()
    return {"mean": round(float(x.mean()), 3), "se": round(float(x.std() / np.sqrt(len(x))), 3), "n": int(len(x))}
shock_days = {a: {"shock": avg(c, shock), "normal": avg(c, ~shock)} for a, c in (("Gold", "gold_ret"), ("Bitcoin", "btc_ret"))}

gpr = fetch_gpr().loc[START:END]
weekly = pd.DataFrame({
    "gpr": gpr.rolling(30).mean().resample("W-FRI").last(),
    "gold": (df["gold_ret"].fillna(0).cumsum() / 100).resample("W-FRI").last(),
    "btc": (df["btc_ret"].fillna(0).cumsum() / 100).resample("W-FRI").last(),
}).dropna()
data = {
    "sample": f"{df.index[0].date()} to {df.index[-1].date()}", "days": int(len(df)),
    "weeks": [d.strftime("%Y-%m-%d") for d in weekly.index],
    "gpr": weekly["gpr"].round(1).tolist(),
    "gold": (100 * np.exp(weekly["gold"])).round(1).tolist(),
    "btc": (100 * np.exp(weekly["btc"])).round(1).tolist(),
    "estimates": estimates,
    "gold_lag": {"effect": round(float(lag.params["d_log_gpr_lag1"] * 0.1), 4), "p": round(float(lag.pvalues["d_log_gpr_lag1"]), 3)},
    "shock_days": shock_days,
}
out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
print(out, f"{out.stat().st_size/1024:.0f} KB")
print(json.dumps({"estimates": estimates[:4], "lag": data["gold_lag"], "shock": shock_days}, indent=1))
