import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export type KpiEntry = {
  name: string;
  planned: number;
  visitTarget: number;
  contractTarget: number;
  visit: number;
  negotiation: number;
  indoor: number;
  contract: number;
};

export function generateMorningMessage(date: Date, entries: KpiEntry[]): string {
  const dateStr = format(date, 'M月d日(E)', { locale: ja });
  const activeEntries = entries.filter((e) => e.planned > 0);
  if (activeEntries.length === 0) return '';

  const lines = activeEntries.map((e) => {
    const kpiLines = [];
    if (e.contractTarget > 0) kpiLines.push(`　本日契約目標：${e.contractTarget}件`);
    kpiLines.push(`　▼今日やるべき数値`);
    if (e.visit > 0)       kpiLines.push(`　訪問　　：${e.visit}件`);
    if (e.negotiation > 0) kpiLines.push(`　商談　　：${e.negotiation}件`);
    if (e.indoor > 0)      kpiLines.push(`　宅内イン：${e.indoor}件`);
    if (e.contract > 0)    kpiLines.push(`　契約　　：${e.contract}件`);
    return [`・${e.name}：${e.planned}件`, ...kpiLines].join('\n');
  });

  return [
    `【${dateStr} 本日のコミット】`,
    '',
    lines.join('\n\n'),
    '',
    `稼働人数：${activeEntries.length}名　合計：${activeEntries.reduce((s, e) => s + e.planned, 0)}件`,
    '',
    '全員今日も頑張りましょう！💪',
  ].join('\n');
}

export function generateEveningMessage(
  date: Date,
  achievers: { name: string; actual: number; planned: number }[],
  nonAchievers: { name: string; actual: number; planned: number; makeupInfo?: string }[]
): string {
  const dateStr = format(date, 'M月d日(E)', { locale: ja });
  // 0件コミットの人は除外
  const activeAchievers = achievers.filter((e) => e.planned > 0);
  const activeNonAchievers = nonAchievers.filter((e) => e.planned > 0);

  const achieverLines = activeAchievers.map(
    (e) => `✅ ${e.name}：${e.actual}件 / ${e.planned}件`
  );
  const nonAchieverLines = activeNonAchievers.map((e) => {
    const makeup = e.makeupInfo ? `　→ 補填：${e.makeupInfo}` : '';
    return `❌ ${e.name}：${e.actual}件 / ${e.planned}件${makeup}`;
  });

  return [
    `【${dateStr} コミット結果報告】`,
    '',
    '■ 達成者',
    achieverLines.length ? achieverLines.join('\n') : '　なし',
    '',
    '■ 未達成者',
    nonAchieverLines.length ? nonAchieverLines.join('\n') : '　なし',
    '',
    `お疲れ様でした！明日も頑張りましょう🔥`,
  ].join('\n');
}

export function generatePersonalStatusMessage(
  name: string,
  monthlyTarget: number,
  totalActual: number,
  remainingWorkDays: number,
  dailyAvg: number
): string {
  const remaining = Math.max(0, monthlyTarget - totalActual);
  const dailyNeeded =
    remainingWorkDays > 0 ? Math.ceil(remaining / remainingWorkDays) : remaining;
  const progressPct = Math.round((totalActual / monthlyTarget) * 100);

  return [
    `【${name}さんの現状】`,
    '',
    `📊 月間目標：${monthlyTarget}件`,
    `✅ 現在実績：${totalActual}件（${progressPct}%）`,
    `📌 残り件数：${remaining}件`,
    `📅 残稼働日数：${remainingWorkDays}日`,
    `📈 現在の1日平均：${dailyAvg}件`,
    `⚡ 残り必要ペース：1日${dailyNeeded}件`,
    '',
    dailyNeeded <= dailyAvg
      ? '現在のペースで達成できます！このまま頑張りましょう💪'
      : `ペースアップが必要です！1日あたり${dailyNeeded - dailyAvg > 0 ? '+' + (dailyNeeded - dailyAvg) : dailyNeeded - dailyAvg}件増やしましょう🔥`,
  ].join('\n');
}
