// AI Lottery Lab Professional 2.1.1 — stable official-data and prize-check release
const config={
  loto6:{name:"ロト6",max:43,pick:6,bonus:1,file:"loto6.json",csv:"loto6_data.csv"},
  loto7:{name:"ロト7",max:37,pick:7,bonus:2,file:"loto7.json",csv:"loto7_data.csv"}
};
const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
let game="loto6", draws={};
const defaultUser={loto6:{sets:[],savedSets:[],checks:[]},loto7:{sets:[],savedSets:[],checks:[]}};
let user=loadUser();
let backtestResults={};
let optimizerResult=null;
const remoteUpdateState={loto6:{status:"待機中",source:"",checkedAt:"",error:""},loto7:{status:"待機中",source:"",checkedAt:"",error:""}};
const C=()=>config[game], R=()=>draws[game];

// 公式発表済みで、内蔵JSONへの反映待ちの抽選結果。
// JSON側に同じ回号が追加された場合は自動的に重複を除外します。
const supplementalDraws={loto6:[],loto7:[]};

function mergeDraws(base,extra=[]){
  const byNo=new Map();
  [...base,...extra].forEach(d=>{
    if(d&&Number.isFinite(Number(d.no)))byNo.set(Number(d.no),{
      ...d,no:Number(d.no),nums:[...(d.nums||[])].map(Number).sort((a,b)=>a-b),
      bonus:[...(d.bonus||[])].map(Number).sort((a,b)=>a-b)
    });
  });
  return [...byNo.values()].sort((a,b)=>a.no-b.no);
}


function verifiedCacheKey(g){return `loto67_verified_${g}_v2`}
function loadVerifiedDraw(g){
  try{
    const d=JSON.parse(localStorage.getItem(verifiedCacheKey(g))||"null");
    return validRemoteDraw(g,d)&&d.verified===true?d:null;
  }catch{return null}
}
function saveVerifiedDraw(g,draw){
  if(validRemoteDraw(g,draw)&&draw.verified===true){
    localStorage.setItem(verifiedCacheKey(g),JSON.stringify(draw));
  }
}
function latestVerifiedDraw(g=game){
  return [...(draws[g]||[])].reverse().find(d=>d.verified===true)||loadVerifiedDraw(g);
}

function prizeRank(g,main,bonus){
  if(g==="loto7"){
    if(main===7)return "1等";
    if(main===6&&bonus>=1)return "2等";
    if(main===6)return "3等";
    if(main===5)return "4等";
    if(main===4)return "5等";
    if(main===3&&bonus>=1)return "6等";
    return "はずれ";
  }
  if(main===6)return "1等";
  if(main===5&&bonus>=1)return "2等";
  if(main===5)return "3等";
  if(main===4)return "4等";
  if(main===3)return "5等";
  return "はずれ";
}

function loadUser(){
  try{
    const raw=localStorage.getItem("loto67v12")||localStorage.getItem("loto67v11")||localStorage.getItem("loto67v6");
    const parsed=raw?JSON.parse(raw):structuredClone(defaultUser);
    for(const g of ["loto6","loto7"]){
      parsed[g]??={};
      parsed[g].sets??=[];
      parsed[g].savedSets??=[];
      parsed[g].checks??=[];
      parsed[g].customWeights??=null;
      parsed[g].reviews??=[];
      // 旧版で抽選結果と予想対象回が混在したため、手動抽選キャッシュは廃棄する。
      parsed[g].manualDraws=[];
      parsed[g].featureWeights??={repeat:1,slide:1,bonusAdj:1,oddEven:1,sum:1,ac:1,range:1,consecutive:1};
      parsed[g].autoLearning??=true;
      parsed[g].learningLog??=[];
    }
    return parsed;
  }catch{return structuredClone(defaultUser)}
}
function save(){localStorage.setItem("loto67v12",JSON.stringify(user))}
function migrateDataIntegrity(){
  let changed=false;
  for(const g of ["loto6","loto7"]){
    if(Array.isArray(user[g].manualDraws)&&user[g].manualDraws.length){user[g].manualDraws=[];changed=true}
    user[g].reviews=(user[g].reviews||[]).filter(r=>{
      const p=(user[g].savedSets||[]).find(x=>Number(x.drawNo)===Number(r.no));
      return !p||Number(p.drawNo)===Number(r.no);
    });
  }
  if(changed)save();
}

function createSafetyBackup(reason="自動バックアップ"){
  try{localStorage.setItem("loto67v12_last_backup",JSON.stringify({reason,date:new Date().toISOString(),user:structuredClone(user)}));return true}catch{return false}
}
function restoreSafetyBackup(){
  try{
    const raw=localStorage.getItem("loto67v12_last_backup");if(!raw)return alert("復元できるバックアップがありません");
    const data=JSON.parse(raw);if(!data?.user?.loto6||!data?.user?.loto7)throw new Error("バックアップ形式が不正です");
    if(!confirm(`${new Date(data.date).toLocaleString("ja-JP")} のバックアップを復元しますか？\n理由：${data.reason||"-"}`))return;
    user=data.user;save();location.reload();
  }catch(e){alert(`復元できませんでした：${e.message||e}`)}
}
function reviewForPurchase(x){
  const reviews=user[game].reviews||[];
  return reviews.find(r=>Number(r.no)===Number(x.drawNo)&&(r.savedId===x.id||r.savedDate===x.date))||reviews.find(r=>Number(r.no)===Number(x.drawNo));
}
function bestRankFromReview(review){
  if(!review?.matches?.length)return null;
  const order={"1等":1,"2等":2,"3等":3,"4等":4,"5等":5,"6等":6,"はずれ":99};
  return [...review.matches].sort((a,b)=>(order[a.rank]||99)-(order[b.rank]||99))[0]?.rank||null;
}
function duplicateSets(sets){
  const seen=new Map(),dupes=[];(sets||[]).forEach((a,i)=>{const k=[...a].sort((x,y)=>x-y).join(",");if(seen.has(k))dupes.push([seen.get(k)+1,i+1]);else seen.set(k,i)});return dupes;
}
function reviewBalls(set,winning,bonus){return `<div class="balls">${set.map(n=>`<span class="ball${winning.includes(n)?" hit-main":bonus.includes(n)?" hit-bonus":""}">${String(n).padStart(2,"0")}</span>`).join("")}</div>`}
function injectRuntimeStyles(){
  if(document.getElementById("ver21Styles"))return;const style=document.createElement("style");style.id="ver21Styles";
  style.textContent=`.purchase-tools{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.purchase-tools input,.purchase-tools select{width:100%;box-sizing:border-box}.purchase-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.purchase-summary article{padding:14px;border-radius:14px;background:#f4f6fb;text-align:center}.purchase-summary b{display:block;font-size:1.35rem}.purchase-summary span{font-size:.82rem;color:#6b7280}.purchase-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.purchase-note{white-space:pre-wrap;padding:10px;border-radius:10px;background:#f6f7fb;margin:8px 0}.purchase-status{font-weight:800}.purchase-status.win{color:#c026d3}.purchase-status.pending{color:#b45309}.purchase-status.lose{color:#64748b}.ball.hit-main{background:linear-gradient(135deg,#10b981,#22c55e)!important;box-shadow:0 0 0 4px rgba(16,185,129,.18)}.ball.hit-bonus{background:linear-gradient(135deg,#f59e0b,#facc15)!important;color:#422006!important;box-shadow:0 0 0 4px rgba(245,158,11,.18)}.match-legend{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0;font-size:.85rem}.match-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:5px}.match-legend .m{background:#10b981}.match-legend .b{background:#f59e0b}.duplicate-warning{padding:10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:700;margin:8px 0}@media(min-width:700px){.purchase-summary{grid-template-columns:repeat(4,minmax(0,1fr))}.purchase-actions{grid-template-columns:repeat(4,minmax(0,1fr))}}`;
  document.head.appendChild(style)
}
const APP_META=Object.freeze({
  name:"AI Lottery Lab Professional",
  version:"2.1.1",
  engine:"PRO 2.1.1",
  build:"2026-08-06-auto-official-flat"
});
function applyAppMeta(){
  document.title=`${APP_META.name} ${APP_META.version}`;
  document.querySelectorAll("[data-app-version]").forEach(el=>{el.textContent=APP_META.version});
  document.querySelectorAll("[data-engine-version]").forEach(el=>{el.textContent=APP_META.engine});
  document.querySelectorAll("[data-build-date]").forEach(el=>{el.textContent=APP_META.build});
}

