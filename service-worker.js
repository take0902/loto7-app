const CACHE_NAME="ai-lottery-lab-disabled-30-1-1";
self.addEventListener("install",event=>{self.skipWaiting();});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",()=>{});
