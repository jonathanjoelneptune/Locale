const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(d,timeStatus)=>new Intl.DateTimeFormat("en-US",timeStatus==="unknown"?{weekday:"long",month:"long",day:"numeric"}:{weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(d))+(timeStatus==="unknown"?" · Time not listed":"");
export function EventDetail(e,saved=false){
 const sources=(e.sources||[{name:e.source,url:e.sourceUrl}]).filter(x=>x.name);
 const price=e.priceStatus==="free"?"Free":e.price||"Price not published";
 return `<div class="detail-backdrop" data-close-detail></div><section class="event-detail" role="dialog" aria-modal="true" aria-label="Event details">
 <button class="detail-close" data-close-detail aria-label="Close event details">×</button>
 ${e.image?`<img class="detail-hero" src="${esc(e.image)}" alt="">`:""}
 <div class="detail-body"><span class="event-badge">${esc(e.category)}</span><h1>${esc(e.title)}</h1>
 <div class="detail-facts"><span>◷ ${esc(fmt(e.start,e.timeStatus))}</span><span>⌖ ${esc(e.venue)}</span><span>◎ ${Number.isFinite(e.distance)?Number(e.distance).toFixed(1)+" mi":"Location approximate"}</span><strong>${esc(price)}</strong></div>
 ${e.description?`<p>${esc(e.description)}</p>`:""}
 <div class="detail-sources"><small>Sources</small>${sources.map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`:`<span>${esc(s.name)}</span>`).join("")}</div>
 <div class="detail-actions"><button class="detail-save${saved?" is-saved":""}" data-save-event="${esc(e.id)}" aria-pressed="${saved}">${saved?"♥ Saved":"♡ Save"}</button>${e.url?`<a class="detail-primary" href="${esc(e.url)}" target="_blank" rel="noopener">${e.source==="Ticketmaster"?"Tickets / details":"Event details"} ↗</a>`:""}</div>
 </div></section>`;
}