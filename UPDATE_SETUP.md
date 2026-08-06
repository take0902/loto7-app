# 自動更新の初回設定

VercelのEnvironment Variablesに次を登録します。

- `GITHUB_TOKEN`：対象リポジトリだけに Contents Read and write を許可したFine-grained token
- `UPDATE_ADMIN_SECRET`：十分に長い管理パスワード
- `GITHUB_OWNER`：take0902
- `GITHUB_REPO`：loto7-app
- `GITHUB_BRANCH`：main

登録後に再デプロイします。以後はアプリの「自動更新」画面から完成ZIPを選択できます。
