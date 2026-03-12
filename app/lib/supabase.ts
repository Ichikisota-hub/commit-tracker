import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type User = {
  id: string;
  name: string;
  line_user_id?: string;
  monthly_target: number;
  remaining_work_days: number;
  daily_visit_target: number;
  created_at: string;
};

export type WorkDay = {
  id: string;
  user_id: string;
  date: string;
  planned_count: number;
  actual_count: number;
  daily_visit_target: number;
  is_committed: boolean;
  makeup_date?: string;
  makeup_day_of_week?: string;
  // KPI項目
  contract_target: number;
  visit_count: number;
  negotiation_count: number;
  indoor_count: number;
  contract_count: number;
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
