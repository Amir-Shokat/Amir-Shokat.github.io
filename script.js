// Theme toggle (remembers the choice when storage is available)
const root = document.documentElement;
document.getElementById("theme-btn").addEventListener("click", () => {
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
});

document.getElementById("print-btn").addEventListener("click", () => window.print());

// Project filters
const chips = document.querySelectorAll(".chip");
const cards = document.querySelectorAll(".card");
chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.toggle("active", c === chip));
    const tag = chip.dataset.filter;
    cards.forEach((card) => {
      card.hidden = tag !== "all" && !card.dataset.tags.split(" ").includes(tag);
    });
  });
});

// Highlight the section in view
const links = [...document.querySelectorAll(".nav-links a")];
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
document.querySelectorAll("main section[id]").forEach((s) => observer.observe(s));

document.getElementById("year").textContent = new Date().getFullYear();
