// Shared helpers for the project demos: colours, number formats and Chart.js defaults.
window.Site = (() => {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const colors = {
    blue: v("--blue", "#41618a"), clay: v("--clay", "#c0714f"), sage: "#6a8f6b",
    plum: "#8a5a83", sand: "#b4a892", text: v("--text", "#3a3631"), muted: v("--muted", "#6b6458"),
    line: v("--line", "#e2dacb"), card: v("--card", "#fbf8f2"),
  };
  if (window.Chart) {
    Chart.defaults.font.family = '"Nunito Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = colors.muted;
    Chart.defaults.borderColor = colors.line;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#2f2b27";
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 350;
  }
  const fmt = {
    pct: (x, d = 1) => (x * 100).toFixed(d) + "%",
    num: (x, d = 2) => Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }),
    signed: (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d),
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const loadJSON = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Could not load ${path}`);
    return res.json();
  };
  // standard normal helpers
  const normCdf = (x) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327 * Math.exp(-x * x / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
  };
  const normPdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
  // seeded random numbers so simulations are reproducible
  const rng = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rand) => { let u = 0, w = 0; while (u === 0) u = rand(); while (w === 0) w = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
  const quantile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); const pos = (s.length - 1) * q; const lo = Math.floor(pos); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo); };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  // a range input that shows its value next to the label
  const bindRange = (input, out, format = (x) => x) => {
    const update = () => { out.textContent = format(Number(input.value)); };
    input.addEventListener("input", update); update();
  };
  const fail = (el, err) => { el.innerHTML = `<p class="demo-error">This demo could not load (${err.message}). Please refresh the page.</p>`; };
  return { colors, fmt, $, $$, loadJSON, normCdf, normPdf, rng, gauss, quantile, mean, std, bindRange, fail };
})();
