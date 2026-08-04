const CACHE_NAME="ai-lottery-lab-disabled-31-0-1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",()=>{});
