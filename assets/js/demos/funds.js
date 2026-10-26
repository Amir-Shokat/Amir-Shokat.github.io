(async () => {
  const { colors, fmt, $, $$, loadJSON, bindRange, fail } = Site;
  let d;
  try { d = await loadJSON("/assets/data/funds.json"); } catch (e) { fail($("#map-demo"), e); fail($("#stress-demo"), e); return; }
  const when = new Date(d.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const bars = new Chart($("#n-bars"), {
    type: "bar",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 5 }] },
    options: { indexAxis: "y", scales: { x: { ticks: { callback: (v) => `${v}%` }, title: { display: true, text: "Share of assets" } }, y: { ticks: { font: { size: 12 } } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const r = c.dataset.rows[c.dataIndex]; return `${c.parsed.x.toFixed(1)}% of assets · ${r.funds} fund${r.funds > 1 ? "s" : ""}`; } } } } },
  });
  function show(role) {
    const s = d.summary[role];
    bars.data.labels = s.top.map((r) => r.name);
    bars.data.datasets[0].data = s.top.map((r) => r.share * 100);
    bars.data.datasets[0].rows = s.top;
    bars.data.datasets[0].backgroundColor = s.top.map((_, i) => (i < 5 ? (role === "guarantor" ? colors.clay : colors.blue) : colors.sand));
    bars.update();
    const scope = role === "guarantor" ? "guaranteed assets" : "all fund assets";
    bars.options.scales.x.title.text = `Share of ${scope}`;
    $("#n-stats").innerHTML = [[String(s.firms), role === "guarantor" ? "Guarantors" : "Managers"],
      [`${s.coverage_funds} of ${d.n_funds}`, role === "guarantor" ? "Funds with a guarantor" : "Funds with a manager"],
      [fmt.pct(s.top5, 0), `Of ${scope} with the top 5`], [s.hhi.toLocaleString(), "Concentration (HHI)"]]
      .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
    $("#n-note").textContent = (role === "guarantor" ? `Only ${s.coverage_funds} funds, holding ${fmt.pct(s.coverage_assets, 0)} of all fund assets, report a liquidity guarantor; shares are of those funds' assets. ` : "") +
      `FIPIRAN registry, ${when}. HHI is the standard concentration score used by competition authorities: below 1,000 is unconcentrated, above 1,800 highly concentrated. The top five are highlighted.`;
    $$("#n-role button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === role)));
  }
  $$("#n-role button").forEach((b) => b.addEventListener("click", () => show(b.dataset.v)));
  show("manager");

  // stress test: share of assets and funds backed by the k largest guarantors
  const totals = {};
  d.funds.forEach((f) => { if (!f.g) return; totals[f.g] = totals[f.g] || { a: 0, n: 0 }; totals[f.g].a += f.a; totals[f.g].n += 1; });
  const ranked = Object.entries(totals).sort((a, b) => b[1].a - a[1].a);
  const all = d.funds.reduce((s, f) => s + f.a, 0);
  const guaranteed = d.funds.filter((f) => f.g).reduce((s, f) => s + f.a, 0);
  const cum = []; let acc = 0, accN = 0;
  ranked.forEach(([, v]) => { acc += v.a; accN += v.n; cum.push({ share: acc / guaranteed, shareAll: acc / all, funds: accN }); });
  const k = $("#n-k");
  bindRange(k, $("#n-k-out"), (x) => `${x}`);
  const curve = new Chart($("#n-curve"), {
    type: "bar",
    data: { labels: cum.slice(0, 10).map((_, i) => `Top ${i + 1}`), datasets: [{ data: cum.slice(0, 10).map((c) => c.share * 100), backgroundColor: [], borderRadius: 5 }] },
    options: { scales: { y: { max: 100, ticks: { callback: (v) => `${v}%` }, title: { display: true, text: "Guaranteed assets affected" } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y.toFixed(1)}% of guaranteed assets` } } } },
  });
  function stress() {
    const n = +k.value, c = cum[n - 1];
    curve.data.datasets[0].backgroundColor = cum.slice(0, 10).map((_, i) => (i < n ? colors.clay : colors.sand));
    curve.update();
    $("#n-stress").innerHTML = [[fmt.pct(c.share, 0), "Of guaranteed assets affected"], [fmt.pct(c.shareAll, 1), "Of all fund assets"], [String(c.funds), "Funds affected"]]
      .map(([v, l]) => `<div class="stat bad"><b>${v}</b><span>${l}</span></div>`).join("");
    $("#n-read").innerHTML = `<strong>Reading it:</strong> if the ${n === 1 ? "single largest guarantor" : `${n} largest guarantors`} could not meet redemptions, <strong>${fmt.pct(c.share, 0)}</strong> of all guaranteed fund money would be affected (${fmt.pct(c.shareAll, 1)} of the whole fund market), spread over just ${c.funds} funds. A few large funds carry most of that risk.`;
  }
  k.addEventListener("input", stress);
  stress();
})();
