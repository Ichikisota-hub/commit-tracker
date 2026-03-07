-- usersテーブルに残稼働日と1日目標訪問数を追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS remaining_work_days INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_visit_target INTEGER DEFAULT 0;

-- work_daysテーブルに1日目標訪問数を追加
ALTER TABLE work_days ADD COLUMN IF NOT EXISTS daily_visit_target INTEGER DEFAULT 0;
