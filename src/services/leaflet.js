export async function ensureLeaflet(timeout=2500){
  if(window.L)return window.L;
  const started=performance.now();
  while(performance.now()-started<timeout){
    await new Promise(r=>setTimeout(r,50));
    if(window.L)return window.L;
  }
  throw new Error("Map library did not initialize");
}
