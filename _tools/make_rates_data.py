"""Data for the yield-curve demo: ECB curve PCA + daily bp changes for in-browser VaR.

    PYTHONPATH=../yield-curve-pca-var/src python _tools/make_rates_data.py
"""
import json
import sys
from pathlib import Path

import numpy as np

from rate_risk import RatePCA, fetch_ecb_curve, remove_reversal_spikes, to_bp_changes

out = Path(__file__).resolve().parents[1] / "assets" / "data" / "rates.json"
levels, _ = remove_reversal_spikes(fetch_ecb_curve("2004-09-06"))
changes = to_bp_changes(levels)
pca = RatePCA(n_components=3).fit(changes)
mats = [int(c[:-1]) for c in changes.columns]
last = levels.iloc[-1]
data = {
    "source": "ECB, euro-area AAA government spot curve",
    "start": str(changes.index[0].date()), "end": str(changes.index[-1].date()),
    "maturities": mats,
    "loadings": pca.loadings_.round(4).T.values.tolist(),          # 3 x n
    "factor_std": pca.factor_std_.round(3).tolist(),
    "explained": pca.explained_variance_ratio_.round(4).tolist(),
    "latest_curve": {"date": str(levels.index[-1].date()), "rates": last.round(3).tolist()},
    "curve_2008": levels.loc["2008-07-01":"2008-07-10"].iloc[0].round(3).tolist(),
    "curve_2021": levels.loc["2021-07-01":"2021-07-10"].iloc[0].round(3).tolist(),
    # daily changes in tenths of a basis point (integers keep the file small)
    "changes_dbp": np.rint(changes.to_numpy() * 10).astype(int).tolist(),
}
out.write_text(json.dumps(data, separators=(",", ":")))
print(out, f"{out.stat().st_size/1024:.0f} KB", len(changes), "days")
