# ライブラリアップデート戦略

## 概要

本ドキュメントでは、Inkmaidプロジェクトにおけるライブラリのアップデート方針と手順を定義します。
適切なアップデート戦略により、セキュリティリスクの軽減、新機能の活用、技術的負債の蓄積防止を実現します。

---

## 1. 依存関係の分類

### 1.1 ティア別分類

依存関係を重要度とリスクに基づいて3つのティアに分類します。

| ティア | カテゴリ | パッケージ | 特徴 |
|--------|----------|-----------|------|
| **Tier 1** | コアフレームワーク | Next.js, React, TypeScript | 破壊的変更の影響大。慎重にアップデート |
| **Tier 2** | 主要機能 | tRPC, Drizzle, AI SDK, Tailwind CSS | 機能に直結。中程度の注意が必要 |
| **Tier 3** | ユーティリティ | Biome, Vitest, 型定義 | 比較的安全にアップデート可能 |

### 1.2 現在の依存関係一覧

#### Tier 1: コアフレームワーク

| パッケージ | 現在バージョン | 備考 |
|-----------|---------------|------|
| `next` | ^15.1.2 | App Router使用 |
| `react` | ^19.0.0 | React 19 (最新メジャー) |
| `react-dom` | ^19.0.0 | React 19 |
| `typescript` | ^5.9.3 | 厳格モード使用 |

#### Tier 2: 主要機能

| パッケージ | 現在バージョン | 備考 |
|-----------|---------------|------|
| `@trpc/client` | ^11.0.0-rc.682 | ⚠️ RCバージョン |
| `@trpc/react-query` | ^11.0.0-rc.682 | ⚠️ RCバージョン |
| `@trpc/server` | ^11.0.0-rc.682 | ⚠️ RCバージョン |
| `@tanstack/react-query` | ^5.62.16 | tRPCと連携 |
| `drizzle-orm` | ^0.38.3 | PostgreSQL ORM |
| `drizzle-kit` | ^0.30.1 | マイグレーションツール |
| `ai` | ^5.0.116 | Vercel AI SDK |
| `@ai-sdk/anthropic` | ^2.0.56 | Claude連携 |
| `@ai-sdk/google` | ^2.0.51 | Gemini連携 |
| `@ai-sdk/openai` | ^2.0.88 | OpenAI連携 |
| `tailwindcss` | ^4.0.0 | CSS Framework |
| `konva` | ^10.0.12 | Canvas描画 |
| `react-konva` | ^19.2.1 | React連携 |
| `mermaid` | ^11.12.2 | 図のレンダリング |
| `zod` | ^3.24.1 | バリデーション |

#### Tier 3: 開発ツール

| パッケージ | 現在バージョン | 備考 |
|-----------|---------------|------|
| `@biomejs/biome` | ^1.9.4 | Linter/Formatter |
| `vitest` | ^2.1.8 | テストフレームワーク |
| `@types/*` | 各種 | 型定義 |

---

## 2. アップデートスケジュール

### 2.1 定期アップデート

| 頻度 | 対象 | 内容 |
|------|------|------|
| **毎週** | セキュリティパッチ | `pnpm audit` で脆弱性チェック |
| **隔週** | Tier 3 | パッチ・マイナーアップデート |
| **月次** | Tier 2 | マイナーアップデート（リリースノート確認後） |
| **四半期** | Tier 1 | メジャーアップデートの検討 |

### 2.2 アップデート優先度

```
緊急セキュリティ修正 > セキュリティパッチ > バグ修正 > 新機能 > パフォーマンス改善
```

---

## 3. アップデート手順

### 3.1 事前準備

```bash
# 1. 現在の依存関係の状態を確認
pnpm outdated

# 2. セキュリティ監査
pnpm audit

# 3. 作業ブランチの作成
git checkout -b chore/update-dependencies-YYYYMMDD
```

### 3.2 ティア別アップデート手順

#### Tier 3（開発ツール）のアップデート

```bash
# パッチ・マイナーアップデート（比較的安全）
pnpm update @biomejs/biome vitest @types/node @types/react @types/react-dom

# 動作確認
pnpm lint
pnpm test
```

#### Tier 2（主要機能）のアップデート

