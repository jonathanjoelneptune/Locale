import {CATEGORIES} from "../data/categories.js";
const ICONS={all:"◉",sports:"◆",music:"♫",festival:"✦",food:"♨",theater:"◈",comedy:"☻",family:"●",community:"✺",nightlife:"☾",other:"＋"};

export function Filters(state){
  const selected=state.categories instanceof Set?state.categories:new Set;
  return `<section class="category-filter">
    <div class="filter-heading"><span>EVENT TYPES</span><button id="clearCategory" type="button">All</button></div>
    <div class="category-pills">
      ${CATEGORIES.filter(([value])=>value!=="all").map(([value,label])=>`<button type="button" class="category-pill ${selected.has(value)?"active":""}" data-category="${value}" aria-pressed="${selected.has(value)}"><span class="category-icon category-${value}">${ICONS[value]||"•"}</span><span>${label}</span></button>`).join("")}
    </div>
  </section>`;
}
