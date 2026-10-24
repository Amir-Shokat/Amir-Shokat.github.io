(async () => {
  const { colors, fmt, $, $$, loadJSON, fail } = Site;
  let d;
  try { d = await loadJSON("/assets/data/sentiment.json"); } catch (e) { fail($("#score-demo"), e); fail($("#results-demo"), e); return; }
  const LEX = d.lexicon, NEG = new Set(["no", "not", "n't", "never"]);
  const clamp = (x) => Math.max(-1, Math.min(1, x));

  // Simplified port of TextBlob / pattern's sentiment assessments
  function score(text) {
    const toks = text.toLowerCase().replace(/n't\b/g, " n't").match(/[a-z]+(?:[-'][a-z]+)*|n't|!/g) || [];
    const a = []; let m = null, n = null;
    for (const w of toks) {
      const e = LEX[w];
      if (e) {
        const [p, s, i, isMod] = e;
        if (m === null) a.push({ w: [w], p, s, i, n: 1 });
        else { const l = a[a.length - 1]; l.w.push(w); l.p = clamp(p * l.i); l.s = clamp(s * l.i); l.i = i; }
        if (n !== null) { const l = a[a.length - 1]; l.w.unshift(n); l.i = 1 / l.i; l.n = -1; }
        m = isMod ? w : null; n = NEG.has(w) ? w : null;
      } else {
        if (NEG.has(w)) n = w;
        else if (n && w.replace(/'/g, "").length > 1) n = null;
        if (n !== null && m !== null && a.length) { a[a.length - 1].w.push(n); a[a.length - 1].n = -1; n = null; }
        else if (m && w.length > 2) m = null;
        if (w === "!" && a.length) a[a.length - 1].p = clamp(a[a.length - 1].p * 1.25);
      }
    }
    const final = a.map((x) => ({ words: x.w.join(" "), p: x.n < 0 ? x.p * -0.5 : x.p, s: x.s }));
    const avg = (k) => (final.length ? final.reduce((t, x) => t + x[k], 0) / final.length : 0);
    return { polarity: avg("p"), subjectivity: avg("s"), parts: final };
  }

  const text = $("#s-text");
  function show() {
    const r = score(text.value);
    $("#s-needle").style.left = `${50 + r.polarity * 50}%`;
    const tone = r.polarity > 0.1 ? "positive" : r.polarity < -0.1 ? "negative" : "neutral";
    $("#s-stats").innerHTML = [[fmt.signed(r.polarity, 2), `Tone (${tone})`, r.polarity > 0.1 ? "good" : r.polarity < -0.1 ? "bad" : ""],
      [fmt.pct(r.subjectivity, 0), "Subjectivity (opinion vs fact)", ""], [String(r.parts.length), "Words that carry tone", ""]]
      .map(([v, l, c]) => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
    $("#s-words").innerHTML = r.parts.length ? r.parts.map((x) => `<span class="${x.p > 0.05 ? "pos" : x.p < -0.05 ? "neg" : ""}">${x.words} ${fmt.signed(x.p, 2)}</span>`).join("") : '<span>No words with a tone found</span>';
  }
  text.addEventListener("input", show);
  $$("#s-examples button").forEach((b) => b.addEventListener("click", () => { text.value = b.dataset.t; show(); }));
  show();

  // ---------- results ----------
  const pts = (flag) => d.articles.filter((a) => a.m === flag).map((a) => ({ x: new Date(a.d).getTime(), y: a.p }));
  new Chart($("#s-scatter"), {
    type: "scatter",
    data: { datasets: [
      { label: "Other articles", data: pts(0), backgroundColor: "rgba(65,97,138,0.35)", pointRadius: 3.5 },
      { label: "Mentions Trump", data: pts(1), backgroundColor: colors.clay, pointRadius: 4.5 },
    ] },
    options: { parsing: false,
      scales: { x: { type: "linear", ticks: { callback: (v) => new Date(v).getFullYear(), maxTicksLimit: 9 } }, y: { min: -0.4, max: 0.6, title: { display: true, text: "Tone (−1 to +1)" } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${new Date(c.parsed.x).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}: tone ${fmt.signed(c.parsed.y, 2)}` } } } },
  });
  const t = d.tests;
  const row = (name, r) => `<tr><td>${name}</td><td class="num">${fmt.signed(r.mean_mention, 3)}</td><td class="num">${fmt.signed(r.mean_other, 3)}</td><td class="num">${fmt.signed(r.difference, 3)}</td><td class="num">${r.welch_p < 0.05 ? "<b>" + r.welch_p.toFixed(2) + "</b>" : r.welch_p.toFixed(2)}</td></tr>`;
  $("#s-table").innerHTML = `<thead><tr><th>Measure</th><th class="num">Mentions Trump</th><th class="num">Other</th><th class="num">Difference</th><th class="num">p-value</th></tr></thead><tbody>` +
    row("Tone, all years", t.polarity_full) + row("Tone, since June 2015", t.polarity_since_2015) + row("Subjectivity, all years", t.subjectivity_full) +
    `</tbody>`;
  $("#s-target").textContent = `average tone ${fmt.signed(d.target.mean, 2)}, and ${fmt.pct(d.target.share_negative, 0)} of them are negative`;
  window.__score = score;   // exposed so the scorer can be checked against TextBlob
})();
