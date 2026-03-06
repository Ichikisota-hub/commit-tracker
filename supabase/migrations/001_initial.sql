-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  line_user_id TEXT UNIQUE,
  monthly_target INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 稼働日テーブル
CREATE TABLE work_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  planned_count INTEGER NOT NULL DEFAULT 0,
  actual_count INTEGER NOT NULL DEFAULT 0,
  is_committed BOOLEAN DEFAULT FALSE,
  makeup_date DATE,
  makeup_day_of_week TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 月次サマリービュー
CREATE VIEW monthly_summary AS
SELECT
  u.id AS user_id,
  u.name,
  DATE_TRUNC('month', w.date) AS month,
  u.monthly_target,
  SUM(w.actual_count) AS total_actual,
  COUNT(DISTINCT w.date) AS worked_days,
  ROUND(AVG(w.actual_count), 1) AS daily_avg,
  u.monthly_target - SUM(w.actual_count) AS remaining_count
FROM users u
LEFT JOIN work_days w ON u.id = w.user_id
GROUP BY u.id, u.name, DATE_TRUNC('month', w.date), u.monthly_target;

-- RLS有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_days ENABLE ROW LEVEL SECURITY;

-- ポリシー（全員読み書き可 - 社内ツールのため）
CREATE POLICY "allow_all" ON users FOR ALL USING (true);
CREATE POLICY "allow_all" ON work_days FOR ALL USING (true);
