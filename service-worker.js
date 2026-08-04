importScripts("./app-config.js");
const CACHE_NAME=(self.APP_CONFIG&&self.APP_CONFIG.CACHE_KEY)||"ai-lottery-lab-current";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",()=>{});
