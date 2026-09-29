let pending=null;
export async function ensureLeaflet(timeout=3000){
  if(window.L)return window.L;
  if(!pending){
    pending=new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      s.async=true;
      s.crossOrigin="anonymous";
      s.onload=()=>window.L?resolve(window.L):reject(new Error("Map library unavailable"));
      s.onerror=()=>reject(new Error("Map library failed to load"));
      document.head.appendChild(s);
    }).finally(()=>{pending=null});
  }
  return Promise.race([
    pending,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Map startup timed out")),timeout))
  ]);
}