function makePurchaseId(){
  return `p_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}
function normalizePurchaseRecord(x,index=0){
  const sets=Array.isArray(x?.sets)?x.sets.map(a=>[...a].map(Number).sort((a,b)=>a-b)):[];
  return {
    ...x,
    id:x?.id||makePurchaseId(),
    drawNo:Number.isInteger(Number(x?.drawNo))&&Number(x.drawNo)>0?Number(x.drawNo):null,
    date:x?.date||new Date(Date.now()-index*1000).toISOString(),
    updatedAt:x?.updatedAt||x?.date||new Date().toISOString(),
    note:String(x?.note||""),
    sets
  };
}
function migratePurchases(){
  for(const g of ["loto6","loto7"]){
    user[g].savedSets=(user[g].savedSets||[]).map(normalizePurchaseRecord);
  }
  save();
}
function nextDrawNo(g=game){
  return Number(draws[g]?.at(-1)?.no||0)+1;
}
function purchaseById(id){
  return (user[game].savedSets||[]).find(x=>x.id===id);
}
function purchaseIndexById(id){
  return (user[game].savedSets||[]).findIndex(x=>x.id===id);
}
function parsePurchaseText(text){
  const lines=String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const sets=lines.map(parseNums);
  if(!sets.length)throw new Error("購入セットを1口以上入力してください");
  if(sets.some(a=>a.length!==C().pick))throw new Error(`各口を${C().pick}個の数字で入力してください`);
  if(sets.some(a=>new Set(a).size!==C().pick))throw new Error("同じ口の中に重複数字があります");
  if(sets.some(a=>a.some(n=>n<1||n>C().max)))throw new Error(`数字は1～${C().max}で入力してください`);
  return sets;
}
function purchaseText(sets){
  return (sets||[]).map(a=>a.map(n=>String(n).padStart(2,"0")).join(",")).join("\n");
}
function parseCsvRows(text,g){
  const c=config[g];
  const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<2)return [];
  const split=line=>line.split(/[,\t;]/).map(x=>x.trim().replace(/^"|"$/g,""));
  const header=split(lines[0]).map(x=>x.toLowerCase().replace(/\s+/g,""));
  const indexOf=(names)=>{for(const n of names){const i=header.indexOf(n);if(i>=0)return i}return -1};
  const noI=indexOf(["no","回","回号","回別","draw","drawno","number"]);
  const dateI=indexOf(["date","抽選日","抽せん日","日付"]);
  let numIdx=[];
  for(let i=1;i<=c.pick;i++)numIdx.push(indexOf([`n${i}`,`num${i}`,`number${i}`,`本数字${i}`,`数字${i}`]));
  let bonusIdx=[];
  for(let i=1;i<=c.bonus;i++)bonusIdx.push(indexOf([`b${i}`,`bonus${i}`,`ボーナス${i}`,`bonus数字${i}`]));
  const headerDetected=numIdx.every(i=>i>=0);
  const rows=[];
  for(let li=headerDetected?1:0;li<lines.length;li++){
    const a=split(lines[li]);
    let no,date,nums,bonus;
    if(headerDetected){
      no=Number(a[noI]);date=dateI>=0?a[dateI]:"";
      nums=numIdx.map(i=>Number(a[i]));bonus=bonusIdx.map(i=>Number(a[i]));
    }else{
      // 代表的な並び: 回号,日付,本数字...,ボーナス... / 日付,本数字...,ボーナス...
      const firstIsDate=/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(a[0]||"");
      if(firstIsDate){date=a[0];nums=a.slice(1,1+c.pick).map(Number);bonus=a.slice(1+c.pick,1+c.pick+c.bonus).map(Number);no=li+1}
      else{no=Number(String(a[0]||"").replace(/\D/g,""));date=a[1]||"";nums=a.slice(2,2+c.pick).map(Number);bonus=a.slice(2+c.pick,2+c.pick+c.bonus).map(Number)}
    }
    const d={no:Number(no),date:String(date||"").replace(/\//g,"-"),nums,bonus};
    if(validRemoteDraw(g,d))rows.push({...d,verified:false,source:"履歴CSV"});
  }
  return mergeDraws([],rows);
}

async function fetchCsvHistory(g){
  const path=config[g].csv;
  try{
    const r=await fetch(`${path}?v=2.1.1`,{cache:"no-store"});
    if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
    const rows=parseCsvRows(await r.text(),g);
    if(rows.length<10)throw new Error(`${path}: 有効データが${rows.length}回分しかありません`);
    return rows;
  }catch(e){console.warn("CSV履歴を利用できません",g,e);return []}
}

async function loadJson(path){
  const gameKey=path.startsWith("loto6")?"loto6":"loto7";
  const csvRows=await fetchCsvHistory(gameKey);
  let jsonRows=[];
  try{
    const r=await fetch(`${path}?v=2.1.1`,{cache:"no-store"});
    if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
    const data=await r.json();
    if(!Array.isArray(data)||!data.length)throw new Error(`${path}: データ形式エラー`);
    jsonRows=data.filter(d=>validRemoteDraw(gameKey,d)).map(d=>({...d,verified:d.verified===true,source:d.source||"内蔵JSON"}));
  }catch(primaryError){
    const backupPath=gameKey==="loto6"?"loto6_latest_backup.json":"loto7_latest_backup.json";
    try{
      const r=await fetch(`${backupPath}?v=2.1.1`,{cache:"no-store"});
      if(!r.ok)throw new Error(`${backupPath}: HTTP ${r.status}`);
      const d=await r.json();if(validRemoteDraw(gameKey,d))jsonRows=[{...d,verified:d.verified===true,source:d.source||"内蔵バックアップ"}];
    }catch(backupError){console.warn("JSONとバックアップを取得できません",primaryError,backupError)}
  }
  const cached=loadVerifiedDraw(gameKey);
  const manual=loadManualOfficial(gameKey);
  const merged=mergeDraws(csvRows,[...jsonRows,...(cached?[cached]:[]),...(manual?[manual]:[])]);
  if(merged.length)return merged;
  throw new Error(`${gameKey}: 利用可能な抽選履歴がありません`);
}

function validRemoteDraw(g,d){
  const c=config[g];
  return d&&Number.isInteger(Number(d.no))&&Number(d.no)>0&&
    Array.isArray(d.nums)&&d.nums.length===c.pick&&new Set(d.nums.map(Number)).size===c.pick&&
    Array.isArray(d.bonus)&&d.bonus.length===c.bonus&&new Set(d.bonus.map(Number)).size===c.bonus&&
    [...d.nums,...d.bonus].every(n=>Number.isInteger(Number(n))&&Number(n)>=1&&Number(n)<=c.max)&&
    !d.bonus.some(n=>d.nums.includes(n));
}
function normalizeOfficialDate(value){
  const s=String(value||"").trim();
  const m=s.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if(!m)return "";
  return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
function decodeOfficialBuffer(buffer){
  const bytes=new Uint8Array(buffer),candidates=[];
  for(const enc of ["shift_jis","utf-8"]){
    try{candidates.push(new TextDecoder(enc,{fatal:false}).decode(bytes))}catch{}
  }
  return candidates.sort((a,b)=>((b.match(/ロト|本数字|ボーナス|抽せん/g)||[]).length)-((a.match(/ロト|本数字|ボーナス|抽せん/g)||[]).length))[0]||"";
}
function officialCells(line){return String(line||"").split(/[,\t]/).map(x=>x.trim().replace(/^"|"$/g,""))}
function officialNumsFromLine(line,max){return officialCells(line).flatMap(x=>(x.match(/\d{1,2}/g)||[]).map(Number)).filter(n=>n>=1&&n<=max)}
function parseOfficialCsvClient(text,filename,g){
  const c=config[g],normalized=String(text||"").replace(/\r/g,"");
  const lines=normalized.split("\n").map(x=>x.trim()).filter(Boolean);
  const filenameNo=Number((String(filename).match(/(\d{4})\.CSV$/i)||[])[1]);
  const textNoMatch=normalized.match(/第\s*(\d+)\s*回/);
  const no=Number(textNoMatch?.[1]||filenameNo||0);
  const dateLine=lines.find(x=>/抽せん日|抽選日|日付/.test(x))||normalized;
  const date=normalizeOfficialDate(dateLine);
  let nums=[],bonus=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/本数字/.test(line)){
      nums=officialNumsFromLine(line.replace(/^.*?本数字/,""),c.max);
      if(nums.length<c.pick&&lines[i+1])nums=nums.concat(officialNumsFromLine(lines[i+1],c.max));
      nums=nums.slice(0,c.pick);
    }
    if(/ボーナス/.test(line)){
      bonus=officialNumsFromLine(line.replace(/^.*?ボーナス(?:数字)?/,""),c.max);
      if(bonus.length<c.bonus&&lines[i+1])bonus=bonus.concat(officialNumsFromLine(lines[i+1],c.max));
      bonus=bonus.slice(0,c.bonus);
    }
  }
  const flat=officialCells(normalized.replace(/\n/g,","));
  if(nums.length!==c.pick){
    const i=flat.findIndex(x=>/本数字/.test(x));
    if(i>=0)nums=flat.slice(i+1).flatMap(x=>(x.match(/^\d{1,2}$/)||[]).map(Number)).filter(n=>n>=1&&n<=c.max).slice(0,c.pick);
  }
  if(bonus.length!==c.bonus){
    const i=flat.findIndex(x=>/ボーナス/.test(x));
    if(i>=0)bonus=flat.slice(i+1).flatMap(x=>(x.match(/^\d{1,2}$/)||[]).map(Number)).filter(n=>n>=1&&n<=c.max).slice(0,c.bonus);
  }
  const draw={no,date,nums:nums.map(Number).sort((a,b)=>a-b),bonus:bonus.map(Number).sort((a,b)=>a-b),verified:true,source:"みずほ銀行公式CSV"};
  if(!date){
    // CSVによって抽せん日が分離している場合の予備抽出
    const dm=normalized.match(/(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);
    if(dm)draw.date=`${dm[1]}-${dm[2].padStart(2,"0")}-${dm[3].padStart(2,"0")}`;
  }
  if(!validRemoteDraw(g,draw)||!draw.date)throw new Error(`公式CSVを解析できません: ${filename}`);
  return draw;
}
async function fetchOfficialLatestFlat(g){
  const base=`/official/${g}/`;
  const nameRes=await fetch(`${base}name.txt?_=${Date.now()}`,{cache:"no-store"});
  if(!nameRes.ok)throw new Error(`公式一覧 HTTP ${nameRes.status}`);
  const nameText=decodeOfficialBuffer(await nameRes.arrayBuffer());
  const files=[...nameText.matchAll(/NAME\s+([^\s]+\.CSV)/gi)].map(m=>m[1]);
  if(!files.length)throw new Error("公式最新ファイル名を取得できません");
  files.sort((a,b)=>Number((b.match(/(\d{4})\.CSV$/i)||[])[1]||0)-Number((a.match(/(\d{4})\.CSV$/i)||[])[1]||0));
  let lastError=null;
  for(const filename of files.slice(0,3)){
    try{
      const csvRes=await fetch(`${base}${encodeURIComponent(filename)}?_=${Date.now()}`,{cache:"no-store"});
      if(!csvRes.ok)throw new Error(`${filename} HTTP ${csvRes.status}`);
      const text=decodeOfficialBuffer(await csvRes.arrayBuffer());
      return parseOfficialCsvClient(text,filename,g);
    }catch(e){lastError=e}
  }
  throw lastError||new Error("公式CSVを取得できません");
}
async function fetchRemoteLatest(g,{silent=false}={}){
  const state=remoteUpdateState[g];
  state.status="公式確認中";state.error="";
  if(!silent)renderRemoteUpdatePanel();
  try{
    const draw=await fetchOfficialLatestFlat(g);
    const before=draws[g]?.at(-1)?.no||0;
    draws[g]=mergeDraws(draws[g]||[],[draw]);
    saveVerifiedDraw(g,draw);
    state.status=draw.no>before?"公式データ更新完了":"公式最新確認済み";
    state.source="みずほ銀行公式CSV（Vercelリライト経由）";
    state.checkedAt=new Date().toISOString();
    state.error="";
    await autoReviewMatchingOfficial(g,draw);
    return draw;
  }catch(officialError){
    // 公式取得失敗時は内蔵データを表示に使うだけで、当せん判定には使用しない。
    try{
      const r=await fetch(`latest.json?_=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)throw new Error(`latest.json HTTP ${r.status}`);
      const payload=await r.json(),data=payload?.[g]||payload?.draw||payload;
      if(validRemoteDraw(g,data))draws[g]=mergeDraws(draws[g]||[],[{...data,verified:false,source:"内蔵フォールバック"}]);
    }catch{}
    state.status="公式取得失敗";
    state.error=String(officialError.message||officialError);
    state.source="内蔵データ（当せん判定には不使用）";
    state.checkedAt=new Date().toISOString();
    return null;
  }finally{
    if(!silent)render();
  }
}
async function autoReviewMatchingOfficial(g,draw){
  if(!draw?.verified)return;
  const saved=user[g]?.savedSets||[];
  const matching=saved.filter(x=>Number(x.drawNo)===Number(draw.no));
  if(!matching.length)return;
  const existing=user[g]?.reviews||[];
  const pending=matching.filter(x=>!existing.some(r=>Number(r.no)===Number(draw.no)&&(r.savedId===x.id||r.savedDate===x.date)));
  if(!pending.length)return;
  const oldGame=game;game=g;
  render();
  for(const purchase of pending){
    const index=(user[g].savedSets||[]).findIndex(x=>x.id===purchase.id);
    if(index<0)continue;
    $("#reviewSavedSet").value=String(index);
    $("#reviewDrawNo").value=draw.no;
    $("#reviewWinning").value=draw.nums.join(",");
    $("#reviewBonus").value=draw.bonus.join(",");
    runAutoReview({requireVerified:true});
  }
  game=oldGame;render();
}


function manualResultKey(g){return `loto67_manual_official_${g}_v21`}
function loadManualOfficial(g){
  try{const d=JSON.parse(localStorage.getItem(manualResultKey(g))||"null");return validRemoteDraw(g,d)&&d.verified===true?d:null}catch{return null}
}
function saveManualOfficial(g,d){localStorage.setItem(manualResultKey(g),JSON.stringify(d))}
function ensureManualResultPanel(){
  if($("#manualResultPanel"))return;
  const remote=$("#remoteUpdatePanel");if(!remote)return;
  const card=document.createElement("div");card.id="manualResultPanel";card.className="card";
  remote.insertAdjacentElement("afterend",card);
}
function renderManualResultPanel(){
  ensureManualResultPanel();const box=$("#manualResultPanel");if(!box)return;
  const c=C(), current=loadManualOfficial(game), latest=R()?.at(-1);
  box.innerHTML=`<h2>最新当たり番号を登録</h2><p class="muted">公式自動取得が失敗した場合だけ使用する予備入力です。通常は上の「公式データを自動取得」を押してください。</p>
  <label>抽選回号</label><input id="manualOfficialNo" inputmode="numeric" value="${current?.no||latest?.no||''}">
  <label>抽選日</label><input id="manualOfficialDate" type="date" value="${current?.date||latest?.date||''}">
  <label>本数字（カンマ区切り）</label><input id="manualOfficialNums" value="${current?.nums?.join(',')||''}" placeholder="例：1,2,3,4,5,6">
  <label>ボーナス数字</label><input id="manualOfficialBonus" value="${current?.bonus?.join(',')||''}" placeholder="例：7">
  <label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="manualOfficialConfirm" type="checkbox"> 宝くじ公式サイトで照合しました</label>
  <button id="saveManualOfficialBtn" class="primary">公式確認済みとして保存</button>
  <p id="manualOfficialStatus" class="muted">${current?`保存済み：第${current.no}回`:'未登録'}</p>`;
  $("#saveManualOfficialBtn").onclick=saveManualOfficialFromForm;
}
function saveManualOfficialFromForm(){
  const no=Number($("#manualOfficialNo").value),date=$("#manualOfficialDate").value;
  const nums=parseNums($("#manualOfficialNums").value),bonus=parseNums($("#manualOfficialBonus").value);
  if(!$("#manualOfficialConfirm").checked)return alert("公式サイトで照合した場合だけ保存できます。");
  const d={no,date,nums,bonus,verified:true,source:"ユーザー手動登録（宝くじ公式照合済み）"};
  if(!validRemoteDraw(game,d))return alert(`数字の個数・重複・範囲を確認してください。本数字${C().pick}個、ボーナス${C().bonus}個です。`);
  const current=R()?.at(-1);
  if(current&&Number(d.no)<Number(current.no)&&!confirm(`現在の収録最新回は第${current.no}回です。古い第${d.no}回を登録しますか？`))return;
  saveManualOfficial(game,d);saveVerifiedDraw(game,d);draws[game]=mergeDraws(draws[game]||[],[d]);
  remoteUpdateState[game]={status:"手動更新完了",source:d.source,checkedAt:new Date().toISOString(),error:""};
  autoReviewMatchingOfficial(game,d);render();
}
async function refreshAllLatest(){
  const btn=$("#refreshLatestBtn");if(btn)btn.disabled=true;
  await Promise.all([fetchRemoteLatest("loto6",{silent:true}),fetchRemoteLatest("loto7",{silent:true})]);
  render();if(btn)btn.disabled=false;
}
function ensureRemoteUpdatePanel(){
  if($("#remoteUpdatePanel"))return;
  const health=$("#dataHealth");if(!health)return;
  const card=document.createElement("div");card.id="remoteUpdatePanel";card.className="card";
  health.parentElement?.insertAdjacentElement("afterend",card);
}
function renderRemoteUpdatePanel(){
  ensureRemoteUpdatePanel();const box=$("#remoteUpdatePanel");if(!box)return;
  const s=remoteUpdateState[game],last=R()?.at(-1);
  const checked=s.checkedAt?new Date(s.checkedAt).toLocaleString("ja-JP"):"未確認";
  box.innerHTML=`<h2>最新データ確認</h2><p><b>${C().name}：第${last?.no||"-"}回 ${last?.verified?"｜公式確認済み":"｜公式未確認"}</b></p><p class="${s.status==="確認失敗"?"warn":"ok"}">${s.status}</p><p class="muted">最終確認：${checked}${s.source?`<br>取得元：${s.source}`:""}${s.error?`<br>詳細：${s.error}`:""}</p><button id="refreshLatestBtn" class="primary">ロト6・ロト7の公式データを自動取得</button>`;
  $("#refreshLatestBtn").onclick=refreshAllLatest;
}
async function boot(){
  try{
    migrateDataIntegrity();
    draws.loto6=mergeDraws(await loadJson(config.loto6.file),supplementalDraws.loto6);
    draws.loto7=mergeDraws(await loadJson(config.loto7.file),supplementalDraws.loto7);
    migratePurchases();
    injectRuntimeStyles();
    bind(); render();
    applyAppMeta();
    await Promise.all([fetchRemoteLatest("loto6",{silent:true}),fetchRemoteLatest("loto7",{silent:true})]);
    render();applyAppMeta();
    if("serviceWorker" in navigator){
      navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{});
    }
    if("caches" in window){caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});}
  }catch(e){
    console.error(e);
    document.body.innerHTML=`<main><div class="card"><h2>データを読み込めませんでした</h2><p>${String(e.message||e)}</p><button onclick="location.reload()" class="primary">再読み込み</button></div></main>`;
  }
}
function bind(){
  const scoreStrategy=$("#scoreStrategy");if(scoreStrategy)scoreStrategy.onchange=renderScoreboard;
  $$("[data-game]").forEach(b=>b.onclick=()=>{
    game=b.dataset.game;
    $$("[data-game]").forEach(x=>x.classList.toggle("active",x===b));
    document.body.classList.toggle("loto7",game==="loto7");
    render();
  });
  $$("[data-tab]").forEach(b=>b.onclick=()=>{
    $$("[data-tab]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $$("section").forEach(s=>s.classList.remove("active"));
    $("#"+b.dataset.tab).classList.add("active");
    if(b.dataset.tab==="report")renderReport();
    if(b.dataset.tab==="lab")renderLab();
    if(b.dataset.tab==="simulator")renderSimulatorDefaults();
    if(b.dataset.tab==="purchase")renderPurchaseMode();
  });
  $("#analysisWindow").onchange=renderAnalysis;
  $("#reportWindow").onchange=renderReport;
  $("#strategy").onchange=renderCandidateScores;
  $("#generateBtn").onclick=generate;
  $("#saveSetsBtn").onclick=saveCurrentSets;
  $("#validateBtn").onclick=validate;
  $("#historySearch").oninput=renderHistory;
  $("#exportBtn").onclick=exportData;
  $("#importBtn").onclick=importData;
  $("#copyReportBtn").onclick=copyReport;
  $("#runBacktestBtn").onclick=runBacktest;
  $("#runOptimizerBtn").onclick=runOptimizer;
  $("#themeBtn").onclick=toggleTheme;
  initTheme();
  $("#applyWeightsBtn").onclick=applyOptimizedWeights;
  $("#resetWeightsBtn").onclick=resetOptimizedWeights;
  $("#autoReviewBtn").onclick=runLatestAutoReview;
  $("#runReviewBtn").onclick=runAutoReview;
  $("#applyReviewBtn").onclick=applyReviewLearning;
  ensurePurchaseManager();
  if($("#labWindow"))$("#labWindow").onchange=renderLab;
  if($("#toggleAutoLearningBtn"))$("#toggleAutoLearningBtn").onclick=toggleAutoLearning;
  if($("#resetLearningBtn"))$("#resetLearningBtn").onclick=resetFeatureLearning;
  if($("#runSimulatorBtn"))$("#runSimulatorBtn").onclick=runConditionSimulator;
  if($("#resetSimulatorBtn"))$("#resetSimulatorBtn").onclick=resetConditionSimulator;
  if($("#exportExcelBtn"))$("#exportExcelBtn").onclick=exportPurchaseExcel;
  if($("#exportCsvBtn"))$("#exportCsvBtn").onclick=exportPurchaseCsv;
  if($("#copyPurchaseBtn"))$("#copyPurchaseBtn").onclick=copyPurchaseMode;
  if($("#printPurchaseBtn"))$("#printPurchaseBtn").onclick=()=>window.print();
  let prompt;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();prompt=e;$("#installBtn").hidden=false});
  $("#installBtn").onclick=async()=>{if(prompt){prompt.prompt();await prompt.userChoice;prompt=null;$("#installBtn").hidden=true}};
}
function balls(a){return `<div class="balls">${a.map(n=>`<span class="ball">${String(n).padStart(2,"0")}</span>`).join("")}</div>`}
function parseNums(v){return v.split(/[,\s、・]+/).map(Number).filter(Boolean).sort((a,b)=>a-b)}
function rowsFor(v){return v==="all"?R():R().slice(-Number(v))}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function std(a){const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function seededShuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function gapOf(n, rows=R()){
  const i=[...rows].reverse().findIndex(r=>Array.isArray(r.nums)&&r.nums.includes(n));
  return i<0?rows.length:i;
}
function stats(v){
  const rows=rowsFor(v), count=Array(C().max+1).fill(0);
  rows.forEach(r=>r.nums.forEach(n=>count[n]++));
  const rank=[];
  for(let n=1;n<=C().max;n++){
    const i=[...rows].reverse().findIndex(r=>r.nums.includes(n));
    rank.push({n,c:count[n],gap:i<0?rows.length:i,rate:rows.length?count[n]/rows.length:0});
  }
  rank.sort((a,b)=>b.c-a.c||b.gap-a.gap||a.n-b.n);
  return{rows,rank,count};
}
function multiScore(strategy="balanced"){
  const windows=[["10",.18],["30",.22],["50",.18],["100",.18],["200",.12],["all",.12]];
  const scores={};
  for(let n=1;n<=C().max;n++)scores[n]={n,total:0,hot:0,gap:0,stability:0};
  for(const [w,weight] of windows){
    const s=stats(w), maxC=Math.max(...s.rank.map(x=>x.c),1), maxGap=Math.max(...s.rank.map(x=>x.gap),1);
    s.rank.forEach(x=>{
      scores[x.n].hot += (x.c/maxC)*weight;
      scores[x.n].gap += (x.gap/maxGap)*weight;
      scores[x.n].stability += (1-Math.abs(x.rate-(C().pick/C().max)))*weight;
    });
  }
  const latest=R().at(-1).nums;
  Object.values(scores).forEach(x=>{
    const repeat=latest.includes(x.n)?1:0;
    const custom=user[game]?.customWeights;
    if(strategy==="balanced"&&custom){
      x.total=x.hot*custom.hot+x.gap*custom.gap+x.stability*custom.stability+repeat*custom.repeat;
    }else if(strategy==="hot")x.total=x.hot*.72+x.gap*.10+x.stability*.13+repeat*.05;
    else if(strategy==="gap")x.total=x.hot*.22+x.gap*.58+x.stability*.15+repeat*.05;
    else if(strategy==="diverse")x.total=x.hot*.30+x.gap*.30+x.stability*.35+repeat*.05;
    else x.total=x.hot*.42+x.gap*.28+x.stability*.25+repeat*.05;
  });
  return Object.values(scores).sort((a,b)=>b.total-a.total||a.n-b.n);
}
function acValue(a){const d=new Set;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)d.add(a[j]-a[i]);return d.size-(a.length-1)}
function setMetrics(a){
  const sum=a.reduce((x,y)=>x+y,0),odd=a.filter(n=>n%2).length;
  let consecutive=0,sameLast=0;
  for(let i=1;i<a.length;i++){if(a[i]===a[i-1]+1)consecutive++;if(a[i]%10===a[i-1]%10)sameLast++}
  return{sum,odd,consecutive,sameLast,ac:acValue(a),range:a.at(-1)-a[0]};
}

