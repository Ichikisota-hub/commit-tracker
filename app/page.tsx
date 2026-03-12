'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { supabase, User, WorkDay } from './lib/supabase';
import { generateMorningMessage, generateEveningMessage, generatePersonalStatusMessage, KpiEntry } from './lib/line-messages';

type Tab = 'morning' | 'evening' | 'status' | 'members';

type KpiState = {
  planned: number;
  visitTarget: number;
  contractTarget: number;
  visit: number;
  negotiation: number;
  indoor: number;
  contract: number;
};

const defaultKpi = (): KpiState => ({ planned: 0, visitTarget: 0, contractTarget: 0, visit: 0, negotiation: 0, indoor: 0, contract: 0 });

function LineBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return <div className="line-empty">稼働メンバーがいないためメッセージはありません</div>;
  return (
    <div className="line-box">
      <div className="line-header">
        <span className="line-header-label">📱 {title}</span>
        <button className="line-copy-btn" onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true); setTimeout(() => setCopied(false), 2000);
        }}>{copied ? '✓ コピー済' : 'LINEにコピー'}</button>
      </div>
      <div className="line-body">{text}</div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || 'var(--ink)' }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// KPI入力フィールド1つ
function KpiField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid var(--border)', background: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          −
        </button>
        <input
          type="number" inputMode="numeric" min={0}
          value={value || ''}
          placeholder="0"
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          style={{ width: 56, textAlign: 'center', border: '2px solid var(--border)', borderRadius: 10, padding: '6px 4px', fontSize: 18, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: '#fafaf7', outline: 'none' }}
        />
        <button
          onClick={() => onChange(value + 1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid var(--border)', background: 'var(--ink)', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          ＋
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)', width: 16 }}>件</span>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('morning');
  const [users, setUsers] = useState<User[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // KPI state per user
  const [kpi, setKpi] = useState<Record<string, KpiState>>({});
  // Evening actual + makeup
  const [actual, setActual] = useState<Record<string, number>>({});
  const [makeupInfo, setMakeupInfo] = useState<Record<string, string>>({});
  // Status
  const [statusUserId, setStatusUserId] = useState('');
  // Members
  const [editingDays, setEditingDays] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newVisitTarget, setNewVisitTarget] = useState('');
  const [newRemainingDays, setNewRemainingDays] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  // Expanded member cards
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: w }] = await Promise.all([
      supabase.from('users').select('*').order('name'),
      supabase.from('work_days').select('*').gte('date', format(startOfMonth(today), 'yyyy-MM-dd')),
    ]);
    if (u) setUsers(u);
    if (w) setWorkDays(w);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!users.length) return;
    const initKpi: Record<string, KpiState> = {};
    const initActual: Record<string, number> = {};
    const initDays: Record<string, number> = {};
    users.forEach(u => {
      const wd = workDays.find(w => w.user_id === u.id && w.date === todayStr);
      initKpi[u.id] = {
        planned: wd?.planned_count ?? 0,
        visitTarget: wd?.daily_visit_target ?? u.daily_visit_target ?? 0,
        contractTarget: wd?.contract_target ?? 0,
        visit: wd?.visit_count ?? 0,
        negotiation: wd?.negotiation_count ?? 0,
        indoor: wd?.indoor_count ?? 0,
        contract: wd?.contract_count ?? 0,
      };
      initActual[u.id] = wd?.actual_count ?? 0;
      initDays[u.id] = u.remaining_work_days ?? 0;
    });
    setKpi(initKpi);
    setActual(initActual);
    setEditingDays(initDays);
    if (!statusUserId && users[0]) setStatusUserId(users[0].id);
  }, [users, workDays]);

  const setUserKpi = (userId: string, field: keyof KpiState, val: number) => {
    setKpi(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: val } }));
  };

  const calcAutoRemaining = (userId: string) =>
    eachDayOfInterval({ start: today, end: endOfMonth(today) })
      .filter(d => workDays.some(w => w.user_id === userId && w.date === format(d, 'yyyy-MM-dd') && w.planned_count > 0)).length;

  const saveMorning = async () => {
    await supabase.from('work_days').upsert(
      users.map(u => {
        const k = kpi[u.id] || defaultKpi();
        return {
          user_id: u.id, date: todayStr,
          planned_count: k.planned,
          daily_visit_target: k.visitTarget,
          contract_target: k.contractTarget,
          visit_count: k.visit,
          negotiation_count: k.negotiation,
          indoor_count: k.indoor,
          contract_count: k.contract,
        };
      }),
      { onConflict: 'user_id,date', ignoreDuplicates: false }
    );
    showToast('稼働前コミットを保存しました'); loadData();
  };

  const saveEvening = async () => {
    await supabase.from('work_days').upsert(
      users.map(u => {
        const k = kpi[u.id] || defaultKpi();
        return {
          user_id: u.id, date: todayStr,
          planned_count: k.planned, actual_count: actual[u.id] || 0,
          daily_visit_target: k.visitTarget,
          is_committed: (actual[u.id] || 0) >= k.planned,
          makeup_day_of_week: makeupInfo[u.id] || null,
        };
      }),
      { onConflict: 'user_id,date', ignoreDuplicates: false }
    );
    showToast('実績を保存しました'); loadData();
  };

  const saveRemainingDays = async (userId: string) => {
    await supabase.from('users').update({ remaining_work_days: editingDays[userId] || 0 }).eq('id', userId);
    showToast('残稼働日を更新しました'); loadData();
  };

  const addUser = async () => {
    if (!newName.trim() || !newTarget) return;
    setAddingUser(true);
    await supabase.from('users').insert({ name: newName.trim(), monthly_target: parseInt(newTarget), daily_visit_target: parseInt(newVisitTarget) || 0, remaining_work_days: parseInt(newRemainingDays) || 0 });
    setNewName(''); setNewTarget(''); setNewVisitTarget(''); setNewRemainingDays('');
    setAddingUser(false); loadData(); showToast(`${newName}さんを追加しました`);
  };

  const getUserStats = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return null;
    const wds = workDays.filter(w => w.user_id === userId);
    const totalActual = wds.reduce((s, w) => s + (w.actual_count || 0), 0);
    const workedDays = wds.filter(w => w.actual_count > 0).length;
    const dailyAvg = workedDays > 0 ? Math.round((totalActual / workedDays) * 10) / 10 : 0;
    const autoRemaining = calcAutoRemaining(userId);
    const remaining = user.remaining_work_days > 0 ? user.remaining_work_days : autoRemaining;
    const remainingCount = Math.max(0, user.monthly_target - totalActual);
    const pct = user.monthly_target > 0 ? Math.round((totalActual / user.monthly_target) * 100) : 0;
    const dailyNeeded = remaining > 0 ? Math.ceil(remainingCount / remaining) : remainingCount;
    return { user, totalActual, workedDays, dailyAvg, remaining, remainingCount, pct, dailyNeeded, autoRemaining };
  };

  const activeUsers = users.filter(u => (kpi[u.id]?.planned || 0) > 0);
  const achievers = activeUsers.filter(u => (actual[u.id] || 0) >= (kpi[u.id]?.planned || 1));
  const nonAchievers = activeUsers.filter(u => (actual[u.id] || 0) < (kpi[u.id]?.planned || 1));
  const inactiveUsers = users.filter(u => (kpi[u.id]?.planned || 0) === 0);

  const morningEntries: KpiEntry[] = users.map(u => ({
    name: u.name,
    planned: kpi[u.id]?.planned || 0,
    visitTarget: kpi[u.id]?.visitTarget || 0,
    contractTarget: kpi[u.id]?.contractTarget || 0,
    visit: kpi[u.id]?.visit || 0,
    negotiation: kpi[u.id]?.negotiation || 0,
    indoor: kpi[u.id]?.indoor || 0,
    contract: kpi[u.id]?.contract || 0,
  }));

  const morningMsg = generateMorningMessage(today, morningEntries);
  const eveningMsg = generateEveningMessage(today,
    achievers.map(u => ({ name: u.name, actual: actual[u.id] || 0, planned: kpi[u.id]?.planned || 0 })),
    nonAchievers.map(u => ({ name: u.name, actual: actual[u.id] || 0, planned: kpi[u.id]?.planned || 0, makeupInfo: makeupInfo[u.id] }))
  );
  const statusStats = getUserStats(statusUserId);
  const statusMsg = statusStats ? generatePersonalStatusMessage(statusStats.user.name, statusStats.user.monthly_target, statusStats.totalActual, statusStats.remaining, statusStats.dailyAvg) : '';

  const navTabs = [
    { key: 'morning' as Tab, icon: '🌅', label: '稼働前' },
    { key: 'evening' as Tab, icon: '🌆', label: '稼働後' },
    { key: 'status' as Tab, icon: '📊', label: '現状確認' },
    { key: 'members' as Tab, icon: '👥', label: 'メンバー' },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 36 }}>⚡</div>
      <div style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 14 }}>読み込み中...</div>
    </div>
  );

  return (
    <>
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="page-title">COMMIT TRACKER</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>日次コミット管理・LINE共有ツール</div>
          </div>
          <div className="page-date">{format(today, 'M/d(E)', { locale: ja })}</div>
        </div>

        {/* ===== MORNING ===== */}
        {tab === 'morning' && (
          <div>
            <div className="save-banner">
              <div>
                <div className="save-banner-text">📝 稼働前コミット入力</div>
                <div className="save-banner-sub">入力後は必ず保存ボタンを押してください！</div>
              </div>
              <button className="save-btn" onClick={saveMorning}>保存する</button>
            </div>

            <div className="summary-bar">
              <span>稼働中 <strong>{activeUsers.length}名</strong></span>
              <span>本日合計 <strong>{users.reduce((s, u) => s + (kpi[u.id]?.planned || 0), 0)}件</strong></span>
            </div>

            <div className="card">
              {users.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>メンバーを追加してください</div>
                : users.map(u => {
                  const k = kpi[u.id] || defaultKpi();
                  const isActive = k.planned > 0;
                  const isExpanded = expandedUser === u.id;
                  return (
                    <div key={u.id} className={`member-row${isActive ? '' : ' inactive'}`}>
                      {/* 上部：名前・バッジ・コミット件数 */}
                      <div className="member-name-row">
                        <div>
                          <div className="member-name">{u.name}</div>
                          <div className="member-target-hint">月間目標 {u.monthly_target}件</div>
                        </div>
                        <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
                          {isActive ? '✅ 稼働' : '💤 非稼働'}
                        </span>
                      </div>

                      {/* コミット件数（大きく） */}
                      <div style={{ marginBottom: 12 }}>
                        <div className="input-label" style={{ marginBottom: 4 }}>本日コミット件数</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => setUserKpi(u.id, 'planned', Math.max(0, k.planned - 1))}
                            style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid var(--border)', background: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer', color: 'var(--muted)' }}>−</button>
                          <input type="number" inputMode="numeric" min={0}
                            value={k.planned || ''} placeholder="0"
                            onChange={e => setUserKpi(u.id, 'planned', parseInt(e.target.value) || 0)}
                            style={{ flex: 1, textAlign: 'center', border: '2px solid var(--border)', borderRadius: 10, padding: '8px', fontSize: 24, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: '#fafaf7', outline: 'none' }} />
                          <button onClick={() => setUserKpi(u.id, 'planned', k.planned + 1)}
                            style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid var(--ink)', background: 'var(--ink)', fontSize: 20, fontWeight: 700, cursor: 'pointer', color: 'white' }}>＋</button>
                          <span style={{ fontSize: 14, color: 'var(--muted)' }}>件</span>
                        </div>
                      </div>

                      {/* KPI展開ボタン */}
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                        style={{ width: '100%', background: isExpanded ? '#f0f0ec' : 'white', border: '1.5px solid var(--border)', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'Zen Kaku Gothic New, sans-serif' }}>
                        <span>📋 今日やるべき数値を入力</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{isExpanded ? '▲ 閉じる' : '▼ 開く'}</span>
                      </button>

                      {/* KPI詳細入力（展開時） */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, background: '#fafaf7', borderRadius: 12, padding: '4px 14px' }}>
                          {/* 契約目標（大きく強調） */}
                          <div style={{ padding: '12px 0 8px', borderBottom: '2px solid var(--border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>本日契約目標</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button onClick={() => setUserKpi(u.id, 'contractTarget', Math.max(0, k.contractTarget - 1))}
                                style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid var(--border)', background: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: 'var(--muted)' }}>−</button>
                              <input type="number" inputMode="numeric" min={0}
                                value={k.contractTarget || ''} placeholder="0"
                                onChange={e => setUserKpi(u.id, 'contractTarget', parseInt(e.target.value) || 0)}
                                style={{ flex: 1, textAlign: 'center', border: '2px solid #ffc300', borderRadius: 10, padding: '8px', fontSize: 22, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: '#fffbea', outline: 'none' }} />
                              <button onClick={() => setUserKpi(u.id, 'contractTarget', k.contractTarget + 1)}
                                style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid #ffc300', background: '#ffc300', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>＋</button>
                              <span style={{ fontSize: 13, color: 'var(--muted)' }}>件</span>
                            </div>
                          </div>

                          {/* 4項目 */}
                          <div style={{ paddingTop: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 0 4px' }}>▼ 今日やるべき数値</div>
                            <KpiField label="訪問" value={k.visit} onChange={v => setUserKpi(u.id, 'visit', v)} />
                            <KpiField label="商談" value={k.negotiation} onChange={v => setUserKpi(u.id, 'negotiation', v)} />
                            <KpiField label="宅内イン" value={k.indoor} onChange={v => setUserKpi(u.id, 'indoor', v)} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>契約</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button onClick={() => setUserKpi(u.id, 'contract', Math.max(0, k.contract - 1))}
                                  style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid var(--border)', background: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: 'var(--muted)' }}>−</button>
                                <input type="number" inputMode="numeric" min={0}
                                  value={k.contract || ''} placeholder="0"
                                  onChange={e => setUserKpi(u.id, 'contract', parseInt(e.target.value) || 0)}
                                  style={{ width: 56, textAlign: 'center', border: '2px solid var(--danger)', borderRadius: 10, padding: '6px 4px', fontSize: 18, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: '#fff5f3', outline: 'none' }} />
                                <button onClick={() => setUserKpi(u.id, 'contract', k.contract + 1)}
                                  style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid var(--danger)', background: 'var(--danger)', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: 'white' }}>＋</button>
                                <span style={{ fontSize: 13, color: 'var(--muted)', width: 16 }}>件</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, paddingLeft: 4 }}>
              ※ コミット0件は非稼働扱いでLINEから除外されます
            </div>

            <LineBox title="全体LINEメッセージ（稼働前）" text={morningMsg} />
          </div>
        )}

        {/* ===== EVENING ===== */}
        {tab === 'evening' && (
          <div>
            <div className="save-banner">
              <div>
                <div className="save-banner-text">📋 稼働終わり実績入力</div>
                <div className="save-banner-sub">入力後は必ず保存ボタンを押してください！</div>
              </div>
              <button className="save-btn" onClick={saveEvening}>保存する</button>
            </div>

            <div className="summary-cards">
              {[
                { icon: '✅', label: '達成', val: achievers.length, color: 'var(--success)' },
                { icon: '❌', label: '未達', val: nonAchievers.length, color: 'var(--danger)' },
                { icon: '💤', label: '非稼働', val: inactiveUsers.length, color: 'var(--muted)' },
              ].map(item => (
                <div key={item.label} className="summary-card">
                  <div className="summary-card-icon">{item.icon}</div>
                  <div className="summary-card-label">{item.label}</div>
                  <div className="summary-card-val" style={{ color: item.color }}>{item.val}名</div>
                </div>
              ))}
            </div>

            <div className="card">
              {users.map(u => {
                const p = kpi[u.id]?.planned || 0;
                const a = actual[u.id] || 0;
                const isActive = p > 0;
                const ok = isActive && a >= p;
                return (
                  <div key={u.id} className={`result-row${isActive ? '' : ' inactive'}`}>
                    <div className="result-top">
                      <div>
                        <div className="member-name">{u.name}</div>
                        <div className="result-meta">{isActive ? `コミット ${p}件` : '非稼働'}</div>
                      </div>
                      {isActive && <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? '✅ 達成' : '❌ 未達'}</span>}
                    </div>
                    {isActive && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => setActual(prev => ({ ...prev, [u.id]: Math.max(0, (prev[u.id] || 0) - 1) }))}
                            style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid var(--border)', background: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer', color: 'var(--muted)' }}>−</button>
                          <input type="number" inputMode="numeric" min={0}
                            value={actual[u.id] || ''} placeholder="0"
                            onChange={e => setActual(prev => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))}
                            style={{ flex: 1, textAlign: 'center', border: `2px solid ${ok ? 'var(--success)' : 'var(--border)'}`, borderRadius: 10, padding: '8px', fontSize: 24, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: ok ? 'var(--success-bg)' : '#fafaf7', outline: 'none' }} />
                          <button onClick={() => setActual(prev => ({ ...prev, [u.id]: (prev[u.id] || 0) + 1 }))}
                            style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid var(--ink)', background: 'var(--ink)', fontSize: 20, fontWeight: 700, cursor: 'pointer', color: 'white' }}>＋</button>
                          <span style={{ fontSize: 14, color: 'var(--muted)' }}>件</span>
                        </div>
                        {!ok && (
                          <select className="makeup-select" value={makeupInfo[u.id] || ''}
                            onChange={e => setMakeupInfo(prev => ({ ...prev, [u.id]: e.target.value }))}>
                            <option value="">📅 補填予定日を選択</option>
                            {['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <LineBox title="全体LINEメッセージ（稼働終わり）" text={eveningMsg} />
          </div>
        )}

        {/* ===== STATUS ===== */}
        {tab === 'status' && (
          <div>
            <div className="section-title">📊 個人現状確認</div>
            <div className="member-chips">
              {users.map(u => (
                <button key={u.id} className={`chip${statusUserId === u.id ? ' active' : ''}`} onClick={() => setStatusUserId(u.id)}>
                  {u.name}
                </button>
              ))}
            </div>

            {statusStats && (
              <>
                <div className="stat-grid">
                  <StatCard label="月間目標" value={`${statusStats.user.monthly_target}件`} />
                  <StatCard label="現在実績" value={`${statusStats.totalActual}件`} color="var(--success)" />
                  <StatCard label="残り件数" value={`${statusStats.remainingCount}件`} color="var(--danger)" />
                  <StatCard label="残稼働日" value={`${statusStats.remaining}日`}
                    sub={statusStats.user.remaining_work_days > 0 ? '📌 手動' : '🤖 自動'} />
                  <StatCard label="1日平均" value={`${statusStats.dailyAvg}件`} sub="実績ベース" />
                  <StatCard label="必要ペース" value={`${statusStats.dailyNeeded}件`}
                    color={statusStats.dailyNeeded > statusStats.dailyAvg ? 'var(--danger)' : 'var(--success)'}
                    sub={statusStats.dailyNeeded > statusStats.dailyAvg ? '⚠️ 要UP' : '✅ OK'} />
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="progress-label-row">
                    <span style={{ fontWeight: 900 }}>月間進捗</span>
                    <span className="progress-pct">{statusStats.pct}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(statusStats.pct, 100)}%` }} />
                  </div>
                  <div className="progress-sub">
                    <span>{statusStats.totalActual}件達成</span>
                    <span>目標 {statusStats.user.monthly_target}件</span>
                  </div>
                </div>

                <LineBox title="個人現状LINEメッセージ" text={statusMsg} />
              </>
            )}
          </div>
        )}

        {/* ===== MEMBERS ===== */}
        {tab === 'members' && (
          <div>
            <div className="section-title">👥 メンバー管理</div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="add-form">
                <div className="add-form-title">➕ メンバー追加</div>
                <div className="form-row">
                  <div className="form-field">
                    <div className="form-label">名前</div>
                    <input className="form-input" placeholder="例：田中 太郎" value={newName} onChange={e => setNewName(e.target.value)} />
                  </div>
                  <div className="form-row-2">
                    <div className="form-field">
                      <div className="form-label">月間目標件数</div>
                      <input className="form-input" type="number" inputMode="numeric" placeholder="100" value={newTarget} onChange={e => setNewTarget(e.target.value)} />
                    </div>
                    <div className="form-field">
                      <div className="form-label">残稼働日数</div>
                      <input className="form-input" type="number" inputMode="numeric" placeholder="15" value={newRemainingDays} onChange={e => setNewRemainingDays(e.target.value)} />
                    </div>
                  </div>
                  <button className="add-btn" onClick={addUser} disabled={addingUser || !newName || !newTarget}>
                    {addingUser ? '追加中...' : '追加する'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              {users.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>メンバーがいません</div>
                : users.map(u => {
                  const stats = getUserStats(u.id);
                  return (
                    <div key={u.id} className="member-manage-row">
                      <div className="mmr-top">
                        <div>
                          <div className="mmr-name">{u.name}</div>
                          <div className="mmr-stats">目標 {u.monthly_target}件 ／ 実績 {stats?.totalActual ?? 0}件（{stats?.pct ?? 0}%）</div>
                        </div>
                        <button className="delete-btn" onClick={async () => {
                          if (confirm(`${u.name}さんを削除しますか？`)) {
                            await supabase.from('users').delete().eq('id', u.id);
                            loadData(); showToast(`${u.name}さんを削除しました`);
                          }
                        }}>削除</button>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #00b4d8, #00c48c)', width: `${Math.min(stats?.pct ?? 0, 100)}%`, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                      <div>
                        <div className="form-label" style={{ marginBottom: 6 }}>残稼働日数</div>
                        <div className="mmr-days-row">
                          <input type="number" inputMode="numeric" min={0} className="days-input"
                            value={editingDays[u.id] ?? 0}
                            onChange={e => setEditingDays(prev => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))} />
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>日</span>
                          <button className="update-btn" onClick={() => saveRemainingDays(u.id)}>更新</button>
                        </div>
                        <div className="auto-days-hint">🤖 自動計算：{calcAutoRemaining(u.id)}日</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {navTabs.map(t => (
          <button key={t.key} className={`nav-item${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="toast">✓ {toast}</div>}
    </>
  );
}
