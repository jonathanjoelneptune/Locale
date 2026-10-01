import {hasPreciseLocation} from "../services/events.js";
import {meters} from "../services/geo.js";

export function createMap(el,state,onCenter,onMarker,onMapBackground,onViewportChange){
  const map=L.map(el,{zoomControl:true}).setView([state.center.lat,state.center.lng],state.zoom);
  Object.defineProperty(el,"__localeMap",{value:map,configurable:true});
  const styles={
    standard:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    humanitarian:"https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    satellite:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  };
  const attribution="&copy; OpenStreetMap contributors · HOT map style · Tiles &copy; Esri";
  let activeStyle=styles[state.mapStyle]?state.mapStyle:"standard";
  const base=L.tileLayer(styles[activeStyle],{
    maxZoom:19,
    subdomains:"abc",
    attribution
  }).addTo(map);
  base.options.localeBasemap=true;
  el.dataset.mapStyle=activeStyle;
  el.dataset.mapTileTemplate=styles[activeStyle];

  function setStyle(name){
    if(!styles[name]||name===activeStyle)return;
    activeStyle=name;
    base.setUrl(styles[name]);
    el.dataset.mapStyle=name;
    el.dataset.mapTileTemplate=styles[name];
  }

  const radius=L.circle([state.center.lat,state.center.lng],{radius:meters(state.radius),weight:1.25,color:"#159d8a",opacity:.65,fillColor:"#53cbb5",fillOpacity:.035,interactive:false}).addTo(map);
  const searchCenterPane=map.createPane("locale-search-center");
  searchCenterPane.style.zIndex="590";
  const center=L.marker([state.center.lat,state.center.lng],{
    draggable:true,
    pane:"locale-search-center",
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
  let lastEvents=[];
  let lastRenderZoom=map.getZoom();
  let userViewportIntent=false;
  let viewportNotifyTimer=0;
  const markUserViewportIntent=()=>{userViewportIntent=true};
  el.addEventListener("wheel",markUserViewportIntent,{passive:true});
  el.addEventListener("touchstart",markUserViewportIntent,{passive:true});
  el.addEventListener("dblclick",markUserViewportIntent);
  el.addEventListener("click",event=>{
    if(event.target.closest(".leaflet-control-zoom-in,.leaflet-control-zoom-out"))markUserViewportIntent();
  },true);
  map.on("dragstart",markUserViewportIntent);
  const notifyViewport=()=>{
    if(!userViewportIntent)return;
    clearTimeout(viewportNotifyTimer);
    viewportNotifyTimer=setTimeout(()=>{
      if(!userViewportIntent)return;
      userViewportIntent=false;
      const bounds=map.getBounds();
      onViewportChange?.({
        zoom:map.getZoom(),
        bounds:{
          south:bounds.getSouth(),
          west:bounds.getWest(),
          north:bounds.getNorth(),
          east:bounds.getEast()
        }
      });
    },80);
  };
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
  map.on("contextmenu",e=>{L.popup({closeButton:false,className:"locale-context"}).setLatLng(e.latlng).setContent(`<button class="center-here" type="button">⌖ Center marker here</button>`).openOn(map);setTimeout(()=>document.querySelector(".center-here")?.addEventListener("click",()=>{commitCenter(e.latlng,{recenter:true});map.closePopup()}),0)});

  const api={
    map,
    setStyle,
    getBasemapState(){return {activeStyle,url:base._url};},
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
    renderEvents(events){
      lastEvents=events;
      const mappableEvents=events.filter(hasPreciseLocation);
      const previousPositions=new Map;
      markers.forEach((marker,id)=>previousPositions.set(id,marker.getLatLng()));
      const previousZoom=lastRenderZoom;
      layer.clearLayers();
      markers.clear();
      const zoom=map.getZoom();
      const animateFromPrevious=previousPositions.size>0&&zoom!==previousZoom;
      lastRenderZoom=zoom;
      el.dataset.mapZoom=String(zoom);
      const FULLY_EXPANDED_ZOOM=17;
      const clusterPx=zoom<=10?76:zoom===11?60:zoom===12?46:zoom===13?34:zoom===14?22:12;
      const groups=[];

      if(zoom>=FULLY_EXPANDED_ZOOM){
        const coordinateBuckets=new Map();
        mappableEvents.forEach(e=>{
          const key=`${Number(e.lat).toFixed(5)},${Number(e.lng).toFixed(5)}`;
          if(!coordinateBuckets.has(key))coordinateBuckets.set(key,[]);
          coordinateBuckets.get(key).push(e);
        });
        coordinateBuckets.forEach(bucket=>{
          bucket.forEach((e,index)=>{
            const base=map.project([e.lat,e.lng],zoom);
            let p=base;
            if(bucket.length>1){
              const ring=Math.floor(index/8);
              const slot=index%8;
              const count=Math.min(8,bucket.length-ring*8);
              const angle=(Math.PI*2*slot)/Math.max(1,count)-(Math.PI/2);
              const radius=18+(ring*16);
              p=L.point(base.x+Math.cos(angle)*radius,base.y+Math.sin(angle)*radius);
            }
            groups.push({events:[e],p});
          });
        });
      }else{
        mappableEvents.forEach(e=>{
          const p=map.project([e.lat,e.lng],zoom);
          let g=groups.find(x=>x.events.some(v=>v.venue===e.venue)||Math.hypot(x.p.x-p.x,x.p.y-p.y)<=clusterPx);
          if(g){const n=g.events.length;g.events.push(e);g.p=L.point((g.p.x*n+p.x)/(n+1),(g.p.y*n+p.y)/(n+1));}
          else groups.push({events:[e],p});
        });
      }

      groups.forEach(g=>{
        const group=g.events,e=group[0],count=group.length;
        const target=zoom>=FULLY_EXPANDED_ZOOM?map.unproject(g.p,zoom):(count>1?map.unproject(g.p,zoom):L.latLng(e.lat,e.lng));
        const prior=group.map(item=>previousPositions.get(item.id)).filter(Boolean);
        const origin=animateFromPrevious&&prior.length
          ?L.latLng(prior.reduce((sum,pos)=>sum+pos.lat,0)/prior.length,prior.reduce((sum,pos)=>sum+pos.lng,0)/prior.length)
          :target;
        const face=count>1?`<span>${count}</span>`:(e.image?`<img src="${esc(e.image)}" alt="">`:`<span>${SYMBOLS[e.category]||"•"}</span>`);
        const label=count>1?`${count} events`:e.title;
        const icon=L.divIcon({className:"event-marker-wrap locale-event-marker-icon",html:`<div class="event-marker"><div class="event-pin pin-${e.category} ${count>1?"event-stack":""}">${face}</div><span class="event-pin-label">${esc(label)}</span></div>`,iconSize:[180,38],iconAnchor:[16,19]});
        const marker=L.marker(origin,{icon}).addTo(layer);
        marker.bindTooltip(count>1?`${count} nearby events`:e.title,{direction:"top"});
        group.forEach(item=>markers.set(item.id,marker));
        marker.on("click",ev=>{L.DomEvent.stopPropagation(ev);count>1?onMarker?.({type:"group",events:group,lat:target.lat,lng:target.lng,venue:group.every(x=>x.venue===e.venue)?e.venue:"Nearby events"}):onMarker?.({type:"single",event:e,marker})});

        if(animateFromPrevious&&origin.distanceTo(target)>1){
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const node=marker.getElement();
            if(node){
              node.classList.add("cluster-motion");
              node.style.transition="transform 320ms cubic-bezier(.2,.8,.2,1)";
            }
            marker.setLatLng(target);
            setTimeout(()=>{
              const current=marker.getElement();
              if(current){
                current.classList.remove("cluster-motion");
                current.style.transition="";
              }
            },360);
          }));
        }
      });
    },
    selectEvent(id){
      markers.forEach(marker=>marker.getElement()?.querySelector(".event-pin")?.classList.remove("selected-pin"));
      const marker=markers.get(id);
      marker?.getElement()?.querySelector(".event-pin")?.classList.add("selected-pin");
    },
    hoverEvent(id,on=true){
      const marker=markers.get(id);
      marker?.getElement()?.querySelector(".event-pin")?.classList.toggle("hover-pulse",!!on);
    },
    fitEvents(events){
      const precise=events.filter(hasPreciseLocation);
      if(!precise.length)return;
      const pts=precise.map(e=>[e.lat,e.lng]);
      pts.push([state.center.lat,state.center.lng]);
      const bounds=L.latLngBounds(pts);
      map.invalidateSize({pan:false,animate:false});
      requestAnimationFrame(()=>map.fitBounds(bounds,{padding:[55,55],maxZoom:13,animate:false}));
    },
    showEventPopup(e){
      if(!hasPreciseLocation(e))return;
      const price=e.price?`<strong>${esc(e.price)}</strong>`:(e.source==="Ticketmaster"?"Check price":"View event");
      const symbol=SYMBOLS[e.category]||"✦";
      const art=e.image
        ?`<div class="map-popup-art has-image"><img class="map-popup-img" src="${esc(e.image)}" alt=""></div>`
        :`<div class="map-popup-art category-art category-bg-${esc(e.category)} is-fallback"><span class="category-art-symbol" aria-hidden="true">${symbol}</span><small>${esc(e.category)}</small></div>`;
      const layout=e.image?"has-image":"no-image";
      L.popup({className:`event-map-popup popup-${e.category}`,maxWidth:300}).setLatLng([e.lat,e.lng]).setContent(`<div class="map-event-card event-surface category-surface-${esc(e.category)} ${layout}">${art}<div class="map-popup-copy"><b>${esc(e.title)}</b><span>${esc(e.venue)}</span><span>${esc(new Date(e.start).toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}))}</span>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${price} ↗</a>`:""}</div></div>`).openOn(map);
    },
    flyTo(pos,zoom=12){map.flyTo([pos.lat,pos.lng],zoom,{duration:.7})},
    getViewport(){
      const bounds=map.getBounds();
      return {
        zoom:map.getZoom(),
        bounds:{
          south:bounds.getSouth(),
          west:bounds.getWest(),
          north:bounds.getNorth(),
          east:bounds.getEast()
        }
      };
    }
  };
  map.on("zoomend",()=>{if(lastEvents.length)api.renderEvents(lastEvents);notifyViewport()});
  map.on("moveend",notifyViewport);
  map.on("click",()=>onMapBackground?.());
  el.addEventListener("click",e=>{if(e.target.closest(".leaflet-marker-icon,.leaflet-popup,.leaflet-control"))return;onMapBackground?.()});
  return api;
}
