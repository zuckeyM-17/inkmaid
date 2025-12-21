---
description: プロジェクトのアーキテクチャを説明します
---

Inkmaidプロジェクトのアーキテクチャについて、以下の観点から説明してください：

## 1. システム全体構成

- フロントエンド、バックエンド、データベースの関係
- 各コンポーネントの責務
- データフロー

## 2. ディレクトリ構造

```
apps/web/src/
├── app/              # Next.js App Router
├── components/       # UIコンポーネント
├── lib/              # クライアントサイドロジック
└── server/           # サーバーサイドロジック
    ├── db/           # データベーススキーマ
    └── trpc/         # APIルーター
```

各ディレクトリの役割と、ファイルをどこに配置すべきかを説明してください。

## 3. 技術的な決定事項

- なぜNext.js App Routerを選択したか
- tRPCの利点と使い方
- Drizzle ORMの特徴
- Vercel AI SDKの活用方法

## 4. データフロー

### クライアント → サーバー
```
User Input → Component → tRPC Client → tRPC Router → Database
```

### AIとの連携
```
User Input → AI Router → Vercel AI SDK → LLM → Tool Calling → Database
```

## 5. 主要な設計パターン

- Server Components vs Client Components
- 状態管理の方針
- エラーハンドリング
- バージョン管理

## 6. 拡張性

新しい機能を追加する際の基本的なパターンを説明してください：
- 新しいページの追加
- 新しいAPIエンドポイントの追加
- 新しいDBテーブルの追加

現在の質問や追加したい機能に応じて、関連するアーキテクチャの詳細を説明してください。
