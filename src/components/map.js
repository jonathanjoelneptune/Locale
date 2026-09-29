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
      const groups=new Map();
      events.forEach(e=>{
        const key=e.lat.toFixed(4)+"|"+e.lng.toFixed(4);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(e);
      });
      groups.forEach(group=>{
        const e=group[0],count=group.length;
        const icon=L.divIcon({className:"",html:`<div class="event-pin pin-${e.category} ${count>1?"event-stack":""}"><span>${count>1?count:e.category.slice(0,1).toUpperCase()}</span></div>`,iconSize:[30,34],iconAnchor:[15,17]});
        const marker=L.marker([e.lat,e.lng],{icon}).addTo(layer);
        marker.bindTooltip(count>1?`${count} events at ${e.venue}`:e.title,{direction:"top"});
        marker.on("click",()=>onSelect(e.id));
      });
    },
    flyTo(pos,zoom=12){map.flyTo([pos.lat,pos.lng],zoom,{duration:.7})}
  };
}
