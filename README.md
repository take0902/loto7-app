# AI Lottery Lab Professional 1.0.2

ロト6・ロト7の統計分析、買い目生成、購入履歴、抽選後検証、バックテスト、自動更新を統合したWebアプリです。

## 公開構成

- `index.html`：画面本体
- `app.js`：分析・予想・履歴・検証ロジック
- `app.css`：画面デザイン
- `api/update.js`：GitHub/Vercel自動更新API
- `scripts/validate-release.js`：リリース整合性検査

## バージョン管理

画面内の各機能に個別バージョンは付けません。アプリ全体を `Professional 1.0.2` として一元管理します。


## Professional 1.0.2 修正
- ロト6最新回は `/api/latest?game=loto6` で公開当せん番号ページをサーバー側確認
- 取得失敗時のみ `latest.json` をフォールバック使用
- 「最新結果で自動検証」は手入力・保存予想を抽選結果として流用しない
- 画面の最新回と保存済み予想の対象回を分離
