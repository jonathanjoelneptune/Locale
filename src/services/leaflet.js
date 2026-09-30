let pending=null;

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=src;
    s.async=true;
    s.crossOrigin="anonymous";
    s.onload=()=>window.L?resolve(window.L):reject(new Error("Map library unavailable"));
    s.onerror=()=>{s.remove();reject(new Error("Map library failed to load"))};
    document.head.appendChild(s);
  });
}

export async function ensureLeaflet(timeout=7000){
  if(window.L)return window.L;
  if(!pending){
    pending=(async()=>{
      const sources=[
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      ];
      let lastError;
      for(const src of sources){
        try{return await loadScript(src)}
        catch(error){lastError=error}
      }
      throw lastError||new Error("Map library unavailable");
    })().finally(()=>{pending=null});
  }
  return Promise.race([
    pending,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Map startup timed out")),timeout))
  ]);
}
