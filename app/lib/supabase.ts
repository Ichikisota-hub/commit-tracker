import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type User = {
  id: string;
  name: string;
  line_user_id?: string;
  monthly_target: number;
  created_at: string;
};

export type WorkDay = {
  id: string;
  user_id: string;
  date: string;
  planned_count: number;
  actual_count: number;
  is_committed: boolean;
  makeup_date?: string;
  makeup_day_of_week?: string;
  created_at: string;
};

export type MonthlySummary = {
  user_id: string;
  name: string;
  month: string;
  monthly_target: number;
  total_actual: number;
  worked_days: number;
  daily_avg: number;
  remaining_count: number;
};
