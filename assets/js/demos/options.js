(() => {
  const { colors, fmt, $, $$, normCdf, normPdf } = Site;

  // ---------- Black-Scholes ----------
  function bs(kind, S, K, T, r, sigma) {
    if (T <= 0) return { value: Math.max(kind === "call" ? S - K : K - S, 0), delta: 0, gamma: 0, vega: 0, theta: 0 };
    const sq = sigma * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / sq;
    const d2 = d1 - sq;
    const disc = Math.exp(-r * T);
    const call = S * normCdf(d1) - K * disc * normCdf(d2);
    const value = kind === "call" ? call : call - S + K * disc;
    const delta = kind === "call" ? normCdf(d1) : normCdf(d1) - 1;
    const gamma = normPdf(d1) / (S * sq);
    const vega = S * normPdf(d1) * Math.sqrt(T) / 100;
    const thetaCall = -S * normPdf(d1) * sigma / (2 * Math.sqrt(T)) - r * K * disc * normCdf(d2);
    const theta = (kind === "call" ? thetaCall : thetaCall + r * K * disc) / 365;
    return { value, delta, gamma, vega, theta };
  }

  // typed number fields: an empty or out-of-range field is flagged and the last good result stays on screen
  const read = (el) => {
    const x = parseFloat(el.value);
    const ok = el.value !== "" && Number.isFinite(x) && el.checkValidity();
    el.classList.toggle("invalid", !ok);
    return ok ? x : null;
  };
  const labelOf = (el) => $(`label[for="${el.id}"]`).textContent.split(",")[0];
  const showError = (box, bad) => {
    box.hidden = bad.length === 0;
    box.textContent = bad.map((el) => `${labelOf(el)}: ${el.validationMessage || "please enter a number."}`).join(" ");
  };

  const ids = ["s", "k", "t", "v", "r"];
  const inp = Object.fromEntries(ids.map((i) => [i, $(`#bs-${i}`)]));
  let kind = "call";

  const chart = new Chart($("#bs-chart"), {
    type: "line",
    data: { datasets: [
      { label: "Value today", data: [], borderColor: colors.blue, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { label: "Payoff at expiry", data: [], borderColor: colors.sand, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 },
      { label: "Current stock price", data: [], borderColor: colors.clay, backgroundColor: colors.clay, pointRadius: 6, showLine: false },
    ] },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { type: "linear", title: { display: true, text: "Stock price" } },
        y: { min: 0, title: { display: true, text: "Option value" } },
      },
      plugins: { tooltip: { callbacks: { title: (it) => `Stock at ${fmt.num(it[0].parsed.x, 1)}`, label: (c) => `${c.dataset.label}: ${fmt.num(c.parsed.y)}` } } },
    },
  });

  function update() {
    const vals = Object.fromEntries(ids.map((i) => [i, read(inp[i])]));
    const bad = ids.filter((i) => vals[i] === null).map((i) => inp[i]);
    showError($("#bs-error"), bad);
    if (bad.length) return;
    const S = vals.s, K = vals.k, T = vals.t / 365, sig = vals.v / 100, r = vals.r / 100;
    const g = bs(kind, S, K, T, r, sig);
    const intrinsic = Math.max(kind === "call" ? S - K : K - S, 0);
    $("#bs-stats").innerHTML = [
      ["Fair value", fmt.num(g.value)], ["Of which time value", fmt.num(g.value - intrinsic)],
      ["Delta", fmt.num(g.delta, 3)], ["Gamma", fmt.num(g.gamma, 4)], ["Vega", fmt.num(g.vega, 3)], ["Theta (per day)", fmt.num(g.theta, 3)],
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
    // the x-axis follows the inputs: half the smaller price to one and a half times the larger one
    const lo = 0.5 * Math.min(S, K), hi = 1.5 * Math.max(S, K);
    const xs = Array.from({ length: 101 }, (_, i) => lo + (hi - lo) * i / 100);
    chart.options.scales.x.min = lo;
    chart.options.scales.x.max = hi;
    chart.data.datasets[0].data = xs.map((x) => ({ x, y: bs(kind, x, K, T, r, sig).value }));
    chart.data.datasets[1].data = xs.map((x) => ({ x, y: Math.max(kind === "call" ? x - K : K - x, 0) }));
    chart.data.datasets[2].data = [{ x: S, y: g.value }];
    chart.update();
  }
  ids.forEach((i) => inp[i].addEventListener("input", update));
  $$("#bs-kind button").forEach((b) => b.addEventListener("click", () => {
    kind = b.dataset.v;
    $$("#bs-kind button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    update();
  }));
  update();

  // ---------- quoting rules (same as quoting.py) ----------
  const TICK = 0.1, THRESHOLD = 60, MIN_VOL = 30, MAX_VOL = 100, LIMIT = 100;
  const r1 = (x) => Math.round(x * 10) / 10;
  const floorT = (x) => r1(Math.floor(Math.round(x / TICK * 1e6) / 1e6) * TICK);
  const ceilT = (x) => r1(Math.ceil(Math.round(x / TICK * 1e6) / 1e6) * TICK);
  function quotes(fair, pos, bestBid, bestAsk) {
    const maxBid = floorT(fair - TICK), minAsk = ceilT(fair + TICK);
    let bid, ask, mode;
    if (pos > THRESHOLD) { bid = Math.min(bestBid, maxBid); ask = minAsk; mode = "long"; }
    else if (pos < -THRESHOLD) { bid = maxBid; ask = Math.max(bestAsk, minAsk); mode = "short"; }
    else { bid = Math.min(bestBid + TICK, maxBid); ask = Math.max(bestAsk - TICK, minAsk); mode = "normal"; }
    bid = floorT(bid); ask = ceilT(ask);
    let vol = MIN_VOL;
    if (bestBid < fair && fair < bestAsk) vol = Math.min(MAX_VOL, MIN_VOL * Math.max(1, Math.round(Math.max(fair - bestBid, bestAsk - fair) / TICK)));
    return { bid, ask, mode, bidVol: Math.max(0, Math.min(vol, LIMIT - pos)), askVol: Math.max(0, Math.min(vol, LIMIT + pos)) };
  }

  const qIn = { fair: $("#q-fair"), inv: $("#q-inv"), bid: $("#q-bid"), ask: $("#q-ask") };
  const tickOf = (x) => Math.round(x / TICK);
  function drawLadder() {
    const v = Object.fromEntries(Object.entries(qIn).map(([k, el]) => [k, read(el)]));
    const bad = Object.keys(qIn).filter((k) => v[k] === null).map((k) => qIn[k]);
    const err = $("#q-error");
    showError(err, bad);
    if (bad.length) return;
    if (v.bid >= v.ask) { err.hidden = false; err.textContent = "The best bid has to be below the best ask."; return; }
    const fair = v.fair, pos = Math.round(v.inv), q = quotes(fair, pos, v.bid, v.ask);
    // show three ticks around every price worth marking; long empty stretches collapse into "…"
    const marks = [v.ask, v.bid, q.ask, q.bid, fair].map(tickOf);
    const keep = new Set();
    marks.forEach((c) => { for (let i = -3; i <= 3; i++) if (c + i > 0) keep.add(c + i); });
    const ticks = [...keep].sort((a, b) => b - a);
    const rows = [];
    ticks.forEach((c, i) => {
      if (i > 0 && ticks[i - 1] - c > 1) rows.push('<div class="rung gap" aria-hidden="true">…</div>');
      const tags = [];
      if (c === tickOf(v.ask)) tags.push('<span class="tag mkt">market ask</span>');
      if (c === tickOf(v.bid)) tags.push('<span class="tag mkt">market bid</span>');
      if (c === tickOf(q.ask)) tags.push(`<span class="tag ask">my ask · sell ${q.askVol}</span>`);
      if (c === tickOf(q.bid)) tags.push(`<span class="tag bid">my bid · buy ${q.bidVol}</span>`);
      const fairRow = c === tickOf(fair);
      rows.push(`<div class="rung${fairRow ? " fair" : ""}"><span class="px">${(c * TICK).toFixed(2)}</span>${fairRow ? '<span class="tag fairv">fair value</span>' : ""}${tags.join("")}</div>`);
    });
    $("#q-ladder").innerHTML = rows.join("");
    const why = {
      normal: `Inventory is under control, so I compete on both sides: one tick better than the market, but never through fair value (${fmt.num(fair)}).`,
      long: `I'm already long ${pos}. I stop competing to buy and offer just above fair value, so the extra options get sold off quickly.`,
      short: `I'm short ${-pos}. I bid just below fair value to buy options back, and stop competing on the sell side.`,
    }[q.mode];
    $("#q-explain").innerHTML = `<strong>Why these prices?</strong> ${why} Spread captured if both sides trade: <strong>${fmt.num(q.ask - q.bid)}</strong> per option.`;
  }
  Object.values(qIn).forEach((el) => el.addEventListener("input", drawLadder));
  drawLadder();
})();
