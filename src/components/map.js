import {meters} from "../services/geo.js";

export function createMap(el,state,onCenter){
  const map=L.map(el,{zoomControl:true}).setView([state.center.lat,state.center.lng],state.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);

  const radius=L.circle([state.center.lat,state.center.lng],{radius:meters(state.radius),weight:1.25,color:"#159d8a",opacity:.65,fillColor:"#53cbb5",fillOpacity:.035,interactive:false}).addTo(map);
  const center=L.marker([state.center.lat,state.center.lng],{
    draggable:true,
    icon:L.divIcon({className:"locale-center-icon",html:'<div class="search-pin"><span></span></div>',iconSize:[30,38],iconAnchor:[15,34]})
  }).addTo(map);
  center.bindTooltip("Search center",{direction:"top",offset:[0,-30]});

  const layer=L.layerGroup().addTo(map);
  let resizeFrame=0;
  const stabilize=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false,animate:false}))};
  const observer=new ResizeObserver(stabilize);
  observer.observe(el);
  requestAnimationFrame(()=>requestAnimationFrame(stabilize));
  const markers=new Map();
  const SYMBOLS={sports:"◆",music:"♫",festival:"✦",food:"♨",theater:"◈",comedy:"●",family:"●",community:"✺",nightlife:"☾",other:"＋"};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function commitCenter(latlng,{recenter=false}={}){
    const pos={lat:latlng.lat,lng:latlng.lng};
    radius.setLatLng(latlng);
    center.setLatLng(latlng);
    onCenter(pos,map.getZoom());
    if(recenter) map.flyTo(latlng,map.getZoom(),{duration:.45});
  }

  center.on("drag",e=>radius.setLatLng(e.target.getLatLng()));
  center.on("dragend",e=>commitCenter(e.target.getLatLng()));

  return{
    map,
    setRadius(miles,pos){
      const ll=[pos.lat,pos.lng];
      radius.setLatLng(ll).setRadius(meters(miles));
      center.setLatLng(ll);
    },
    setSearchCenter(pos,{recenter=true,zoom}={}){
      const ll=L.latLng(pos.lat,pos.lng);
      radius.setLatLng(ll);
      center.setLatLng(ll);
      if(recenter) map.flyTo(ll,zoom??map.getZoom(),{duration:.7});
    },
    useMapCenter(){
      commitCenter(map.getCenter());
    },
    renderEvents(events,onSelect){
      layer.clearLayers();
      markers.clear();
      const groups=new Map();
      events.forEach(e=>{
        const key=e.lat.toFixed(4)+"|"+e.lng.toFixed(4);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(e);
      });
      groups.forEach(group=>{
        const e=group[0],count=group.length;
        const face=e.image?`<img src="${esc(e.image)}" alt="">`:`<span>${count>1?count:(SYMBOLS[e.category]||"•")}</span>`;
        const label=count>1?`${count} events`:e.title;
        const icon=L.divIcon({className:"event-marker-wrap",html:`<div class="event-marker"><div class="event-pin pin-${e.category} ${count>1?"event-stack":""}">${face}</div><span class="event-pin-label">${esc(label)}</span></div>`,iconSize:[180,38],iconAnchor:[16,19]});
        const marker=L.marker([e.lat,e.lng],{icon}).addTo(layer);
        marker.bindTooltip(count>1?`${count} events at ${e.venue}`:e.title,{direction:"top"});
        group.forEach(item=>markers.set(item.id,marker));
        marker.on("click",()=>onSelect(e.id));
      });
    },
    selectEvent(id){
      markers.forEach(m=>m.getElement()?.querySelector(".event-pin")?.classList.remove("selected-pin"));
      const marker=markers.get(id);
      marker?.getElement()?.querySelector(".event-pin")?.classList.add("selected-pin");
    },
    fitEvents(events){
      if(!events.length)return;
      const pts=events.map(e=>[e.lat,e.lng]);
      pts.push([state.center.lat,state.center.lng]);
      const bounds=L.latLngBounds(pts);
      map.invalidateSize({pan:false,animate:false});
      requestAnimationFrame(()=>map.fitBounds(bounds,{padding:[55,55],maxZoom:13,animate:false}));
    },
    flyTo(pos,zoom=12){map.flyTo([pos.lat,pos.lng],zoom,{duration:.7})}
  };
}
