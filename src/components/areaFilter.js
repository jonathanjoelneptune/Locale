const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function searchText(feature){
  const p=feature.properties||{};
  return [p.name,p.groupLabel,p.areaType,...(p.aliases||[])].filter(Boolean).join(" ").toLowerCase();
}

export function AreaFilter(state,features,counts=new Map){
  const selected=state.selectedAreaIds instanceof Set?state.selectedAreaIds:new Set;
  const query=String(state.areaQuery||"").trim().toLowerCase();
  const sorted=[...(features||[])].sort((a,b)=>{
    const aSelected=selected.has(a.properties.id),bSelected=selected.has(b.properties.id);
    if(aSelected!==bSelected)return aSelected?-1:1;
    return (b.properties.displayPriority||0)-(a.properties.displayPriority||0)||a.properties.name.localeCompare(b.properties.name);
  });
  const matching=query?sorted.filter(feature=>searchText(feature).includes(query)):sorted;
  const limit=query?40:(state.areaExpanded?matching.length:18);
  const shown=matching.slice(0,limit);
  const selectedFeatures=sorted.filter(feature=>selected.has(feature.properties.id));

  return `<section class="area-filter" aria-label="Area filters">
    <div class="filter-heading"><span>AREAS</span><button id="clearAreas" type="button" ${selected.size?"":"disabled"}>Clear</button></div>
    <div class="area-filter-meta"><span>${selected.size?`${selected.size} selected`:"Choose one or more neighborhoods"}</span><small>${features.length} mapped areas</small></div>
    ${selectedFeatures.length?`<div class="area-selected-chips">${selectedFeatures.map(feature=>`<button type="button" class="area-chip" data-remove-area="${esc(feature.properties.id)}" title="Remove ${esc(feature.properties.name)}"><span>${esc(feature.properties.name)}</span><b>×</b></button>`).join("")}</div>`:""}
    <label class="area-search"><span aria-hidden="true">⌕</span><input id="areaSearch" type="search" value="${esc(state.areaQuery||"")}" placeholder="Search neighborhoods or cities" autocomplete="off"></label>
    <div class="area-options" role="listbox" aria-multiselectable="true">
      ${shown.length?shown.map(feature=>{
        const p=feature.properties;
        const active=selected.has(p.id);
        const count=counts.get(p.id)||0;
        return `<button type="button" class="area-option ${active?"active":""}" data-area-id="${esc(p.id)}" role="option" aria-selected="${active}" aria-pressed="${active}">
          <span class="area-check">${active?"✓":""}</span>
          <span class="area-option-copy"><strong>${esc(p.name)}</strong><small>${esc(p.groupLabel||p.areaType||"Area")}</small></span>
          <span class="area-count">${count}</span>
        </button>`;
      }).join(""):`<div class="area-no-results">No mapped areas match “${esc(state.areaQuery||"")}”.</div>`}
    </div>
    ${!query&&matching.length>18?`<button id="toggleAreas" class="area-expand" type="button">${state.areaExpanded?"Show priority areas":"Show all "+matching.length+" areas"}</button>`:""}
  </section>`;
}
