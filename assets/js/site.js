// Project filters (projects page)
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
