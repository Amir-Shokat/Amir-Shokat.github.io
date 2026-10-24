(async () => {
  const { colors, fmt, $, loadJSON, quantile, mean, std, bindRange, fail } = Site;

  // inverse standard normal (Acklam's approximation)
  function normInv(p) {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const q = Math.min(p, 1 - p);
    let x;
    if (q > 0.02425) { const r = q - 0.5, s = r * r; x = (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1); }
    else { const r = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
    return p < 0.5 ? x : -x;   // x is computed for the lower tail
  }
  const toReturns = (p) => p.slice(1).map((x, i) => x / p[i] - 1);

  function analyse(prices, market, rfAnnual, conf, periods = 252) {
    const r = toReturns(prices);
    const rf = Math.pow(1 + rfAnnual, 1 / periods) - 1;
    const ex = r.map((x) => x - rf);
    const annRet = Math.pow(prices[prices.length - 1] / prices[0], periods / r.length) - 1;
    const vol = std(r) * Math.sqrt(periods);
    const sharpe = mean(ex) / std(ex) * Math.sqrt(periods);
    const downside = Math.sqrt(mean(r.map((x) => Math.min(x - rf, 0) ** 2))) * Math.sqrt(periods);
    const sortino = mean(ex) * periods / downside;
    let peak = -Infinity, mdd = 0;
    prices.forEach((p) => { peak = Math.max(peak, p); mdd = Math.min(mdd, p / peak - 1); });
    const varH = -quantile(r, 1 - conf);
    const tail = r.filter((x) => x <= -varH);
    const es = -mean(tail);
    const varP = -(mean(r) + normInv(1 - conf) * std(r));
    let beta = null;
    if (market) {
      const m = toReturns(market), mm = mean(m), rm = mean(r);
      let cov = 0, vm = 0; m.forEach((x, i) => { cov += (x - mm) * (r[i] - rm); vm += (x - mm) ** 2; });
      beta = cov / vm;
    }
    return { r, annRet, vol, sharpe, sortino, mdd, varH, varP, es, beta };
  }

  let d;
  try { d = await loadJSON("/assets/data/fundrisk.json"); } catch (e) { fail($("#fund-demo"), e); return; }
  const names = { EQUITY_A: "Equity fund A (aggressive)", EQUITY_B: "Equity fund B (defensive)", EQUITY_C: "Equity fund C (bumpy, fat tails)",
    GOLD_FUND: "Gold fund", FIXED_INCOME_FUND: "Fixed-income fund", INDEX: "Stock market index" };
  const sel = $("#f-fund"), conf = $("#f-conf"), rf = $("#f-rf");
  sel.innerHTML = Object.keys(names).filter((k) => d.series[k]).map((k) => `<option value="${k}">${names[k]}</option>`).join("");
  bindRange(conf, $("#f-conf-out"), (x) => `${x}%`);
  bindRange(rf, $("#f-rf-out"), (x) => `${x}%`);
  let custom = null;

  const priceChart = new Chart($("#f-price"), {
    type: "line", data: { labels: [], datasets: [{ label: "Value of 100 invested", data: [], borderColor: colors.blue, borderWidth: 2, pointRadius: 0, fill: { target: "origin", above: "rgba(65,97,138,0.06)" } }] },
    options: { scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { title: { display: true, text: "Value" } } }, plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } } },
  });
  const histChart = new Chart($("#f-hist"), {
    type: "bar", data: { labels: [], datasets: [{ label: "Number of days", data: [], backgroundColor: [], barPercentage: 1, categoryPercentage: 1 }] },
    options: { scales: { x: { title: { display: true, text: "Daily return" }, ticks: { maxTicksLimit: 8 } }, y: { title: { display: true, text: "Days" } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => `Daily return around ${it[0].label}` } } } },
  });

  function update() {
    const c = +conf.value / 100, rfa = +rf.value / 100;
    const prices = custom ? custom.prices : d.series[sel.value];
    const market = custom || sel.value === "INDEX" ? null : d.series.INDEX;
    const a = analyse(prices, market, rfa, c);
    const label = custom ? "your prices" : names[sel.value].toLowerCase();
    $("#f-stats").innerHTML = [
      [fmt.pct(a.annRet), "Return per year", a.annRet >= rfa ? "good" : "bad"], [fmt.pct(a.vol), "Volatility per year", ""],
      [fmt.num(a.sharpe), "Sharpe ratio", a.sharpe > 0.5 ? "good" : a.sharpe < 0 ? "bad" : ""], [fmt.num(a.sortino), "Sortino ratio", ""],
      [a.beta === null ? "–" : fmt.num(a.beta), "Beta vs market", ""], [fmt.pct(a.mdd), "Worst fall from a peak", "bad"],
      [fmt.pct(a.varH, 2), `1-day VaR (${conf.value}%)`, ""], [fmt.pct(a.es, 2), "Expected shortfall", ""],
    ].map(([v, l, cl]) => `<div class="stat ${cl}"><b>${v}</b><span>${l}</span></div>`).join("");
    const base = prices[0];
    priceChart.data.labels = custom ? prices.map((_, i) => `Day ${i + 1}`) : d.dates;
    priceChart.data.datasets[0].data = prices.map((p) => (p / base) * 100);
    priceChart.update();
    const lo = Math.min(...a.r), hi = Math.max(...a.r), bins = 40, w = (hi - lo) / bins || 1e-6;
    const counts = Array(bins).fill(0);
    a.r.forEach((x) => { counts[Math.min(bins - 1, Math.floor((x - lo) / w))]++; });
    histChart.data.labels = counts.map((_, i) => fmt.pct(lo + (i + 0.5) * w, 1));
    histChart.data.datasets[0].data = counts;
    histChart.data.datasets[0].backgroundColor = counts.map((_, i) => (lo + (i + 1) * w <= -a.varH ? colors.clay : "rgba(65,97,138,0.55)"));
    histChart.update();
    const days = Math.round(1 / (1 - c));
    $("#f-read").innerHTML = `<strong>Reading it:</strong> for ${label}, on ${days - 1} days out of ${days} the daily loss shouldn't exceed <strong>${fmt.pct(a.varH, 2)}</strong> (orange bars are the days beyond that). On those worst days it lost <strong>${fmt.pct(a.es, 2)}</strong> on average. ` +
      `The normal-distribution estimate is ${fmt.pct(a.varP, 2)}${a.varH > a.varP * 1.1 ? ", lower than history: the bad days are worse than a bell curve predicts" : ""}. ` +
      (a.sharpe < 0 ? "Its return didn't beat the risk-free rate, so the Sharpe ratio is negative." : `A Sharpe ratio of ${fmt.num(a.sharpe)} means it earned ${fmt.num(a.sharpe)} units of extra return per unit of risk.`);
  }
  [sel, conf, rf].forEach((el) => el.addEventListener("input", () => { if (el === sel) custom = null; update(); }));
  $("#f-use").addEventListener("click", () => {
    const nums = $("#f-paste").value.split(/[\n;\t ]+/).map((x) => parseFloat(x.replace(/,/g, ""))).filter((x) => Number.isFinite(x) && x > 0);
    if (nums.length < 60) { $("#f-paste-msg").textContent = `Found ${nums.length} prices; please paste at least 60.`; return; }
    custom = { prices: nums }; $("#f-paste-msg").textContent = `Analysing ${nums.length} prices.`; update();
  });
  update();

  // ---------- bond calculator ----------
  const cpn = $("#b-cpn"), mat = $("#b-mat"), ytm = $("#b-ytm"), freq = $("#b-freq");
  bindRange(cpn, $("#b-cpn-out"), (x) => `${x}%`);
  bindRange(mat, $("#b-mat-out"), (x) => `${x} years`);
  bindRange(ytm, $("#b-ytm-out"), (x) => `${x}%`);
  const FACE = 1e6;
  function flows(c, T, f) {
    if (c === 0) return [[T, FACE]];
    const n = Math.max(1, Math.round(T * f)), out = [];
    for (let i = 1; i <= n; i++) out.push([i / f, FACE * c / f + (i === n ? FACE : 0)]);
    return out;
  }
  const price = (cf, y) => cf.reduce((s, [t, x]) => s + x / Math.pow(1 + y, t), 0);
  const bondChart = new Chart($("#b-chart"), {
    type: "line",
    data: { datasets: [
      { label: "Price", data: [], borderColor: colors.blue, borderWidth: 3, pointRadius: 0 },
      { label: "Duration estimate (straight line)", data: [], borderColor: colors.clay, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: "Today", data: [], type: "scatter", backgroundColor: colors.clay, pointRadius: 6 },
    ] },
    options: { parsing: false, scales: { x: { type: "linear", min: 1, max: 45, title: { display: true, text: "Market yield (%)" } }, y: { title: { display: true, text: "Price (% of face value)" } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}% at ${c.parsed.x}% yield` } } } },
  });
  function bond() {
    const c = +cpn.value / 100, T = +mat.value, f = +freq.value, y = +ytm.value / 100;
    const cf = flows(c, T, f), P = price(cf, y);
    const mac = cf.reduce((s, [t, x]) => s + t * x / Math.pow(1 + y, t), 0) / P;
    const mod = mac / (1 + y);
    const cvx = cf.reduce((s, [t, x]) => s + t * (t + 1) * x / Math.pow(1 + y, t), 0) / (P * (1 + y) ** 2);
    const up = price(cf, y + 0.01) / P - 1;
    $("#b-stats").innerHTML = [[Math.round(P).toLocaleString(), "Price (rials)"], [fmt.pct(P / FACE), "Price, % of face"], [fmt.num(mac), "Macaulay duration (years)"],
      [fmt.num(mod), "Modified duration"], [fmt.num(cvx, 1), "Convexity"], [fmt.pct(up, 2), "If yields rise 1 point"]]
      .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
    const ys = Array.from({ length: 89 }, (_, i) => 1 + i * 0.5);
    bondChart.data.datasets[0].data = ys.map((x) => ({ x, y: price(cf, x / 100) / FACE * 100 }));
    bondChart.data.datasets[1].data = ys.map((x) => ({ x, y: (P / FACE * 100) * (1 - mod * (x / 100 - y)) }));
    bondChart.data.datasets[2].data = [{ x: y * 100, y: P / FACE * 100 }];
    bondChart.update();
  }
  [cpn, mat, ytm, freq].forEach((el) => el.addEventListener("input", bond));
  bond();
})();
