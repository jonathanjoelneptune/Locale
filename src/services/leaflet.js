export async function ensureLeaflet(){
  if(window.L)return window.L;
  throw new Error("Map temporarily disabled while startup reliability is verified");
}
