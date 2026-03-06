# 📊 COMMIT TRACKER

日次コミット管理・LINE共有・個人進捗トラッカー

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| 🌅 稼働前コミット | 各メンバーが今日やる件数を入力 → 全体LINE文面を自動生成 |
| 🌆 稼働終わり報告 | 実績入力 → 達成者・未達者リストと補填予定日を含むLINE文面を生成 |
| 📊 個人現状確認 | 現在実績・残り件数・1日平均・必要ペースを自動計算してLINE文面生成 |
| 👥 メンバー管理 | メンバーの追加・削除・月間目標設定 |

---

## セットアップ手順

### 1. Supabaseのセットアップ

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **SQL Editor** を開いて `supabase/migrations/001_initial.sql` の内容を実行
3. **Settings → API** から以下をコピー：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. ローカル開発

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.local.example .env.local
# .env.local を編集してSupabaseの情報を入力

# 開発サーバー起動
npm run dev
```

### 3. Vercelへのデプロイ

```bash
# Vercel CLIでデプロイ
npx vercel

# または GitHubと連携してVercelダッシュボードから自動デプロイ
```

**Vercelの環境変数設定：**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 使い方フロー

### 毎朝（稼働前）
1. **稼働前コミット** タブを開く
2. 各メンバーが今日やる件数を入力
3. 「保存する」をクリック
4. 自動生成されたLINEメッセージをコピーして全体LINEに送る

### 毎夜（稼働終わり）
1. **稼働終わり報告** タブを開く
2. 各メンバーの実績件数を入力
3. 未達の場合は補填予定曜日を選択
4. 「保存する」をクリック
5. 達成者・未達者リストのLINEメッセージをコピーして全体LINEに送る

### 個人確認
1. **個人現状確認** タブを開く
2. メンバーを選択
3. 現状サマリーとLINEメッセージを確認・コピー

---

## 技術スタック

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + カスタムCSS
- **DB**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **フォント**: Zen Kaku Gothic New, Bebas Neue, JetBrains Mono
