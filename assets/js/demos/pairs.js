(() => {
  const { colors, fmt, $, $$, rng, gauss, std, bindRange } = Site;
  const N = 500, TRAIN = 150, BREAK = 300, NOTIONAL = 10000;
  const eur = (x) => `${x < 0 ? "−" : ""}€${fmt.num(Math.abs(x), 0)}`;
  let seed = 7, exitMode = "flip";
  const hl = $("#p-hl"), k = $("#p-k"), cost = $("#p-cost"), brk = $("#p-break");
  bindRange(hl, $("#p-hl-out"), (x) => `half the gap in ${x} days`);
  bindRange(k, $("#p-k-out"), (x) => `${x}× normal`);
  bindRange(cost, $("#p-cost-out"), (x) => `${x} bp`);

  function simulate() {
    const rand = rng(seed);
    const kappa = 1 - Math.pow(0.5, 1 / +hl.value);           // daily pull-back from half-life
    const sigmaShock = 0.01 * Math.sqrt(2 * kappa - kappa * kappa);  // keeps the normal gap size ~1%
    const z = [0];
    for (let t = 1; t < N; t++) {
      const pull = brk.checked && t >= BREAK ? 0 : kappa;
      z.push((1 - pull) * z[t - 1] + sigmaShock * gauss(rand));
    }
    return z;
  }

  function trade(z) {
    const band = +k.value * std(z.slice(0, TRAIN));
    const c = +cost.value / 1e4 * 2 * NOTIONAL;              // both legs
    let pos = 0, pnl = 0, trades = 0, wins = 0, entry = 0, peak = 0, maxDd = 0;
    const pnlSeries = [], buys = [], sells = [];
    for (let t = 0; t < N; t++) {
      if (t > 0) pnl += pos * (z[t] - z[t - 1]) * NOTIONAL;
      if (t >= TRAIN) {
        let target = pos;
        if (exitMode === "mean" && ((pos < 0 && z[t] <= 0) || (pos > 0 && z[t] >= 0))) target = 0;
        if (z[t] > band && pos >= 0) target = -1;
        if (z[t] < -band && pos <= 0) target = 1;
        if (target !== pos) {
          if (pos !== 0) { trades++; if ((pnl - entry) > 0) wins++; }
          pnl -= Math.abs(target - pos) * c;   // flipping from short to long counts as two trades
          entry = pnl;
          (target > pos ? buys : sells).push({ x: t, y: z[t] * 100 });
          pos = target;
        }
      }
      peak = Math.max(peak, pnl); maxDd = Math.min(maxDd, pnl - peak);
      pnlSeries.push({ x: t, y: pnl });
    }
    return { band, pnlSeries, buys, sells, pnl, trades, wins, maxDd };
  }

  const trainShade = {
    id: "trainShade",
    beforeDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.fillStyle = "rgba(180,168,146,0.16)";
      const x1 = scales.x.getPixelForValue(TRAIN);
      ctx.fillRect(chartArea.left, chartArea.top, x1 - chartArea.left, chartArea.bottom - chartArea.top);
      if (brk.checked) {
        const xb = scales.x.getPixelForValue(BREAK);
        ctx.strokeStyle = colors.clay; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(xb, chartArea.top); ctx.lineTo(xb, chartArea.bottom); ctx.stroke();
      }
      ctx.restore();
    },
  };
  const xScale = { type: "linear", min: 0, max: N - 1, title: { display: true, text: "Trading day" } };
  const spreadChart = new Chart($("#p-spread"), {
    type: "line",
    data: { datasets: [
      { label: "Gap between the stocks (%)", data: [], borderColor: colors.blue, borderWidth: 1.6, pointRadius: 0 },
      { label: "Upper band", data: [], borderColor: colors.sand, borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0 },
      { label: "Lower band", data: [], borderColor: colors.sand, borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0 },
      { label: "Buy the gap", data: [], type: "scatter", backgroundColor: colors.sage, pointRadius: 4 },
      { label: "Sell the gap", data: [], type: "scatter", backgroundColor: colors.clay, pointRadius: 4 },
    ] },
    options: { parsing: false, scales: { x: xScale, y: { title: { display: true, text: "Gap (%)" } } },
      plugins: { legend: { labels: { filter: (i) => i.datasetIndex !== 2 } }, tooltip: { enabled: false } } },
    plugins: [trainShade],
  });
  const pnlChart = new Chart($("#p-pnl"), {
    type: "line",
    data: { datasets: [{ label: "Cumulative profit (€)", data: [], borderColor: colors.clay, borderWidth: 2, pointRadius: 0, fill: { target: "origin", above: "rgba(106,143,107,0.12)", below: "rgba(192,113,79,0.12)" } }] },
    options: { parsing: false, scales: { x: xScale, y: { title: { display: true, text: "€" } } }, plugins: { tooltip: { enabled: false } } },
    plugins: [trainShade],
  });

  function update() {
    const z = simulate(), r = trade(z);
    spreadChart.data.datasets[0].data = z.map((v, t) => ({ x: t, y: v * 100 }));
    spreadChart.data.datasets[1].data = [{ x: 0, y: r.band * 100 }, { x: N - 1, y: r.band * 100 }];
    spreadChart.data.datasets[2].data = [{ x: 0, y: -r.band * 100 }, { x: N - 1, y: -r.band * 100 }];
    spreadChart.data.datasets[3].data = r.buys;
    spreadChart.data.datasets[4].data = r.sells;
    spreadChart.update();
    pnlChart.data.datasets[0].data = r.pnlSeries;
    pnlChart.update();
    $("#p-stats").innerHTML = [
      [eur(r.pnl), "Total profit", r.pnl >= 0 ? "good" : "bad"],
      [String(r.trades), "Completed trades", ""],
      [r.trades ? fmt.pct(r.wins / r.trades, 0) : "–", "Winning trades", ""],
      [eur(r.maxDd), "Worst drop from a peak", r.maxDd < -0.6 * Math.abs(r.pnl) ? "bad" : ""],
    ].map(([v, l, c]) => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  }
  [hl, k, cost, brk].forEach((el) => el.addEventListener("input", update));
  $("#p-new").addEventListener("click", () => { seed = Math.floor(Math.random() * 1e6); update(); });
  $$("#p-exit button").forEach((b) => b.addEventListener("click", () => {
    exitMode = b.dataset.v; $$("#p-exit button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); update();
  }));
  update();
})();