function learnedFeatureScore(a){
  const rows=rowsFor("200"),latest=R().at(-1)||{nums:[],bonus:[]},m=setMetrics(a);
  const normal=(value,values)=>{
    const s=Math.max(std(values),1);
    return clamp(1-Math.abs(value-mean(values))/(2*s),0,1);
  };
  const values={
    repeat:clamp(1-Math.abs(a.filter(n=>latest.nums.includes(n)).length-1)/2,0,1),
    slide:clamp(1-Math.abs(a.filter(n=>latest.nums.some(x=>Math.abs(x-n)===1)).length-2)/3,0,1),
    bonusAdj:clamp(a.filter(n=>latest.bonus.some(x=>Math.abs(x-n)===1)).length/1.5,0,1),
    oddEven:1-Math.abs(m.odd-C().pick/2)/(C().pick/2),
    sum:normal(m.sum,rows.map(r=>r.nums.reduce((x,y)=>x+y,0))),
    ac:normal(m.ac,rows.map(r=>acValue(r.nums))),
    range:normal(m.range,rows.map(r=>r.nums.at(-1)-r.nums[0])),
    consecutive:normal(m.consecutive,rows.map(r=>setMetrics(r.nums).consecutive))
  };
  let total=0,weightTotal=0;
  for(const [key,value] of Object.entries(values)){
    const weight=user[game].featureWeights?.[key]||1;
    total+=value*weight;weightTotal+=weight;
  }
  return Math.round(total/Math.max(weightTotal,1)*100);
}
function adaptiveStructureScore(a){
  return Math.round(structureScore(a)*.55+learnedFeatureScore(a)*.45);
}

function structureScore(a){
  const m=setMetrics(a), historical=rowsFor("200");
  const sums=historical.map(r=>r.nums.reduce((x,y)=>x+y,0));
  const targetSum=median(sums), targetOdd=C().pick/2, targetRange=C().max*.68;
  let score=100;
  score-=Math.abs(m.sum-targetSum)*.45;
  score-=Math.abs(m.odd-targetOdd)*8;
  score-=Math.max(0,m.consecutive-1)*7;
  score-=m.sameLast*4;
  score-=Math.abs(m.range-targetRange)*.65;
  if(m.ac<Math.max(2,C().pick-3))score-=10;
  return Math.round(clamp(score,0,100));
}
function overlap(a,b){return a.filter(n=>b.includes(n)).length}
function weightedPick(candidates, chosen){
  const usable=candidates.filter(x=>!chosen.includes(x.n));
  const total=usable.reduce((s,x)=>s+Math.max(x.total,.001),0);
  let r=Math.random()*total;
  for(const x of usable){r-=Math.max(x.total,.001);if(r<=0)return x.n}
  return usable.at(-1)?.n;
}
function createCandidateSet(scores,strategy){
  let chosen=[], attempts=0;
  while(chosen.length<C().pick&&attempts<300){
    attempts++;
    const n=weightedPick(scores,chosen);
    if(!n)break;
    const test=[...chosen,n].sort((a,b)=>a-b);
    const m=setMetrics(test);
    if(test.length>=4&&m.consecutive>2)continue;
    if(test.length>=5&&m.sameLast>2)continue;
    chosen=test;
  }
  return chosen.sort((a,b)=>a-b);
}

