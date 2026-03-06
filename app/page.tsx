'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import { ja } from 'date-fns/locale';
import { supabase, User, WorkDay } from './lib/supabase';
import {
  generateMorningMessage,
  generateEveningMessage,
  generatePersonalStatusMessage,
} from './lib/line-messages';

// ============ TYPES ============
type Tab = 'morning' | 'evening' | 'status' | 'members';
type Toast = { msg: string; id: number } | null;

// ============ UTIL ============
function getRemainingWorkDays(month: Date): number {
  const today = new Date();
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start: today, end: end });
  return days.filter((d) => !isWeekend(d)).length;
}

// ============ COMPONENTS ============

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn-secondary" style={{ fontSize: 13 }} onClick={copy}>
      {copied ? '✓ コピー済' : (label || 'コピー')}
    </button>
  );
}

function MessageBox({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="section-stripe">📱 {title}</span>
        <CopyButton text={text} label="LINEにコピー" />
      </div>
      <div style={{
        background: '#f0f9f0',
        border: '2px solid #06C755',
        borderRadius: 12,
        padding: '16px 18px',
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
        color: '#1a1a1a',
      }}>
        {text}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || 'var(--ink)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ============ MAIN APP ============
export default function App() {
  const [tab, setTab] = useState<Tab>('morning');
  const [users, setUsers] = useState<User[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // New user form
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Morning: planned counts per user
  const [planned, setPlanned] = useState<Record<string, number>>({});

  // Evening: actual counts + makeup info per user
  const [actual, setActual] = useState<Record<string, number>>({});
  const [makeupInfo, setMakeupInfo] = useState<Record<string, string>>({});

  // Status: selected user
  const [statusUserId, setStatusUserId] = useState<string>('');

  const showToast = (msg: string) => {
    const id = Date.now();
    setToast({ msg, id });
    setTimeout(() => setToast(null), 2500);
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
    if (users.length) {
      const initPlanned: Record<string, number> = {};
      const initActual: Record<string, number> = {};
      users.forEach((u) => {
        const wd = workDays.find((w) => w.user_id === u.id && w.date === todayStr);
        initPlanned[u.id] = wd?.planned_count ?? 0;
        initActual[u.id] = wd?.actual_count ?? 0;
      });
      setPlanned(initPlanned);
      setActual(initActual);
      if (!statusUserId && users[0]) setStatusUserId(users[0].id);
    }
  }, [users, workDays]);

  // Save morning commit
  const saveMorning = async () => {
    const upserts = users.map((u) => ({
      user_id: u.id,
      date: todayStr,
      planned_count: planned[u.id] || 0,
    }));
    await supabase.from('work_days').upsert(upserts, { onConflict: 'user_id,date', ignoreDuplicates: false });
    showToast('稼働前コミットを保存しました');
    loadData();
  };

  // Save evening results
  const saveEvening = async () => {
    const upserts = users.map((u) => {
      const mk = makeupInfo[u.id] || '';
      return {
        user_id: u.id,
        date: todayStr,
        planned_count: planned[u.id] || 0,
        actual_count: actual[u.id] || 0,
        is_committed: (actual[u.id] || 0) >= (planned[u.id] || 0),
        makeup_day_of_week: mk || null,
      };
    });
    await supabase.from('work_days').upsert(upserts, { onConflict: 'user_id,date', ignoreDuplicates: false });
    showToast('稼働終わりの実績を保存しました');
    loadData();
  };

  const addUser = async () => {
    if (!newName.trim() || !newTarget) return;
    setAddingUser(true);
    await supabase.from('users').insert({ name: newName.trim(), monthly_target: parseInt(newTarget) });
    setNewName(''); setNewTarget('');
    setAddingUser(false);
    loadData();
    showToast(`${newName}さんを追加しました`);
  };

  // Compute status for a user
  const getUserStats = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return null;
    const monthWDs = workDays.filter((w) => w.user_id === userId);
    const totalActual = monthWDs.reduce((s, w) => s + (w.actual_count || 0), 0);
    const workedDays = monthWDs.filter((w) => w.actual_count > 0).length;
    const dailyAvg = workedDays > 0 ? Math.round((totalActual / workedDays) * 10) / 10 : 0;
    const remaining = getRemainingWorkDays(today);
    const remainingCount = Math.max(0, user.monthly_target - totalActual);
    const pct = user.monthly_target > 0 ? Math.round((totalActual / user.monthly_target) * 100) : 0;
    const dailyNeeded = remaining > 0 ? Math.ceil(remainingCount / remaining) : remainingCount;
    return { user, totalActual, workedDays, dailyAvg, remaining, remainingCount, pct, dailyNeeded };
  };

  // LINE messages
  const morningMsg = generateMorningMessage(
    today,
    users.map((u) => ({ name: u.name, planned: planned[u.id] || 0 }))
  );

  const achievers = users.filter((u) => (actual[u.id] || 0) >= (planned[u.id] || 1));
  const nonAchievers = users.filter((u) => (actual[u.id] || 0) < (planned[u.id] || 1));

  const eveningMsg = generateEveningMessage(
    today,
    achievers.map((u) => ({ name: u.name, actual: actual[u.id] || 0, planned: planned[u.id] || 0 })),
    nonAchievers.map((u) => ({ name: u.name, actual: actual[u.id] || 0, planned: planned[u.id] || 0, makeupInfo: makeupInfo[u.id] }))
  );

  const statusStats = getUserStats(statusUserId);
  const statusMsg = statusStats
    ? generatePersonalStatusMessage(
        statusStats.user.name,
        statusStats.user.monthly_target,
        statusStats.totalActual,
        statusStats.remaining,
        statusStats.dailyAvg
      )
    : '';

  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'morning', label: '稼働前コミット', emoji: '🌅' },
    { key: 'evening', label: '稼働終わり報告', emoji: '🌆' },
    { key: 'status', label: '個人現状確認', emoji: '📊' },
    { key: 'members', label: 'メンバー管理', emoji: '👥' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div style={{ fontWeight: 700, color: 'var(--muted)' }}>読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 className="font-display" style={{ fontSize: 42, letterSpacing: 2, lineHeight: 1, color: 'var(--ink)' }}>
            COMMIT TRACKER
          </h1>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
            {format(today, 'M月d日(E)', { locale: ja })}
          </span>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          日次コミット管理・LINE共有・個人進捗トラッカー
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ====== MORNING TAB ====== */}
      {tab === 'morning' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900 }}>🌅 稼働前コミット入力</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={saveMorning}>保存する</button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th>今日の件数コミット</th>
                  <th>月間目標</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>メンバーを追加してください</td></tr>
                ) : users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          style={{ width: 90 }}
                          value={planned[u.id] || ''}
                          placeholder="0"
                          onChange={(e) => setPlanned((p) => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))}
                        />
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>件</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{u.monthly_target}件/月</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, textAlign: 'right', color: 'var(--muted)', fontSize: 13 }}>
            合計：<strong style={{ color: 'var(--ink)' }}>
              {Object.values(planned).reduce((s, v) => s + (v || 0), 0)}件
            </strong>
          </div>

          {users.length > 0 && (
            <MessageBox title="全体LINEメッセージ（稼働前）" text={morningMsg} />
          )}
        </div>
      )}

      {/* ====== EVENING TAB ====== */}
      {tab === 'evening' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900 }}>🌆 稼働終わり実績入力</h2>
            <button className="btn-primary" onClick={saveEvening}>保存する</button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th>コミット件数</th>
                  <th>実績件数</th>
                  <th>状況</th>
                  <th>補填予定日（未達の場合）</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const p = planned[u.id] || 0;
                  const a = actual[u.id] || 0;
                  const ok = a >= p && p > 0;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>{u.name}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p}件</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="number"
                            min={0}
                            className="input"
                            style={{ width: 80 }}
                            value={actual[u.id] || ''}
                            placeholder="0"
                            onChange={(e) => setActual((prev) => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))}
                          />
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>件</span>
                        </div>
                      </td>
                      <td>
                        {p > 0 ? (
                          <span className={ok ? 'badge-success' : 'badge-danger'}>
                            {ok ? '✅ 達成' : '❌ 未達'}
                          </span>
                        ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                      </td>
                      <td>
                        {!ok && p > 0 ? (
                          <select
                            className="input"
                            style={{ width: 140 }}
                            value={makeupInfo[u.id] || ''}
                            onChange={(e) => setMakeupInfo((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          >
                            <option value="">曜日を選択</option>
                            {['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'].map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary badges */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>達成者</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color: 'var(--success)' }}>{achievers.length}名</div>
              </div>
            </div>
            <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>❌</span>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>未達成者</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color: 'var(--danger)' }}>{nonAchievers.length}名</div>
              </div>
            </div>
          </div>

          {users.length > 0 && (
            <MessageBox title="全体LINEメッセージ（稼働終わり）" text={eveningMsg} />
          )}
        </div>
      )}

      {/* ====== STATUS TAB ====== */}
      {tab === 'status' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>📊 個人現状確認</h2>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
              メンバーを選択
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setStatusUserId(u.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: `2px solid ${statusUserId === u.id ? 'var(--ink)' : 'var(--border)'}`,
                    background: statusUserId === u.id ? 'var(--ink)' : 'white',
                    color: statusUserId === u.id ? 'white' : 'var(--ink)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          {statusStats && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <StatCard label="月間目標" value={`${statusStats.user.monthly_target}件`} />
                <StatCard label="現在実績" value={`${statusStats.totalActual}件`} color="var(--success)" />
                <StatCard label="残り件数" value={`${statusStats.remainingCount}件`} color="var(--danger)" />
                <StatCard label="残稼働日" value={`${statusStats.remaining}日`} sub="今日含む" />
                <StatCard label="1日平均" value={`${statusStats.dailyAvg}件`} sub="実績ベース" />
                <StatCard
                  label="必要ペース"
                  value={`${statusStats.dailyNeeded}件/日`}
                  color={statusStats.dailyNeeded > statusStats.dailyAvg ? 'var(--danger)' : 'var(--success)'}
                  sub={statusStats.dailyNeeded > statusStats.dailyAvg ? '⚠️ ペースアップ要' : '✅ このペースでOK'}
                />
              </div>

              {/* Progress bar */}
              <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>月間進捗</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16 }}>
                    {statusStats.pct}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(statusStats.pct, 100)}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <span>{statusStats.totalActual}件達成</span>
                  <span>目標 {statusStats.user.monthly_target}件</span>
                </div>
              </div>

              <MessageBox title="個人現状LINEメッセージ" text={statusMsg} />
            </>
          )}
        </div>
      )}

      {/* ====== MEMBERS TAB ====== */}
      {tab === 'members' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>👥 メンバー管理</h2>

          {/* Add member */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>➕ メンバー追加</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>名前</label>
                <input
                  className="input"
                  placeholder="例：田中 太郎"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>月間目標件数</label>
                <input
                  className="input"
                  type="number"
                  placeholder="例：100"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn-primary" onClick={addUser} disabled={addingUser || !newName || !newTarget}>
                  {addingUser ? '追加中...' : '追加'}
                </button>
              </div>
            </div>
          </div>

          {/* Member list */}
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>月間目標</th>
                  <th>今月実績</th>
                  <th>進捗</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                      メンバーがいません。追加してください。
                    </td>
                  </tr>
                ) : users.map((u) => {
                  const stats = getUserStats(u.id);
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>{u.name}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{u.monthly_target}件</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--success)' }}>
                        {stats?.totalActual ?? 0}件
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="progress-track" style={{ width: 80, height: 8 }}>
                            <div className="progress-fill" style={{ width: `${Math.min(stats?.pct ?? 0, 100)}%` }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                            {stats?.pct ?? 0}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={async () => {
                            if (confirm(`${u.name}さんを削除しますか？`)) {
                              await supabase.from('users').delete().eq('id', u.id);
                              loadData();
                              showToast(`${u.name}さんを削除しました`);
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: '1.5px solid var(--border)',
                            borderRadius: 8,
                            padding: '4px 12px',
                            fontSize: 12,
                            color: 'var(--muted)',
                            cursor: 'pointer',
                          }}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">✓ {toast.msg}</div>}
    </div>
  );
}
