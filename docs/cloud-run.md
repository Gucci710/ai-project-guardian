# Google Cloud / Cloud Run デプロイ手順

## 最初にユーザーが行うこと

1. [Google Cloud Console](https://console.cloud.google.com/)にGoogleアカウントでログインし、この作品用のプロジェクトを作成します。
2. プロジェクトに請求先アカウントを関連付けます。無料利用枠の範囲でも請求先の有効化が必要です。申し込み・支払方法の登録はユーザー本人が行ってください。
3. プロジェクトIDを控えます。表示名とは別のIDです。リージョンは例として東京`asia-northeast1`を使用します。
4. Gemini APIキーを用意します。既存のローカルキーを使用できます。キーをチャットやGitへ貼らないでください。

Cloud Runに加えて、Cloud Build・Artifact Registry・Secret Manager・Gemini APIに使用量が発生する場合があります。デプロイ前に利用するプロジェクトの請求先と予算通知を設定してください。予算通知は利用額の強制停止ではありません。

前提と請求設定については[Google Cloud公式クイックスタート](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service)を参照してください。

## Cloud Shellで準備

Google Cloud Console右上のCloud Shellを開きます。ローカルPCへのgcloud・Dockerインストールは不要です。

以下はCloud Shellの**Bash**用です。`YOUR_PROJECT_ID`を置き換えてください。

```bash
export GUARDIAN_PROJECT="YOUR_PROJECT_ID"
export GUARDIAN_REGION="asia-northeast1"
gcloud config set project "$GUARDIAN_PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

ソースをCloud Shellへ配置します。Gitリポジトリにコミット済みならそのリポジトリをcloneしてください。未コミットの変更はcloneに含まれないため、今回の実装を含むことを確認します。アップロードする場合はソースとpackage-lock.json・Dockerfile・設定ファイルを含め、`.env.local`・`node_modules`・`.next`は含めません。

```bash
cd ai-project-guardian
```

このディレクトリにDockerfileがあることを確認してください。

## 実行アカウントとSecret Manager

```bash
gcloud iam service-accounts create guardian-runtime --display-name="AI Project Guardian runtime"
export GUARDIAN_RUNTIME="guardian-runtime@${GUARDIAN_PROJECT}.iam.gserviceaccount.com"
```

Cloud Consoleの「Secret Manager」で`guardian-gemini-api-key`というシークレットを作成し、値にGemini APIキーを入力します。最初のバージョン番号は通常`1`です。別番号ならデプロイコマンドの`:1`も変更してください。

実行アカウントに、このシークレットだけの参照権限を付与します。

```bash
gcloud secrets add-iam-policy-binding guardian-gemini-api-key \
  --member="serviceAccount:${GUARDIAN_RUNTIME}" \
  --role="roles/secretmanager.secretAccessor"
```

キーはビルドに渡さず、Cloud Run起動時に環境変数として読み込みます。[Secret Manager連携の公式手順](https://docs.cloud.google.com/run/docs/configuring/services/secrets)に沿った設定です。

ソースビルドに使う既定アカウントへBuilder権限を付与します。

```bash
export GUARDIAN_PROJECT_NUMBER="$(gcloud projects describe "$GUARDIAN_PROJECT" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "$GUARDIAN_PROJECT" \
  --member="serviceAccount:${GUARDIAN_PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.builder"
```

組織の設定で別のビルドアカウントを使う場合は、そのアカウントに読み替えてください。実行者にはCloud Runのデプロイ権限と実行サービスアカウントの利用権限が必要です。詳細は[必要なロール](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service#required_roles)を参照してください。

## ビルドとデプロイ

```bash
gcloud run deploy ai-project-guardian \
  --source . \
  --project "$GUARDIAN_PROJECT" \
  --region "$GUARDIAN_REGION" \
  --service-account "$GUARDIAN_RUNTIME" \
  --set-secrets "GEMINI_API_KEY=guardian-gemini-api-key:1" \
  --set-env-vars "GEMINI_MODEL=gemini-3.7-flash" \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 8 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 1800 \
  --no-allow-unauthenticated
```

モデルは利用するAPIキーで利用可能なIDを指定してください。ビルド中にGeminiキーは不要です。`.gcloudignore`と`.dockerignore`で環境ファイルを送信対象・イメージから除外します。

初回はIAM認証を必須にしています。API使用量が発生するため、このアプリは認証・利用制限なしの一般公開を初期設定にしていません。

## ブラウザーで確認

Cloud Shellで認証付きプロキシを起動します。

```bash
gcloud run services proxy ai-project-guardian \
  --project "$GUARDIAN_PROJECT" \
  --region "$GUARDIAN_REGION" \
  --port 8080
```

Cloud Shellの「ウェブでプレビュー」からポート8080を開きます。SmartShopで開始し、必要なら計画を確認して続行を承認してください。プロキシ実行者にはCloud Run Invoker権限が必要です。

確認項目:

- `/api/health`が`{"status":"ok"}`を返す。
- 仕様と人数を入力してPlanning結果が表示される。
- QAの指摘・根拠・工数内訳が表示される。
- 中信頼で承認待ち、低信頼や検証失敗で停止する。
- セキュリティ比較で実結果が表示される。
- 検証後に変更要求を入力し、採用案から再計算・再検証できる。

## 現在の範囲

実行記録はブラウザー内にあり、ページ更新で失われます。検証完了後にJSONをダウンロードできます。複数ユーザーの認証、永続化、使用量制限、運用監視は別途拡張が必要です。一般公開URLが必要な場合は、その公開範囲とアクセス制御を決めてから公開設定を変更してください。

Cloud Runは今回のAgent処理を実行する基盤です。AIはGoogle Gemini APIを使用しており、Vertex AI認証への移行は含めていません。
