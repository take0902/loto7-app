const config={
  loto6:{name:"ロト6",max:43,pick:6,bonus:1,file:"loto6.json"},
  loto7:{name:"ロト7",max:37,pick:7,bonus:2,file:"loto7.json"}
};
const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
let game="loto6", draws={};
const defaultUser={loto6:{sets:[],savedSets:[],checks:[]},loto7:{sets:[],savedSets:[],checks:[]}};
let user=loadUser();
let backtestResults={};
let optimizerResult=null;
const C=()=>config[game], R=()=>draws[game];

function loadUser(){
  try{
    const raw=localStorage.getItem("loto67v10")||localStorage.getItem("loto67v6");
    const parsed=raw?JSON.parse(raw):structuredClone(defaultUser);
    for(const g of ["loto6","loto7"]){
      parsed[g]??={};
      parsed[g].sets??=[];
      parsed[g].savedSets??=[];
      parsed[g].checks??=[];
      parsed[g].customWeights??=null;
    }
    return parsed;
  }catch{return structuredClone(defaultUser)}
}
function save(){localStorage.setItem("loto67v10",JSON.stringify(user))}
async function loadJson(path){
  const r=await fetch(path,{cache:"no-store"});
  if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
  const data=await r.json();
  if(!Array.isArray(data)||!data.length)throw new Error(`${path}: データ形式エラー`);
  return data;
}
async function boot(){
  try{
    draws.loto6=await loadJson(config.loto6.file);
    draws.loto7=await loadJson(config.loto7.file);
    bind(); render();
    if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }catch(e){
    console.error(e);
    document.body.innerHTML=`<main><div class="card"><h2>データを読み込めませんでした</h2><p>${String(e.message||e)}</p><button onclick="location.reload()" class="primary">再読み込み</button></div></main>`;
  }
}
function bind(){
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
    const score=structureScore(set);
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
  save();renderSets();renderCandidateScores();renderReport();
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
  renderAnalysis();renderSets();renderCandidateScores();renderValidationHistory();renderHistory();renderReport();renderBacktestEmpty();
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
    const m=setMetrics(a),score=structureScore(a);
    return `<div class="set"><div class="settop"><b>第${i+1}口</b><span class="badge">構造 ${score}点</span></div>${balls(a)}<div class="mini-metrics">合計 ${m.sum}｜奇数 ${m.odd}｜連番 ${m.consecutive}｜AC ${m.ac}｜幅 ${m.range}</div></div>`;
  }).join(""):"<p class='muted'>予想セットを生成してください。</p>";
}
function renderCandidateScores(){
  if(!$("#candidateScores"))return;
  const scores=multiScore($("#strategy").value),max=scores[0]?.total||1;
  $("#candidateScores").innerHTML=scores.slice(0,18).map((x,i)=>`<div class="score-row"><span>${i+1}</span><b>${String(x.n).padStart(2,"0")}</b><div class="bar"><i style="width:${x.total/max*100}%"></i></div><em>${Math.round(x.total/max*100)}</em></div>`).join("");
}
function saveCurrentSets(){
  if(!user[game].sets.length)return alert("先に予想セットを生成してください");
  user[game].savedSets.unshift({date:new Date().toISOString(),sets:user[game].sets});
  save();alert("購入候補として保存しました");
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
  a.download="loto67_user_data_v10.json";a.click();
}
function importData(){
  try{
    const x=JSON.parse($("#importText").value);
    if(!x.loto6||!x.loto7)throw Error();
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

boot();