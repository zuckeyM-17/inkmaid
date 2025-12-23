#!/bin/bash
# ===========================================
# Inkmaid - Git Worktree セットアップスクリプト
# ===========================================
# 各worktreeで一意なポートとプロジェクト名を自動設定します
#
# 使用方法:
#   ./scripts/setup-worktree.sh           # 自動ポート割り当て
#   ./scripts/setup-worktree.sh --default # デフォルトポート（5432, 3000）を使用
#
# または手動でポートを指定:
#   DB_PORT=5433 NEXT_PORT=3001 ./scripts/setup-worktree.sh

set -e

# --default オプションの処理
USE_DEFAULT_PORTS=false
if [ "$1" = "--default" ]; then
    USE_DEFAULT_PORTS=true
fi

# カラー出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# スクリプトのディレクトリからプロジェクトルートを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Inkmaid Worktree セットアップ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ディレクトリ名からプロジェクト識別子を生成
# 例: /path/to/inkmaid-feature-auth → inkmaid-feature-auth
DIR_NAME=$(basename "${PROJECT_ROOT}")

if [ "$USE_DEFAULT_PORTS" = true ]; then
    # --default オプション: デフォルトポートを使用
    DEFAULT_DB_PORT=5432
    DEFAULT_NEXT_PORT=3000