```bash
# 1. リリースノートを確認してから実行
# 2. 一つずつ更新することを推奨

# 例: Drizzle ORM のアップデート
pnpm update drizzle-orm drizzle-kit

# 動作確認
pnpm db:push  # スキーマの互換性確認
pnpm dev      # 開発サーバー起動
```

#### Tier 1（コアフレームワーク）のアップデート

```bash
# 1. CHANGELOGを熟読
# 2. マイグレーションガイドの確認
# 3. テスト環境での事前検証

# 例: Next.js のアップデート
pnpm update next

# 全機能の手動検証
pnpm build
pnpm start
```

### 3.3 検証チェックリスト

- [ ] `pnpm install` が成功する
- [ ] `pnpm lint` でエラーがない
- [ ] `pnpm build` が成功する
- [ ] `pnpm test` が全てパスする
- [ ] 開発サーバーが正常に起動する
- [ ] 主要機能の動作確認（手動テスト）
  - [ ] ダイアグラムの作成・編集
  - [ ] AIチャット機能
  - [ ] 手書き入力
  - [ ] Mermaidプレビュー

---

## 4. 特別な注意が必要なパッケージ

### 4.1 tRPC（RCバージョン）

**現状:** `^11.0.0-rc.682` を使用中（安定版未リリース）

**リスク:**
- RCバージョン間での破壊的変更の可能性
- ドキュメントと実装の乖離

**対策:**
- tRPC v11 の正式リリースを監視
- 正式リリース後は優先的にアップデート
- 破壊的変更があった場合はマイグレーションガイドに従う
- 関連パッケージ（client, server, react-query）は同時にアップデート

```bash
# tRPC関連は必ず同時更新
pnpm update @trpc/client @trpc/server @trpc/react-query
```

### 4.2 React 19 / Next.js 15

**注意点:**
- React 19 は比較的新しいメジャーバージョン
- Next.js 15 は App Router の改善が継続中
- Server Components / Client Components の境界に注意

**対策:**
- Next.js の Canary チャンネルは使用しない
- React の Experimental 機能の使用を避ける
- アップデート時は両方のリリースノートを確認

### 4.3 Tailwind CSS v4

**注意点:**
- v4 はメジャーアップデートで設定方法が変更
- PostCSS 設定との互換性

**対策:**
- v4 の新しい設定形式を理解する
- 既存のユーティリティクラスの動作確認

### 4.4 Vercel AI SDK

**注意点:**
- 急速に進化中のライブラリ
- プロバイダー別パッケージ（anthropic, openai, google）のバージョン整合性

**対策:**
- AI SDK関連パッケージは同時にアップデート
- Tool Calling のAPI変更に注意
- ストリーミングレスポンスの動作確認

```bash
# AI SDK関連は同時更新
pnpm update ai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai
```

---

## 5. 自動化とツール

### 5.1 使用ツール

| ツール | 用途 | 導入状況 |
|--------|------|---------|
| `pnpm outdated` | 古いパッケージの検出 | ✅ 使用可能 |
| `pnpm audit` | セキュリティ脆弱性チェック | ✅ 使用可能 |
| Renovate | 自動PR作成 | ✅ 導入済み |

### 5.2 Renovate の設定

プロジェクトルートに `renovate.json` を配置済みです。

**設定のポイント:**

| 設定項目 | 内容 |
|----------|------|
| スケジュール | 毎週末にPRを作成 |
| タイムゾーン | Asia/Tokyo |
| PR制限 | 1時間に3件、同時に5件まで |
| lockファイル | 毎週月曜朝にメンテナンス |

**パッケージグループ:**

| グループ名 | 対象パッケージ | 備考 |
|-----------|---------------|------|
| tRPC | `@trpc/*` | 同時更新、3日待機 |
| AI SDK | `ai`, `@ai-sdk/*` | 同時更新 |
| Drizzle | `drizzle-*` | 同時更新 |
| React | `react`, `react-dom`, 型定義 | 同時更新 |
| Konva | `konva`, `react-konva` | 同時更新 |
| Type definitions | `@types/*` (React除く) | 自動マージ |
| devDependencies | 開発依存 (minor/patch) | まとめて更新 |

**自動マージ:**
- 型定義パッケージ（`@types/*`、React関連を除く）
- Biome のパッチアップデート

> 📁 設定ファイル: `/renovate.json`

### 5.3 GitHub Actions ワークフロー

プロジェクトには以下のワークフローが設定されています：

