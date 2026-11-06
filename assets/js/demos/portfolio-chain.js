(() => {
  const { colors, fmt, $, $$, bindRange } = Site;

  // Data quality: one compact table, three outcomes.
  const dq = $("#dq-demo");
  if (dq) {
    const cases = {
      clean: {
        stats: [["4 / 4", "Controls passed"], ["0", "Exceptions"]],
        rows: [["Position quantity", "120", "120", "Pass"], ["Closing price", "42.50", "42.50", "Pass"], ["Corporate actions", "1", "1", "Pass"], ["Unique events", "3", "3", "Pass"]],
        read: "Both routes agree. The record can move to the return calculation with its evidence attached."
      },
      missing: {
        stats: [["3 / 4", "Controls passed"], ["1", "Exception"]],
        rows: [["Position quantity", "120", "120", "Pass"], ["Closing price", "42.50", "Missing", "Investigate"], ["Corporate actions", "1", "1", "Pass"], ["Unique events", "3", "3", "Pass"]],
        read: "The holding exists, but valuation evidence is incomplete. The toolkit reports the gap; it does not invent or carry a price."
      },
      duplicate: {
        stats: [["3 / 4", "Controls passed"], ["1", "Exception"]],
        rows: [["Position quantity", "120", "120", "Pass"], ["Closing price", "42.50", "42.50", "Pass"], ["Corporate actions", "1", "1", "Pass"], ["Unique events", "3", "4 rows", "Investigate"]],
        read: "A duplicate event can overstate the rebuilt position. It is retained as evidence and routed for review instead of silently removed."
      }
    };
    const render = (name) => {
      const c = cases[name];
      $("#dq-stats").innerHTML = c.stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
      $("#dq-rows").innerHTML = c.rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td><span class="status-dot ${r[3] === "Pass" ? "ok" : "warn"}">${r[3]}</span></td></tr>`).join("");
      $("#dq-read").textContent = c.read;
      $$("#dq-case button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.case === name)));
    };
    $$("#dq-case button").forEach((b) => b.addEventListener("click", () => render(b.dataset.case)));
    render("clean");
  }

  // Return engine: a two-period example where TWR is fixed but personal return changes with timing.
  const ret = $("#return-demo");
  if (ret) {
    const flow = $("#ret-flow"), timing = $("#ret-time");
    bindRange(flow, $("#ret-flow-out"), (x) => `${x} units`);
    const chart = new Chart($("#ret-chart"), {
      type: "line",
      data: { labels: ["Start", "After strong month", "End"], datasets: [{ label: "Portfolio value", data: [], borderColor: colors.blue, backgroundColor: "rgba(61,116,184,.08)", fill: true, borderWidth: 3, pointRadius: 4, tension: .25 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, title: { display: true, text: "Value (synthetic units)" } } } }
    });
    const update = () => {
      const f = +flow.value, early = timing.value === "early";
      const values = early ? [100 + f, (100 + f) * 1.10, (100 + f) * 1.10 * .95] : [100, 110 + f, (110 + f) * .95];
      const twr = 1.10 * .95 - 1;
      let periodic;
      if (early) periodic = Math.sqrt(values[2] / (100 + f)) - 1;
      else periodic = (-f + Math.sqrt(f * f + 400 * values[2])) / 200 - 1;
      const mwr = (1 + periodic) ** 2 - 1;
      chart.data.datasets[0].data = values; chart.update();
      $("#ret-stats").innerHTML = [[fmt.pct(twr), "TWR: investment performance"], [fmt.pct(mwr), "MWR: investor experience"], [fmt.signed(values[2] - 100 - f, 1), "Wealth change"]].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
      $("#ret-read").innerHTML = `<strong>Same market path, different experience.</strong> TWR stays at ${fmt.pct(twr)} because it removes cash-flow timing. MWR ${Math.abs(mwr - twr) < .002 ? "is similar because all capital had the same exposure" : "changes because the deposit arrived after the strong month and before the weaker one"}.`;
    };
    [flow, timing].forEach((el) => el.addEventListener("input", update)); update();
  }

  // Risk: make drawdown depth and recovery convention visible.
  const risk = $("#risk-demo");
  if (risk) {
    const depth = $("#risk-depth"), recovery = $("#risk-recovery");
    bindRange(depth, $("#risk-depth-out"), (x) => `${x}%`);
    bindRange(recovery, $("#risk-recovery-out"), (x) => `${x} sessions`);
    const chart = new Chart($("#risk-chart"), {
      type: "line", data: { labels: [], datasets: [{ label: "Wealth index", data: [], borderColor: colors.blue, backgroundColor: "rgba(200,115,79,.12)", fill: "origin", borderWidth: 3, pointRadius: 0, tension: .25 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "Market sessions" } }, y: { suggestedMin: 55, suggestedMax: 110, title: { display: true, text: "Wealth index" } } } }
    });
    const update = () => {
      const d = +depth.value / 100, n = +recovery.value, fall = 12;
      const path = [];
      for (let i = 0; i <= fall; i++) path.push(100 * (1 - d * (i / fall) ** 1.35));
      for (let i = 1; i <= n; i++) path.push(100 * (1 - d + d * (i / n) ** .8));
      chart.data.labels = path.map((_, i) => i); chart.data.datasets[0].data = path; chart.update();
      const volHint = Math.sqrt(d * d / (fall + n)) * Math.sqrt(250);
      $("#risk-stats").innerHTML = [[`−${(d * 100).toFixed(0)}%`, "Maximum drawdown"], [`${n}`, "Sessions to recover"], [fmt.pct(volHint), "Illustrative volatility"]].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
    };
    [depth, recovery].forEach((el) => el.addEventListener("input", update)); update();
  }

  // Monitoring: one scenario selector updates health, coverage and ownership.
  const monitor = $("#monitor-demo");
  if (monitor) {
    const cases = {
      healthy: { stats: [["Fresh", "Inputs"], ["100%", "Coverage"], ["0", "Open incidents"]], rows: [["Input freshness", "Pass", "0", "Data"], ["Expected results", "Pass", "0", "Returns"], ["Display validation", "Pass", "0", "Product"]], read: "All expected results are current, complete and displayable. No incident is opened." },
      late: { stats: [["Late", "Inputs"], ["100%", "Coverage"], ["1", "Open incident"]], rows: [["Cash-flow freshness", "Alert", "1 feed", "Data"], ["Expected results", "Pass", "0", "Returns"], ["Display validation", "Hold", "All MWR", "Product"]], read: "One late feed creates one owned incident. MWR publication is held before stale values reach users." },
      partial: { stats: [["Fresh", "Inputs"], ["92%", "Coverage"], ["1", "Open incident"]], rows: [["Input freshness", "Pass", "0", "Data"], ["Expected results", "Alert", "800", "Returns"], ["Display validation", "Hold", "800", "Product"]], read: "The denominator is the expected population, so the missing partition cannot look like a 100% successful run." },
      unsafe: { stats: [["Fresh", "Inputs"], ["100%", "Coverage"], ["1", "Open incident"]], rows: [["Input freshness", "Pass", "0", "Data"], ["Expected results", "Pass", "0", "Returns"], ["Display validation", "Alert", "3", "Product"]], read: "Calculation succeeded, but three impossible values are withheld. Successful and safe-to-display remain separate metrics." }
    };
    const select = $("#mon-case");
    const render = () => {
      const c = cases[select.value];
      $("#mon-stats").innerHTML = c.stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
      $("#mon-rows").innerHTML = c.rows.map((r) => `<tr><td>${r[0]}</td><td><span class="status-dot ${r[1] === "Pass" ? "ok" : "warn"}">${r[1]}</span></td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`).join("");
      $("#mon-read").textContent = c.read;
    };
    select.addEventListener("input", render); render();
  }
})();