function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  }
}
function historicalRows(endExclusive){
  return R().slice(0,endExclusive);
}
function historicalStats(rows,windowValue){
  const subset=windowValue==="all"?rows:rows.slice(-Number(windowValue));
  const count=Array(C().max+1).fill(0);
  subset.forEach(r=>r.nums.forEach(n=>count[n]++));
  const rank=[];
  for(let n=1;n<=C().max;n++){
    const i=[...subset].reverse().findIndex(r=>r.nums.includes(n));
    rank.push({n,c:count[n],gap:i<0?subset.length:i,rate:subset.length?count[n]/subset.length:0});
  }
  rank.sort((a,b)=>b.c-a.c||b.gap-a.gap||a.n-b.n);
  return{rows:subset,rank,count};
}
function historicalMultiScore(rows,strategy="balanced"){
  const windows=[["10",.18],["30",.22],["50",.18],["100",.18],["200",.12],["all",.12]];
  const scores={};
  for(let n=1;n<=C().max;n++)scores[n]={n,total:0,hot:0,gap:0,stability:0};
  for(const [w,weight] of windows){
    const s=historicalStats(rows,w), maxC=Math.max(...s.rank.map(x=>x.c),1), maxGap=Math.max(...s.rank.map(x=>x.gap),1);
    s.rank.forEach(x=>{
      scores[x.n].hot += (x.c/maxC)*weight;
      scores[x.n].gap += (x.gap/maxGap)*weight;
      scores[x.n].stability += (1-Math.abs(x.rate-(C().pick/C().max)))*weight;
    });
  }
  const latest=rows.at(-1)?.nums||[];
  Object.values(scores).forEach(x=>{
    const repeat=latest.includes(x.n)?1:0;
    if(strategy==="hot")x.total=x.hot*.72+x.gap*.10+x.stability*.13+repeat*.05;
    else if(strategy==="gap")x.total=x.hot*.22+x.gap*.58+x.stability*.15+repeat*.05;
    else if(strategy==="diverse")x.total=x.hot*.30+x.gap*.30+x.stability*.35+repeat*.05;
    else x.total=x.hot*.42+x.gap*.28+x.stability*.25+repeat*.05;
  });
  return Object.values(scores).sort((a,b)=>b.total-a.total||a.n-b.n);
}
function weightedPickWithRng(candidates,chosen,rng){
  const usable=candidates.filter(x=>!chosen.includes(x.n));
  const total=usable.reduce((s,x)=>s+Math.max(x.total,.001),0);
  let r=rng()*total;
  for(const x of usable){r-=Math.max(x.total,.001);if(r<=0)return x.n}
  return usable.at(-1)?.n;
}
function createCandidateSetHistorical(scores,rng){
  let chosen=[],attempts=0;
  while(chosen.length<C().pick&&attempts<300){
    attempts++;
    const n=weightedPickWithRng(scores,chosen,rng);
    if(!n)break;
    const test=[...chosen,n].sort((a,b)=>a-b);
    const m=setMetrics(test);
    if(test.length>=4&&m.consecutive>2)continue;
    if(test.length>=5&&m.sameLast>2)continue;
    chosen=test;
  }
  return chosen.sort((a,b)=>a-b);
}
function historicalStructureScore(a,rows){
  const m=setMetrics(a), historical=rows.slice(-200);
  const sums=historical.map(r=>r.nums.reduce((x,y)=>x+y,0));
  const targetSum=median(sums), targetOdd=C().pick/2, targetRange=C().max*.68;
  let score=100;
  score-=Math.abs(m.sum-targetSum)*.45;
  score-=Math.abs(m.odd-targetOdd)*8;
  score-=Math.max(0,m.consecutive-1)*7;
  score-=m.sameLast*4;
  score-=Math.abs(m.range-targetRange)*.65;
  if(m.ac<Math.max(2,C().pick-3))score-=10;
  return Math.round(clamp(score,0,100));
}
function generateHistoricalSets(rows,strategy,count,seed){
  const scores=historicalMultiScore(rows,strategy);
  const rng=mulberry32(seed);
  const candidates=[];
  for(let attempt=0;attempt<800&&candidates.length<count*8;attempt++){
    const set=createCandidateSetHistorical(scores,rng);
    if(set.length!==C().pick)continue;
    const score=historicalStructureScore(set,rows);
    if(score<48)continue;
    if(candidates.some(x=>x.set.join(",")===set.join(",")))continue;
    candidates.push({set,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const c of candidates){
    const limit=strategy==="diverse"?Math.max(1,C().pick-4):Math.max(2,C().pick-3);
    if(selected.every(x=>overlap(x.set,c.set)<=limit))selected.push(c);
    if(selected.length===count)break;
  }
  while(selected.length<count&&candidates[selected.length])selected.push(candidates[selected.length]);
  return selected.slice(0,count).map(x=>x.set);
}

function generate(){
  const count=Number($("#setCount").value),strategy=$("#strategy").value,scores=multiScore(strategy);
  const candidates=[];
  for(let attempt=0;attempt<1200&&candidates.length<count*8;attempt++){
    const set=createCandidateSet(seededShuffle(scores.slice(0,strategy==="diverse"?C().max:Math.min(C().max,32))),strategy);
    if(set.length!==C().pick)continue;
    const score=adaptiveStructureScore(set);
    if(score<48)continue;
    if(candidates.some(x=>x.set.join(",")===set.join(",")))continue;
    candidates.push({set,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const c of candidates){
    const limit=strategy==="diverse"?Math.max(1,C().pick-4):Math.max(2,C().pick-3);
    if(selected.every(x=>overlap(x.set,c.set)<=limit))selected.push(c);
    if(selected.length===count)break;
  }
  while(selected.length<count&&candidates[selected.length])selected.push(candidates[selected.length]);
  user[game].sets=selected.slice(0,count).map(x=>x.set);
  save();renderSets();renderCandidateScores();renderReport();renderLab();
}
function render(){
  const c=C(),r=R(),last=r.at(-1);
  $("#dashboardTitle").textContent=c.name+" ダッシュボード";
  if($("#heroGameTitle"))$("#heroGameTitle").textContent=c.name+" AI分析";
  $("#drawCount").textContent=r.length+"回";
  $("#latestNo").textContent="第"+last.no+"回";
  $("#latestDate").textContent=last.date;
  $("#numberRange").textContent="1～"+c.max;
  $("#latestBalls").innerHTML=balls(last.nums);
  $("#latestBonus").textContent="ボーナス："+last.bonus.join("・");
  $("#winningLabel").textContent=`本数字（${c.pick}個）`;
  $("#bonusLabel").textContent=`ボーナス数字（${c.bonus}個）`;
  const sequenceOk=r.every((x,i)=>i===0||x.no>=r[i-1].no);
  $("#dataHealth").innerHTML=`<p><b>${r.length.toLocaleString("ja-JP")}回分</b>を読込済み</p><p class="${sequenceOk?"ok":"warn"}">${sequenceOk?"回号順序：正常":"回号順序：要確認"}</p><p class="muted">最新収録：第${last.no}回（${last.date}）</p>`;
  renderAnalysis();renderSets();renderCandidateScores();renderScoreboard();renderValidationHistory();renderHistory();renderReport();renderBacktestEmpty();renderReviewPanel();renderPurchaseHistory();renderRemoteUpdatePanel();renderLab();renderSimulatorDefaults();renderPurchaseMode();
}

function scoreClass(n, recent30, maxRecent, gap){
  const ratio=maxRecent?recent30/maxRecent:0;
  if(ratio>=.78&&gap<=5)return {label:"HOT",cls:"score-hot"};
  if(gap>=Math.max(10,Math.round(R().length*.025)))return {label:"COLD",cls:"score-cold"};
  return {label:"標準",cls:"score-normal"};
}
function numberStability(n){
  const windows=[30,100,300].map(w=>{
    const rows=R().slice(-Math.min(w,R().length));
    return rows.length?rows.filter(r=>r.nums.includes(n)).length/rows.length:0;
  });
  const avg=mean(windows),spread=Math.max(...windows)-Math.min(...windows);
  return Math.round(clamp((avg*7)+(1-spread*5),0,1)*100);
}
function renderScoreboard(){
  const body=$("#scoreboardBody");if(!body)return;
  const strategy=$("#scoreStrategy")?.value||"balanced";
  const scores=multiScore(strategy),maxScore=scores[0]?.total||1;
  const recent=R().slice(-30),counts=Array.from({length:C().max},(_,i)=>recent.filter(r=>r.nums.includes(i+1)).length),maxRecent=Math.max(...counts,1);
  body.innerHTML=scores.map((x,i)=>{
    const n=x.n,gap=gapOf(n,R()),recentCount=counts[n-1],kind=scoreClass(n,recentCount,maxRecent,gap),stability=numberStability(n),pct=Math.round(x.total/maxScore*100);
    return `<tr><td>${i+1}</td><td><span class="score-ball ${kind.cls}">${String(n).padStart(2,"0")}</span></td><td><b>${pct}</b></td><td><span class="score-label ${kind.cls}">${kind.label}</span></td><td>${recentCount}回</td><td>${gap}回</td><td>${stability}</td></tr>`;
  }).join("");
  const reviews=user[game].reviews||[],avgHit=reviews.length?mean(reviews.map(r=>Number(r.highest)||0)):0,best=reviews.length?Math.max(...reviews.map(r=>Number(r.highest)||0)):0;
  const confidence=Math.round(clamp(45+Math.min(R().length,500)/500*20+Math.min(reviews.length,20)/20*20-Math.abs(avgHit-C().pick*.32)*5,35,90));
  $("#scoreKpis").innerHTML=`<article><b>${confidence}</b><span>分析信頼度</span></article><article><b>${reviews.length}</b><span>実検証回数</span></article><article><b>${avgHit.toFixed(2)}</b><span>平均最高一致</span></article><article><b>${best}</b><span>最高一致</span></article>`;
  const top=scores.slice(0,6).map(x=>String(x.n).padStart(2,"0")).join("・");
  $("#scoreComment").innerHTML=`<b>現在の上位候補：</b>${top}<br><span class="muted">信頼度は収録データ量と保存済み検証回数から算出しています。90点でも当選確率を意味しません。</span>`;
  const weights=user[game].featureWeights||{};
  $("#scoreWeights").innerHTML=Object.keys(featureNames).map(k=>{const v=Number(weights[k]||1),pct=Math.round(v/1.5*100);return `<div class="filter-row"><b>${featureNames[k]}</b><div class="bar"><i style="width:${pct}%"></i></div><em>${v.toFixed(2)}</em></div>`}).join("");
}

function renderAnalysis(){
  const o=stats($("#analysisWindow").value),rows=o.rows,max=o.rank[0].c,min=Math.min(...o.rank.map(x=>x.c));
  $("#hotNumber").textContent=o.rank[0].n+"（"+max+"）";
  $("#coldNumber").textContent=o.rank.filter(x=>x.c===min).slice(0,4).map(x=>x.n).join("・");
  $("#averageSum").textContent=mean(rows.map(r=>r.nums.reduce((x,y)=>x+y,0))).toFixed(1);
  $("#averageOdd").textContent=mean(rows.map(r=>r.nums.filter(n=>n%2).length)).toFixed(2);
  const scoreMap=new Map(multiScore().map(x=>[x.n,x.total]));
  const maxIndex=Math.max(...scoreMap.values(),1);
  $("#rankingBody").innerHTML=o.rank.map((x,i)=>`<tr><td>${i+1}</td><td><b>${x.n}</b></td><td>${x.c}</td><td>${x.gap}</td><td>${Math.round((scoreMap.get(x.n)/maxIndex)*100)}</td><td><div class="bar"><i style="width:${x.c/max*100}%"></i></div></td></tr>`).join("");
  renderDistribution(rows);
}
function renderDistribution(rows){
  const sums=rows.map(r=>r.nums.reduce((a,b)=>a+b,0));
  const odds=Array.from({length:C().pick+1},(_,i)=>({label:String(i),value:rows.filter(r=>r.nums.filter(n=>n%2).length===i).length}));
  const thirds=[
    {label:"低域",from:1,to:Math.floor(C().max/3)},
    {label:"中域",from:Math.floor(C().max/3)+1,to:Math.floor(C().max*2/3)},
    {label:"高域",from:Math.floor(C().max*2/3)+1,to:C().max}
  ].map(x=>({...x,value:rows.reduce((s,r)=>s+r.nums.filter(n=>n>=x.from&&n<=x.to).length,0)}));
  const chart=(title,items)=>`<div class="chart"><b>${title}</b>${items.map(x=>`<div class="chart-row"><span>${x.label}</span><div class="bar"><i style="width:${items.length?x.value/Math.max(...items.map(y=>y.value),1)*100:0}%"></i></div><em>${x.value}</em></div>`).join("")}</div>`;
  $("#distributionCharts").innerHTML=
    `<p class="muted">本数字合計：平均 ${mean(sums).toFixed(1)}／中央値 ${median(sums).toFixed(1)}／標準偏差 ${std(sums).toFixed(1)}</p>`+
    chart("奇数個数分布",odds)+chart("数字帯の総出現数",thirds);
}
function renderSets(){
  const sets=user[game].sets;
  $("#predictionSets").innerHTML=sets.length?sets.map((a,i)=>{
    const m=setMetrics(a),score=adaptiveStructureScore(a);
    const other=sets.filter((_,j)=>j!==i);
    const diversity=other.length?100-Math.max(...other.map(s=>overlap(s,a)/C().pick*100)):100;
    const confidence=Math.round(clamp(score*.85+diversity*.15,0,100));
    return `<div class="set"><div class="settop"><b>第${i+1}口</b><span class="badge">AI信頼度 ${confidence}点</span></div>${balls(a)}<div class="mini-metrics">総合 ${score}｜合計 ${m.sum}｜奇数 ${m.odd}｜連番 ${m.consecutive}｜AC ${m.ac}｜幅 ${m.range}</div></div>`;
  }).join(""):"<p class='muted'>予想セットを生成してください。</p>";
}
function renderCandidateScores(){
  if(!$("#candidateScores"))return;
  const scores=multiScore($("#strategy").value),max=scores[0]?.total||1;
  $("#candidateScores").innerHTML=scores.slice(0,18).map((x,i)=>`<div class="score-row"><span>${i+1}</span><b>${String(x.n).padStart(2,"0")}</b><div class="bar"><i style="width:${x.total/max*100}%"></i></div><em>${Math.round(x.total/max*100)}</em></div>`).join("");
}
function saveCurrentSets(){
  if(!user[game].sets.length)return alert("先に予想セットを生成してください");
  const suggested=nextDrawNo();
  const input=prompt(`購入対象の抽選回号を入力してください\n（最新結果の次回は第${suggested}回です）`,String(suggested));
  if(input===null)return;
  const drawNo=Number(input);
  if(!Number.isInteger(drawNo)||drawNo<=0)return alert("正しい抽選回号を入力してください");
  const dupes=duplicateSets(user[game].sets);
  if(dupes.length&&!confirm(`同じ購入セットが${dupes.length}組あります。このまま登録しますか？`))return;
  const existing=(user[game].savedSets||[]).find(x=>Number(x.drawNo)===drawNo);
  if(existing&&!confirm(`第${drawNo}回の購入登録が既にあります。現在のセットで上書きしますか？`))return;
  createSafetyBackup(`第${drawNo}回の購入登録前`);
  const now=new Date().toISOString();
  const record={id:existing?.id||makePurchaseId(),drawNo,date:existing?.date||now,updatedAt:now,note:existing?.note||"",sets:user[game].sets.map(a=>[...a]),features:user[game].featureWeights};
  if(existing){const i=purchaseIndexById(existing.id);user[game].savedSets[i]=record;user[game].reviews=(user[game].reviews||[]).filter(r=>Number(r.no)!==drawNo)}else user[game].savedSets.unshift(record);
  save();renderPurchaseHistory();renderReviewPanel();alert(`第${drawNo}回の購入データとして保存しました`);
}
function validate(){
  const nums=parseNums($("#winningInput").value),bonus=parseNums($("#bonusInput").value),no=Number($("#validationNo").value);
  if(nums.length!==C().pick||new Set(nums).size!==C().pick)return alert("本数字の個数を確認してください");
  if(bonus.length!==C().bonus||new Set(bonus).size!==C().bonus)return alert("ボーナス数字の個数を確認してください");
  if([...nums,...bonus].some(n=>n<1||n>C().max))return alert("数字の範囲を確認してください");
  const sets=user[game].sets;
  if(!sets.length)return alert("照合する予想セットがありません");
  const matches=sets.map(s=>s.filter(n=>nums.includes(n)).length),highest=Math.max(...matches),avg=mean(matches);
  user[game].checks.unshift({no,nums,bonus,highest,avg,matches,sets,date:new Date().toISOString()});
  save();
  $("#validationResult").innerHTML=`<div class="card"><h3>最高一致 ${highest}個</h3><p>平均一致 ${avg.toFixed(2)}個</p>${matches.map((v,i)=>`<p>第${i+1}口：${v}個一致</p>`).join("")}</div>`;
  renderValidationHistory();
}
function renderValidationHistory(){
  const checks=user[game].checks;
  $("#validationHistory").innerHTML=checks.map(x=>`<tr><td>${x.no||"-"}</td><td>${x.highest}</td><td>${Number(x.avg||0).toFixed(2)}</td><td>${x.nums.join("・")}</td></tr>`).join("")||'<tr><td colspan="4">履歴なし</td></tr>';
  const total=checks.length, best=total?Math.max(...checks.map(x=>x.highest)):0, avg=total?mean(checks.map(x=>x.avg||0)):0, hit3=checks.filter(x=>x.highest>=3).length;
  $("#validationSummary").innerHTML=`<article><b>${total}</b><span>検証回数</span></article><article><b>${best}</b><span>最高一致</span></article><article><b>${avg.toFixed(2)}</b><span>平均一致</span></article><article><b>${hit3}</b><span>3個以上</span></article>`;
}
function renderHistory(){
  const q=$("#historySearch").value.trim();let rows=[...R()].reverse();
  if(q){const n=Number(q);rows=rows.filter(r=>r.no===n||r.nums.includes(n)||r.bonus.includes(n))}
  $("#historyBody").innerHTML=rows.slice(0,700).map(r=>`<tr><td>${r.no}</td><td>${r.date}</td><td>${r.nums.join("・")}</td><td>${r.bonus.join("・")}</td></tr>`).join("");
}
function reportText(){
  const v=$("#reportWindow")?.value||"100",o=stats(v),rows=o.rows;
  const top=o.rank.slice(0,7).map(x=>x.n),late=[...o.rank].sort((a,b)=>b.gap-a.gap).slice(0,7).map(x=>x.n);
  const sums=rows.map(r=>r.nums.reduce((a,b)=>a+b,0)),odd=mean(rows.map(r=>r.nums.filter(n=>n%2).length));
  const multi=multiScore().slice(0,10).map(x=>x.n);
  return `${C().name} ${v==="all"?"全期間":"直近"+v+"回"}分析
最多出現上位: ${top.join("・")}
長期間隔上位: ${late.join("・")}
複数期間総合指数上位: ${multi.join("・")}
本数字合計: 平均 ${mean(sums).toFixed(1)} / 中央値 ${median(sums).toFixed(1)} / 標準偏差 ${std(sums).toFixed(1)}
奇数個数平均: ${odd.toFixed(2)}
現在の生成セット数: ${user[game].sets.length}
注意: これは過去履歴の統計要約であり、各組み合わせの理論上の当選確率を変えるものではありません。`;
}
function renderReport(){
  if(!$("#aiReport"))return;
  const text=reportText();
  $("#aiReport").innerHTML=`<div class="report-box">${text.split("\n").map(x=>`<p>${x}</p>`).join("")}</div>`;
  const sets=user[game].sets;
  $("#setEvaluation").innerHTML=sets.length?sets.map((s,i)=>{
    const m=setMetrics(s),score=structureScore(s);
    return `<div class="eval-row"><b>第${i+1}口</b><span>${score} / 100</span><div class="bar"><i style="width:${score}%"></i></div><small>合計 ${m.sum}・奇数 ${m.odd}・連番 ${m.consecutive}・AC ${m.ac}・幅 ${m.range}</small></div>`;
  }).join(""):"<p class='muted'>予想セット生成後に構造評価を表示します。</p>";
}
async function copyReport(){try{await navigator.clipboard.writeText(reportText());alert("レポートをコピーしました")}catch{alert("コピーできませんでした")}}
function exportData(){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([JSON.stringify(user,null,2)],{type:"application/json"}));
  a.download="loto67_user_data_v12.json";a.click();
}
function importData(){
  try{
    const x=JSON.parse($("#importText").value);
    if(!x.loto6||!x.loto7)throw Error();
    createSafetyBackup("データ読込み前");
    user=x;for(const g of ["loto6","loto7"]){user[g].sets??=[];user[g].savedSets??=[];user[g].checks??=[]}
    save();render();alert("読み込みました");
  }catch{alert("JSON形式を確認してください")}
}

function strategyName(s){
  return {balanced:"バランス",hot:"直近傾向",gap:"空白期間",diverse:"分散"}[s]||s;
}
function renderBacktestEmpty(){
  if(!$("#backtestComparison"))return;
  if(Object.keys(backtestResults).length)return;
  $("#backtestComparison").innerHTML='<tr><td colspan="7">条件を選び、バックテストを実行してください。</td></tr>';
  $("#backtestDistribution").innerHTML="<p class='muted'>結果はまだありません。</p>";
  $("#backtestHistory").innerHTML='<tr><td colspan="5">履歴なし</td></tr>';
}
async function runBacktest(){
  const strategies=[...document.querySelectorAll(".strategy-checks input:checked")].map(x=>x.value);
  if(!strategies.length)return alert("少なくとも1つの戦略を選択してください");
  const setsPerDraw=Number($("#backtestSets").value);
  const selectedWindow=$("#backtestWindow").value;
  const all=R();
  const minHistory=60;
  const requested=selectedWindow==="all"?all.length-minHistory:Number(selectedWindow);
  const start=Math.max(minHistory,all.length-requested);
  const targets=all.slice(start);
  if(!targets.length)return alert("検証可能な履歴が不足しています");

  $("#runBacktestBtn").disabled=true;
  $("#backtestStatus").textContent="計算中です…";
  backtestResults={};

  for(const strategy of strategies){
    const detail=[];
    const dist=Array(C().pick+1).fill(0);
    let sumBest=0,sumAvg=0,sumOverlap=0,maxHit=0,three=0,four=0;
    for(let i=0;i<targets.length;i++){
      const targetIndex=start+i;
      const past=historicalRows(targetIndex);
      const target=all[targetIndex];
      const seed=(target.no*1009)+(strategy.length*97)+(setsPerDraw*13);
      const predicted=generateHistoricalSets(past,strategy,setsPerDraw,seed);
      const hits=predicted.map(s=>overlap(s,target.nums));
      const best=Math.max(...hits,0),avg=mean(hits);
      let pairOverlap=0,pairs=0;
      for(let a=0;a<predicted.length;a++)for(let b=a+1;b<predicted.length;b++){pairOverlap+=overlap(predicted[a],predicted[b]);pairs++}
      const avgOverlap=pairs?pairOverlap/pairs:0;
      dist[best]++;
      sumBest+=best;sumAvg+=avg;sumOverlap+=avgOverlap;
      maxHit=Math.max(maxHit,best);
      if(best>=3)three++;
      if(best>=4)four++;
      detail.push({no:target.no,strategy,best,avg,nums:target.nums,sets:predicted});
      if(i%20===0){
        $("#backtestStatus").textContent=`${strategyName(strategy)}：${i+1}/${targets.length}回`;
        await new Promise(r=>setTimeout(r,0));
      }
    }
    backtestResults[strategy]={
      strategy,
      count:targets.length,
      maxHit,
      avgBest:sumBest/targets.length,
      avgAll:sumAvg/targets.length,
      avgOverlap:sumOverlap/targets.length,
      threeRate:three/targets.length,
      fourRate:four/targets.length,
      dist,
      detail
    };
  }
  renderBacktest();
  $("#backtestStatus").textContent=`完了：${targets.length}回 × ${strategies.length}戦略`;
  $("#runBacktestBtn").disabled=false;
}
function renderBacktest(){
  const values=Object.values(backtestResults);
  $("#backtestComparison").innerHTML=values.map(x=>`<tr>
    <td><b>${strategyName(x.strategy)}</b></td>
    <td>${x.count}</td>
    <td>${x.maxHit}</td>
    <td>${x.avgBest.toFixed(3)}</td>
    <td>${(x.threeRate*100).toFixed(1)}%</td>
    <td>${(x.fourRate*100).toFixed(1)}%</td>
    <td>${x.avgOverlap.toFixed(2)}</td>
  </tr>`).join("");

  const maxDist=Math.max(1,...values.flatMap(x=>x.dist));
  $("#backtestDistribution").innerHTML=values.map(x=>`<div class="chart"><b>${strategyName(x.strategy)}</b>${
    x.dist.map((v,i)=>`<div class="chart-row"><span>${i}個一致</span><div class="bar"><i style="width:${v/maxDist*100}%"></i></div><em>${v}</em></div>`).join("")
  }</div>`).join("");

  const rows=values.flatMap(x=>x.detail.map(d=>({...d})))
    .sort((a,b)=>b.no-a.no||a.strategy.localeCompare(b.strategy))
    .slice(0,800);
  $("#backtestHistory").innerHTML=rows.map(x=>`<tr>
    <td>${x.no}</td><td>${strategyName(x.strategy)}</td><td>${x.best}</td>
    <td>${x.avg.toFixed(2)}</td><td>${x.nums.join("・")}</td>
  </tr>`).join("");
}



function initTheme(){
  const saved=localStorage.getItem("loto67_theme")||"light";
  document.documentElement.dataset.theme=saved;
  updateThemeButton();
}
function toggleTheme(){
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=next;
  localStorage.setItem("loto67_theme",next);
  updateThemeButton();
}
function updateThemeButton(){
  if($("#themeBtn"))$("#themeBtn").textContent=document.documentElement.dataset.theme==="dark"?"☀️":"🌙";
}

function normalizeWeights(w){
  const total=w.hot+w.gap+w.stability+w.repeat;
  return {
    hot:w.hot/total,
    gap:w.gap/total,
    stability:w.stability/total,
    repeat:w.repeat/total
  };
}
function weightLabel(w){
  return `Hot ${(w.hot*100).toFixed(0)}%・Gap ${(w.gap*100).toFixed(0)}%・安定 ${(w.stability*100).toFixed(0)}%・重複 ${(w.repeat*100).toFixed(0)}%`;
}
function seededWeightCandidates(count){
  const base=[
    {hot:.42,gap:.28,stability:.25,repeat:.05},
    {hot:.55,gap:.20,stability:.20,repeat:.05},
    {hot:.30,gap:.40,stability:.25,repeat:.05},
    {hot:.30,gap:.25,stability:.40,repeat:.05},
    {hot:.45,gap:.30,stability:.15,repeat:.10},
    {hot:.35,gap:.30,stability:.25,repeat:.10}
  ];
  const rng=mulberry32(9072026+C().max);
  while(base.length<count){
    const raw={
      hot:.12+rng()*.58,
      gap:.08+rng()*.48,
      stability:.08+rng()*.48,
      repeat:rng()*.14
    };
    base.push(normalizeWeights(raw));
  }
  return base.slice(0,count).map(normalizeWeights);
}
function scoreWithWeights(rows,weights){
  const windows=[["10",.18],["30",.22],["50",.18],["100",.18],["200",.12],["all",.12]];
  const scores={};
  for(let n=1;n<=C().max;n++)scores[n]={n,total:0,hot:0,gap:0,stability:0};
  for(const [w,windowWeight] of windows){
    const s=historicalStats(rows,w);
    const maxC=Math.max(...s.rank.map(x=>x.c),1);
    const maxGap=Math.max(...s.rank.map(x=>x.gap),1);
    s.rank.forEach(x=>{
      scores[x.n].hot+=(x.c/maxC)*windowWeight;
      scores[x.n].gap+=(x.gap/maxGap)*windowWeight;
      scores[x.n].stability+=(1-Math.abs(x.rate-(C().pick/C().max)))*windowWeight;
    });
  }
  const latest=rows.at(-1)?.nums||[];
  Object.values(scores).forEach(x=>{
    const repeat=latest.includes(x.n)?1:0;
    x.total=x.hot*weights.hot+x.gap*weights.gap+x.stability*weights.stability+repeat*weights.repeat;
  });
  return Object.values(scores).sort((a,b)=>b.total-a.total||a.n-b.n);
}
function generateSetsWithWeights(rows,weights,count,seed){
  const scores=scoreWithWeights(rows,weights);
  const rng=mulberry32(seed);
  const candidates=[];
  for(let attempt=0;attempt<550&&candidates.length<count*7;attempt++){
    const set=createCandidateSetHistorical(scores,rng);
    if(set.length!==C().pick)continue;
    const score=historicalStructureScore(set,rows);
    if(score<45)continue;
    if(candidates.some(x=>x.set.join(",")===set.join(",")))continue;
    candidates.push({set,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const c of candidates){
    if(selected.every(x=>overlap(x.set,c.set)<=Math.max(2,C().pick-3)))selected.push(c);
    if(selected.length===count)break;
  }
  while(selected.length<count&&candidates[selected.length])selected.push(candidates[selected.length]);
  return selected.slice(0,count).map(x=>x.set);
}
async function evaluateWeights(targets,startIndex,weights,setsPerDraw,statusPrefix){
  let sumBest=0,three=0,four=0,maxHit=0;
  for(let i=0;i<targets.length;i++){
    const absoluteIndex=startIndex+i;
    const past=historicalRows(absoluteIndex);
    const target=R()[absoluteIndex];
    const seed=target.no*7919+Math.round(weights.hot*1000)*31+setsPerDraw;
    const sets=generateSetsWithWeights(past,weights,setsPerDraw,seed);
    const best=Math.max(...sets.map(s=>overlap(s,target.nums)),0);
    sumBest+=best;
    maxHit=Math.max(maxHit,best);
    if(best>=3)three++;
    if(best>=4)four++;
    if(i%30===0){
      $("#optimizerStatus").textContent=`${statusPrefix}：${i+1}/${targets.length}回`;
      await new Promise(r=>setTimeout(r,0));
    }
  }
  return {
    count:targets.length,
    avgBest:sumBest/targets.length,
    threeRate:three/targets.length,
    fourRate:four/targets.length,
    maxHit
  };
}
function optimizationObjective(m){
  return m.avgBest + m.threeRate*.9 + m.fourRate*1.8 + m.maxHit*.015;
}
async function runOptimizer(){
  const all=R(),minHistory=80;
  const selected=$("#optimizerWindow").value;
  const requested=selected==="all"?all.length-minHistory:Number(selected);
  const start=Math.max(minHistory,all.length-requested);
  const usable=all.slice(start);
  if(usable.length<100)return alert("最適化に必要な履歴が不足しています");

  const holdoutRatio=Number($("#holdoutRatio").value);
  const split=Math.max(50,Math.floor(usable.length*(1-holdoutRatio)));
  const trainTargets=usable.slice(0,split);
  const holdoutTargets=usable.slice(split);
  const trainStart=start;
  const holdoutStart=start+split;
  const trials=Number($("#optimizationTrials").value);
  const setsPerDraw=Number($("#optimizerSets").value);
  const candidates=seededWeightCandidates(trials);

  $("#runOptimizerBtn").disabled=true;
  $("#applyWeightsBtn").disabled=true;
  $("#optimizerStatus").textContent="候補重みを評価しています…";

  const ranked=[];
  for(let i=0;i<candidates.length;i++){
    const weights=candidates[i];
    const train=await evaluateWeights(trainTargets,trainStart,weights,setsPerDraw,`候補 ${i+1}/${candidates.length} 訓練`);
    ranked.push({weights,train,trainScore:optimizationObjective(train)});
  }
  ranked.sort((a,b)=>b.trainScore-a.trainScore);

  // Validate only the top training candidates to reduce computation and preserve holdout separation.
  const finalists=ranked.slice(0,Math.min(8,ranked.length));
  for(let i=0;i<finalists.length;i++){
    finalists[i].holdout=await evaluateWeights(
      holdoutTargets,holdoutStart,finalists[i].weights,setsPerDraw,
      `上位候補 ${i+1}/${finalists.length} 検証`
    );
    finalists[i].holdoutScore=optimizationObjective(finalists[i].holdout);
    finalists[i].robustScore=finalists[i].holdoutScore-Math.max(0,finalists[i].trainScore-finalists[i].holdoutScore)*.7;
  }
  finalists.sort((a,b)=>b.robustScore-a.robustScore);
  optimizerResult={
    recommended:finalists[0],
    finalists,
    trainCount:trainTargets.length,
    holdoutCount:holdoutTargets.length,
    setsPerDraw
  };
  renderOptimizer();
  $("#optimizerStatus").textContent=`完了：訓練 ${trainTargets.length}回／検証 ${holdoutTargets.length}回`;
  $("#runOptimizerBtn").disabled=false;
  $("#applyWeightsBtn").disabled=false;
}
function renderOptimizer(){
  if(!optimizerResult)return;
  const best=optimizerResult.recommended,w=best.weights;
  $("#recommendedWeights").innerHTML=`
    <div class="weight-grid">
      <article><b>${(w.hot*100).toFixed(1)}%</b><span>Hot</span></article>
      <article><b>${(w.gap*100).toFixed(1)}%</b><span>Gap</span></article>
      <article><b>${(w.stability*100).toFixed(1)}%</b><span>安定性</span></article>
      <article><b>${(w.repeat*100).toFixed(1)}%</b><span>直前重複</span></article>
    </div>
    <p class="muted">検証期間を含むロバスト評価で最上位となった候補です。</p>`;

  $("#optimizerPerformance").innerHTML=[
    ["訓練",best.train],
    ["検証",best.holdout]
  ].map(([label,m])=>`<tr><td><b>${label}</b></td><td>${m.count}</td><td>${m.avgBest.toFixed(3)}</td><td>${(m.threeRate*100).toFixed(1)}%</td><td>${(m.fourRate*100).toFixed(1)}%</td><td>${m.maxHit}</td></tr>`).join("");

  $("#optimizerRanking").innerHTML=optimizerResult.finalists.map((x,i)=>`<tr>
    <td>${i+1}</td>
    <td>${(x.weights.hot*100).toFixed(0)}%</td>
    <td>${(x.weights.gap*100).toFixed(0)}%</td>
    <td>${(x.weights.stability*100).toFixed(0)}%</td>
    <td>${(x.weights.repeat*100).toFixed(0)}%</td>
    <td>${x.train.avgBest.toFixed(3)}</td>
    <td>${x.holdout.avgBest.toFixed(3)}</td>
  </tr>`).join("");

  const delta=best.train.avgBest-best.holdout.avgBest;
  let level,text;
  if(delta<=.08){level="ok";text="訓練と検証の差は小さく、比較的安定しています。"}
  else if(delta<=.20){level="caution";text="訓練成績がやや高く、軽度の過学習傾向があります。"}
  else{level="danger";text="訓練と検証の差が大きく、過学習の可能性が高いです。"}
  $("#overfitCheck").innerHTML=`<div class="risk ${level}"><b>${text}</b><p>平均最高一致の差：${delta.toFixed(3)}</p><p>推奨判断は検証成績を優先しています。</p></div>`;
}
function applyOptimizedWeights(){
  if(!optimizerResult)return;
  user[game].customWeights=optimizerResult.recommended.weights;
  save();
  $("#strategy").value="balanced";
  renderCandidateScores();
  alert(`${C().name}のバランス戦略に推奨重みを適用しました`);
}
function resetOptimizedWeights(){
  user[game].customWeights=null;
  save();
  renderCandidateScores();
  alert(`${C().name}を標準重みに戻しました`);
}



function ensurePurchaseManager(){
  const history=$("#history");if(!history||$("#purchaseManager"))return;
  const card=document.createElement("div");card.className="card";card.id="purchaseManager";
  card.innerHTML=`<h2>購入・検証管理</h2><p class="muted">回号別の購入データ、検証状況、当せん結果を一括管理します。</p><div id="purchaseSummary" class="purchase-summary"></div><div class="purchase-tools"><input id="purchaseSearch" placeholder="回号・数字・メモで検索" inputmode="search"><select id="purchaseStatusFilter"><option value="all">すべて</option><option value="pending">未検証</option><option value="win">当せん</option><option value="lose">はずれ</option></select></div><div class="purchase-actions"><button id="purchaseShowAllBtn" class="secondary">全件表示</button><button id="purchaseBackupBtn" class="secondary">安全バックアップ</button><button id="purchaseRestoreBtn" class="secondary">直前状態へ復元</button><button id="purchaseExportBtn" class="secondary">データ書出し</button></div><div id="purchaseHistoryList"></div><div id="purchaseEditor" hidden><hr><h3 id="purchaseEditorTitle">購入データ編集</h3><input type="hidden" id="purchaseEditId"><label>対象抽選回号</label><input id="purchaseEditDrawNo" inputmode="numeric"><label>購入セット（1行に1口、カンマ区切り）</label><textarea id="purchaseEditSets" rows="8"></textarea><label>メモ</label><textarea id="purchaseEditNote" rows="3" placeholder="購入場所、戦略、気付いたことなど"></textarea><div class="button-row"><button id="purchaseSaveBtn" class="primary">上書き保存</button><button id="purchaseCancelBtn" class="secondary">キャンセル</button></div></div>`;
  history.insertBefore(card,history.firstChild);$("#purchaseSaveBtn").onclick=savePurchaseEdit;$("#purchaseCancelBtn").onclick=()=>{$("#purchaseEditor").hidden=true};$("#purchaseSearch").oninput=renderPurchaseHistory;$("#purchaseStatusFilter").onchange=renderPurchaseHistory;$("#purchaseShowAllBtn").onclick=()=>{$("#purchaseSearch").value="";$("#purchaseStatusFilter").value="all";renderPurchaseHistory()};$("#purchaseBackupBtn").onclick=()=>{createSafetyBackup("手動バックアップ");alert("現在のデータを安全バックアップしました")};$("#purchaseRestoreBtn").onclick=restoreSafetyBackup;$("#purchaseExportBtn").onclick=exportData;
}
function renderPurchaseHistory(){
  ensurePurchaseManager();
  if($("#labWindow"))$("#labWindow").onchange=renderLab;
  if($("#toggleAutoLearningBtn"))$("#toggleAutoLearningBtn").onclick=toggleAutoLearning;
  if($("#resetLearningBtn"))$("#resetLearningBtn").onclick=resetFeatureLearning;
  if($("#runSimulatorBtn"))$("#runSimulatorBtn").onclick=runConditionSimulator;
  if($("#resetSimulatorBtn"))$("#resetSimulatorBtn").onclick=resetConditionSimulator;const box=$("#purchaseHistoryList");if(!box)return;
  const all=[...(user[game].savedSets||[])].sort((a,b)=>(Number(b.drawNo)||0)-(Number(a.drawNo)||0)||new Date(b.date)-new Date(a.date));
  const reviewed=all.filter(x=>reviewForPurchase(x));const winners=all.filter(x=>{const rank=bestRankFromReview(reviewForPurchase(x));return rank&&rank!=="はずれ"});
  const best=winners.map(x=>bestRankFromReview(reviewForPurchase(x))).sort((a,b)=>Number(a.replace(/\D/g,""))-Number(b.replace(/\D/g,"")))[0]||"なし";
  $("#purchaseSummary").innerHTML=`<article><b>${all.length}</b><span>購入回数</span></article><article><b>${all.reduce((n,x)=>n+x.sets.length,0)}</b><span>購入口数</span></article><article><b>${reviewed.length}</b><span>検証済み</span></article><article><b>${best}</b><span>最高等級</span></article>`;
  const q=($("#purchaseSearch")?.value||"").trim().toLowerCase(),status=$("#purchaseStatusFilter")?.value||"all";
  const saved=all.filter(x=>{const r=reviewForPurchase(x),rank=bestRankFromReview(r),state=!r?"pending":rank&&rank!=="はずれ"?"win":"lose";const hay=[x.drawNo,x.note,purchaseText(x.sets)].join(" ").toLowerCase();return(!q||hay.includes(q))&&(status==="all"||status===state)});
  if(!saved.length){box.innerHTML=all.length?'<p class="muted">条件に合う購入履歴はありません。</p>':'<p class="muted">購入登録はありません。予想画面の「購入候補として保存」から登録してください。</p>';return}
  box.innerHTML=saved.map(x=>{const review=reviewForPurchase(x),rank=bestRankFromReview(review),state=!review?"pending":rank&&rank!=="はずれ"?"win":"lose",label=!review?"未検証":rank||"検証済み",dupes=duplicateSets(x.sets);return `<div class="set purchase-record"><div class="settop"><b>${x.drawNo?`第${x.drawNo}回`:"回号未設定"}</b><span class="purchase-status ${state}">${label}</span></div>${x.sets.map((a,i)=>`<div><small>第${i+1}口</small>${balls(a)}</div>`).join("")}${dupes.length?`<div class="duplicate-warning">重複セット：${dupes.map(d=>`第${d[0]}口と第${d[1]}口`).join("、")}</div>`:""}${x.note?`<div class="purchase-note">${String(x.note).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</div>`:""}<p class="muted">${x.sets.length}口｜登録：${new Date(x.date).toLocaleString("ja-JP")}${x.updatedAt&&x.updatedAt!==x.date?`／更新：${new Date(x.updatedAt).toLocaleString("ja-JP")}`:""}</p><div class="button-row"><button class="secondary" data-purchase-edit="${x.id}">編集</button><button class="secondary" data-purchase-copy="${x.id}">コピー</button><button class="secondary" data-purchase-review="${x.id}">検証</button><button class="secondary" data-purchase-delete="${x.id}">削除</button></div></div>`}).join("");
  $$('[data-purchase-edit]').forEach(b=>b.onclick=()=>openPurchaseEdit(b.dataset.purchaseEdit));$$('[data-purchase-copy]').forEach(b=>b.onclick=()=>copyPurchase(b.dataset.purchaseCopy));$$('[data-purchase-review]').forEach(b=>b.onclick=()=>openPurchaseReview(b.dataset.purchaseReview));$$('[data-purchase-delete]').forEach(b=>b.onclick=()=>deletePurchase(b.dataset.purchaseDelete));
}
function openPurchaseEdit(id){
  const x=purchaseById(id);if(!x)return;
  $("#purchaseEditId").value=x.id;
  $("#purchaseEditDrawNo").value=x.drawNo||"";
  $("#purchaseEditSets").value=purchaseText(x.sets);
  $("#purchaseEditNote").value=x.note||"";
  $("#purchaseEditorTitle").textContent=`${x.drawNo?`第${x.drawNo}回`:"回号未設定"} 購入データ編集`;
  $("#purchaseEditor").hidden=false;
  $("#purchaseEditor").scrollIntoView({behavior:"smooth",block:"start"});
}
function savePurchaseEdit(){
  try{
    const id=$("#purchaseEditId").value;
    const i=purchaseIndexById(id);
    if(i<0)throw new Error("編集対象が見つかりません");
    const drawNo=Number($("#purchaseEditDrawNo").value);
    if(!Number.isInteger(drawNo)||drawNo<=0)throw new Error("正しい抽選回号を入力してください");
    const duplicate=(user[game].savedSets||[]).find(x=>x.id!==id&&Number(x.drawNo)===drawNo);
    if(duplicate&&!confirm(`第${drawNo}回は既に登録されています。このデータを残したまま保存しますか？`))return;
    const sets=parsePurchaseText($("#purchaseEditSets").value);
    const old=user[game].savedSets[i];
    const dupes=duplicateSets(sets);if(dupes.length&&!confirm(`同じ購入セットが${dupes.length}組あります。このまま保存しますか？`))return;
    createSafetyBackup(`第${old.drawNo||drawNo}回の購入データ編集前`);
    user[game].savedSets[i]={...old,drawNo,sets,note:$("#purchaseEditNote").value.trim(),updatedAt:new Date().toISOString()};
    user[game].reviews=(user[game].reviews||[]).filter(r=>Number(r.no)!==drawNo&&Number(r.no)!==Number(old.drawNo));
    user[game].sets=sets.map(a=>[...a]);
    save();
    $("#purchaseEditor").hidden=true;
    renderPurchaseHistory();renderReviewPanel();renderSets();
    alert(`第${drawNo}回の購入データを更新しました。検証履歴は再検証できるよう削除しました。`);
  }catch(e){alert(e.message||String(e))}
}
async function copyPurchase(id){
  const x=purchaseById(id);if(!x)return;
  const text=`${C().name} 第${x.drawNo||"-"}回\n${purchaseText(x.sets)}`;
  try{await navigator.clipboard.writeText(text);alert("購入データをコピーしました")}
  catch{prompt("下記をコピーしてください",text)}
}
function deletePurchase(id){
  const x=purchaseById(id);if(!x)return;
  if(!confirm(`${x.drawNo?`第${x.drawNo}回`:"回号未設定"}の購入データを削除しますか？`))return;
  createSafetyBackup(`${x.drawNo?`第${x.drawNo}回`:"回号未設定"}の削除前`);
  user[game].savedSets=user[game].savedSets.filter(y=>y.id!==id);
  if(x.drawNo)user[game].reviews=(user[game].reviews||[]).filter(r=>Number(r.no)!==Number(x.drawNo));
  save();renderPurchaseHistory();renderReviewPanel();
}
function openPurchaseReview(id){
  const index=(user[game].savedSets||[]).findIndex(x=>x.id===id);
  const x=user[game].savedSets[index];if(!x)return;
  const nav=$('[data-tab="review"]');if(nav)nav.click();
  $("#reviewSavedSet").value=String(index);
  if(x.drawNo){
    $("#reviewDrawNo").value=x.drawNo;
    const draw=R().find(d=>Number(d.no)===Number(x.drawNo));
    if(draw){
      $("#reviewWinning").value=draw.nums.join(",");
      $("#reviewBonus").value=draw.bonus.join(",");
    }
  }
  $("#reviewStatus").textContent=`${x.drawNo?`第${x.drawNo}回`:"選択した"}購入データを読み込みました`;
}

let pendingReviewAdjustment=null;
const featureNames={repeat:"前回重複",slide:"±1スライド",bonusAdj:"ボーナス隣接",oddEven:"偶奇",sum:"合計値",ac:"AC値",range:"高低幅",consecutive:"連番"};

function renderReviewPanel(){
  if(!$("#reviewSavedSet"))return;
  const saved=user[game].savedSets||[],reviews=user[game].reviews||[];
  $("#reviewSavedSet").innerHTML=saved.length
    ? saved.map((x,i)=>`<option value="${i}">${x.drawNo?`第${x.drawNo}回｜`:"回号未設定｜"}${new Date(x.date).toLocaleString("ja-JP")}｜${x.sets.length}口</option>`).join("")
    : '<option value="">保存済み予想なし</option>';

  const latest=R().at(-1);
  if(latest&&!$("#reviewDrawNo").value){
    $("#reviewDrawNo").value=latest.no;
    $("#reviewWinning").value=latest.nums.join(",");
    $("#reviewBonus").value=latest.bonus.join(",");
  }

  const best=reviews.length?Math.max(...reviews.map(x=>x.highest)):0;
  const avg=reviews.length?mean(reviews.map(x=>x.average)):0;
  const hit3=reviews.filter(x=>x.highest>=3).length,hit4=reviews.filter(x=>x.highest>=4).length;
  $("#reviewSummary").innerHTML=
    `<article><b>${reviews.length}</b><span>検証回数</span></article>`+
    `<article><b>${best}</b><span>最高一致</span></article>`+
    `<article><b>${avg.toFixed(2)}</b><span>平均一致</span></article>`+
    `<article><b>${reviews.length?(hit3/reviews.length*100).toFixed(1):"0.0"}%</b><span>3個以上率</span></article>`+
    `<article><b>${reviews.length?(hit4/reviews.length*100).toFixed(1):"0.0"}%</b><span>4個以上率</span></article>`;

  $("#featureHistory").innerHTML=Object.keys(featureNames).map(k=>{
    const vals=reviews.map(x=>x.features?.[k]).filter(Boolean);
    const good=vals.filter(x=>x.status==="good").length;
    const neutral=vals.filter(x=>x.status==="neutral").length;
    const rate=vals.length?(good+neutral*.5)/vals.length:0;
    return `<tr><td>${featureNames[k]}</td><td>${vals.length}</td><td>${good}</td><td>${(rate*100).toFixed(1)}%</td><td>${(user[game].featureWeights[k]||1).toFixed(2)}</td></tr>`;
  }).join("");

  const recent=reviews.slice(0,12).reverse();
  $("#reviewTrend").innerHTML=recent.length
    ? recent.map(r=>`<div class="trend-row"><span>第${r.no}回</span><div class="bar"><i style="width:${Math.min(100,r.highest/C().pick*100)}%"></i></div><b>${r.highest}個</b><em>平均${Number(r.average).toFixed(2)}</em></div>`).join("")
    : '<p class="muted">検証履歴が蓄積されると推移を表示します。</p>';

  const ranked=Object.keys(featureNames).map(k=>{
    const vals=reviews.slice(0,30).map(x=>x.features?.[k]).filter(Boolean);
    return {k,score:vals.length?mean(vals.map(v=>v.score)):0,count:vals.length};
  }).sort((a,b)=>b.score-a.score);
  const strong=ranked.filter(x=>x.count).slice(0,3).map(x=>featureNames[x.k]);
  const weak=[...ranked].reverse().filter(x=>x.count).slice(0,2).map(x=>featureNames[x.k]);
  $("#learningComment").innerHTML=reviews.length
    ? `<p><b>現在の強い特徴：</b>${strong.join("・")}</p><p><b>見直し候補：</b>${weak.join("・")}</p><p><b>学習方針：</b>直近30回を重視し、重みを小幅更新して過剰適応を防ぎます。</p>`
    : '<p>検証後に、強い特徴と見直し候補を自動表示します。</p>';
}
function fstate(score,text){
  return {score,status:score>=.66?"good":score>=.33?"neutral":"bad",text};
}

function runLatestAutoReview(){
  const latest=latestVerifiedDraw(game),saved=user[game].savedSets||[];
  if(!latest)return alert("抽選データがありません");
  if(!latest.verified)return alert(`第${latest.no}回は公式確認済みデータではありません。最新データ確認を実行してください。`);
  if(!saved.length)return alert("購入したセットを先に保存してください");
  const matchingIndex=saved.findIndex(x=>Number(x.drawNo)===Number(latest.no));
  if(matchingIndex<0){
    const next=saved.map(x=>x.drawNo).filter(Boolean).sort((a,b)=>b-a)[0];
    return alert(`公式最新は第${latest.no}回です。第${latest.no}回として保存された購入データがありません。${next?`
保存済み最新対象回：第${next}回`:""}`);
  }
  $("#reviewSavedSet").value=String(matchingIndex);
  $("#reviewDrawNo").value=latest.no;
  $("#reviewWinning").value=latest.nums.join(",");
  $("#reviewBonus").value=latest.bonus.join(",");
  runAutoReview({requireVerified:true});
}
function runAutoReview(options={}){
  const saved=user[game].savedSets?.[Number($("#reviewSavedSet").value)];
  if(!saved)return alert("保存済み予想セットがありません");

  const no=Number($("#reviewDrawNo").value);
  const winning=parseNums($("#reviewWinning").value);
  const bonus=parseNums($("#reviewBonus").value);

  if(winning.length!==C().pick)return alert(`本数字を${C().pick}個入力してください`);
  if(bonus.length!==C().bonus)return alert(`ボーナス数字を${C().bonus}個入力してください`);
  if(!Number.isInteger(no)||no<=0)return alert("正しい抽選回号を入力してください");
  if(saved.drawNo&&Number(saved.drawNo)!==no)return alert(`購入データは第${saved.drawNo}回、抽選結果は第${no}回です。回号が一致しないため検証しません。`);
  const officialDraw=R().find(d=>Number(d.no)===no&&d.verified===true);
  if(options.requireVerified&&!officialDraw)return alert(`第${no}回は公式確認済みデータではありません。`);
  if(options.requireVerified&&(officialDraw.nums.join(",")!==winning.join(",")||officialDraw.bonus.join(",")!==bonus.join(",")))return alert("入力された抽選数字が公式確認済みデータと一致しません。");
  if(new Set(winning).size!==C().pick||winning.some(n=>n<1||n>C().max))return alert("本数字に重複または範囲外の数字があります");
  if(new Set(bonus).size!==C().bonus||bonus.some(n=>n<1||n>C().max)||bonus.some(n=>winning.includes(n)))return alert("ボーナス数字に重複・範囲外・本数字との重複があります");

  // 手入力データは公式最新履歴へ混ぜない。公式データのみ履歴として採用する。
const idx=R().findIndex(x=>x.no===no);

let prev;
let hist;

if(idx>=1){
  prev=R()[idx-1];
  hist=R().slice(0,idx);
}else if(idx===-1 && no>R().at(-1).no){
  prev=R().at(-1);
  hist=R();
}else{
  return alert("前回データを確認できない回号です");
}
  const metrics=setMetrics(winning);
  const repeat=winning.filter(n=>prev.nums.includes(n)).length;
  const slide=winning.filter(n=>prev.nums.some(p=>Math.abs(p-n)===1)).length;
  const bonusAdj=winning.filter(n=>prev.bonus.some(b=>Math.abs(b-n)===1)).length;

  const normalScore=(value,values)=>{
    const s=Math.max(std(values),1);
    return clamp(1-Math.abs(value-mean(values))/(2*s),0,1);
  };

  const sumHistory=hist.slice(-200).map(x=>x.nums.reduce((a,b)=>a+b,0));
  const acHistory=hist.slice(-200).map(x=>acValue(x.nums));
  const rangeHistory=hist.slice(-200).map(x=>x.nums.at(-1)-x.nums[0]);
  const consecutiveHistory=hist.slice(-200).map(x=>setMetrics(x.nums).consecutive);

  const features={
    repeat:fstate(clamp(repeat/2,0,1),`${repeat}個が前回から継続`),
    slide:fstate(clamp(slide/2,0,1),`${slide}個が前回数字の±1`),
    bonusAdj:fstate(clamp(bonusAdj/1.5,0,1),`${bonusAdj}個が前回ボーナス隣接`),
    oddEven:fstate(1-Math.abs(metrics.odd-C().pick/2)/(C().pick/2),`奇数${metrics.odd}・偶数${C().pick-metrics.odd}`),
    sum:fstate(normalScore(metrics.sum,sumHistory),`合計値 ${metrics.sum}`),
    ac:fstate(normalScore(metrics.ac,acHistory),`AC値 ${metrics.ac}`),
    range:fstate(normalScore(metrics.range,rangeHistory),`高低幅 ${metrics.range}`),
    consecutive:fstate(normalScore(metrics.consecutive,consecutiveHistory),`連番 ${metrics.consecutive}組`)
  };

  const matches=saved.sets.map(set=>{
    const main=overlap(set,winning),bonusHit=overlap(set,bonus);
    return {set,main,bonus:bonusHit,rank:prizeRank(game,main,bonusHit)};
  });
  const highest=Math.max(...matches.map(x=>x.main),0);
  const average=mean(matches.map(x=>x.main));

  pendingReviewAdjustment={};
  Object.entries(features).forEach(([k,v])=>{
    pendingReviewAdjustment[k]=v.status==="good"?.06:v.status==="bad"?-.04:0;
  });

  const reviewData={
  no,winning,bonus,matches,highest,average,features,
  savedDate:saved.date,
  savedId:saved.id||null,
  date:new Date().toISOString()
};

const oldIndex=user[game].reviews.findIndex(
  r=>r.no===no && r.savedDate===saved.date
);

if(oldIndex>=0){
  user[game].reviews[oldIndex]=reviewData;
}else{
  user[game].reviews.unshift(reviewData);
}
  if(user[game].autoLearning)applyReviewLearningInternal(pendingReviewAdjustment,`第${no}回 自動検証`);
  save();

  $("#reviewMatches").innerHTML=`<div class="match-legend"><span><i class="m"></i>本数字一致</span><span><i class="b"></i>ボーナス一致</span></div>`+matches.map((x,i)=>
    `<div class="set"><div class="settop"><b>第${i+1}口</b><span class="badge">${x.rank}</span></div>${reviewBalls(x.set,winning,bonus)}<div class="mini-metrics">本数字 ${x.main}個・ボーナス ${x.bonus}個</div></div>`
  ).join("");

  $("#featureEvaluation").innerHTML=Object.entries(features).map(([k,v])=>
    `<div class="feature-card ${v.status}"><div><b>${featureNames[k]}</b><span>${Math.round(v.score*100)}点</span></div><div class="bar"><i style="width:${v.score*100}%"></i></div><p>${v.text}</p></div>`
  ).join("");

  const good=Object.entries(features).filter(([,v])=>v.status==="good").map(([k])=>featureNames[k]);
  const bad=Object.entries(features).filter(([,v])=>v.status==="bad").map(([k])=>featureNames[k]);

  $("#improvementReport").innerHTML=
    `<div class="report-box">`+
    `<p><b>有効：</b>${good.join("・")||"明確な特徴なし"}</p>`+
    `<p><b>弱い：</b>${bad.join("・")||"大きな弱点なし"}</p>`+
    `<p><b>一致：</b>最高${highest}個、平均${average.toFixed(2)}個</p>`+
    `<p><b>次回反映：</b>有効特徴を小幅増、弱い特徴を小幅減。1回で大幅変更しません。</p>`+
    `</div>`;

  $("#applyReviewBtn").disabled=false;
  const winners=matches.filter(x=>x.rank!=="はずれ");
  $("#reviewStatus").textContent=winners.length
    ? `第${no}回：${winners.length}口当せん（${winners.map(x=>x.rank).join("・")}）`
    : `第${no}回のレポートを作成しました（当せんなし）`;
  renderReviewPanel();
  renderPurchaseHistory();
}

function applyReviewLearning(){
  if(!pendingReviewAdjustment)return;
  applyReviewLearningInternal(pendingReviewAdjustment,"手動反映");
  save();pendingReviewAdjustment=null;
  $("#applyReviewBtn").disabled=true;
  renderReviewPanel();renderSets();renderLab();
  alert("学習重みを更新し、次回予想へ反映しました");
}


// ===== AIロジック研究所 =====
function gradeFromScore(score){return score>=90?"S":score>=80?"A":score>=68?"B":score>=55?"C":"D"}
function featureOccurrence(rows,key){
  if(!rows.length)return 0;let ok=0;
  rows.forEach((r,i)=>{
    const prev=i?rows[i-1]:null,m=setMetrics(r.nums);let yes=false;
    if(key==="repeat"&&prev)yes=r.nums.filter(n=>prev.nums.includes(n)).length>=1;
    if(key==="slide"&&prev)yes=r.nums.filter(n=>prev.nums.some(x=>Math.abs(x-n)===1)).length>=1;
    if(key==="bonusAdj"&&prev)yes=r.nums.filter(n=>prev.bonus.some(x=>Math.abs(x-n)===1)).length>=1;
    if(key==="oddEven")yes=Math.abs(m.odd-C().pick/2)<=1;
    if(key==="sum"){
      const sums=rows.map(x=>x.nums.reduce((a,b)=>a+b,0)),lo=mean(sums)-std(sums),hi=mean(sums)+std(sums);yes=m.sum>=lo&&m.sum<=hi;
    }
    if(key==="ac")yes=m.ac>=Math.max(2,C().pick-3);
    if(key==="range")yes=m.range>=C().max*.45;
    if(key==="consecutive")yes=m.consecutive<=1;
    if(yes)ok++;
  });return ok/rows.length;
}
function diagnosisComment(set,score){
  const m=setMetrics(set),comments=[];
  if(Math.abs(m.odd-C().pick/2)<=1)comments.push("偶奇は標準域");else comments.push("偶奇に偏り");
  if(m.consecutive<=1)comments.push("連番は適正");else comments.push("連番が多め");
  if(m.ac>=Math.max(2,C().pick-3))comments.push("AC値は分散型");else comments.push("差分の重複が多め");
  if(score>=80)comments.push("複数期間指数との整合性が高い");
  return comments.join("・");
}
function renderNumberHeatmap(){
  const box=$("#numberHeatmap");if(!box)return;
  const w=$("#labWindow")?.value||"100",st=stats(w),max=Math.max(...st.rank.map(x=>x.c),1),min=Math.min(...st.rank.map(x=>x.c));
  const scoreMap=new Map(multiScore().map(x=>[x.n,x.total]));const maxScore=Math.max(...scoreMap.values(),1);
  box.innerHTML=Array.from({length:C().max},(_,i)=>i+1).map(n=>{
    const r=st.rank.find(x=>x.n===n),freq=(r.c-min)/Math.max(max-min,1),idx=(scoreMap.get(n)||0)/maxScore,score=Math.round((freq*.45+idx*.55)*100);
    const hue=Math.round(220-score*2.0);return `<div class="heat-number" style="background:hsl(${hue} 78% 52%)"><b>${String(n).padStart(2,"0")}</b><small>${score}点</small></div>`;
  }).join("");
}
function renderSetDiagnosisLab(){
  const box=$("#labSetDiagnosis");if(!box)return;const sets=user[game].sets||[];
  if(!sets.length){box.innerHTML='<p class="muted">予想画面でセットを生成すると診断します。</p>';return}
  box.innerHTML=sets.map((set,i)=>{const structure=structureScore(set),learned=learnedFeatureScore(set),total=Math.round(structure*.55+learned*.45),m=setMetrics(set);return `<div class="set"><div class="settop"><b>第${i+1}口</b><span class="ai-grade">${gradeFromScore(total)}</span></div>${balls(set)}<div class="diagnosis-grid"><article><b>${total}</b><span>総合指数</span></article><article><b>${structure}</b><span>構造</span></article><article><b>${learned}</b><span>学習整合</span></article><article><b>${m.ac}</b><span>AC値</span></article></div><p class="lab-comment">${diagnosisComment(set,total)}</p></div>`}).join("");
}
function applyReviewLearningInternal(adjustment,reason){
  if(!adjustment)return;const count=(user[game].reviews||[]).length,damping=count<5?.65:count<15?.45:.30,before={...user[game].featureWeights};
  Object.entries(adjustment).forEach(([k,delta])=>{user[game].featureWeights[k]=clamp((user[game].featureWeights[k]||1)+delta*damping,.5,1.5)});
  const changes=Object.keys(featureNames).map(k=>({key:k,delta:(user[game].featureWeights[k]||1)-(before[k]||1)})).filter(x=>Math.abs(x.delta)>.0001);
  user[game].learningLog??=[];user[game].learningLog.unshift({date:new Date().toISOString(),reason,changes});user[game].learningLog=user[game].learningLog.slice(0,50);
}
function toggleAutoLearning(){user[game].autoLearning=!user[game].autoLearning;save();renderLab()}
function resetFeatureLearning(){
  if(!confirm(`${C().name}の学習重みを初期値へ戻しますか？`))return;createSafetyBackup("学習重み初期化");
  user[game].featureWeights={repeat:1,slide:1,bonusAdj:1,oddEven:1,sum:1,ac:1,range:1,consecutive:1};user[game].learningLog=[];save();renderLab();renderSets();
}
function renderLearningState(){
  const box=$("#learningState"),log=$("#learningLog");if(!box||!log)return;const weights=user[game].featureWeights||{};
  box.innerHTML=`<p><b>自動学習：</b><span class="${user[game].autoLearning?'ok':'warn'}">${user[game].autoLearning?'ON':'OFF'}</span></p><div>${Object.keys(featureNames).map(k=>`<span class="learning-chip">${featureNames[k]} ${(weights[k]||1).toFixed(2)}</span>`).join("")}</div>`;
  $("#toggleAutoLearningBtn").textContent=user[game].autoLearning?"自動学習をOFF":"自動学習をON";
  log.innerHTML=(user[game].learningLog||[]).slice(0,8).map(x=>`<div class="learning-entry"><b>${new Date(x.date).toLocaleString('ja-JP')}</b>｜${x.reason}<br>${x.changes.map(c=>`${featureNames[c.key]} ${c.delta>0?'+':''}${c.delta.toFixed(3)}`).join('・')||'変更なし'}</div>`).join('')||'<p class="muted">学習履歴はまだありません。</p>';
}
function renderLogicComparison(){
  const body=$("#logicComparison");if(!body)return;const windows=[30,100,300,'all'];
  body.innerHTML=Object.keys(featureNames).map(k=>{const vals=windows.map(w=>featureOccurrence(w==='all'?R():R().slice(-w),k));const spread=Math.max(...vals)-Math.min(...vals),recent=vals[0]-vals[3];let label,cls;if(spread<=.10){label='長期安定';cls='logic-stable'}else if(recent>=.12){label='直近上昇';cls='logic-recent'}else{label='変動大';cls='logic-weak'}return `<tr><td>${featureNames[k]}</td>${vals.map(v=>`<td>${(v*100).toFixed(1)}%</td>`).join('')}<td class="${cls}">${label}</td></tr>`}).join('');
}
function renderFilterContribution(){
  const box=$("#filterContribution");if(!box)return;const reviews=(user[game].reviews||[]).slice(0,30),weights=user[game].featureWeights||{};
  box.innerHTML=Object.keys(featureNames).map(k=>{const vals=reviews.map(r=>r.features?.[k]?.score).filter(v=>Number.isFinite(v));const observed=vals.length?mean(vals):.5,weight=weights[k]||1,score=Math.round(clamp(observed*weight/1.5,0,1)*100);return `<div class="filter-row"><b>${featureNames[k]}</b><div class="bar"><i style="width:${score}%"></i></div><em>${score}</em></div>`}).join('')+'<p class="muted">貢献度は直近検証の特徴スコアと現在重みを合成した研究指標です。</p>';
}
function renderLab(){if(!$("#lab"))return;renderNumberHeatmap();renderSetDiagnosisLab();renderLearningState();renderLogicComparison();renderFilterContribution()}


// ===== 条件シミュレーター =====
let simulatorInitialized=false;
function simRows(){const v=$("#simWindow")?.value||"300";return v==="all"?R():R().slice(-Number(v))}
function classifyCount(value,rule){if(rule==="any")return true;if(rule==="0")return value===0;if(rule==="1")return value===1;if(rule==="2")return value>=2;return true}
function simulatorRecord(rows,index){
  const draw=rows[index],prev=index?rows[index-1]:null,m=setMetrics(draw.nums);
  return {draw,m,repeat:prev?draw.nums.filter(n=>prev.nums.includes(n)).length:0,slide:prev?draw.nums.filter(n=>prev.nums.some(x=>Math.abs(x-n)===1)).length:0};
}
function renderSimulatorDefaults(){
  if(!$("#simulator"))return;
  if(!simulatorInitialized){
    const rows=simRows(),sums=rows.map(r=>r.nums.reduce((a,b)=>a+b,0));
    if($("#simSumMin")&&!$("#simSumMin").value)$("#simSumMin").placeholder=String(Math.round(mean(sums)-std(sums)));
    if($("#simSumMax")&&!$("#simSumMax").value)$("#simSumMax").placeholder=String(Math.round(mean(sums)+std(sums)));
    simulatorInitialized=true;
  }
  if(!$("#simSummary").innerHTML)$("#simSummary").innerHTML='<article><b>－</b><span>条件一致回</span></article><article><b>－</b><span>一致率</span></article><article><b>－</b><span>平均合計</span></article><article><b>－</b><span>平均AC値</span></article>';
}
function resetConditionSimulator(){
  ["simOdd","simRepeat","simSlide","simConsecutive"].forEach(id=>{if($("#"+id))$("#"+id).value="any"});
  ["simSumMin","simSumMax","simAcMin","simRangeMin"].forEach(id=>{if($("#"+id))$("#"+id).value=""});
  $("#simStatus").textContent="条件を初期化しました";$("#simNumberRanking").innerHTML="";$("#simComparison").innerHTML="";$("#simHistory").innerHTML="";simulatorInitialized=false;renderSimulatorDefaults();
}
function runConditionSimulator(){
  const rows=simRows();if(rows.length<2)return alert("検証可能な履歴が不足しています");
  const oddRule=$("#simOdd").value,repeatRule=$("#simRepeat").value,slideRule=$("#simSlide").value,consRule=$("#simConsecutive").value;
  const sumMin=$("#simSumMin").value===""?null:Number($("#simSumMin").value),sumMax=$("#simSumMax").value===""?null:Number($("#simSumMax").value),acMin=$("#simAcMin").value===""?null:Number($("#simAcMin").value),rangeMin=$("#simRangeMin").value===""?null:Number($("#simRangeMin").value);
  const records=rows.map((_,i)=>simulatorRecord(rows,i)).slice(1);
  const matched=records.filter(x=>{
    const oddOk=oddRule==="any"||(oddRule==="balanced"&&Math.abs(x.m.odd-C().pick/2)<=1)||(oddRule==="exact"&&x.m.odd===Math.round(C().pick/2));
    return oddOk&&classifyCount(x.repeat,repeatRule)&&classifyCount(x.slide,slideRule)&&classifyCount(x.m.consecutive,consRule)&&(sumMin===null||x.m.sum>=sumMin)&&(sumMax===null||x.m.sum<=sumMax)&&(acMin===null||x.m.ac>=acMin)&&(rangeMin===null||x.m.range>=rangeMin);
  });
  const rate=matched.length/records.length,avgSum=matched.length?mean(matched.map(x=>x.m.sum)):0,avgAc=matched.length?mean(matched.map(x=>x.m.ac)):0;
  $("#simSummary").innerHTML=`<article><b>${matched.length}</b><span>条件一致回</span></article><article><b>${(rate*100).toFixed(1)}%</b><span>一致率</span></article><article><b>${avgSum.toFixed(1)}</b><span>平均合計</span></article><article><b>${avgAc.toFixed(2)}</b><span>平均AC値</span></article>`;
  $("#simStatus").textContent=`${records.length}回を検証し、${matched.length}回が条件に一致しました`;
  renderSimulatorRanking(matched,records);renderSimulatorComparison(matched,records);renderSimulatorHistory(matched);
}
function renderSimulatorRanking(matched,records){
  const box=$("#simNumberRanking");if(!matched.length){box.innerHTML='<p class="muted">条件に一致する回がありません。</p>';return}
  const count=Array(C().max+1).fill(0);matched.forEach(x=>x.draw.nums.forEach(n=>count[n]++));const ranked=Array.from({length:C().max},(_,i)=>({n:i+1,c:count[i+1]})).sort((a,b)=>b.c-a.c||a.n-b.n),max=Math.max(...ranked.map(x=>x.c),1);
  box.innerHTML=ranked.slice(0,15).map((x,i)=>`<div class="score-row"><span>${i+1}</span><b>${String(x.n).padStart(2,"0")}</b><div class="bar"><i style="width:${x.c/max*100}%"></i></div><em>${x.c}回</em></div>`).join('');
}
function renderSimulatorComparison(matched,records){
  const box=$("#simComparison");if(!matched.length){box.innerHTML='<p class="muted">比較データなし</p>';return}
  const metrics=[
    ["前回重複",x=>x.repeat],["±1スライド",x=>x.slide],["奇数個数",x=>x.m.odd],["合計値",x=>x.m.sum],["AC値",x=>x.m.ac],["高低幅",x=>x.m.range],["連番",x=>x.m.consecutive]
  ];
  box.innerHTML='<div class="table-wrap"><table><thead><tr><th>指標</th><th>条件一致回</th><th>基準期間</th><th>差</th></tr></thead><tbody>'+metrics.map(([name,fn])=>{const a=mean(matched.map(fn)),b=mean(records.map(fn)),d=a-b;return `<tr><td>${name}</td><td>${a.toFixed(2)}</td><td>${b.toFixed(2)}</td><td class="${d>0?'ok':d<0?'warn':''}">${d>0?'+':''}${d.toFixed(2)}</td></tr>`}).join('')+'</tbody></table></div>';
}
function renderSimulatorHistory(matched){
  $("#simHistory").innerHTML=[...matched].reverse().slice(0,300).map(x=>`<tr><td>${x.draw.no}</td><td>${x.draw.date||'-'}</td><td>${x.draw.nums.join('・')}</td><td>${x.repeat}</td><td>${x.slide}</td><td>${x.m.sum}</td><td>${x.m.ac}</td></tr>`).join('')||'<tr><td colspan="7">該当なし</td></tr>';
}


// ===== 購入モード・Excel/CSV出力 =====
function purchaseModeKey(){return `loto67_purchase_checks_${game}`}
function purchaseModeChecks(){try{return JSON.parse(localStorage.getItem(purchaseModeKey())||"{}")||{}}catch{return {}}}
function currentPurchaseSets(){return Array.isArray(user[game]?.sets)?user[game].sets:[]}
function currentPurchaseDrawNo(){return nextDrawNo(game)}
function purchaseUnitPrice(){return 300}
function purchaseAiScore(set){return adaptiveStructureScore(set)}
function purchaseRank(score){return score>=88?"S":score>=78?"A":score>=68?"B":score>=58?"C":"D"}
function renderPurchaseMode(){
  const box=$("#purchaseModeSets");if(!box)return;
  const sets=currentPurchaseSets(),drawNo=currentPurchaseDrawNo(),checks=purchaseModeChecks();
  $("#purchaseModeTitle").textContent=`${C().name} 第${drawNo}回 購入数字`;
  $("#purchaseModeAmount").textContent=`${(sets.length*purchaseUnitPrice()).toLocaleString("ja-JP")}円`;
  if(!sets.length){box.innerHTML='<div class="purchase-empty">予想画面で数字を生成してください。</div>';return}
  box.innerHTML=sets.map((set,i)=>{const checked=!!checks[i],score=purchaseAiScore(set);return `<div class="purchase-mode-set ${checked?"done":""}"><label><b>第${i+1}口｜AI ${purchaseRank(score)}ランク ${score}点</b><span><input type="checkbox" data-purchase-check="${i}" ${checked?"checked":""}> 購入済み</span></label><div class="purchase-mode-number">${set.map(n=>`<span>${String(n).padStart(2,"0")}</span>`).join("")}</div></div>`}).join("");
  $$('[data-purchase-check]').forEach(c=>c.onchange=()=>{const state=purchaseModeChecks();state[c.dataset.purchaseCheck]=c.checked;localStorage.setItem(purchaseModeKey(),JSON.stringify(state));renderPurchaseMode()});
}
function purchaseExportRows(){
  const sets=currentPurchaseSets(),drawNo=currentPurchaseDrawNo();
  return sets.map((set,i)=>{const score=purchaseAiScore(set),row={"ゲーム":C().name,"対象回":drawNo,"口番号":i+1};set.forEach((n,j)=>row[`数字${j+1}`]=String(n).padStart(2,"0"));row["AIランク"]=purchaseRank(score);row["AI評価点"]=score;row["作成日時"]=new Date().toLocaleString("ja-JP");return row});
}
function safeFileName(ext){return `${game}_第${currentPurchaseDrawNo()}回_購入数字_${new Date().toISOString().slice(0,10)}.${ext}`}
function downloadBlob(content,type,name){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function exportPurchaseCsv(){
  const rows=purchaseExportRows();if(!rows.length)return alert("出力する予想セットがありません");
  const headers=Object.keys(rows[0]),escape=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv="\uFEFF"+[headers.map(escape).join(","),...rows.map(r=>headers.map(h=>escape(r[h])).join(","))].join("\r\n");
  downloadBlob(csv,"text/csv;charset=utf-8",safeFileName("csv"));$("#purchaseExportStatus").textContent="CSVを出力しました";
}
function exportPurchaseExcel(){
  const rows=purchaseExportRows();if(!rows.length)return alert("出力する予想セットがありません");
  const headers=Object.keys(rows[0]);
  const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const table=`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td style="mso-number-format:'\\@'">${esc(r[h])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const html=`<!doctype html><html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:'Yu Gothic','Meiryo',sans-serif}th{background:#6657ff;color:white}th,td{border:1px solid #999;padding:8px;text-align:center}</style></head><body><h2>${C().name} 第${currentPurchaseDrawNo()}回 購入数字</h2>${table}</body></html>`;
  downloadBlob("\uFEFF"+html,"application/vnd.ms-excel;charset=utf-8",safeFileName("xls"));$("#purchaseExportStatus").textContent="Excel形式（.xls）を出力しました";
}
async function copyPurchaseMode(){
  const sets=currentPurchaseSets();if(!sets.length)return alert("コピーする予想セットがありません");
  const text=`${C().name} 第${currentPurchaseDrawNo()}回\n`+sets.map((s,i)=>`${i+1}. ${s.map(n=>String(n).padStart(2,"0")).join(" ")}`).join("\n");
  try{await navigator.clipboard.writeText(text);$("#purchaseExportStatus").textContent="購入数字をコピーしました"}catch{alert("コピーできませんでした")}
}


boot();
