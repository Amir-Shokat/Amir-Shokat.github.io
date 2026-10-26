// Light/dark toggle; the choice is remembered when the browser allows it
const root = document.documentElement;
const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
document.querySelector(".theme-toggle")?.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  window.Site?.retheme?.();
});

// Project filters (projects page)
const chips = document.querySelectorAll(".chip");
const cards = document.querySelectorAll(".card");
chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    const tag = chip.dataset.filter;
    cards.forEach((card) => {
      card.hidden = tag !== "all" && !card.dataset.tags.split(" ").includes(tag);
    });
  });
});
