const CACHE_NAME="ai-lottery-lab-professional-1-0-0";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",()=>{});
