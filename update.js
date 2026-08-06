const AdmZip = require("adm-zip");

const MAX_BYTES = 3 * 1024 * 1024;
const REQUIRED = ["index.html", "app.js", "app.css", "loto6.json", "loto7.json", "vercel.json", "package.json"];
const LEGACY_PATHS = [
  "ver20-final-copy.html", "data-repair-688.html", "sw.js",
  "api-latest.js", "app-config.js", "app_Ver20_2_draw6.html",
  "README_更新手順.txt", "Ver30.1_修正内容.txt", "Ver30_変更内容.txt"
];
const DENIED_NAMES = [/^\.env/i, /token/i, /secret/i, /credential/i, /^\.git\//i];

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POSTのみ対応しています" });

  const expected = process.env.UPDATE_ADMIN_SECRET;
  const supplied = req.headers["x-update-secret"];
  if (!expected || !supplied || !constantTimeEqual(String(expected), String(supplied))) {
    return res.status(401).json({ ok: false, error: "管理パスワードが正しくありません" });
  }

  const owner = process.env.GITHUB_OWNER || "take0902";
  const repo = process.env.GITHUB_REPO || "loto7-app";
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: "GITHUB_TOKENがVercelに設定されていません" });

  try {
    const body = await readBody(req);
    if (!body.length) throw new Error("ZIPデータが空です");
    if (body.length > MAX_BYTES) throw new Error("ZIPは3MB以下にしてください");

    const zip = new AdmZip(body);
    const entries = zip.getEntries().filter(e => !e.isDirectory);
    if (!entries.length) throw new Error("ZIP内にファイルがありません");
    if (entries.length > 100) throw new Error("ZIP内のファイル数が多すぎます");

    const files = new Map();
    const rootPrefix = commonArchiveRoot(entries.map(e => e.entryName));
    for (const entry of entries) {
      const rawName = rootPrefix && entry.entryName.startsWith(rootPrefix) ? entry.entryName.slice(rootPrefix.length) : entry.entryName;
      const name = normalizePath(rawName);
      if (!name) continue;
      if (DENIED_NAMES.some(pattern => pattern.test(name))) throw new Error(`禁止ファイルが含まれています：${name}`);
      const data = entry.getData();
      if (data.length > 1024 * 1024) throw new Error(`1MBを超えるファイルは更新できません：${name}`);
      files.set(name, data);
    }

    for (const required of REQUIRED) if (!files.has(required)) throw new Error(`必須ファイルがありません：${required}`);
    validateJson(files, "loto6.json");
    validateJson(files, "loto7.json");
    validateJson(files, "vercel.json");
    const version = detectVersion(files.get("index.html").toString("utf8"));
    validateApp(files, version);

    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await gh(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, token);

    const baseTree = await gh(`/repos/${owner}/${repo}/git/trees/${baseCommit.tree.sha}?recursive=1`, token);
    const existingPaths = new Set((baseTree.tree || []).map(item => item.path));
    const deletedPaths = LEGACY_PATHS.filter(path => existingPaths.has(path));
    const tree = deletedPaths.map(path => ({ path, mode: "100644", type: "blob", sha: null }));
    for (const [path, data] of files) {
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, token, {
        method: "POST",
        body: { content: data.toString("base64"), encoding: "base64" }
      });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, token, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree }
    });
    const requestedMessage = String(req.query?.message || "").trim().slice(0, 120);
    const message = requestedMessage || `AI Lottery Lab Ver.${version} 自動更新`;
    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, token, {
      method: "POST",
      body: { message, tree: newTree.sha, parents: [baseCommitSha] }
    });
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
      method: "PATCH",
      body: { sha: commit.sha, force: false }
    });

    return res.status(200).json({ ok: true, version, commit: commit.sha, files: files.size, deleted: deletedPaths.length, branch });
  } catch (error) {
    console.error("auto update failed", error);
    return res.status(400).json({ ok: false, error: error.message || "更新に失敗しました" });
  }
};

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "binary");
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function commonArchiveRoot(names) {
  const normalized = names.map(n => String(n || "").replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
  if (!normalized.length) return "";
  const firstParts = normalized[0].split("/");
  if (firstParts.length < 2) return "";
  const candidate = `${firstParts[0]}/`;
  return normalized.every(n => n.startsWith(candidate)) ? candidate : "";
}

function normalizePath(input) {
  const path = String(input || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.includes("../") || path.includes("\0")) throw new Error(`不正なパスです：${input}`);
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 8) throw new Error(`階層が深すぎます：${path}`);
  return parts.join("/");
}

function validateJson(files, name) {
  try { JSON.parse(files.get(name).toString("utf8")); }
  catch { throw new Error(`${name}のJSON形式が不正です`); }
}

function detectVersion(html) {
  const match = html.match(/(?:Ver\.|Professional\s+)(\d+\.\d+\.\d+)/);
  if (!match) throw new Error("index.htmlからバージョンを確認できません");
  return match[1];
}

function validateApp(files, version) {
  const html = files.get("index.html").toString("utf8");
  const js = files.get("app.js").toString("utf8");
  if (!html.includes(version)) throw new Error("index.htmlのバージョン表記が不一致です");
  if (!js.includes(version)) throw new Error("app.jsのバージョン表記が不一致です");
  if (!/<script[^>]+src=["']app\.js/.test(html)) throw new Error("index.htmlからapp.jsが参照されていません");
  if (!/<link[^>]+href=["']app\.css/.test(html)) throw new Error("index.htmlからapp.cssが参照されていません");
}

function constantTimeEqual(a, b) {
  const crypto = require("crypto");
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function gh(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-Lottery-Lab-Updater",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${data.message || "処理失敗"}`);
  return data;
}
