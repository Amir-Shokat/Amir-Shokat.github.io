(async () => {
  const { colors, fmt, $, $$, loadJSON, fail } = Site;
  let d;
  try { d = await loadJSON("/assets/data/hedge.json"); } catch (e) { ["#timeline-demo", "#results-demo", "#shock-demo"].forEach((s) => fail($(s), e)); return; }

  // ---------- timeline ----------
  const events = [
    ["2015-11-13", "Paris attacks"], ["2017-08-11", "US-North Korea tensions"], ["2020-01-03", "US-Iran escalation"],
    ["2022-02-24", "Russia invades Ukraine"], ["2023-10-07", "War in Gaza begins"],
  ];
  const ts = d.weeks.map((w) => new Date(w).getTime());
  const nearest = (date) => { const t = new Date(date).getTime(); let best = 0; ts.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(ts[best] - t)) best = i; }); return best; };
  const timeline = new Chart($("#h-timeline"), {
    type: "line",
    data: { datasets: [
      { label: "Gold", data: ts.map((x, i) => ({ x, y: d.gold[i] })), borderColor: "#c9a227", borderWidth: 2, pointRadius: 0, yAxisID: "y" },
      { label: "Bitcoin", data: ts.map((x, i) => ({ x, y: d.btc[i] })), borderColor: colors.blue, borderWidth: 2, pointRadius: 0, yAxisID: "y" },
      { label: "Geopolitical risk", data: ts.map((x, i) => ({ x, y: d.gpr[i] })), borderColor: "rgba(122,114,102,0.5)", backgroundColor: "rgba(180,168,146,0.22)", fill: true, borderWidth: 1, pointRadius: 0, yAxisID: "y2" },
      { label: "Events", type: "scatter", data: events.map(([day, name]) => { const i = nearest(day); return { x: ts[i], y: d.gpr[i], name }; }), backgroundColor: colors.clay, pointRadius: 6, pointHoverRadius: 8, yAxisID: "y2" },
    ] },
    options: {
      parsing: false, interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", ticks: { callback: (v) => new Date(v).getFullYear(), maxTicksLimit: 11 } },
        y: { type: "logarithmic", position: "left", title: { display: true, text: "Growth of €100 (log)" }, ticks: { callback: (v) => [100, 300, 1000, 3000, 10000, 30000].includes(v) ? `€${v.toLocaleString()}` : "" } },
        y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "GPR index" } },
      },
      plugins: { tooltip: { callbacks: {
        title: (it) => new Date(it[0].parsed.x).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        label: (c) => c.dataset.label === "Events" ? `⚑ ${c.raw.name}` : c.dataset.label === "Geopolitical risk" ? `GPR index: ${c.parsed.y.toFixed(0)}` : `${c.dataset.label}: €${fmt.num(c.parsed.y, 0)}`,
      } } },
    },
  });
  $$("#h-show button").forEach((b) => b.addEventListener("click", () => {
    $$("#h-show button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    timeline.data.datasets[0].hidden = b.dataset.v === "btc";
    timeline.data.datasets[1].hidden = b.dataset.v === "gold";
    timeline.update();
  }));

  // ---------- result explorer ----------
  const specs = [...new Set(d.estimates.map((e) => e.spec))];
  $("#h-spec").innerHTML = specs.map((s, i) => `<button type="button" data-v="${s}" aria-pressed="${i === 0}">${s}</button>`).join("");
  const errorBars = { id: "errorBars", afterDatasetsDraw(chart) {
    const { ctx, scales } = chart; const meta = chart.getDatasetMeta(0);
    ctx.save(); ctx.strokeStyle = colors.text; ctx.lineWidth = 1.5;
    chart.data.datasets[0].ci.forEach(([lo, hi], i) => {
      const y = meta.data[i].y, x1 = scales.x.getPixelForValue(lo), x2 = scales.x.getPixelForValue(hi);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6); ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6); ctx.stroke();
    });
    ctx.restore();
  } };
  const eff = new Chart($("#h-effects"), {
    type: "bar",
    data: { labels: ["Gold", "Bitcoin"], datasets: [{ data: [0, 0], ci: [[0, 0], [0, 0]], backgroundColor: ["#c9a227", colors.blue], borderRadius: 6, barThickness: 26 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${fmt.signed(c.parsed.x, 3)}% return (95% range ${c.dataset.ci[c.dataIndex].map((v) => v.toFixed(3)).join(" to ")})` } } },
      scales: { x: { title: { display: true, text: "Change in daily return (%)" } } } },
    plugins: [errorBars],
  });
  function showSpec(spec) {
    const rows = ["Gold", "Bitcoin"].map((a) => d.estimates.find((e) => e.spec === spec && e.asset === a));
    eff.data.datasets[0].data = rows.map((r) => r.effect);
    eff.data.datasets[0].ci = rows.map((r) => [r.low, r.high]);
    const span = Math.max(...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high)))) * 1.15;
    eff.options.scales.x.min = -span; eff.options.scales.x.max = span;
    eff.update();
    const sig = rows.filter((r) => r.p < 0.05).map((r) => r.asset);
    $("#h-read").innerHTML = `<strong>Reading it:</strong> bars show the estimated change in daily return after a 10% jump in geopolitical risk; the black lines are 95% confidence ranges. ` +
      (sig.length ? `Here the effect is statistically significant for ${sig.join(" and ")}.` : "Every range crosses zero, so neither effect can be told apart from no effect at all.");
    $$("#h-spec button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === spec)));
  }
  $$("#h-spec button").forEach((b) => b.addEventListener("click", () => showSpec(b.dataset.v)));
  showSpec(specs[0]);
  $("#h-lag").textContent = `${(d.gold_lag.effect).toFixed(3)} percentage points (p = ${d.gold_lag.p})`;

  // ---------- shock days ----------
  const sd = d.shock_days;
  new Chart($("#h-shocks"), {
    type: "bar",
    data: { labels: ["Gold", "Bitcoin"], datasets: [
      { label: "Normal days", data: [sd.Gold.normal.mean, sd.Bitcoin.normal.mean], se: [sd.Gold.normal.se, sd.Bitcoin.normal.se], backgroundColor: colors.sand, borderRadius: 6 },
      { label: "Biggest 10% risk jumps", data: [sd.Gold.shock.mean, sd.Bitcoin.shock.mean], se: [sd.Gold.shock.se, sd.Bitcoin.shock.se], backgroundColor: colors.clay, borderRadius: 6 },
    ] },
    options: { scales: { y: { title: { display: true, text: "Average daily return (%)" } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.signed(c.parsed.y, 2)}% (± ${(2 * c.dataset.se[c.dataIndex]).toFixed(2)})` } } } },
    plugins: [{ id: "se", afterDatasetsDraw(chart) {
      const { ctx, scales } = chart; ctx.save(); ctx.strokeStyle = colors.text; ctx.lineWidth = 1.5;
      chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((bar, i) => {
        const m = ds.data[i], s = 2 * ds.se[i], y1 = scales.y.getPixelForValue(m - s), y2 = scales.y.getPixelForValue(m + s);
        ctx.beginPath(); ctx.moveTo(bar.x, y1); ctx.lineTo(bar.x, y2); ctx.moveTo(bar.x - 6, y1); ctx.lineTo(bar.x + 6, y1); ctx.moveTo(bar.x - 6, y2); ctx.lineTo(bar.x + 6, y2); ctx.stroke();
      })); ctx.restore();
    } }],
  });
})();
