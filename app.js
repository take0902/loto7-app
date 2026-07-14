'use strict';
let base=[], rows=[], currentSets=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function parseCSV(t){const ls=t.trim().split(/\r?\n/);return ls.slice(1).map(l=>{const c=l.split(',');return{round:+c[0],date:c[1],main:c.slice(2,9).map(Number).sort((a,b)=>a-b),bonus:c.slice(9,11).map(Number)}}).filter(x=>x.round&&x.main.length===7)}
function extras(){try{return JSON.parse(localStorage.getItem('loto7-extra')||'[]')}catch{return[]}}
function saveExtras(x){localStorage.setItem('loto7-extra',JSON.stringify(x))}
function merge(){const m=new Map();[...base,...extras()].forEach(x=>m.set(x.round,x));rows=[...m.values()].sort((a,b)=>a.round-b)}
const fmt=n=>String(n).padStart(2,'0');
function balls(nums,bonus=false){return `<div class="balls">${nums.map(n=>`<span class="ball ${bonus?'bonus':''}">${fmt(n)}</span>`).join('')}</div>`}
function latest(){const x=rows.at(-1);$('#latest').innerHTML=x?`<h3>第${x.round}回　${x.date}</h3>${balls(x.main)}<h3>ボーナス</h3>${balls(x.bonus,true)}`:'データなし';$('#dataStatus').textContent=`登録済み ${rows.length}回分`}
function oddCount(a){return a.filter(n=>n%2).length}
function consecutivePairs(a){let c=0;for(let i=1;i<a.length;i++)if(a[i]-a[i-1]===1)c++;return c}
function tailDup(a){const z={};a.forEach(n=>z[n%10]=(z[n%10]||0)+1);return Object.values(z).reduce((s,v)=>s+Math.max(0,v-1),0)}
function slideCount(a,prev){const s=new Set(prev.flatMap(n=>[n-1,n+1]).filter(n=>n>=1&&n<=37));return a.filter(n=>s.has(n)).length}
function scoreSet(a,prev,hot){let s=0;const o=oddCount(a),sum=a.reduce((x,y)=>x+y,0),con=consecutivePairs(a),td=tailDup(a),zones=[0,0,0,0];a.forEach(n=>zones[Math.min(3,Math.floor((n-1)/10))]++);if(o===3||o===4)s+=18;else if(o===2||o===5)s+=8;if(sum>=105&&sum<=165)s+=18;else if(sum>=95&&sum<=175)s+=8;if(con<=1)s+=14;else if(con===2)s+=4;if(td>=1&&td<=2)s+=10;else if(td===0)s+=4;if(zones.every(z=>z>=1))s+=13;if(a.some(n=>n>=32))s+=5;const overlap=a.filter(n=>prev.includes(n)).length;if(overlap<=2)s+=8;if(slideCount(a,prev)>=1&&slideCount(a,prev)<=3)s+=8;s+=a.reduce((q,n)=>q+(hot[n]||0),0)*1.5;return s}
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function generate(){const prev=rows.at(-1)?.main||[], recent=rows.slice(-20),hot={};for(let n=1;n<=37;n++)hot[n]=recent.reduce((s,r)=>s+r.main.includes(n),0);const random=rng((rows.at(-1)?.round||1)*7919+Date.now()%100000),cand=[];for(let k=0;k<12000;k++){const set=new Set();while(set.size<7)set.add(1+Math.floor(random()*37));const a=[...set].sort((x,y)=>x-y);cand.push({a,score:scoreSet(a,prev,hot)})}cand.sort((x,y)=>y.score-x.score);const picked=[],use={};for(const c of cand){let overlapMax=picked.length?Math.max(...picked.map(p=>p.filter(n=>c.a.includes(n)).length)):0;let penalty=c.a.reduce((s,n)=>s+(use[n]||0)*7,0)+Math.max(0,overlapMax-3)*25;const adj=c.score-penalty;if(picked.length<5){const bestWindow=cand.slice(0,Math.min(500,cand.length)).map(x=>({x,adj:x.score-x.a.reduce((s,n)=>s+(use[n]||0)*7,0)-Math.max(0,(picked.length?Math.max(...picked.map(p=>p.filter(n=>x.a.includes(n)).length)):0)-3)*25})).sort((a,b)=>b.adj-a.adj)[0].x;picked.push(bestWindow.a);bestWindow.a.forEach(n=>use[n]=(use[n]||0)+1);cand.splice(cand.indexOf(bestWindow),1)}if(picked.length===5)break}currentSets=picked;renderSets()}
function renderSets(){$('#predictions').innerHTML=currentSets.map((a,i)=>`<div class="set"><span class="tag">${'ABCDE'[i]}</span>${balls(a)}</div>`).join('')}
function filterStats(data){const prevAll=rows;const out={odd:0,sum:0,con:0,tail:0,slide:0};data.forEach((r,idx)=>{const a=r.main,o=oddCount(a),sum=a.reduce((x,y)=>x+y,0);if(o===3||o===4)out.odd++;if(sum>=100&&sum<=170)out.sum++;if(consecutivePairs(a)<=1)out.con++;if(tailDup(a)>=1&&tailDup(a)<=2)out.tail++;const globalIndex=rows.findIndex(x=>x.round===r.round);if(globalIndex>0&&slideCount(a,rows[globalIndex-1].main)>=1&&slideCount(a,rows[globalIndex-1].main)<=3)out.slide++});return out}
function showStats(n=0){const d=n?rows.slice(-n):rows, cnt=d.length, avg=d.reduce((s,r)=>s+r.main.reduce((x,y)=>x+y,0),0)/cnt;const f=filterStats(d);$('#statsBody').innerHTML=`<div class="grid"><div class="metric"><b>${cnt}</b><span>対象回数</span></div><div class="metric"><b>${avg.toFixed(1)}</b><span>平均合計値</span></div><div class="metric"><b>${(d.reduce((s,r)=>s+oddCount(r.main),0)/cnt).toFixed(2)}</b><span>平均奇数個数</span></div><div class="metric"><b>${rows.at(-1)?.round||'-'}</b><span>最新開催回</span></div></div>`;$('#filters').innerHTML=`<table><tr><th>条件</th><th>通過率</th></tr>${[['偶奇3:4/4:3',f.odd],['合計100〜170',f.sum],['連番0〜1組',f.con],['末尾重複1〜2',f.tail],['スライド1〜3',f.slide]].map(x=>`<tr><td>${x[0]}</td><td>${(x[1]/cnt*100).toFixed(1)}%</td></tr>`).join('')}</table>`}
function nums(s){return s.split(/[\s,、・]+/).filter(Boolean).map(Number)}
async function init(){try{base=parseCSV(await fetch('loto7_data.csv').then(r=>r.text()));merge();latest();generate();showStats(0);$('#round').value=(rows.at(-1)?.round||0)+1}catch(e){$('#dataStatus').textContent='データ読み込みに失敗しました';console.error(e)}if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});if(!window.matchMedia('(display-mode: standalone)').matches)$('#installCard').style.display='block'}
$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.page').forEach(x=>x.classList.remove('active'));$('#'+b.dataset.page).classList.add('active')});
$$('.period').forEach(b=>b.onclick=()=>showStats(+b.dataset.n));
$('#regen').onclick=generate;
$('#copySets').onclick=()=>navigator.clipboard.writeText(currentSets.map((a,i)=>`${'ABCDE'[i]}：${a.map(fmt).join('・')}`).join('\n')).then(()=>alert('コピーしました'));
$('#official').onclick=()=>window.open('https://www.mizuhobank.co.jp/takarakuji/check/loto/loto7/index.html','_blank');
$('#addResult').onclick=()=>{const r=+$('#round').value,d=$('#date').value,m=nums($('#mainNums').value),b=nums($('#bonusNums').value);if(!r||!d||m.length!==7||b.length!==2||new Set(m).size!==7||m.some(n=>n<1||n>37)||b.some(n=>n<1||n>37)){ $('#addMsg').textContent='入力を確認してください。本数字7個、ボーナス2個が必要です。';return}const ex=extras().filter(x=>x.round!==r);ex.push({round:r,date:d.replaceAll('-','/'),main:m.sort((a,b)=>a-b),bonus:b.sort((a,b)=>a-b)});saveExtras(ex);merge();latest();generate();showStats(0);$('#addMsg').textContent=`第${r}回を保存しました。`};
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(extras(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='loto7_backup.json';a.click();URL.revokeObjectURL(a.href)};
$('#importFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{saveExtras(JSON.parse(rd.result));merge();latest();generate();showStats(0);alert('読み込みました')}catch{alert('読み込みに失敗しました')}};rd.readAsText(f)};
$('#resetBtn').onclick=()=>{if(confirm('手入力した追加データを削除しますか？')){localStorage.removeItem('loto7-extra');merge();latest();generate();showStats(0)}};
init();

let stopBT=false;
function scoreSetAt(a, history){
 const prev=history.at(-1)?.main||[], recent=history.slice(-20),hot={};
 for(let n=1;n<=37;n++)hot[n]=recent.reduce((s,r)=>s+r.main.includes(n),0);
 return scoreSet(a,prev,hot);
}
function genAt(history, seed, candidateCount=450){
 const random=rng(seed),cand=[];
 for(let k=0;k<candidateCount;k++){
  const st=new Set(); while(st.size<7)st.add(1+Math.floor(random()*37));
  const a=[...st].sort((x,y)=>x-y); cand.push({a,score:scoreSetAt(a,history)});
 }
 cand.sort((x,y)=>y.score-x.score);
 const picked=[],use={};
 while(picked.length<5 && cand.length){
  let best=null,bestAdj=-1e9,bestIdx=0;
  for(let i=0;i<Math.min(180,cand.length);i++){
   const x=cand[i], ov=picked.length?Math.max(...picked.map(p=>p.filter(n=>x.a.includes(n)).length)):0;
   const adj=x.score-x.a.reduce((s,n)=>s+(use[n]||0)*7,0)-Math.max(0,ov-3)*25;
   if(adj>bestAdj){bestAdj=adj;best=x;bestIdx=i}
  }
  picked.push(best.a); best.a.forEach(n=>use[n]=(use[n]||0)+1); cand.splice(bestIdx,1);
 }
 return picked;
}
function matchCount(a,b){const s=new Set(b);return a.reduce((n,x)=>n+s.has(x),0)}
async function runBacktest(n){
 stopBT=false; const end=rows.length, start=Math.max(30,end-n), results=[];
 $('#btResult').innerHTML='';
 for(let i=start;i<end;i++){
  if(stopBT)break;
  const hist=rows.slice(0,i), target=rows[i];
  const sets=genAt(hist,target.round*7919,450);
  const ms=sets.map(s=>matchCount(s,target.main));
  const union=new Set(sets.flat());
  results.push({max:Math.max(...ms),avg:ms.reduce((a,b)=>a+b,0)/5,cover:target.main.filter(x=>union.has(x)).length});
  if((i-start)%5===0){$('#btStatus').textContent=`${i-start+1}/${end-start}回を検証中…`; await new Promise(r=>setTimeout(r,0));}
 }
 if(!results.length){$('#btStatus').textContent='停止しました';return}
 const pct=k=>results.filter(x=>x.max>=k).length/results.length*100;
 const avg=k=>results.reduce((s,x)=>s+x[k],0)/results.length;
 const dist=[0,1,2,3,4,5,6,7].map(k=>results.filter(x=>x.max===k).length);
 $('#btStatus').textContent=`${results.length}回の検証完了`;
 $('#btResult').innerHTML=`<div class="grid"><div class="metric"><b>${avg('avg').toFixed(3)}</b><span>1口平均一致</span></div><div class="metric"><b>${avg('max').toFixed(3)}</b><span>5口最高一致平均</span></div><div class="metric"><b>${avg('cover').toFixed(2)}</b><span>5口全体カバー</span></div><div class="metric"><b>${pct(4).toFixed(1)}%</b><span>4個以上の回</span></div></div><table><tr><th>評価</th><th>結果</th></tr><tr><td>3個以上</td><td>${pct(3).toFixed(1)}%</td></tr><tr><td>4個以上</td><td>${pct(4).toFixed(1)}%</td></tr><tr><td>5個以上</td><td>${pct(5).toFixed(1)}%</td></tr><tr><td>最高一致分布</td><td>${dist.map((v,i)=>`${i}個:${v}`).join(' / ')}</td></tr></table>`;
}
$$('.backtest').forEach(b=>b.onclick=()=>runBacktest(+b.dataset.n));
$('#stopBacktest').onclick=()=>{stopBT=true;$('#btStatus').textContent='停止処理中…'};
