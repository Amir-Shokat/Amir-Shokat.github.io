(async () => {
  const { colors, fmt, $, $$, loadJSON, fail } = Site;
  let d;
  try { d = await loadJSON("/assets/data/thesis.json"); } catch (e) { fail($("#match-demo"), e); fail($("#effects-demo"), e); return; }

  const right = d.same_location_pct;
  new Chart($("#t-match"), {
    type: "bar",
    data: { labels: [""], datasets: [
      { label: `Right town (${right.toFixed(1)}%)`, data: [right], backgroundColor: colors.blue, borderRadius: 6 },
      { label: `Wrong town with the same name (${(100 - right).toFixed(1)}%)`, data: [100 - right], backgroundColor: colors.clay, borderRadius: 6 },
    ] },
    options: { indexAxis: "y", scales: { x: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } }, y: { stacked: true, display: false } },
      plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label } } } },
  });

  const ci = { id: "ci", afterDatasetsDraw(chart) {
    const { ctx, scales } = chart, meta = chart.getDatasetMeta(0), rows = chart.data.datasets[0].rows;
    ctx.save(); ctx.strokeStyle = colors.text; ctx.lineWidth = 1.5;
    rows.forEach((r, i) => { const y = meta.data[i].y, a = scales.x.getPixelForValue(r.low), b = scales.x.getPixelForValue(r.high);
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.moveTo(a, y - 5); ctx.lineTo(a, y + 5); ctx.moveTo(b, y - 5); ctx.lineTo(b, y + 5); ctx.stroke(); });
    const x0 = scales.x.getPixelForValue(0); ctx.strokeStyle = colors.clay; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, chart.chartArea.top); ctx.lineTo(x0, chart.chartArea.bottom); ctx.stroke(); ctx.restore();
  } };
  const chart = new Chart($("#t-effects"), {
    type: "scatter",
    data: { datasets: [{ data: [], rows: [], backgroundColor: colors.blue, pointRadius: 6, pointStyle: "rectRot" }] },
    options: { parsing: false, scales: { y: { type: "category", labels: [], offset: true, grid: { display: false } }, x: { title: { display: true, text: "" } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const r = c.dataset.rows[c.dataIndex]; return `${fmt.signed(r.coef, 2)} (95% range ${r.low.toFixed(2)} to ${r.high.toFixed(2)}), p = ${r.p}`; } } } } },
    plugins: [ci],
  });
  function show(y) {
    const rows = d.corrected.filter((r) => r.y === y);
    chart.options.scales.y.labels = rows.map((r) => r.var);
    chart.data.datasets[0].data = rows.map((r) => ({ x: r.coef, y: r.var }));
    chart.data.datasets[0].rows = rows;
    const span = Math.max(...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high)))) * 1.2;
    chart.options.scales.x.min = -span; chart.options.scales.x.max = span;
    chart.options.scales.x.title.text = y === "ret_w" ? "Change in monthly return, basis points per °F" : "Change in volatility, ×10⁻⁴ per °F";
    chart.update();
    $("#t-read").innerHTML = y === "ret_w"
      ? "<strong>Reading it:</strong> each diamond is an estimate; the line is its 95% confidence range. One basis point is 0.01%. Every range crosses zero, so none of these effects can be told apart from no effect."
      : "<strong>Reading it:</strong> the same picture for volatility, how much a stock's price swings. Again, every range crosses zero.";
    $$("#t-outcome button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === y)));
  }
  $$("#t-outcome button").forEach((b) => b.addEventListener("click", () => show(b.dataset.v)));
  show("ret_w");
})();
