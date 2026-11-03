(async () => {
  const { colors, fmt, $, $$, loadJSON, fail } = Site;
  const demos = ["#market-demo", "#flow-demo", "#mgr-demo", "#mix-demo", "#fund-demo", "#rank-demo", "#etf-demo", "#own-demo"];
  let d;
  try { d = await loadJSON("/assets/data/market/overview.json"); } catch (e) { demos.forEach((s) => fail($(s), e)); return; }

  // fixed colours per fund type, so a type looks the same in every chart
  const palette = [colors.blue, "#c9a23f", colors.sand, colors.clay, colors.plum, colors.sage, "#4f9a9a", "#8a6d55"];
  const main = d.types.slice(0, 7);
  const typeColor = (t) => (main.includes(t) ? palette[main.indexOf(t)] : "#9aa0a8");
  const group = (t) => (main.includes(t) ? t : "Other");
  const groups = [...main, "Other"];
  const sumGroups = (obj, n) => Object.fromEntries(groups.map((g) => [g, Array.from({ length: n }, (_, i) =>
    Object.entries(obj).filter(([t]) => group(t) === g).reduce((s, [, v]) => s + (v[i] || 0), 0))]));
  const day = (s) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  // short histories get day labels, longer ones month labels
  const month = (s) => new Date(s).toLocaleDateString("en-GB", d.dates.length < 70 ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
  const T = (x, dp = 0) => `${fmt.num(x, dp)} T`;
  const stat = ([v, l, cls = ""]) => `<div class="stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
  const pressed = (sel, v) => $$(`${sel} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  const timeX = (labels) => ({ ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0, callback: (_, i) => month(labels[i]) }, grid: { display: false } });
  const n = d.dates.length;
  $("#m-asof").innerHTML = `<strong>Data through ${day(d.asof)}</strong>, collected since ${day(d.start)}: ${d.funds.length} funds, ${n} days. Updated weekly, so the history grows each week.`;

  // ---------------------------------------------------------------- market size
  const aum = sumGroups(d.aum, n);
  const total = d.dates.map((_, i) => groups.reduce((s, g) => s + aum[g][i], 0));
  const flowAll = Object.values(d.flows).flat().reduce((s, x) => s + x, 0);
  $("#m-stats").innerHTML = [[T(total[n - 1]), "Total fund assets"], [String(d.count[n - 1]), "Funds reporting"],
    [fmt.pct(total[n - 1] / total[0] - 1, 1), `Growth since ${day(d.start)}`, total[n - 1] >= total[0] ? "good" : "bad"], [T(flowAll), "Net new money in that time"]].map(stat).join("");
  const aumChart = new Chart($("#m-aum"), {
    type: "line",
    data: { labels: d.dates, datasets: groups.map((g) => ({ label: g, data: aum[g], fill: true, backgroundColor: typeColor(g) + "cc", borderColor: typeColor(g), borderWidth: 1, pointRadius: 0, tension: 0.2 })) },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: timeX(d.dates), y: { stacked: true, beginAtZero: true, ticks: {} } },
      plugins: { legend: { position: "bottom" }, tooltip: { itemSort: (a, b) => b.parsed.y - a.parsed.y, callbacks: { title: (c) => day(c[0].label) } } } },
  });
  function scale(v) {
    aumChart.data.datasets.forEach((ds) => { const g = ds.label; ds.data = v === "pct" ? aum[g].map((x, i) => (100 * x) / total[i]) : aum[g]; });
    aumChart.options.scales.y.max = v === "pct" ? 100 : undefined;
    aumChart.options.scales.y.ticks.callback = (x) => (v === "pct" ? `${x}%` : `${x.toLocaleString()} T`);
    aumChart.options.plugins.tooltip.callbacks.label = (c) => `${c.dataset.label}: ${v === "pct" ? c.parsed.y.toFixed(1) + "%" : T(c.parsed.y)}`;
    aumChart.update(); pressed("#m-scale", v);
  }
  $$("#m-scale button").forEach((b) => b.addEventListener("click", () => scale(b.dataset.v)));
  scale("abs");

  // ---------------------------------------------------------------- flows
  const flows = sumGroups(d.flows, d.weeks.length);
  const flowChart = new Chart($("#f-bars"), {
    type: "bar", data: { labels: [], datasets: groups.map((g) => ({ label: g, data: [], backgroundColor: typeColor(g) })) },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: { stacked: true, ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { stacked: true, ticks: { callback: (x) => `${x} T` }, title: { display: true, text: "Net flow per week" } } },
      plugins: { legend: { position: "bottom" }, tooltip: { filter: (c) => Math.abs(c.parsed.y) >= 0.05, callbacks: { title: (c) => `Week to ${day(d.weeks[c[0].dataIndex + flowChart.$from])}`, label: (c) => `${c.dataset.label}: ${fmt.signed(c.parsed.y, 1)} T` } } } },
  });
  function range(v) {
    const k = Number(v), from = k ? d.weeks.length - k : 0;
    flowChart.$from = from;
    flowChart.data.labels = d.weeks.slice(from).map(month);
    flowChart.data.datasets.forEach((ds) => { ds.data = flows[ds.label].slice(from); });
    flowChart.update(); pressed("#f-range", v);
    const sums = groups.map((g) => [g, flows[g].slice(from).reduce((s, x) => s + x, 0)]).sort((a, b) => b[1] - a[1]);
    const net = sums.reduce((s, [, x]) => s + x, 0);
    $("#f-stats").innerHTML = [[`${fmt.signed(net, 0)} T`, "Net new money"], ...sums.slice(0, 2).map(([g, x]) => [`${fmt.signed(x, 0)} T`, `Into ${g.toLowerCase()}`, "good"]),
      [`${fmt.signed(sums[sums.length - 1][1], 0)} T`, `${sums[sums.length - 1][0]}`, sums[sums.length - 1][1] < 0 ? "bad" : ""]].map(stat).join("");
  }
  $$("#f-range button").forEach((b) => b.addEventListener("click", () => range(b.dataset.v)));
  range("0");

  // ---------------------------------------------------------------- managers
  const mgrChart = new Chart($("#g-bars"), {
    type: "bar", data: { labels: d.managers.map((m) => m.name), datasets: [{ data: [], backgroundColor: [], borderRadius: 5 }] },
    options: { indexAxis: "y", scales: { x: { ticks: {} }, y: { ticks: { font: { size: 12 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: {} } } },
  });
  const metrics = {
    share: { v: (m) => m.share * 100, t: (x) => `${x.toFixed(1)}%`, axis: "Share of all fund assets" },
    growth: { v: (m) => (m.growth ?? 0) * 100, t: (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`, axis: `Growth in assets since ${day(d.start)}` },
    flow: { v: (m) => m.flow, t: (x) => `${fmt.signed(x, 1)} T`, axis: "Net new money (trillion tomans)" },
  };
  function showMgr(k) {
    const m = metrics[k];
    mgrChart.data.datasets[0].data = d.managers.map(m.v);
    mgrChart.data.datasets[0].backgroundColor = d.managers.map((r) => (m.v(r) < 0 ? colors.clay : colors.blue));
    mgrChart.options.scales.x.ticks.callback = m.t;
    mgrChart.options.scales.x.title = { display: true, text: m.axis };
    mgrChart.options.plugins.tooltip.callbacks.label = (c) => { const r = d.managers[c.dataIndex]; return [`${m.t(c.parsed.x)}`, `${T(r.aum)} in ${r.funds} funds`]; };
    mgrChart.update(); pressed("#g-metric", k);
  }
  $$("#g-metric button").forEach((b) => b.addEventListener("click", () => showMgr(b.dataset.v)));
  showMgr("share");
  const top5 = d.managers.slice(0, 5).reduce((s, m) => s + m.share, 0);
  $("#g-note").textContent = `${d.n_managers} firms manage funds. The five largest hold ${fmt.pct(top5, 0)} of all assets. Concentration (HHI) went from ${d.hhi[0]} to ${d.hhi[n - 1]}; below 1,000 still counts as unconcentrated, but the trend is up.`;

  // ---------------------------------------------------------------- asset mix
  const mixKeys = [["stock", "Stocks", colors.blue], ["bond", "Bonds", colors.sage], ["deposit", "Bank deposits", colors.sand], ["cash", "Cash", "#9aa0a8"],
    ["commodity", "Commodities", "#c9a23f"], ["fundUnit", "Other funds", colors.plum], ["other", "Other", colors.clay]];
  const mixSel = $("#x-group");
  mixSel.innerHTML = Object.keys(d.mix).map((g) => `<option>${g}</option>`).join("");
  const mixArea = (canvas, labels) => new Chart(canvas, {
    type: "line", data: { labels, datasets: mixKeys.map(([, l, c]) => ({ label: l, data: [], fill: true, backgroundColor: c + "cc", borderColor: c, borderWidth: 1, pointRadius: 0, tension: 0.2 })) },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: timeX(labels), y: { stacked: true, min: 0, max: 100, ticks: { callback: (x) => `${x}%` } } },
      plugins: { legend: { position: "bottom" }, tooltip: { filter: (c) => c.parsed.y >= 0.5, callbacks: { title: (c) => `Week to ${day(c[0].label)}`, label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } },
  });
  const mixChart = mixArea($("#x-area"), d.mix_weeks);
  function showMix() {
    const rows = d.mix[mixSel.value];
    mixChart.data.datasets.forEach((ds, i) => { ds.data = rows.map((r) => (r ? 100 * r[mixKeys[i][0]] : null)); });
    mixChart.update();
  }
  mixSel.addEventListener("change", showMix); showMix();

  // ---------------------------------------------------------------- fund explorer
  const typeOpts = (all) => `<option value="">${all}</option>` + d.types.map((t) => `<option>${t}</option>`).join("");
  const eType = $("#e-type"), eFund = $("#e-fund");
  eType.innerHTML = typeOpts("All types");
  const live = d.funds.filter((f) => f.live);
  function fillFunds(keep) {
    const list = live.filter((f) => !eType.value || f.type === eType.value);
    eFund.innerHTML = list.map((f) => `<option value="${f.id}">${f.name} · ${f.type}${f.etf ? " · ETF" : ""} · ${T(f.aum, 1)}</option>`).join("");
    $("#e-count").textContent = `${list.length} funds, largest first`;
    if (keep && list.some((f) => String(f.id) === keep)) eFund.value = keep;
  }
  const navChart = new Chart($("#e-nav"), {
    type: "line", data: { labels: [], datasets: [{ label: "Fund", data: [], borderColor: colors.blue, borderWidth: 2, pointRadius: 0 }, { label: "Stock index (TEDPIX)", data: [], borderColor: colors.sand, borderWidth: 1.5, pointRadius: 0 }] },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { title: { display: true, text: "Growth of 100" } } },
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } } } },
  });
  const flowFund = new Chart($("#e-flow"), {
    type: "bar", data: { labels: [], datasets: [{ type: "line", label: "Fund size", data: [], yAxisID: "y1", borderColor: colors.blue, borderWidth: 2, pointRadius: 0 }, { label: "Weekly net flow", data: [], backgroundColor: [] }] },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { callback: (x) => `${x} T` }, title: { display: true, text: "Net flow" } }, y1: { position: "right", grid: { display: false }, ticks: { callback: (x) => `${x} T` }, title: { display: true, text: "Size" } } },
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.num(c.parsed.y, 2)} T` } } } },
  });
  const mixFund = mixArea($("#e-mix"), []);
  const premChart = new Chart($("#e-prem"), {
    type: "line", data: { labels: [], datasets: [{ label: "Premium over NAV", data: [], borderColor: colors.clay, borderWidth: 1.5, pointRadius: 0, fill: { target: "origin", above: colors.clay + "33", below: colors.sage + "44" } }] },
    options: { scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { callback: (x) => `${x}%` }, title: { display: true, text: "Price vs NAV" } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${fmt.signed(c.parsed.y, 2)}% vs NAV` } } } },
  });
  const kindColors = [colors.sand, colors.plum, colors.clay, colors.blue, "#4f9a9a", colors.sage, "#c9a23f", "#8a6d55", "#5f7fa8", "#b07aa1", "#d8d2c4"];
  const holdChart = new Chart($("#e-hold"), {
    type: "line", data: { labels: [], datasets: [] },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { stacked: true, min: 0, max: 100, ticks: { callback: (x) => `${x}%` }, title: { display: true, text: "Owned by" } } },
      plugins: { legend: { position: "bottom" }, tooltip: { filter: (c) => c.parsed.y >= 0.5, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } },
  });
  const cache = {};
  async function showFund() {
    const f = d.funds.find((x) => String(x.id) === eFund.value);
    if (!f) return;
    let s;
    try { s = cache[f.id] || (cache[f.id] = await loadJSON(`/assets/data/market/fund/${f.id}.json`)); } catch (e) { $("#e-note").textContent = e.message; return; }
    const pct = (x) => (x == null ? "–" : fmt.pct(x, 1));
    const sgn = (x) => (x == null ? "" : x >= 0 ? "good" : "bad");
    $("#e-stats").innerHTML = [[T(f.aum, 1), "Size"], [pct(f.rall), `Since ${day(s.d[0])}`, sgn(f.rall)], [pct(f.r1m), "1 month", sgn(f.r1m)], [pct(f.r3m), "3 months", sgn(f.r3m)], [pct(f.r1y), "12 months", sgn(f.r1y)],
      [pct(f.vol), "Volatility (yearly)"], [pct(f.var), "1-day VaR 95%"], [pct(f.es), "Expected shortfall"], [pct(f.mdd), "Worst fall (12m)"],
      [f.sharpe == null ? "–" : f.sharpe.toFixed(2), "Sharpe ratio"], [f.beta == null ? "–" : f.beta.toFixed(2), "Beta to index"], [`${fmt.signed(f.flow3m, 2)} T`, "Net flow, last 3 months"]].filter(([v]) => v !== "–").map(stat).join("");
    const i0 = d.dates.indexOf(s.d[0]);
    const base = d.index[i0] || 1;
    const idxMap = Object.fromEntries(d.dates.map((x, i) => [x, d.index[i]]));
    navChart.data.labels = s.d.map(month);
    navChart.data.datasets[0].data = s.nav.map((v) => 100 * v / s.nav[0]);
    navChart.data.datasets[1].data = s.d.map((x) => (idxMap[x] ? 100 * idxMap[x] / base : null));
    navChart.update();
    flowFund.data.labels = s.w.map(month);
    const wAum = s.w.map((w) => { let a = null; s.d.forEach((x, i) => { if (x <= w) a = s.aum[i]; }); return a; });
    flowFund.data.datasets[0].data = wAum;
    flowFund.data.datasets[1].data = s.flow;
    flowFund.data.datasets[1].backgroundColor = s.flow.map((x) => (x < 0 ? colors.clay : colors.sage));
    flowFund.update();
    mixFund.data.labels = s.w;
    mixFund.options.scales.x = timeX(s.w);
    mixFund.data.datasets.forEach((ds, i) => { ds.data = s.mix[mixKeys[i][0]].map((x) => (x == null ? null : 100 * x)); });
    mixFund.update();
    const etf = Boolean(s.prem || s.hold);
    $("#e-etf").hidden = !etf;
    if (s.prem) { premChart.data.labels = s.d.map(month); premChart.data.datasets[0].data = s.prem.map((x) => (x == null ? null : 100 * x)); premChart.update(); }
    if (s.hold) {
      holdChart.data.labels = s.hw.map(month);
      holdChart.data.datasets = Object.entries(s.hold).map(([k, v]) => { const c = kindColors[d.holders.kinds.indexOf(k)]; return { label: k, data: v.map((x) => 100 * x), fill: true, backgroundColor: c + "cc", borderColor: c, borderWidth: 1, pointRadius: 0 }; });
      holdChart.update();
    }
    $("#e-note").textContent = `Managed by ${f.mgr || "an unnamed manager"}. Returns come from the daily change in the fund's redemption price, with payouts added back. ` +
      (f.vol == null ? `Risk measures appear once the fund has about ${d.min_days} days of data. ` : f.sharpe == null ? "Sharpe and beta are left out for funds whose value hardly moves. " : `Sharpe uses the median fixed-income fund return (${fmt.pct(d.rf, 1)} a year) as the safe rate. `) +
      (etf ? "For ETFs the last two charts show the price gap to NAV and who owns the units (holders with at least 1%)." : "");
  }
  eType.addEventListener("change", () => { fillFunds(eFund.value); showFund(); });
  eFund.addEventListener("change", showFund);
  const openFund = (id) => { eType.value = ""; fillFunds(String(id)); eFund.value = String(id); showFund(); $("#explorer").scrollIntoView({ behavior: "smooth" }); };
  fillFunds(); showFund();

  // ---------------------------------------------------------------- rankings
  const rType = $("#r-type");
  rType.innerHTML = typeOpts("All types");
  const cols = [["name", "Fund", null], ["aum", "Size", (x) => T(x, 1)], ["rall", "Since start", (x) => fmt.pct(x, 1)], ["r3m", "3 m", (x) => fmt.pct(x, 1)], ["r1y", "12 m", (x) => fmt.pct(x, 1)],
    ["vol", "Volatility", (x) => fmt.pct(x, 1)], ["var", "VaR 95%", (x) => fmt.pct(x, 2)], ["sharpe", "Sharpe", (x) => x.toFixed(2)], ["flow3m", "Flow 3 m", (x) => `${fmt.signed(x, 2)} T`]];
  let sortKey = "aum", desc = true;
  function table() {
    const rows = live.filter((f) => !rType.value || f.type === rType.value)
      .sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return typeof x === "string" ? x.localeCompare(y) * (desc ? -1 : 1) : (desc ? y - x : x - y); })
      .slice(0, 25);
    const shown = cols.filter(([k]) => k === "name" || rows.some((f) => f[k] != null));   // columns fill in as history grows
    $("#r-table").innerHTML = `<thead><tr>${shown.map(([k, l]) => `<th class="${k === "name" ? "" : "num"}"><button type="button" class="sort" data-k="${k}" style="all:unset;cursor:pointer">${l}${k === sortKey ? (desc ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((f) => `<tr>${shown.map(([k, , fm]) => k === "name" ? `<td dir="auto"><a href="#explorer" data-id="${f.id}">${f.name}</a></td>` : `<td class="num">${f[k] == null ? "–" : fm(f[k])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    $$("#r-table .sort").forEach((b) => b.addEventListener("click", () => { desc = b.dataset.k === sortKey ? !desc : b.dataset.k !== "name"; sortKey = b.dataset.k; table(); }));
    $$("#r-table a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openFund(a.dataset.id); }));
  }
  rType.addEventListener("change", table); table();
  $("#r-note").textContent = `Top 25 by the chosen column; click a header to sort, a fund to open it above. "Since start" is the return since ${day(d.start)}, payouts included. Longer returns and risk measures fill in as weeks of data are added; VaR is the daily loss exceeded on one day in twenty.`;

  // ---------------------------------------------------------------- ETF premiums
  const etfs = live.filter((f) => f.etf && f.prem != null && f.aum >= 1).sort((a, b) => b.prem - a.prem);
  const ends = [...etfs.slice(0, 8), ...etfs.slice(-8)];
  const premBars = new Chart($("#p-bars"), {
    type: "bar", data: { labels: ends.map((f) => f.name), datasets: [{ data: ends.map((f) => 100 * f.prem), backgroundColor: ends.map((f) => (f.prem >= 0 ? colors.clay : colors.sage)), borderRadius: 4 }] },
    options: { indexAxis: "y", onClick: (_, el) => el.length && openFund(ends[el[0].index].id), scales: { x: { ticks: { callback: (x) => `${x}%` }, title: { display: true, text: "Price above (+) or below (−) NAV" } }, y: { ticks: { font: { size: 12 } } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const f = ends[c.dataIndex]; return [`${fmt.signed(c.parsed.x, 2)}% vs NAV`, `${f.type} · ${T(f.aum, 1)}`]; } } } } },
  });
  void premBars;

  // ---------------------------------------------------------------- ETF owners
  const h = d.holders;
  if (!h.weeks.length) { $("#o-area").parentElement.innerHTML = `<p class="demo-note">No shareholder lists collected yet; they are added with each weekly update.</p>`; $("#o-note").textContent = ""; Site.retheme(); return; }
  new Chart($("#o-area"), {
    type: "line", data: { labels: h.weeks, datasets: h.kinds.map((k, i) => ({ label: k, data: h.share[k].map((x) => 100 * x), fill: true, backgroundColor: kindColors[i] + "cc", borderColor: kindColors[i], borderWidth: 1, pointRadius: 0, tension: 0.2 })) },
    options: { interaction: { mode: "index", intersect: false }, scales: { x: timeX(h.weeks), y: { stacked: true, min: 0, max: 100, ticks: { callback: (x) => `${x}%` } } },
      plugins: { legend: { position: "bottom" }, tooltip: { filter: (c) => c.parsed.y >= 0.3, callbacks: { title: (c) => `Week to ${day(c[0].label)}`, label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } },
  });
  const last = (k) => h.share[k][h.share[k].length - 1];
  $("#o-note").textContent = `${h.n_etfs} ETFs, each weighted by its size. "ETF reserve" is units the fund has created but not yet sold, held in the fund's own account. "Small holders" is everyone below the 1% disclosure line: ${fmt.pct(last("Small holders (<1%)"), 0)} of the market. Individuals who cross 1% are rare (${fmt.pct(last("Individuals"), 1)}).`;
  Site.retheme();
})();