else
    # ディレクトリ名のハッシュからポートオフセットを計算（0-99の範囲）
    # 同じディレクトリ名なら常に同じオフセットになる
    HASH=$(echo -n "${DIR_NAME}" | md5 -q 2>/dev/null || echo -n "${DIR_NAME}" | md5sum | cut -d' ' -f1)
    PORT_OFFSET=$((16#${HASH:0:4} % 100))

    # デフォルトポートの計算
    DEFAULT_DB_PORT=$((5432 + PORT_OFFSET))
    DEFAULT_NEXT_PORT=$((3000 + PORT_OFFSET))
fi

# 環境変数で上書き可能
FINAL_DB_PORT=${DB_PORT:-$DEFAULT_DB_PORT}
FINAL_NEXT_PORT=${NEXT_PORT:-$DEFAULT_NEXT_PORT}

# プロジェクト名の生成（ディレクトリ名をそのまま使用、小文字に変換）
PROJECT_NAME=$(echo "${DIR_NAME}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')

echo -e "${YELLOW}検出情報:${NC}"
echo "  ディレクトリ: ${PROJECT_ROOT}"
echo "  プロジェクト名: ${PROJECT_NAME}"
echo ""
echo -e "${YELLOW}ポート設定:${NC}"
echo "  PostgreSQL: ${FINAL_DB_PORT}"
echo "  Next.js: ${FINAL_NEXT_PORT}"
echo ""

# ポートが使用中かチェック
check_port() {
    local port=$1
    local name=$2
    if lsof -i ":${port}" >/dev/null 2>&1; then
        echo -e "${RED}警告: ポート ${port} (${name}) は既に使用中です${NC}"
        return 1
    fi
    return 0
}

# ポートチェック（警告のみ、処理は続行）
check_port ${FINAL_DB_PORT} "PostgreSQL" || true
check_port ${FINAL_NEXT_PORT} "Next.js" || true
echo ""

# ルートの .env ファイルを作成
ENV_FILE="${PROJECT_ROOT}/.env"
echo -e "${GREEN}作成: ${ENV_FILE}${NC}"
cat > "${ENV_FILE}" << EOF
# ===========================================
# Inkmaid 環境設定（自動生成）
# ===========================================
# 生成日時: $(date '+%Y-%m-%d %H:%M:%S')
# ディレクトリ: ${DIR_NAME}

# Docker Compose 設定
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
DB_PORT=${FINAL_DB_PORT}
NEXT_PORT=${FINAL_NEXT_PORT}

# PostgreSQL 設定
POSTGRES_USER=inkmaid
POSTGRES_PASSWORD=inkmaid_password
POSTGRES_DB=inkmaid
EOF

# apps/web/.env.local を作成（既存のAPIキーを保持）
WEB_ENV_FILE="${PROJECT_ROOT}/apps/web/.env.local"

# 既存のAPIキーを抽出（存在する場合）
EXISTING_ANTHROPIC_KEY=""
EXISTING_OPENAI_KEY=""
EXISTING_GOOGLE_KEY=""
EXISTING_AI_PROVIDER=""

if [ -f "${WEB_ENV_FILE}" ]; then
    echo -e "${YELLOW}既存の .env.local を検出、APIキーを保持します${NC}"
    EXISTING_ANTHROPIC_KEY=$(grep "^ANTHROPIC_API_KEY=" "${WEB_ENV_FILE}" 2>/dev/null | cut -d'=' -f2- || true)
    EXISTING_OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "${WEB_ENV_FILE}" 2>/dev/null | cut -d'=' -f2- || true)
    EXISTING_GOOGLE_KEY=$(grep "^GOOGLE_GENERATIVE_AI_API_KEY=" "${WEB_ENV_FILE}" 2>/dev/null | cut -d'=' -f2- || true)
    EXISTING_AI_PROVIDER=$(grep "^AI_PROVIDER=" "${WEB_ENV_FILE}" 2>/dev/null | cut -d'=' -f2- || true)
fi

echo -e "${GREEN}作成: ${WEB_ENV_FILE}${NC}"
cat > "${WEB_ENV_FILE}" << EOF
# ===========================================
# Inkmaid Web アプリ設定（自動生成）
# ===========================================
# 生成日時: $(date '+%Y-%m-%d %H:%M:%S')

# データベース接続
DATABASE_URL=postgresql://inkmaid:inkmaid_password@localhost:${FINAL_DB_PORT}/inkmaid

# AI プロバイダー設定（anthropic / openai / google）
AI_PROVIDER=${EXISTING_AI_PROVIDER:-anthropic}

# AI API Keys
ANTHROPIC_API_KEY=${EXISTING_ANTHROPIC_KEY}
OPENAI_API_KEY=${EXISTING_OPENAI_KEY}
GOOGLE_GENERATIVE_AI_API_KEY=${EXISTING_GOOGLE_KEY}
EOF

# APIキーが設定されていない場合の警告
if [ -z "${EXISTING_ANTHROPIC_KEY}" ] && [ -z "${EXISTING_OPENAI_KEY}" ] && [ -z "${EXISTING_GOOGLE_KEY}" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  注意: AI APIキーが設定されていません${NC}"
    echo "    手書き認識を使用するには、以下のいずれかを設定してください:"
    echo "    - ANTHROPIC_API_KEY（推奨）"
    echo "    - OPENAI_API_KEY"
    echo "    - GOOGLE_GENERATIVE_AI_API_KEY"
    echo ""
    echo "    設定方法: ${WEB_ENV_FILE} を直接編集"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  セットアップ完了！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "次のステップ:"
echo "  1. pnpm install"
echo "  2. pnpm db:up"
echo "  3. pnpm db:push"
echo "  4. pnpm dev"
echo ""
echo "開発サーバーURL:"
echo -e "  ${BLUE}http://localhost:${FINAL_NEXT_PORT}${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Langfuse（LLMオブザーバビリティ）について${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Langfuseは全worktreeで共有するサービスです。"
echo "必要な場合のみ起動してください（リソース消費が大きい）"
echo ""
echo "Langfuseの起動（初回のみ、またはメインブランチで）:"
echo "  1. .env に LANGFUSE_ENCRYPTION_KEY を設定"
echo "     openssl rand -hex 32"
echo "  2. pnpm langfuse:up"
echo ""
echo "Langfuse URL:"
echo -e "  ${BLUE}http://localhost:3001${NC}"
echo ""

