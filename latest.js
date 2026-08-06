const SOURCES={
  loto6:{name:"ロト6",base:"https://www.mizuhobank.co.jp/takarakuji/apl/txt/loto6/",nameFile:"name.txt",max:43,pick:6,bonus:1},
  loto7:{name:"ロト7",base:"https://www.mizuhobank.co.jp/takarakuji/apl/txt/loto7/",nameFile:"name.txt",max:37,pick:7,bonus:2}
};

function normalizeDate(value){
  const s=String(value||"").trim();
  let m=s.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if(!m)return "";
  return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
function valid(draw,c){
  return draw&&Number.isInteger(draw.no)&&draw.no>0&&/^\d{4}-\d{2}-\d{2}$/.test(draw.date)&&
    Array.isArray(draw.nums)&&draw.nums.length===c.pick&&new Set(draw.nums).size===c.pick&&
    Array.isArray(draw.bonus)&&draw.bonus.length===c.bonus&&new Set(draw.bonus).size===c.bonus&&
    [...draw.nums,...draw.bonus].every(n=>Number.isInteger(n)&&n>=1&&n<=c.max)&&
    !draw.bonus.some(n=>draw.nums.includes(n));
}
function decodeBuffer(buffer){
  const bytes=new Uint8Array(buffer);
  const candidates=[];
  for(const enc of ["shift_jis","utf-8"]){
    try{candidates.push(new TextDecoder(enc,{fatal:false}).decode(bytes))}catch{}
  }
  return candidates.sort((a,b)=>{
    const sa=(a.match(/ロト|本数字|ボーナス|抽せん/g)||[]).length;
    const sb=(b.match(/ロト|本数字|ボーナス|抽せん/g)||[]).length;
    return sb-sa;
  })[0]||"";
}
function cells(line){
  return String(line||"").split(/[,\t]/).map(x=>x.trim().replace(/^"|"$/g,""));
}
function numsFromLine(line){
  return cells(line).flatMap(x=>(x.match(/\d{1,2}/g)||[]).map(Number)).filter(n=>n>=1&&n<=43);
}
function parseOfficialCsv(text,filename,c){
  const normalized=String(text||"").replace(/\r/g,"");
  const lines=normalized.split("\n").map(x=>x.trim()).filter(Boolean);
  const filenameNo=Number((String(filename).match(/(\d{4})\.CSV$/i)||[])[1]);
  const textNoMatch=normalized.match(/第\s*(\d+)\s*回/);
  const no=Number(textNoMatch?.[1]||filenameNo||0);
  const dateLine=lines.find(x=>/抽せん日|抽選日|日付/.test(x))||normalized;
  const date=normalizeDate(dateLine);
  let nums=[],bonus=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/本数字/.test(line)){
      nums=numsFromLine(line.replace(/^.*?本数字/,""));
      if(nums.length<c.pick&&lines[i+1])nums=nums.concat(numsFromLine(lines[i+1]));
      nums=nums.slice(0,c.pick);
    }
    if(/ボーナス/.test(line)){
      bonus=numsFromLine(line.replace(/^.*?ボーナス(?:数字)?/,""));
      if(bonus.length<c.bonus&&lines[i+1])bonus=bonus.concat(numsFromLine(lines[i+1]));
      bonus=bonus.slice(0,c.bonus);
    }
  }
  // ラベルが改行で分離されたCSVにも対応。
  const flat=cells(normalized.replace(/\n/g,","));
  if(nums.length!==c.pick){
    const i=flat.findIndex(x=>/本数字/.test(x));
    if(i>=0)nums=flat.slice(i+1).flatMap(x=>(x.match(/^\d{1,2}$/)||[]).map(Number)).filter(n=>n>=1&&n<=c.max).slice(0,c.pick);
  }
  if(bonus.length!==c.bonus){
    const i=flat.findIndex(x=>/ボーナス/.test(x));
    if(i>=0)bonus=flat.slice(i+1).flatMap(x=>(x.match(/^\d{1,2}$/)||[]).map(Number)).filter(n=>n>=1&&n<=c.max).slice(0,c.bonus);
  }
  const draw={no,date,nums:nums.map(Number).sort((a,b)=>a-b),bonus:bonus.map(Number).sort((a,b)=>a-b)};
  if(!valid(draw,c))throw new Error(`公式CSVを解析できません: ${filename}`);
  return draw;
}
async function fetchText(url){
  const r=await fetch(url,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0 (compatible; AI-Lottery-Lab/1.1)",Accept:"text/plain,text/csv,*/*"}});
  if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);
  return r;
}
async function latestOfficial(game){
  const c=SOURCES[game];
  if(!c)throw new Error("未対応ゲームです");
  const nameRes=await fetchText(c.base+c.nameFile);
  const nameText=decodeBuffer(await nameRes.arrayBuffer());
  const files=[...nameText.matchAll(/NAME\s+([^\s]+\.CSV)/gi)].map(m=>m[1]);
  if(!files.length)throw new Error("公式ファイル一覧を取得できませんでした");
  // 回号の大きい順。公開直後に先頭が壊れていても次候補を試す。
  files.sort((a,b)=>Number((b.match(/(\d{4})\.CSV$/i)||[])[1]||0)-Number((a.match(/(\d{4})\.CSV$/i)||[])[1]||0));
  let lastError=null;
  for(const filename of files.slice(0,3)){
    try{
      const csvRes=await fetchText(c.base+filename);
      const csvText=decodeBuffer(await csvRes.arrayBuffer());
      const draw=parseOfficialCsv(csvText,filename,c);
      return {draw,filename,sourceUrl:c.base+filename};
    }catch(e){lastError=e}
  }
  throw lastError||new Error("公式最新CSVを取得できませんでした");
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const game=String(req.query?.game||"loto6");
  try{
    const result=await latestOfficial(game);
    return res.status(200).json({ok:true,game,draw:{...result.draw,verified:true,source:"みずほ銀行公式CSV"},source:"みずほ銀行公式CSV",filename:result.filename,sourceUrl:result.sourceUrl,checkedAt:new Date().toISOString()});
  }catch(error){
    return res.status(502).json({ok:false,game,error:String(error.message||error),checkedAt:new Date().toISOString()});
  }
};
module.exports._test={normalizeDate,parseOfficialCsv,valid};
