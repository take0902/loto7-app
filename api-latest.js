// AI Lottery Lab Ver.21.1.2
// Vercel root function. /api/latest is routed here by vercel.json.
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  try {
    const [loto6, loto7] = await Promise.all([
      fetchLatest("loto6"),
      fetchLatest("loto7")
    ]);

    return res.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      loto6,
      loto7
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "LATEST_FETCH_FAILED",
      message: error && error.message ? error.message : String(error),
      checkedAt: new Date().toISOString()
    });
  }
};

async function getText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AI-Lottery-Lab/21.1.2)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.text();
}

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchLatest(game) {
  const host = game === "loto6" ? "https://loto6.thekyo.jp" : "https://loto7.thekyo.jp";
  const pick = game === "loto6" ? 6 : 7;
  const bonusCount = game === "loto6" ? 1 : 2;

  const topHtml = await getText(`${host}/`);
  const topText = cleanText(topHtml);

  const roundPatterns = game === "loto6"
    ? [/ロト[６6]\s*第?\s*(\d+)\s*回/i, /第\s*(\d+)\s*回\s*ロト[６6]/i, /最新.*?第\s*(\d+)\s*回/i]
    : [/ロト[７7]\s*第?\s*(\d+)\s*回/i, /第\s*(\d+)\s*回\s*ロト[７7]/i, /最新.*?第\s*(\d+)\s*回/i];

  let no = 0;
  for (const p of roundPatterns) {
    const m = topText.match(p);
    if (m) { no = Number(m[1]); break; }
  }
  if (!no) throw new Error(`${game}: 最新回号を取得できません`);

  const resultUrl = `${host}/iphone/database/getresult?no=${no}`;
  const resultText = cleanText(await getText(resultUrl));

  const dateMatch = resultText.match(/(?:開催日|抽せん日)\s*[:：]?\s*(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})/);
  const date = dateMatch
    ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[3]).padStart(2,"0")}`
    : "";

  const mainMatch = resultText.match(/本数字\s*([0-9０-９\s|・,、]{11,80}?)(?:BO|ボーナス|等級)/i);
  if (!mainMatch) throw new Error(`${game}: 本数字を解析できません`);

  const toAscii = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0));
  const nums = (toAscii(mainMatch[1]).match(/\d{1,2}/g) || []).map(Number).slice(0, pick);

  const bonusMatch = resultText.match(/(?:BO|ボーナス(?:数字)?)\s*[:：|]?\s*([0-9０-９\s|・,、]{1,30}?)(?:等級|1等|１等)/i);
  const bonus = bonusMatch
    ? (toAscii(bonusMatch[1]).match(/\d{1,2}/g) || []).map(Number).slice(0, bonusCount)
    : [];

  if (nums.length !== pick || bonus.length !== bonusCount) {
    throw new Error(`${game}: 数字数が不正です 本数字=${nums.length} ボーナス=${bonus.length}`);
  }

  return {
    no,
    date,
    nums: nums.sort((a,b)=>a-b),
    bonus: bonus.sort((a,b)=>a-b),
    source: resultUrl
  };
}
