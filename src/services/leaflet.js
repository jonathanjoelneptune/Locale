const SOURCES=[
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

function loadScript(src,timeout=5000){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    const timer=setTimeout(()=>{s.remove();reject(new Error("Timed out loading "+src))},timeout);
    s.src=src;s.async=true;
    s.onload=()=>{clearTimeout(timer);resolve()};
    s.onerror=()=>{clearTimeout(timer);s.remove();reject(new Error("Failed loading "+src))};
    document.head.appendChild(s);
  });
}
export async function ensureLeaflet(){
  if(window.L) return window.L;
  let last;
  for(const src of SOURCES){
    try{await loadScript(src);if(window.L)return window.L}catch(e){last=e}
  }
  throw last||new Error("Map library unavailable");
}
