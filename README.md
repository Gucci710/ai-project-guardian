# Agent Guardian

AIエージェントの設計を診断し、危険な権限を制限して、その制限が実行時に機能するか検証する起動許可プロトコルです。

Google Geminiが入力文から権限・根拠・未確認事項を抽出し、修正版仕様と権限ルールを生成します。プログラム側の認可層が、合成データの隔離環境で外部送信・削除・範囲外参照を拒否し、必要な参照と返信下書きは実行できることを確認します。

## ローカル起動

Node.js 22以降を使用します。

```powershell
npm ci
Copy-Item .env.example .env.local
```

`.env.local`に`GEMINI_API_KEY`を設定します。既存のファイルがある場合は上書きせず、必要な変数だけ追加してください。

```powershell
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)を開きます。

`GEMINI_MODEL`の既定値は`gemini-3.7-flash`です。API利用制限や一時障害では、`GEMINI_FALLBACK_MODELS`に指定したモデルへ有限回だけ切り替えます。

## 起動審査

1. 入力文を6つの権限・統制項目で診断し、引用できない設定を「未確認」にします。
2. 危険な権限を合成環境で再現します。
3. Geminiが修正版仕様と機械可読な権限ルールを作成します。
4. 認可層が危険操作の拒否と正常操作の成功を再検証します。
5. 許可された参照結果だけで返信内容を作り、顧客・注文・返品条件・根拠を照合します。
6. すべて合格した場合だけ、10分間有効な制限付き起動許可を発行します。

設計診断は任意の業務を受け付けます。実行検証は現在、問い合わせ返信の合成環境だけに対応しています。実データの送信・削除や、外部エージェントの停止は行いません。

`POST /api/launch`は、診断する`review`と、署名付き許可で下書き作成・拒否確認を行う`execute`に対応します。クライアントから送られた権限値では許可範囲を拡大できません。

診断結果は共有用テキスト、詳細な監査記録はJSONで保存できます。どちらも起動許可証ではなく、ページを更新すると画面上の状態は失われます。

詳しい制約は[起動審査の設計と検証範囲](docs/launch-protocol.md)、デプロイ方法は[Cloud Run手順](docs/cloud-run.md)を参照してください。

## 検証

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

ブラウザーテストは、別ターミナルで`npm run dev -- --port 3100`を起動してから`npm run test:browser`を実行します。

実Geminiを使った確認は`npm run verify:launch`です。API使用量が発生し、結果はGit対象外の`artifacts/`へ保存されます。

## Google Cloud

DockerfileはNext.jsのstandalone出力をCloud Runで実行します。APIキーはビルドへ渡さず、Cloud Run起動時にSecret Managerから`GEMINI_API_KEY`として読み込みます。

構造化出力には[Google Gemini公式のJSON Schema機能](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en)を使用し、アプリ側でも構造と値を検証しています。
