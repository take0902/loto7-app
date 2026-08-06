const SOURCES={
  loto6:"https://www.takarakuji-loto6.jp/LotoNumber/History"
};

function normalizeDate(v){return String(v||"").trim().replace(/\//g,"-")}
function valid(draw,max,pick,bonusCount){
  return draw&&Number.isInteger(draw.no)&&draw.no>0&&/^\d{4}-\d{2}-\d{2}$/.test(draw.date)&&
    Array.isArray(draw.nums)&&draw.nums.length===pick&&new Set(draw.nums).size===pick&&
    Array.isArray(draw.bonus)&&draw.bonus.length===bonusCount&&new Set(draw.bonus).size===bonusCount&&
    [...draw.nums,...draw.bonus].every(n=>Number.isInteger(n)&&n>=1&&n<=max)&&
    !draw.bonus.some(n=>draw.nums.includes(n));
}
function parseLoto6(html){
  const text=String(html).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\s+/g," ");
  const rx=/第\s*(\d+)\s*回\s*(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})\s*(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})/g;
  const found=[];let m;
  while((m=rx.exec(text))){
    const draw={no:Number(m[1]),date:normalizeDate(m[2]).split('-').map((x,i)=>i?x.padStart(2,'0'):x).join('-'),nums:m.slice(3,9).map(Number).sort((a,b)=>a-b),bonus:[Number(m[9])]};
    if(valid(draw,43,6,1))found.push(draw);
  }
  found.sort((a,b)=>b.no-a.no);
  return found[0]||null;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const game=String(req.query?.game||"loto6");
  if(game!=="loto6")return res.status(400).json({ok:false,error:"現在オンライン確認に対応しているのはロト6です"});
  try{
    const response=await fetch(SOURCES.loto6,{headers:{"User-Agent":"Mozilla/5.0 (compatible; AI-Lottery-Lab/1.0)","Accept":"text/html"}});
    if(!response.ok)throw new Error(`source HTTP ${response.status}`);
    const draw=parseLoto6(await response.text());
    if(!draw)throw new Error("最新回を解析できませんでした");
    return res.status(200).json({ok:true,game,draw,source:"takarakuji-loto6.jp",checkedAt:new Date().toISOString()});
  }catch(error){
    return res.status(502).json({ok:false,error:String(error.message||error),checkedAt:new Date().toISOString()});
  }
};
