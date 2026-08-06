const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = ['index.html','app.js','app.css','loto6.json','loto7.json','manifest.webmanifest','package.json','vercel.json','api/update.js'];
const errors = [];
for (const file of required) if (!fs.existsSync(path.join(root,file))) errors.push(`必須ファイルなし: ${file}`);

const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version = pkg.version;
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const js = fs.readFileSync(path.join(root,'app.js'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
for (const file of ['loto6.json','loto7.json','latest.json','vercel.json']) JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
if (!html.includes(version)) errors.push('index.html のバージョン不一致');
if (!js.includes(`version:"${version}"`)) errors.push('app.js APP_META のバージョン不一致');
if (!String(manifest.name).includes(version)) errors.push('manifest のバージョン不一致');
if (/renderVer\d+|injectVer\d+|ENGINE\s+V(?:2\d|3[0-2])/.test(html+js)) errors.push('旧モジュール名または旧ENGINE表記が残っています');
if (/Ver\.(?:1[2-9]|2\d|3[0-2])(?:\.\d+){0,2}/.test(html+js)) errors.push('旧バージョン表記が残っています');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Validation OK: AI Lottery Lab Professional ${version}`);