| ワークフロー | ファイル | トリガー | 内容 |
|-------------|---------|---------|------|
| **Renovate** | `renovate.yml` | 毎日 9:00 JST、手動 | 依存関係の自動更新PR作成 |
| **CI** | `ci.yml` | PR、mainへのpush | Lint、型チェック、ビルド |
| **Dependency Review** | `dependency-review.yml` | PR（依存関係変更時） | 脆弱性チェック |

#### Renovate ワークフローのセットアップ

**必要なシークレット:**

1. GitHub リポジトリの Settings > Secrets and variables > Actions
2. `RENOVATE_TOKEN` を追加
   - Personal Access Token (Classic) を作成
   - 必要な権限: `repo`, `workflow`
   - Private リポジトリの場合は `read:org` も追加

**PAT の作成手順:**

1. GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. "Generate new token (classic)" をクリック
3. Note: `Renovate Bot`
4. Expiration: 適切な期間（90日など）
5. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
6. "Generate token" をクリックしてコピー
7. リポジトリの Secrets に `RENOVATE_TOKEN` として保存

**手動実行:**

Actions タブから "Renovate" ワークフローを選択し、"Run workflow" で手動実行可能。
デバッグ時は `dry_run: true` や `log_level: debug` を設定できます。

#### CI ワークフロー

PRとmainブランチへのプッシュ時に自動実行：

```
lint (Biome) ─┬─ build
              │
typecheck ────┘
```

#### Dependency Review ワークフロー

依存関係ファイル（`package.json`, `pnpm-lock.yaml`）が変更されたPRで実行：

- 脆弱性の重大度が `high` 以上の依存関係はブロック
- 許可されたライセンスのみ通過（MIT, Apache-2.0, BSD等）

### 5.4 アップデート確認スクリプト

`package.json` に以下のスクリプトを追加することを推奨:

```json
{
  "scripts": {
    "deps:check": "pnpm outdated",
    "deps:audit": "pnpm audit",
    "deps:update-safe": "pnpm update --latest @types/* @biomejs/biome vitest"
  }
}
```

---

## 6. トラブルシューティング

### 6.1 よくある問題と解決策

#### peerDependency の競合

```bash
# 問題の特定
pnpm install --reporter=default

# 解決策: overrides で強制指定（最終手段）
# package.json に追加
{
  "pnpm": {
    "overrides": {
      "パッケージ名": "バージョン"
    }
  }
}
```

#### 型エラーの発生

```bash
# TypeScript のキャッシュクリア
rm -rf node_modules/.cache
rm -rf .next

# 再インストール
pnpm install
```

#### ビルド失敗時

```bash
# 1. キャッシュのクリア
rm -rf node_modules
rm -rf apps/web/node_modules
rm -rf apps/web/.next

# 2. lockfile から再インストール
pnpm install --frozen-lockfile
```

### 6.2 ロールバック手順

```bash
# 1. 変更を破棄
git checkout pnpm-lock.yaml
git checkout package.json
git checkout apps/web/package.json

# 2. 再インストール
pnpm install
```

---

## 7. 記録と報告

### 7.1 アップデートログ

大規模なアップデートを行った場合は、`doc/logs/YYYY/MM/` に記録を残す:

```markdown
# YYYYMMDD - ライブラリアップデート

## 更新内容

- next: 15.1.2 → 15.2.0
- drizzle-orm: 0.38.3 → 0.39.0

## 破壊的変更の対応

- xxx の API が変更されたため、yyy を修正

## 動作確認

- [x] ビルド成功
- [x] 全テストパス
- [x] 主要機能の手動確認
```

### 7.2 メトリクス（オプション）

定期的に以下を記録することで、技術的負債を可視化できます:

- 古いパッケージの数
- セキュリティ脆弱性の数
- 最終アップデート日

---

## 8. 緊急時対応

### 8.1 セキュリティ脆弱性が発見された場合

1. `pnpm audit` で影響範囲を確認
2. 影響を受けるパッケージを即座にアップデート
3. 修正パッチがない場合は代替パッケージを検討
4. 必要に応じて関連するコードの修正

### 8.2 連絡先

緊急のセキュリティ問題が発見された場合:
- プロジェクトの Issue にラベル `security` を付けて報告
- Slack/Discord などのチームチャンネルで通知


