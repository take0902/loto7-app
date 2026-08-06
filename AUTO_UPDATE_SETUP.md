# AI Lottery Lab Ver.32 自動更新 初回設定

Vercelの対象プロジェクトで、Settings → Environment Variables に次を登録します。

- `GITHUB_TOKEN`：対象リポジトリ `take0902/loto7-app` の Contents: Read and write 権限を持つFine-grained token
- `UPDATE_ADMIN_SECRET`：自分だけが分かる長い管理パスワード
- `GITHUB_OWNER`：`take0902`
- `GITHUB_REPO`：`loto7-app`
- `GITHUB_BRANCH`：`main`

登録対象はProductionを必須とし、必要ならPreviewにも登録してください。登録後は再デプロイが必要です。

## 利用方法

1. アプリの「自動更新」タブを開く
2. 完成版ZIPを選択
3. 管理パスワードを入力
4. 「検査して自動更新」を押す
5. GitHubコミット作成後、Vercelの自動デプロイ完了を待つ

## 注意

GitHubトークンはZIPやJavaScriptへ記載しないでください。Vercel環境変数だけに保存します。
