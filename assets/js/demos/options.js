(() => {
  const { colors, fmt, $, $$, normCdf, normPdf, bindRange } = Site;

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

  const ids = ["s", "k", "t", "v", "r"];
  const inp = Object.fromEntries(ids.map((i) => [i, $(`#bs-${i}`)]));
  let kind = "call";
  bindRange(inp.s, $("#bs-s-out"), (x) => fmt.num(x, 0));
  bindRange(inp.k, $("#bs-k-out"), (x) => fmt.num(x, 0));
  bindRange(inp.t, $("#bs-t-out"), (x) => `${x} days`);
  bindRange(inp.v, $("#bs-v-out"), (x) => `${x}%`);
  bindRange(inp.r, $("#bs-r-out"), (x) => `${x}%`);

  const xs = Array.from({ length: 81 }, (_, i) => 50 + i * 1.25);
  const chart = new Chart($("#bs-chart"), {
    type: "line",
    data: { labels: xs, datasets: [
      { label: "Value today", data: [], borderColor: colors.blue, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { label: "Payoff at expiry", data: [], borderColor: colors.sand, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 },
      { label: "Current stock price", data: [], borderColor: colors.clay, backgroundColor: colors.clay, pointRadius: 6, showLine: false },
    ] },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { type: "linear", min: 50, max: 150, title: { display: true, text: "Stock price" } },
        y: { min: 0, title: { display: true, text: "Option value" } },
      },
      plugins: { tooltip: { callbacks: { title: (it) => `Stock at ${fmt.num(it[0].parsed.x, 1)}`, label: (c) => `${c.dataset.label}: ${fmt.num(c.parsed.y)}` } } },
    },
  });

  function update() {
    const S = +inp.s.value, K = +inp.k.value, T = +inp.t.value / 365, sig = +inp.v.value / 100, r = +inp.r.value / 100;
    const g = bs(kind, S, K, T, r, sig);
    const intrinsic = Math.max(kind === "call" ? S - K : K - S, 0);
    $("#bs-stats").innerHTML = [
      ["Fair value", fmt.num(g.value)], ["Of which time value", fmt.num(g.value - intrinsic)],
      ["Delta", fmt.num(g.delta, 3)], ["Gamma", fmt.num(g.gamma, 4)], ["Vega", fmt.num(g.vega, 3)], ["Theta (per day)", fmt.num(g.theta, 3)],
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
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
  const TICK = 0.1, BEST_BID = 36.4, BEST_ASK = 37.2, THRESHOLD = 60, MIN_VOL = 30, MAX_VOL = 100, LIMIT = 100;
  const r1 = (x) => Math.round(x * 10) / 10;
  const floorT = (x) => r1(Math.floor(Math.round(x / TICK * 1e6) / 1e6) * TICK);
  const ceilT = (x) => r1(Math.ceil(Math.round(x / TICK * 1e6) / 1e6) * TICK);
  function quotes(fair, pos) {
    const maxBid = floorT(fair - TICK), minAsk = ceilT(fair + TICK);
    let bid, ask, mode;
    if (pos > THRESHOLD) { bid = Math.min(BEST_BID, maxBid); ask = minAsk; mode = "long"; }
    else if (pos < -THRESHOLD) { bid = maxBid; ask = Math.max(BEST_ASK, minAsk); mode = "short"; }
    else { bid = Math.min(BEST_BID + TICK, maxBid); ask = Math.max(BEST_ASK - TICK, minAsk); mode = "normal"; }
    bid = floorT(bid); ask = ceilT(ask);
    let vol = MIN_VOL;
    if (BEST_BID < fair && fair < BEST_ASK) vol = Math.min(MAX_VOL, MIN_VOL * Math.max(1, Math.round(Math.max(fair - BEST_BID, BEST_ASK - fair) / TICK)));
    return { bid, ask, mode, bidVol: Math.max(0, Math.min(vol, LIMIT - pos)), askVol: Math.max(0, Math.min(vol, LIMIT + pos)) };
  }

  const fairIn = $("#q-fair"), invIn = $("#q-inv");
  bindRange(fairIn, $("#q-fair-out"), (x) => fmt.num(x));
  bindRange(invIn, $("#q-inv-out"), (x) => (x > 0 ? `long ${x}` : x < 0 ? `short ${-x}` : "none"));
  function drawLadder() {
    const fair = +fairIn.value, pos = +invIn.value, q = quotes(fair, pos);
    const rows = [];
    for (let p = 37.7; p >= 35.89; p -= 0.1) {
      const price = r1(p), tags = [];
      if (Math.abs(price - BEST_ASK) < 1e-9) tags.push('<span class="tag mkt">market ask</span>');
      if (Math.abs(price - BEST_BID) < 1e-9) tags.push('<span class="tag mkt">market bid</span>');
      if (Math.abs(price - q.ask) < 1e-9) tags.push(`<span class="tag ask">my ask · sell ${q.askVol}</span>`);
      if (Math.abs(price - q.bid) < 1e-9) tags.push(`<span class="tag bid">my bid · buy ${q.bidVol}</span>`);
      const fairRow = fair <= price + 0.05 && fair > price - 0.05;
      rows.push(`<div class="rung${fairRow ? " fair" : ""}"><span class="px">${price.toFixed(2)}</span>${fairRow ? '<span class="tag fairv">fair value</span>' : ""}${tags.join("")}</div>`);
    }
    $("#q-ladder").innerHTML = rows.join("");
    const why = {
      normal: `Inventory is under control, so I compete on both sides: one tick better than the market, but never through fair value (${fmt.num(fair)}).`,
      long: `I'm already long ${pos}. I stop competing to buy and offer just above fair value, so the extra options get sold off quickly.`,
      short: `I'm short ${-pos}. I bid just below fair value to buy options back, and stop competing on the sell side.`,
    }[q.mode];
    $("#q-explain").innerHTML = `<strong>Why these prices?</strong> ${why} Spread captured if both sides trade: <strong>${fmt.num(q.ask - q.bid)}</strong> per option.`;
  }
  [fairIn, invIn].forEach((el) => el.addEventListener("input", drawLadder));
  drawLadder();
})();
