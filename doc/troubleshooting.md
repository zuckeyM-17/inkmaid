# ❓ トラブルシューティング

よくある問題とその解決方法をまとめています。

---

## 🚀 起動・セットアップ

### ポート3000が使用中

**症状:** `Error: listen EADDRINUSE: address already in use :::3000`

**解決方法:**

```bash
# 使用中のプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>

# または、別のポートで起動
PORT=3001 pnpm dev
```

---

### pnpm install でエラー

**症状:** `ERR_PNPM_STORE_IS_NOT_IN_WORKSPACE_DIRECTORY`

**原因:** Cursor AI のサンドボックス環境でストアディレクトリが異なる

**解決方法:**

```bash
# .npmrc を作成
cp .npmrc.example .npmrc

# .npmrc を編集して YOUR_USERNAME を自分のユーザー名に変更
# store-dir=/Users/YOUR_USERNAME/.pnpm-store
```

---

### node_modules の問題

**症状:** パッケージが見つからない、依存関係エラー

**解決方法:**

```bash
# キャッシュをクリアして再インストール
rm -rf node_modules apps/web/node_modules
pnpm install
```

---

## 🗄️ データベース

### データベース接続エラー

**症状:** `ECONNREFUSED 127.0.0.1:5432` または `Connection refused`

**解決方法:**

```bash
# PostgreSQLコンテナが起動しているか確認
docker ps

# 起動していない場合
pnpm db:up

# ログを確認
pnpm db:logs
```

---

### スキーマ同期エラー

**症状:** テーブルが存在しない、カラムがない

**解決方法:**

```bash
# スキーマを強制的に再適用
DATABASE_URL="postgresql://inkmaid:inkmaid_password@localhost:5432/inkmaid" pnpm db:push
```

---

### データをリセットしたい

**解決方法:**

```bash
# データベースをリセット（データは全て削除されます）
pnpm db:reset

# スキーマを再適用
pnpm db:push
```

---

### Drizzle Studio が開かない

**症状:** `pnpm db:studio` でエラー

**解決方法:**

```bash
# DATABASE_URL を明示的に指定
DATABASE_URL="postgresql://inkmaid:inkmaid_password@localhost:5432/inkmaid" pnpm db:studio
```

---

## 🤖 AI 関連

### AI APIキーエラー

**症状:** `401 Unauthorized` または `Invalid API Key`

**解決方法:**

1. `apps/web/.env.local` を確認

```bash
# 正しいプロバイダーを設定
AI_PROVIDER=anthropic

# 対応するAPIキーを設定
ANTHROPIC_API_KEY=sk-ant-...
```

2. APIキーが有効か確認（各プロバイダーのダッシュボードで確認）

---

### AI の応答が遅い

**原因:** モデルの処理時間、ネットワーク遅延

**対処法:**
- より軽量なモデルに切り替える（例: `gpt-4o-mini`）
- ストロークデータを減らす（一度に多くのストロークを送らない）

---

### マルチモーダル認識がうまくいかない

**症状:** 手書き文字が正しく認識されない

**対処法:**
1. 文字をより大きく、はっきり書く
2. 補足説明（hint）を追加する
3. ストロークの色を濃くする

---

## 🎨 フロントエンド

### Canvas が表示されない

**症状:** 空白のエリアが表示される

**原因:** SSRでブラウザAPIにアクセスしようとしている

**解決方法:** Dynamic import を使用

```tsx
import dynamic from "next/dynamic";

const DiagramCanvas = dynamic(
  () => import("@/components/DiagramCanvas"),
  { ssr: false }
);
```

---

### Mermaid図が表示されない

**症状:** プレビューエリアが空白、またはエラー表示

**確認ポイント:**

1. Mermaidコードの構文が正しいか
2. コンソールにエラーが出ていないか

```bash
# ブラウザのコンソールで確認
# F12 → Console タブ
```

**解決方法:**
- Mermaidコードを [Mermaid Live Editor](https://mermaid.live/) で検証
- 自動修正機能を使用（`ai.fixMermaidError`）

---

### スタイルが適用されない

**症状:** Tailwind のクラスが効かない

**解決方法:**

```bash
# 開発サーバーを再起動
# Ctrl+C で停止後
pnpm dev
```

---

## 🔧 ビルド・デプロイ

### ビルドエラー

**症状:** `pnpm build` でエラー

**確認ポイント:**

```bash
# 型エラーの確認
pnpm typecheck

# Lintエラーの確認
pnpm lint
```

**よくある原因:**
- 未使用のインポート
- 型の不一致
- 環境変数の不足

---

### Docker ビルドエラー

**症状:** `pnpm prod:build` でエラー

**解決方法:**

```bash
# Docker キャッシュをクリア
docker system prune -a

# 再ビルド
pnpm prod:build
```

---

## 🧹 一般的なリセット手順

問題が解決しない場合の完全リセット手順：

```bash
# 1. すべてのコンテナを停止
docker compose down -v

# 2. node_modules を削除
rm -rf node_modules apps/web/node_modules

# 3. pnpm キャッシュをクリア
pnpm store prune

# 4. 依存関係を再インストール
pnpm install

# 5. 開発環境を起動
pnpm dev:all

# 6. スキーマを適用
pnpm db:push
```

---

## 📞 サポート

上記で解決しない場合：

1. [開発ログ](./logs/) を確認して類似の問題がないか確認
2. [設計ドキュメント](./develop.md) でアーキテクチャを確認
3. Issue を作成して報告

