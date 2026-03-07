'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { supabase, User, WorkDay } from './lib/supabase';
import { generateMorningMessage, generateEveningMessage, generatePersonalStatusMessage } from './lib/line-messages';

type Tab = 'morning' | 'evening' | 'status' | 'members';

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

export default function App() {
  const [tab, setTab] = useState<Tab>('morning');
  const [users, setUsers] = useState<User[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [visitTarget, setVisitTarget] = useState<Record<string, number>>({});
  const [actual, setActual] = useState<Record<string, number>>({});
  const [makeupInfo, setMakeupInfo] = useState<Record<string, string>>({});
  const [statusUserId, setStatusUserId] = useState('');
  const [editingDays, setEditingDays] = useState<Record<string, number>>({});

  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newVisitTarget, setNewVisitTarget] = useState('');
  const [newRemainingDays, setNewRemainingDays] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(null), 2500);
  };

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
    const ip: Record<string, number> = {}, ia: Record<string, number> = {}, iv: Record<string, number> = {}, id: Record<string, number> = {};
    users.forEach((u) => {
      const wd = workDays.find((w) => w.user_id === u.id && w.date === todayStr);
      ip[u.id] = wd?.planned_count ?? 0;
      ia[u.id] = wd?.actual_count ?? 0;
      iv[u.id] = wd?.daily_visit_target ?? u.daily_visit_target ?? 0;
      id[u.id] = u.remaining_work_days ?? 0;
    });
    setPlanned(ip); setActual(ia); setVisitTarget(iv); setEditingDays(id);
    if (!statusUserId && users[0]) setStatusUserId(users[0].id);
  }, [users, workDays]);

  const calcAutoRemaining = (userId: string) =>
    eachDayOfInterval({ start: today, end: endOfMonth(today) })
      .filter(d => workDays.some(w => w.user_id === userId && w.date === format(d, 'yyyy-MM-dd') && w.planned_count > 0)).length;

  const saveMorning = async () => {
    await supabase.from('work_days').upsert(
      users.map(u => ({ user_id: u.id, date: todayStr, planned_count: planned[u.id] || 0, daily_visit_target: visitTarget[u.id] || 0 })),
      { onConflict: 'user_id,date', ignoreDuplicates: false }
    );
    showToast('稼働前コミットを保存しました'); loadData();
  };

  const saveEvening = async () => {
    await supabase.from('work_days').upsert(
      users.map(u => ({
        user_id: u.id, date: todayStr,
        planned_count: planned[u.id] || 0, actual_count: actual[u.id] || 0,
        daily_visit_target: visitTarget[u.id] || 0,
        is_committed: (actual[u.id] || 0) >= (planned[u.id] || 0),
        makeup_day_of_week: makeupInfo[u.id] || null,
      })),
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

  const activeUsers = users.filter(u => (planned[u.id] || 0) > 0);
  const achievers = activeUsers.filter(u => (actual[u.id] || 0) >= (planned[u.id] || 1));
  const nonAchievers = activeUsers.filter(u => (actual[u.id] || 0) < (planned[u.id] || 1));
  const inactiveUsers = users.filter(u => (planned[u.id] || 0) === 0);

  const morningMsg = generateMorningMessage(today, users.map(u => ({ name: u.name, planned: planned[u.id] || 0, visitTarget: visitTarget[u.id] || 0 })));
  const eveningMsg = generateEveningMessage(today,
    achievers.map(u => ({ name: u.name, actual: actual[u.id] || 0, planned: planned[u.id] || 0 })),
    nonAchievers.map(u => ({ name: u.name, actual: actual[u.id] || 0, planned: planned[u.id] || 0, makeupInfo: makeupInfo[u.id] }))
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
            {/* Save banner */}
            <div className="save-banner">
              <div>
                <div className="save-banner-text">📝 稼働前コミット入力</div>
                <div className="save-banner-sub">入力後は必ず保存ボタンを押してください！</div>
              </div>
              <button className="save-btn" onClick={saveMorning}>保存する</button>
            </div>

            {/* Summary */}
            <div className="summary-bar">
              <span>稼働中 <strong>{activeUsers.length}名</strong></span>
              <span>本日合計 <strong>{Object.values(planned).reduce((s, v) => s + v, 0)}件</strong></span>
            </div>

            {/* Member cards */}
            <div className="card">
              {users.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>メンバーを追加してください</div>
                : users.map(u => {
                  const isActive = (planned[u.id] || 0) > 0;
                  return (
                    <div key={u.id} className={`member-row${isActive ? '' : ' inactive'}`}>
                      <div className="member-name-row">
                        <div>
                          <div className="member-name">{u.name}</div>
                          <div className="member-target-hint">月間目標 {u.monthly_target}件</div>
                        </div>
                        <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
                          {isActive ? '✅ 稼働' : '💤 非稼働'}
                        </span>
                      </div>
                      <div className="input-row">
                        <div className="input-group">
                          <div className="input-label">コミット件数</div>
                          <input type="number" inputMode="numeric" min={0} className="num-input"
                            value={planned[u.id] || ''} placeholder="0"
                            onChange={e => setPlanned(p => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))} />
                        </div>
                        <div className="input-group">
                          <div className="input-label">目標訪問件数</div>
                          <input type="number" inputMode="numeric" min={0} className="num-input"
                            value={visitTarget[u.id] || ''} placeholder="0"
                            onChange={e => setVisitTarget(p => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))} />
                        </div>
                      </div>
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

            {/* Summary cards */}
            <div className="summary-cards">
              <div className="summary-card">
                <div className="summary-card-icon">✅</div>
                <div className="summary-card-label">達成</div>
                <div className="summary-card-val" style={{ color: 'var(--success)' }}>{achievers.length}名</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-icon">❌</div>
                <div className="summary-card-label">未達</div>
                <div className="summary-card-val" style={{ color: 'var(--danger)' }}>{nonAchievers.length}名</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-icon">💤</div>
                <div className="summary-card-label">非稼働</div>
                <div className="summary-card-val" style={{ color: 'var(--muted)' }}>{inactiveUsers.length}名</div>
              </div>
            </div>

            <div className="card">
              {users.map(u => {
                const p = planned[u.id] || 0;
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
                      <div className="input-row">
                        <div className="input-group">
                          <div className="input-label">実績件数</div>
                          <input type="number" inputMode="numeric" min={0} className="num-input"
                            value={actual[u.id] || ''} placeholder="0"
                            onChange={e => setActual(prev => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))} />
                        </div>
                        {!ok && (
                          <div className="input-group">
                            <div className="input-label">補填予定日</div>
                            <select className="makeup-select"
                              value={makeupInfo[u.id] || ''}
                              onChange={e => setMakeupInfo(prev => ({ ...prev, [u.id]: e.target.value }))}>
                              <option value="">曜日を選択</option>
                              {['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'].map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
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

                <div className="card" style={{ padding: '16px' }}>
                  <div className="progress-wrap" style={{ marginBottom: 0 }}>
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

            {/* Add form */}
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
                      <div className="form-label">1日目標訪問</div>
                      <input className="form-input" type="number" inputMode="numeric" placeholder="5" value={newVisitTarget} onChange={e => setNewVisitTarget(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-field">
                    <div className="form-label">残稼働日数</div>
                    <input className="form-input" type="number" inputMode="numeric" placeholder="15" value={newRemainingDays} onChange={e => setNewRemainingDays(e.target.value)} />
                  </div>
                  <button className="add-btn" onClick={addUser} disabled={addingUser || !newName || !newTarget}>
                    {addingUser ? '追加中...' : '追加する'}
                  </button>
                </div>
              </div>
            </div>

            {/* Member list */}
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
                          <div className="mmr-stats">
                            目標 {u.monthly_target}件 ／ 実績 {stats?.totalActual ?? 0}件
                            （{stats?.pct ?? 0}%）
                          </div>
                        </div>
                        <button className="delete-btn" onClick={async () => {
                          if (confirm(`${u.name}さんを削除しますか？`)) {
                            await supabase.from('users').delete().eq('id', u.id);
                            loadData(); showToast(`${u.name}さんを削除しました`);
                          }
                        }}>削除</button>
                      </div>

                      {/* Progress */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #00b4d8, #00c48c)', width: `${Math.min(stats?.pct ?? 0, 100)}%`, transition: 'width 0.5s' }} />
                        </div>
                      </div>

                      {/* Remaining days */}
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

            <div className="info-box">
              💡 <strong>残稼働日について</strong><br />
              「自動計算」は稼働前コミットで目標が入力済みの今月残り日数です。<br />
              手動で入力して「更新」を押すと個人現状確認に反映されます。
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
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
