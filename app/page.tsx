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

type Tab = 'morning' | 'evening' | 'status' | 'members';
type Toast = { msg: string; id: number } | null;

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
  if (!text) return (
    <div style={{ marginTop: 16, padding: '16px 18px', background: '#f5f5f0', borderRadius: 12, color: 'var(--muted)', fontSize: 13 }}>
      稼働メンバーが0件のためメッセージはありません
    </div>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="section-stripe">📱 {title}</span>
        <CopyButton text={text} label="LINEにコピー" />
      </div>
      <div style={{
        background: '#f0f9f0', border: '2px solid #06C755', borderRadius: 12,
        padding: '16px 18px', fontFamily: 'monospace', fontSize: 13,
        lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#1a1a1a',
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
      <div style={{ fontSize: 26, fontWeight: 900, color: color || 'var(--ink)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('morning');
  const [users, setUsers] = useState<User[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newVisitTarget, setNewVisitTarget] = useState('');
  const [newRemainingDays, setNewRemainingDays] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [editingDays, setEditingDays] = useState<Record<string, number>>({});

  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [visitTarget, setVisitTarget] = useState<Record<string, number>>({});
  const [actual, setActual] = useState<Record<string, number>>({});
  const [makeupInfo, setMakeupInfo] = useState<Record<string, string>>({});
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
      const initVisit: Record<string, number> = {};
      const initDays: Record<string, number> = {};
      users.forEach((u) => {
        const wd = workDays.find((w) => w.user_id === u.id && w.date === todayStr);
        initPlanned[u.id] = wd?.planned_count ?? 0;
        initActual[u.id] = wd?.actual_count ?? 0;
        initVisit[u.id] = wd?.daily_visit_target ?? u.daily_visit_target ?? 0;
        initDays[u.id] = u.remaining_work_days ?? 0;
      });
      setPlanned(initPlanned);
      setActual(initActual);
      setVisitTarget(initVisit);
      setEditingDays(initDays);
      if (!statusUserId && users[0]) setStatusUserId(users[0].id);
    }
  }, [users, workDays]);

  // 目標件数が入力された今日以降の日数を自動計算
  const calcAutoRemainingDays = (userId: string): number => {
    return eachDayOfInterval({ start: today, end: endOfMonth(today) })
      .filter((d) => {
        const ds = format(d, 'yyyy-MM-dd');
        return workDays.some((w) => w.user_id === userId && w.date === ds && w.planned_count > 0);
      }).length;
  };

  const saveMorning = async () => {
    const upserts = users.map((u) => ({
      user_id: u.id,
      date: todayStr,
      planned_count: planned[u.id] || 0,
      daily_visit_target: visitTarget[u.id] || 0,
    }));
    await supabase.from('work_days').upsert(upserts, { onConflict: 'user_id,date', ignoreDuplicates: false });
    showToast('稼働前コミットを保存しました');
    loadData();
  };

  const saveEvening = async () => {
    const upserts = users.map((u) => ({
      user_id: u.id,
      date: todayStr,
      planned_count: planned[u.id] || 0,
      actual_count: actual[u.id] || 0,
      daily_visit_target: visitTarget[u.id] || 0,
      is_committed: (actual[u.id] || 0) >= (planned[u.id] || 0),
      makeup_day_of_week: makeupInfo[u.id] || null,
    }));
    await supabase.from('work_days').upsert(upserts, { onConflict: 'user_id,date', ignoreDuplicates: false });
    showToast('稼働終わりの実績を保存しました');
    loadData();
  };

  const saveRemainingDays = async (userId: string) => {
    await supabase.from('users').update({ remaining_work_days: editingDays[userId] || 0 }).eq('id', userId);
    showToast('残稼働日を更新しました');
    loadData();
  };

  const addUser = async () => {
    if (!newName.trim() || !newTarget) return;
    setAddingUser(true);
    await supabase.from('users').insert({
      name: newName.trim(),
      monthly_target: parseInt(newTarget),
      daily_visit_target: parseInt(newVisitTarget) || 0,
      remaining_work_days: parseInt(newRemainingDays) || 0,
    });
    setNewName(''); setNewTarget(''); setNewVisitTarget(''); setNewRemainingDays('');
    setAddingUser(false);
    loadData();
    showToast(`${newName}さんを追加しました`);
  };

  const getUserStats = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return null;
    const monthWDs = workDays.filter((w) => w.user_id === userId);
    const totalActual = monthWDs.reduce((s, w) => s + (w.actual_count || 0), 0);
    const workedDays = monthWDs.filter((w) => w.actual_count > 0).length;
    const dailyAvg = workedDays > 0 ? Math.round((totalActual / workedDays) * 10) / 10 : 0;
    const autoRemaining = calcAutoRemainingDays(userId);
    // 手動設定があればそちらを優先、なければ自動計算
    const remaining = (user.remaining_work_days > 0) ? user.remaining_work_days : autoRemaining;
    const remainingCount = Math.max(0, user.monthly_target - totalActual);
    const pct = user.monthly_target > 0 ? Math.round((totalActual / user.monthly_target) * 100) : 0;
    const dailyNeeded = remaining > 0 ? Math.ceil(remainingCount / remaining) : remainingCount;
    return { user, totalActual, workedDays, dailyAvg, remaining, remainingCount, pct, dailyNeeded, autoRemaining };
  };

  const morningMsg = generateMorningMessage(
    today,
    users.map((u) => ({ name: u.name, planned: planned[u.id] || 0, visitTarget: visitTarget[u.id] || 0 }))
  );

  const activeUsers = users.filter((u) => (planned[u.id] || 0) > 0);
  const achievers = activeUsers.filter((u) => (actual[u.id] || 0) >= (planned[u.id] || 1));
  const nonAchievers = activeUsers.filter((u) => (actual[u.id] || 0) < (planned[u.id] || 1));

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
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 className="font-display" style={{ fontSize: 42, letterSpacing: 2, lineHeight: 1, color: 'var(--ink)' }}>
            COMMIT TRACKER
          </h1>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
            {format(today, 'M月d日(E)', { locale: ja })}
          </span>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>日次コミット管理・LINE共有・個人進捗トラッカー</p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ====== MORNING ====== */}
      {tab === 'morning' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900 }}>🌅 稼働前コミット入力</h2>
            <button className="btn-primary" onClick={saveMorning}>保存する</button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th>今日のコミット件数</th>
                  <th>目標訪問件数</th>
                  <th>月間目標</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>メンバーを追加してください</td></tr>
                ) : users.map((u) => {
                  const isActive = (planned[u.id] || 0) > 0;
                  return (
                    <tr key={u.id} style={{ opacity: isActive ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 700 }}>{u.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="number" min={0} className="input" style={{ width: 80 }}
                            value={planned[u.id] || ''} placeholder="0"
                            onChange={(e) => setPlanned((p) => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))} />
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>件</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="number" min={0} className="input" style={{ width: 80 }}
                            value={visitTarget[u.id] || ''} placeholder="0"
                            onChange={(e) => setVisitTarget((p) => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))} />
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>件</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{u.monthly_target}件/月</td>
                      <td>
                        {isActive
                          ? <span className="badge-success">稼働</span>
                          : <span style={{ fontSize: 12, color: 'var(--muted)', background: '#f0f0ec', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>非稼働</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>※ 0件は非稼働扱い・LINEメッセージから除外</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              稼働：<strong style={{ color: 'var(--ink)' }}>{activeUsers.length}名</strong>　
              合計：<strong style={{ color: 'var(--ink)' }}>{Object.values(planned).reduce((s, v) => s + v, 0)}件</strong>
            </span>
          </div>

          {users.length > 0 && <MessageBox title="全体LINEメッセージ（稼働前）" text={morningMsg} />}
        </div>
      )}

      {/* ====== EVENING ====== */}
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
                  <th>コミット</th>
                  <th>実績</th>
                  <th>状況</th>
                  <th>補填予定日（未達の場合）</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const p = planned[u.id] || 0;
                  const a = actual[u.id] || 0;
                  const isActive = p > 0;
                  const ok = a >= p && p > 0;
                  return (
                    <tr key={u.id} style={{ opacity: isActive ? 1 : 0.4 }}>
                      <td style={{ fontWeight: 700 }}>
                        {u.name}
                        {!isActive && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>（非稼働）</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p > 0 ? `${p}件` : '-'}</td>
                      <td>
                        {isActive
                          ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="number" min={0} className="input" style={{ width: 80 }}
                                value={actual[u.id] || ''} placeholder="0"
                                onChange={(e) => setActual((prev) => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))} />
                              <span style={{ color: 'var(--muted)', fontSize: 13 }}>件</span>
                            </div>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                      </td>
                      <td>
                        {isActive
                          ? <span className={ok ? 'badge-success' : 'badge-danger'}>{ok ? '✅ 達成' : '❌ 未達'}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                      </td>
                      <td>
                        {isActive && !ok
                          ? <select className="input" style={{ width: 140 }}
                              value={makeupInfo[u.id] || ''}
                              onChange={(e) => setMakeupInfo((prev) => ({ ...prev, [u.id]: e.target.value }))}>
                              <option value="">曜日を選択</option>
                              {['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'].map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { icon: '✅', label: '達成者', val: achievers.length, color: 'var(--success)' },
              { icon: '❌', label: '未達成者', val: nonAchievers.length, color: 'var(--danger)' },
              { icon: '😴', label: '非稼働', val: users.filter(u => (planned[u.id] || 0) === 0).length, color: 'var(--muted)' },
            ].map((item) => (
              <div key={item.label} className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color: item.color }}>{item.val}名</div>
                </div>
              </div>
            ))}
          </div>

          {users.length > 0 && <MessageBox title="全体LINEメッセージ（稼働終わり）" text={eveningMsg} />}
        </div>
      )}

      {/* ====== STATUS ====== */}
      {tab === 'status' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>📊 個人現状確認</h2>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>メンバーを選択</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {users.map((u) => (
                <button key={u.id} onClick={() => setStatusUserId(u.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 10,
                    border: `2px solid ${statusUserId === u.id ? 'var(--ink)' : 'var(--border)'}`,
                    background: statusUserId === u.id ? 'var(--ink)' : 'white',
                    color: statusUserId === u.id ? 'white' : 'var(--ink)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}>
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
                <StatCard label="残稼働日" value={`${statusStats.remaining}日`}
                  sub={statusStats.user.remaining_work_days > 0 ? '📌 手動設定' : `🤖 自動(${statusStats.autoRemaining}日)`} />
                <StatCard label="1日平均" value={`${statusStats.dailyAvg}件`} sub="実績ベース" />
                <StatCard label="必要ペース" value={`${statusStats.dailyNeeded}件/日`}
                  color={statusStats.dailyNeeded > statusStats.dailyAvg ? 'var(--danger)' : 'var(--success)'}
                  sub={statusStats.dailyNeeded > statusStats.dailyAvg ? '⚠️ ペースアップ要' : '✅ このペースでOK'} />
              </div>

              <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>月間進捗</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16 }}>{statusStats.pct}%</span>
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

      {/* ====== MEMBERS ====== */}
      {tab === 'members' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>👥 メンバー管理</h2>

          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>➕ メンバー追加</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 130 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>名前</label>
                <input className="input" placeholder="例：田中 太郎" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>月間目標件数</label>
                <input className="input" type="number" placeholder="100" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>1日目標訪問数</label>
                <input className="input" type="number" placeholder="5" value={newVisitTarget} onChange={(e) => setNewVisitTarget(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>残稼働日数</label>
                <input className="input" type="number" placeholder="15" value={newRemainingDays} onChange={(e) => setNewRemainingDays(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn-primary" onClick={addUser} disabled={addingUser || !newName || !newTarget}>
                  {addingUser ? '追加中...' : '追加'}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>月間目標</th>
                  <th>今月実績</th>
                  <th>残稼働日（編集可）</th>
                  <th>進捗</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>メンバーがいません</td></tr>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="number" min={0} className="input" style={{ width: 65 }}
                            value={editingDays[u.id] ?? 0}
                            onChange={(e) => setEditingDays((prev) => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))} />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>日</span>
                          <button onClick={() => saveRemainingDays(u.id)}
                            style={{ background: 'var(--ink)', color: 'white', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            更新
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          自動計算：{calcAutoRemainingDays(u.id)}日
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="progress-track" style={{ width: 80, height: 8 }}>
                            <div className="progress-fill" style={{ width: `${Math.min(stats?.pct ?? 0, 100)}%` }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{stats?.pct ?? 0}%</span>
                        </div>
                      </td>
                      <td>
                        <button onClick={async () => {
                          if (confirm(`${u.name}さんを削除しますか？`)) {
                            await supabase.from('users').delete().eq('id', u.id);
                            loadData();
                            showToast(`${u.name}さんを削除しました`);
                          }
                        }} style={{ background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 8, padding: '4px 12px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, padding: '12px 16px', background: '#f5f4ef', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
            💡 <strong>残稼働日について</strong><br />
            「自動計算」は稼働前コミットで目標件数が入力された今月の残り日数を表示します。<br />
            手動で入力して「更新」を押すと、個人現状確認の計算に優先的に反映されます。
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast.msg}</div>}
    </div>
  );
}
