(async () => {
  const { colors, fmt, $, $$, loadJSON, quantile, std, bindRange, fail } = Site;
  let d;
  try { d = await loadJSON("/assets/data/rates.json"); } catch (e) { fail($("#moves-demo"), e); fail($("#var-demo"), e); return; }
  const mats = d.maturities, L = d.loadings, SD = d.factor_std;

  // ---------- bend the curve ----------
  $("#r-date").textContent = new Date(d.latest_curve.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const f = [1, 2, 3].map((i) => $(`#r-f${i}`));
  f.forEach((el, i) => bindRange(el, $(`#r-f${i + 1}-out`), (x) => `${x > 0 ? "+" : ""}${x} × typical day`));
  $("#r-explained").textContent = `Together these three movements explain ${fmt.pct(d.explained[0] + d.explained[1] + d.explained[2])} of all daily moves (level ${fmt.pct(d.explained[0])}, slope ${fmt.pct(d.explained[1])}, curvature ${fmt.pct(d.explained[2])}). Data: ${d.source}, ${d.start.slice(0, 4)} to ${d.end.slice(0, 4)}.`;
  const base = d.latest_curve.rates;
  const curve = new Chart($("#r-curve"), {
    type: "line",
    data: { labels: mats, datasets: [
      { label: "Shifted curve", data: [...base], borderColor: colors.clay, borderWidth: 3, pointRadius: 3, tension: 0.3 },
      { label: `Curve on ${d.latest_curve.date}`, data: base, borderColor: colors.blue, borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.3 },
    ] },
    options: { scales: { x: { type: "linear", min: 0, max: 31, title: { display: true, text: "Maturity (years)" } },
      y: { title: { display: true, text: "Interest rate (%)" }, suggestedMin: Math.min(...base) - 0.6, suggestedMax: Math.max(...base) + 0.6 } },
      plugins: { tooltip: { callbacks: { title: (it) => `${it[0].parsed.x}-year rate`, label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}%` } } } },
  });
  curve.data.datasets.forEach((ds) => { ds.data = ds.data.map((y, i) => ({ x: mats[i], y })); });
  function bend() {
    const k = f.map((el) => +el.value);
    curve.data.datasets[0].data = base.map((r, i) => ({ x: mats[i], y: r + (k[0] * SD[0] * L[0][i] + k[1] * SD[1] * L[1][i] + k[2] * SD[2] * L[2][i]) / 100 }));
    curve.update();
  }
  f.forEach((el) => el.addEventListener("input", bend)); bend();

  // ---------- VaR calculator ----------
  const used = [3, 4, 5, 7, 10, 30];
  // "textbook" = Hull's Table 9.8 portfolio (+10 per bp RISE in the 3-year rate, ...); sliders show gains when rates FALL, hence the signs
  const presets = { hull: { 3: -10, 4: -4, 5: 8, 7: 7, 10: -2, 30: -6 }, long: { 3: 2, 4: 2, 5: 4, 7: 6, 10: 10, 30: 12 }, steep: { 3: 12, 4: 0, 5: 0, 7: 0, 10: 0, 30: -6 } };
  $("#r-exposures").innerHTML = used.map((m) => `<div class="control"><label for="r-e${m}">${m}-year rate <output id="r-e${m}-out"></output></label><input id="r-e${m}" type="range" min="-15" max="15" step="1" value="0"></div>`).join("");
  const ex = Object.fromEntries(used.map((m) => [m, $(`#r-e${m}`)]));
  used.forEach((m) => bindRange(ex[m], $(`#r-e${m}-out`), (x) => `€${x}k per bp`));
  const idx = Object.fromEntries(used.map((m) => [m, mats.indexOf(m)]));
  const changes = d.changes_dbp;     // tenths of a basis point
  const varChart = new Chart($("#r-var"), {
    type: "bar",
    data: { labels: ["PCA, 1 factor", "PCA, 2 factors", "PCA, 3 factors", "Historical (real days)"],
      datasets: [{ data: [0, 0, 0, 0], backgroundColor: [colors.sand, colors.sand, colors.blue, colors.clay], borderRadius: 6 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `1-day 99% VaR: €${fmt.num(c.parsed.x, 0)}k` } } },
      scales: { x: { beginAtZero: true, title: { display: true, text: "Possible 1-day loss (€ thousands)" } } } },
  });
  function computeVar() {
    // a rate FALL makes money here, so value change = -exposure x change in rate (bp)
    const w = mats.map((m) => (idx[m] !== undefined && used.includes(m) ? -(+ex[m].value) : 0));
    const fexp = L.map((row) => row.reduce((s, l, i) => s + l * w[i], 0));
    const pca = [1, 2, 3].map((n) => 2.326 * Math.sqrt(fexp.slice(0, n).reduce((s, e, j) => s + (e * SD[j]) ** 2, 0)));
    const pnl = changes.map((row) => row.reduce((s, c, i) => s + w[i] * c / 10, 0));
    const hist = -quantile(pnl, 0.01);
    const tail = pnl.filter((x) => x <= -hist);
    const es = tail.length ? -tail.reduce((a, b) => a + b, 0) / tail.length : 0;
    varChart.data.datasets[0].data = [...pca, hist]; varChart.update();
    $("#r-var-stats").innerHTML = [[`€${fmt.num(pca[2], 0)}k`, "VaR, 3-factor model"], [`€${fmt.num(hist, 0)}k`, "VaR, real history"], [`€${fmt.num(es, 0)}k`, "Average loss on the worst 1% of days"], [`${pnl.length.toLocaleString()}`, "Real trading days replayed"]]
      .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
    const gap = pca[1] > 0 ? 1 - pca[1] / pca[2] : 0;
    $("#r-var-explain").innerHTML = pca[2] < 1 ? "Move a slider to build a portfolio." :
      `<strong>Reading it:</strong> on 99 days out of 100, this portfolio shouldn't lose more than about <strong>€${fmt.num(hist, 0)}k</strong> in a day, based on replaying every day since ${d.start.slice(0, 4)}. ` +
      (gap > 0.1 ? `A two-factor model would say €${fmt.num(pca[1], 0)}k, ${fmt.pct(gap, 0)} too low, because this portfolio is exposed to the curve's curvature. ` : "") +
      (hist > pca[2] * 1.1 ? "Real history gives a bigger number than any normal-distribution model: rate moves have fat tails." : "");
  }
  function applyPreset(name) {
    used.forEach((m) => { ex[m].value = presets[name][m]; ex[m].dispatchEvent(new Event("input")); });
    $$("#r-presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === name)));
    computeVar();
  }
  used.forEach((m) => ex[m].addEventListener("input", computeVar));
  $$("#r-presets button").forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.p)));
  applyPreset("hull");

  // ---------- PC3 before / after cleaning (course data) ----------
  const cm = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
  const before = [0.262, 0.155, 0.168, 0.106, 0.060, 0.041, -0.397, -0.482, -0.554, 0.022, 0.055, 0.111, 0.183, 0.224, 0.259];
  const after = [0.566, 0.306, 0.093, -0.083, -0.199, -0.227, -0.230, -0.230, -0.223, -0.206, -0.124, 0.011, 0.193, 0.294, 0.377];
  new Chart($("#r-pc3"), {
    type: "line",
    data: { datasets: [
      { label: "With the bad day (original)", data: before.map((y, i) => ({ x: cm[i], y })), borderColor: colors.clay, borderWidth: 2, pointRadius: 3 },
      { label: "Bad day removed", data: after.map((y, i) => ({ x: cm[i], y })), borderColor: colors.blue, borderWidth: 3, pointRadius: 3, tension: 0.3 },
    ] },
    options: { scales: { x: { type: "linear", min: 0, max: 31, title: { display: true, text: "Maturity (years)" } }, y: { title: { display: true, text: "Loading" } } },
      plugins: { tooltip: { enabled: false } } },
  });
})();
