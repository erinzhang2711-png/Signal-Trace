"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { evidenceFromImport, nextState, sourceTierFromPublisher } from "@/lib/evidence";
import { marketReactionForEvent, returnFrom } from "@/lib/market";
import { buildTimelineGroups, canonicalEventName, timelineStageLabel } from "@/lib/timeline";
import { marketIdentityForTask } from "@/lib/market-identity";
import { researchTaskWarning } from "@/lib/task-validation";
import { followedEventId, readWatchlist, WATCHLIST_STORAGE_KEY, type FollowedEvent } from "@/lib/watchlist";
import type { AgentProposal, AgentRun, EvidenceItem, EventState, ImportedMaterial, MarketSeries, ResearchTask } from "@/lib/types";

const RESEARCH_STORAGE_PREFIX = "signaltrace-research-v1:";

const stateTone: Record<EventState, string> = {
  "筹划中": "tone-amber",
  "预案披露": "tone-blue",
  "持续推进": "tone-violet",
  "待人工核验": "tone-amber",
  "已否认": "tone-red",
  "已完成": "tone-green",
};

function blankMaterial(): ImportedMaterial {
  return { title: "", publisher: "", sourceUrl: "", disclosedAt: new Date().toISOString().slice(0, 10), body: "" };
}

function securityLabels(companyQuery: string) {
  return companyQuery.split(/[、，,]/).map((part) => {
    const name = part.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z]{2,}/)?.[0] ?? part.trim();
    const code = part.match(/\b\d{6}\b/)?.[0];
    return { name, code };
  }).filter((item) => item.name);
}

function isFormalSource(material: Pick<ImportedMaterial, "publisher" | "sourceUrl">) {
  const tier = sourceTierFromPublisher(material.publisher, material.sourceUrl);
  return tier === "交易所/公司公告" || tier === "公司投资者关系";
}

function requiresOriginalVerification(item: EvidenceItem) {
  return !item.sourceUrl || !["交易所/公司公告", "公司投资者关系"].includes(item.sourceTier);
}

async function requestAnalysis(material: ImportedMaterial, task: ResearchTask): Promise<AgentProposal> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...material, task }),
  });
  const raw = await response.text();
  let data: { proposal?: AgentProposal; error?: string } = {};
  try {
    data = JSON.parse(raw) as { proposal?: AgentProposal; error?: string };
  } catch {
    throw new Error(`核验服务返回了非预期内容（HTTP ${response.status}），没有写入任何结论。`);
  }
  if (!response.ok || !data.proposal) throw new Error(data.error || `核验服务返回 HTTP ${response.status}，没有生成草案。`);
  return data.proposal;
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<ResearchLoading />}>
      <ResearchWorkspace />
    </Suspense>
  );
}

function ResearchWorkspace() {
  const searchParams = useSearchParams();
  const task = useMemo<ResearchTask>(() => ({
    companyQuery: searchParams.get("company")?.trim() ?? "",
    eventQuery: searchParams.get("event")?.trim() ?? "",
    cutoffDate: searchParams.get("cutoff")?.trim() ?? "",
  }), [searchParams]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedTask = useRef<string | null>(null);
  const taskKey = `${task.companyQuery}|${task.eventQuery}|${task.cutoffDate}`;
  const storageKey = `${RESEARCH_STORAGE_PREFIX}${taskKey}`;
  const taskWarning = researchTaskWarning(task);
  const validTask = Boolean(task.companyQuery && task.eventQuery && /^\d{4}-\d{2}-\d{2}$/.test(task.cutoffDate) && !taskWarning);

  const runResearch = useCallback(async () => {
    if (!validTask) {
      setError(taskWarning || "研究任务不完整，请返回首页重新填写公司、事件关键词和历史截点。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentState: "待人工核验", currentConclusion: "尚未建立正式事件结论，需基于可追溯证据创建草案。", task }),
      });
      const data = (await response.json()) as { run?: AgentRun; error?: string };
      // A failed Agent run is still a valid, user-actionable result: render its
      // safe stop reason instead of discarding it solely because the HTTP status is 5xx.
      if (data.run) {
        setRun(data.run);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Agent 监测服务暂不可用，请稍后重试。");
      throw new Error(data.error || "Agent 监测没有返回运行记录");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent 监测失败");
    } finally {
      setLoading(false);
    }
  }, [task, taskWarning, validTask]);

  useEffect(() => {
    if (startedTask.current === taskKey) return;
    startedTask.current = taskKey;
    if (taskWarning) {
      setError(taskWarning);
      setLoading(false);
      return;
    }
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setRun(JSON.parse(saved) as AgentRun);
        setLoading(false);
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    void runResearch();
  }, [runResearch, storageKey, taskKey, taskWarning]);

  useEffect(() => {
    if (run) window.localStorage.setItem(storageKey, JSON.stringify(run));
  }, [run, storageKey]);

  if (run) return <ResearchDashboard task={task} run={run} onRerun={() => void runResearch()} onRunChange={setRun} />;

  return <main>
    <header className="topbar">
      <div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><a className="topbar-start" href="/">← 修改研究任务</a></div>
      <div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div>
    </header>
    <section className="result-hero">
      <p className="eyebrow">EVENT RESEARCH WORKSPACE</p>
      <h1>{task.companyQuery || "未命名研究"}</h1>
      <p>{task.eventQuery || "未提供事件关键词"} <span className="divider" /> 历史截点 {task.cutoffDate || "未提供"}</p>
    </section>
    <section className="execution-section result-content">
      {loading && <div className="research-loading panel"><span className="live-dot" />Agent 正在调用 iFinD MCP 检索公告、新闻、披露事件与历史市场背景…</div>}
      {error && <div className="error-box">{error} <a href="/">返回研究首页</a></div>}
    </section>
  </main>;
}

function ResearchDashboard({ task, run, onRerun, onRunChange }: { task: ResearchTask; run: AgentRun; onRerun: () => void; onRunChange: (run: AgentRun) => void }) {
  const evidence = useMemo<EvidenceItem[]>(() => run.evidence?.length ? [...run.evidence].sort((left, right) => left.disclosedAt.localeCompare(right.disclosedAt)) : [], [run]);
  const timelineGroups = useMemo(() => run.timelineGroups?.length ? run.timelineGroups : buildTimelineGroups(evidence), [evidence, run.timelineGroups]);
  const canBuildTimeline = run.status === "待用户确认" && evidence.some((item) => item.sourceUrl && item.quote);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selectedMarketSeries, setSelectedMarketSeries] = useState<MarketSeries | undefined>();
  const [marketLoading, setMarketLoading] = useState(false);
  const eventName = run.eventName || canonicalEventName(task, evidence);
  const securities = securityLabels(task.companyQuery);
  const followId = followedEventId(task);

  useEffect(() => {
    setFollowing(readWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).some((item) => item.id === followId));
  }, [followId]);

  function toggleFollowing() {
    const next = !following;
    setFollowing(next);
    const current = readWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));
    const updated = next
      ? [{ id: followId, eventName, task, securities, followedAt: new Date().toISOString() } satisfies FollowedEvent, ...current.filter((item) => item.id !== followId)]
      : current.filter((item) => item.id !== followId);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(updated));
  }

  const selected = evidence.find((item) => item.id === selectedId) ?? evidence[0];
  const selectedGroup = timelineGroups.find((group) => selected && group.evidenceIds.includes(selected.id));
  const selectedGroupSources = selectedGroup ? evidence.filter((item) => selectedGroup.evidenceIds.includes(item.id)) : [];
  const state = run.proposal?.proposedState ?? "待人工核验";
  const conclusion = run.proposal?.suggestedConclusion || (evidence.length ? "已检索到候选材料，正在等待 Agent 归并与原文核验；当前不建立正式事件结论。" : "本次未检索到可展示材料，正式事件状态保持待人工核验。");

  useEffect(() => {
    const identity = run.marketSeries ?? marketIdentityForTask(task);
    if (!selected || !identity || (!identity.securityName && !identity.securityCode)) {
      setSelectedMarketSeries(undefined);
      return;
    }
    const controller = new AbortController();
    setMarketLoading(true);
    setSelectedMarketSeries(undefined);
    void fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ eventDate: selected.disclosedAt, cutoffDate: task.cutoffDate, securityName: identity.securityName, securityCode: identity.securityCode }),
    }).then(async (response) => {
      const data = (await response.json()) as { series?: MarketSeries };
      if (!controller.signal.aborted) setSelectedMarketSeries(data.series);
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setMarketLoading(false);
    });
    return () => controller.abort();
  }, [run.marketSeries, selected?.disclosedAt, selected?.id, task.cutoffDate]);

  return <main>
    <header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><a className="topbar-start" href="/">← 开始新研究</a></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header>
    <section className="hero"><div><p className="eyebrow">{canBuildTimeline ? "EVIDENCE-FIRST EVENT INTELLIGENCE" : "CANDIDATE EVENT RESEARCH"}</p><div className="event-title-row"><h1>{eventName}</h1><button className={`follow-button ${following ? "is-following" : ""}`} onClick={toggleFollowing}>{following ? "✓ 已关注" : "+ 关注"}</button></div><p className="subtitle">从首次可得披露回溯至 {task.cutoffDate} 的研究快照</p></div><div className="research-context"><div className="target-stack"><span>研究标的</span><div className="security-labels">{securities.map((security) => <b key={`${security.name}-${security.code ?? ""}`}><strong>{security.name}</strong>{security.code ? <small>{security.code}</small> : <em>代码待确认</em>}</b>)}</div></div><details className="hero-agent"><summary>Agent 运行 · {run.status} · {run.toolCalls.length} 项</summary><div className="hero-agent-content"><button className="primary-button" onClick={onRerun}>重新运行本次研究</button><AgentRunPanel run={run} task={task} /></div></details></div></section>
    <section className="dashboard">
      <aside className="left-column">
        <MarketChart series={selectedMarketSeries} selected={selected} loading={marketLoading} />
        <SelectedMarketReaction series={selectedMarketSeries} selected={selected} loading={marketLoading} />
      </aside>
      <section className="center-column panel">
        <div className="timeline-header"><div><div className="panel-label">{canBuildTimeline ? "证据时间线" : "候选研究时间线"}</div><h2>事件生命周期</h2><p className="timeline-guide">左侧看状态与节点行情；中间按阶段阅读具体进展；右侧核对选中材料与运行记录。</p></div><span>{timelineGroups.length} 个阶段 · {evidence.length} 条材料</span></div>
        <div className="timeline-toolbar"><span>点击阶段查看全部来源；出现“待原文核验”时，在右侧补充交易所或公司原文，再生成并确认核验结论。</span></div>
        <div className="legend"><span><i className="dot official" />交易所/公司公告</span><span><i className="dot ir" />投资者关系</span><span><i className="dot user" />媒体 / 待归并</span></div>
        <div className="timeline research-lifecycle">{timelineGroups.length ? timelineGroups.map((group) => { const representative = evidence.find((item) => item.id === group.representativeEvidenceId); if (!representative) return null; return <div className={`timeline-row ${selected?.id === representative.id ? "selected" : ""}`} key={group.id}><button className="timeline-item" onClick={() => { setSelectedId(representative.id); setReviewing(false); }}><div className="date"><b>{group.dateLabel}</b><span>{group.sourceCount} 个来源</span></div><i className={`line-dot ${representative.sourceTier === "交易所/公司公告" ? "official" : representative.sourceTier === "公司投资者关系" ? "ir" : "user"}`} /><div className="timeline-copy"><div><span className="kind-tag">{timelineStageLabel(group.stage)}</span>{requiresOriginalVerification(representative) && <span className="review-mini">待原文核验</span>}{representative.reviewOutcome && <span className="review-mini">{representative.reviewOutcome}</span>}</div><h3>{group.title}</h3><p>{group.summary}</p></div></button></div>; }) : <div className="timeline-empty">本次没有提取出同时匹配公司与事件关键词的材料。请补充公司代码、交易对手或更具体的事件名称后重新运行。</div>}</div>
      </section>
      <aside className="right-column">
        <article className="panel evidence-card"><div className="panel-heading"><span>{canBuildTimeline ? "证据详情" : "候选详情"}</span><span className={`source-tag ${selected?.sourceTier === "交易所/公司公告" ? "official" : "user"}`}>{selected?.sourceTier ?? "待核验"}</span></div>{selected ? <><h3>{selected.title}</h3>{selected.quote && <blockquote>“{selected.quote}”</blockquote>}<p>{selected.impact}</p><dl><div><dt>发生时间</dt><dd>{selected.occurredAt}</dd></div><div><dt>披露时间</dt><dd>{selected.disclosedAt}</dd></div><div><dt>抓取时间</dt><dd>{selected.capturedAt.slice(0, 10)}</dd></div><div><dt>更新时间</dt><dd>{selected.updatedAt.slice(0, 10)}</dd></div><div><dt>来源</dt><dd>{selected.publisher}</dd></div></dl><small className="source-reference">{selected.sourceLabel}</small>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">打开原文 ↗</a> : <span className="fine-print">当前材料暂无直达原文。</span>}{selectedGroupSources.length > 1 && <div className="stage-sources"><b>本阶段全部来源（{selectedGroupSources.length}）</b>{selectedGroupSources.map((source) => <div key={source.id}><span>{source.publisher} · {source.disclosedAt}</span>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">打开原文 ↗</a> : <em>待补原文</em>}</div>)}</div>}{requiresOriginalVerification(selected) && <button className="review-trigger" onClick={() => setReviewing((value) => !value)}>{reviewing ? "收起人工核验" : "人工核验这条材料 →"}</button>}</> : <p className="fine-print">选择时间线节点后查看材料详情。</p>}</article>
        <article className="panel conclusion-card"><div className="panel-label">当前事件状态</div><div className="state-row"><span className={`status-pill ${stateTone[state]}`}>{state}</span><span className="version">{canBuildTimeline ? "正式草案" : "候选研究"}</span></div><p>{conclusion}</p><div className="risk-callout"><strong>{canBuildTimeline ? "风险提示" : "候选时间线"}</strong><span>{canBuildTimeline ? "候选材料不等于正式结论；未直达原文或未识别交易对手时，系统不会升级事件状态。" : "下方先展示可读的候选时间线；只有带原文、短引和同一事件匹配的节点，才可升格为正式事实。"}</span></div></article>
        {reviewing && selected && <CandidateReviewPanel task={task} run={run} selected={selected} onRunChange={onRunChange} onClose={() => setReviewing(false)} />}
      </aside>
    </section>
  </main>;
}

function MarketChart({ series, selected, loading }: { series?: MarketSeries; selected?: EvidenceItem; loading: boolean }) {
  if (loading) return <article className="panel market-chart"><div className="panel-heading"><span>历史行情 · 节点窗口</span><small>正在更新</small></div><p className="fine-print">正在读取所选节点前后约 30 个交易日的 iFinD 日频行情…</p></article>;
  if (!series) return <article className="panel market-chart"><div className="panel-heading"><span>历史行情 · 节点窗口不可用</span><small>不展示</small></div><p className="fine-print">iFinD 未返回所选节点附近可核对的日频行情。系统不会用稀疏的长周期序列替代该节点的市场反应。</p></article>;
  const reaction = marketReactionForEvent(series, selected?.disclosedAt ?? "");
  const observedIndex = reaction ? series.points.findIndex((point) => point.date === reaction.observedDate) : -1;
  const windowStart = observedIndex >= 0 ? Math.max(0, Math.min(observedIndex - 30, series.points.length - 60)) : Math.max(0, series.points.length - 60);
  const points = series.points.slice(windowStart, windowStart + 60);
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 280},${92 - ((point.close - min) / range) * 76}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const change = ((last.close / first.close) - 1) * 100;
  const selectedIndex = reaction ? points.findIndex((point) => point.date === reaction.observedDate) : -1;
  const markerX = selectedIndex >= 0 ? (selectedIndex / Math.max(points.length - 1, 1)) * 280 : undefined;
  const markerY = selectedIndex >= 0 ? 92 - ((points[selectedIndex].close - min) / range) * 76 : undefined;
  const label = `${series.securityName ?? "证券"}${series.securityCode ? `（${series.securityCode}）` : "（代码待补）"}`;
  return <article className="panel market-chart"><div className="panel-heading"><span>{label} · 历史行情</span><small>{points.length} 个交易日</small></div><div className="chart-metric"><b>{last.close.toFixed(2)}</b><span className={change >= 0 ? "positive-move" : "negative-move"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></div><svg className="price-chart" viewBox="0 0 280 104" role="img" aria-label={`${label} 的 iFinD 历史收盘价折线图`}><line x1="0" y1="92" x2="280" y2="92" /><polyline points={coordinates} />{markerX !== undefined && markerY !== undefined && <><line className="event-marker" x1={markerX} y1="6" x2={markerX} y2="92" /><circle className="event-marker-dot" cx={markerX} cy={markerY} r="4" /></>}</svg><div className="chart-axis"><span>{first.date}</span><span>{last.date}</span></div>{reaction && selectedIndex >= 0 && <p className="chart-event-label">已标记：{reaction.observedDate}{reaction.observedDate !== reaction.eventDate ? `（对应 ${reaction.eventDate} 披露）` : ""}</p>}<p className="fine-print">本图只对应 {label}；收盘价仅用于事件研究窗口观察，不构成收益预测或因果证明。</p><small className="source-reference">{series.sourceLabel} · 抓取于 {series.capturedAt.slice(0, 10)}</small></article>;
}

function SelectedMarketReaction({ series, selected, loading }: { series?: MarketSeries; selected?: EvidenceItem; loading: boolean }) {
  if (loading) return <article className="panel selected-market-reaction"><div className="panel-heading"><span>所选节点 · 市场反应</span><small>节点窗口加载中</small></div></article>;
  const reaction = marketReactionForEvent(series, selected?.disclosedAt ?? "");
  if (!selected) return null;
  if (!reaction) return <article className="panel selected-market-reaction"><div className="panel-heading"><span>所选节点 · 市场反应</span><small>非因果验证</small></div><p className="fine-print">该节点不在当前行情窗口内，或 iFinD 未返回其后的可交易日，因此不生成涨跌数字。</p></article>;
  const tPlusOne = reaction.next ? returnFrom(reaction.point.close, reaction.next.close) : undefined;
  return <article className="panel selected-market-reaction"><div className="panel-heading"><span>所选节点 · 市场反应</span><small>非因果验证</small></div><p className="selected-market-title">{selected.title}</p><div className="selected-market-grid"><div><span>观察窗口</span><b>{reaction.observedDate === reaction.eventDate ? `T0 · ${reaction.observedDate}` : `首个交易日 · ${reaction.observedDate}`}</b></div><div><span>T0 当日涨跌</span><b className={(reaction.point.changePct ?? 0) >= 0 ? "positive-move" : "negative-move"}>{reaction.point.changePct === undefined ? "待补充" : `${reaction.point.changePct >= 0 ? "+" : ""}${reaction.point.changePct.toFixed(2)}%`}</b></div><div><span>T0 收盘价</span><b>{reaction.point.close.toFixed(2)}</b></div><div><span>T+1 相对 T0</span><b className={tPlusOne === undefined || tPlusOne >= 0 ? "positive-move" : "negative-move"}>{tPlusOne === undefined ? "待补充" : `${tPlusOne >= 0 ? "+" : ""}${tPlusOne.toFixed(2)}%`}</b></div></div><p className="fine-print">{reaction.observedDate === reaction.eventDate ? "按披露日对应交易日观察。" : `披露日 ${reaction.eventDate} 非交易日或无有效行情，已顺延至 ${reaction.observedDate}。`} 该观察不证明事件是价格变动的唯一原因。</p></article>;
}

function CandidateReviewPanel({ task, run, selected, onRunChange, onClose }: { task: ResearchTask; run: AgentRun; selected: EvidenceItem; onRunChange: (run: AgentRun) => void; onClose: () => void }) {
  const [material, setMaterial] = useState<ImportedMaterial>({ title: selected.title, publisher: selected.publisher, sourceUrl: selected.sourceUrl, disclosedAt: selected.disclosedAt, body: selected.quote || selected.summary });
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCandidate, setSavedCandidate] = useState(false);
  const formalSource = isFormalSource(material);
  const proposedState = proposal ? nextState("待人工核验", proposal, material) : "待人工核验";
  const canPromote = Boolean(proposal && proposedState !== "待人工核验");
  const promotionReason = !proposal ? "请先生成核验草案。"
    : proposal.eventMatch !== "同一事件" ? "模型未能确认它属于当前事件。"
      : proposal.contentKind !== "事实" ? `模型将材料识别为“${proposal.contentKind}”，而非可升格的事实材料。`
        : proposal.requiresReview ? "模型要求人工复核，不能直接升格。"
          : !["交易所/公司公告", "公司投资者关系"].includes(sourceTierFromPublisher(material.publisher, material.sourceUrl)) ? "来源不是交易所/公司公告或公司投资者关系页面。"
            : "材料缺少可用短引或关键事实字段。";

  async function analyze() {
    setLoading(true); setError(null); setProposal(null);
    try {
      const result = await requestAnalysis(material, task);
      setProposal(result); setSavedCandidate(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "材料核验失败");
    } finally { setLoading(false); }
  }

  function confirm() {
    if (!proposal) return;
    const state = nextState("待人工核验", proposal, material);
    if (state === "待人工核验") { setError("材料尚未满足正式事件的来源、原文短引或同一事件匹配规则；已保留在候选时间线。 "); return; }
    const verified = evidenceFromImport(material, proposal, state);
    const evidence = [...(run.evidence ?? []).filter((item) => item.id !== selected.id), verified];
    onRunChange({ ...run, id: `${run.id}-verified`, status: "待用户确认", proposal, stopReason: "已核验一条可追溯材料；候选时间线保留，正式状态等待用户确认。", evidence, timelineGroups: buildTimelineGroups(evidence) });
    onClose();
  }

  function saveCandidateReview() {
    if (!proposal && formalSource) return;
    const reviewed: EvidenceItem = {
      ...selected,
      contentKind: proposal?.contentKind ?? selected.contentKind,
      quote: proposal?.quote || selected.quote,
      summary: proposal?.claim || selected.summary,
      impact: proposal?.rationale || selected.impact,
      reviewOutcome: "待人工核验",
    };
    const evidence = (run.evidence ?? []).map((item) => item.id === selected.id ? reviewed : item);
    onRunChange({ ...run, proposal: proposal ?? run.proposal, stopReason: formalSource ? "已保存单条证据质检结果；该材料仍未满足正式证据的升格条件。" : "已保留媒体线索为候选材料；它不会改变正式事件状态。", evidence, timelineGroups: buildTimelineGroups(evidence) });
    setSavedCandidate(true);
  }

  return <article className="panel review-card"><div className="panel-heading"><span>检查候选材料</span><button className="text-button" onClick={onClose}>关闭</button></div><p className="form-note">证据质检不是判断文章真假：它只检查材料是否属于同一事件、是否为事实，以及来源是否足以改变正式事件状态。</p><div className="review-form"><label>标题<input value={material.title} onChange={(event) => setMaterial({ ...material, title: event.target.value })} /></label><label>发布者<input value={material.publisher} onChange={(event) => setMaterial({ ...material, publisher: event.target.value })} /></label><label>披露日期<input type="date" value={material.disclosedAt} onChange={(event) => setMaterial({ ...material, disclosedAt: event.target.value })} /></label><label>权威原文 URL<input value={material.sourceUrl} onChange={(event) => setMaterial({ ...material, sourceUrl: event.target.value })} placeholder="https://" /></label><label>原文正文 / 关键段落<textarea rows={5} value={material.body} onChange={(event) => setMaterial({ ...material, body: event.target.value })} /></label></div>{!formalSource && <div className="promotion-blocker"><b>当前是媒体/线索来源</b><span>可保留为候选以便追溯，但不能升格为正式证据；请补充交易所或公司投资者关系原文。此操作不会调用模型。</span></div>}{error && <div className="error-box">{error}</div>}{formalSource ? <button className="primary-button" onClick={() => void analyze()} disabled={loading}>{loading ? "Agent 正在生成草案…" : "生成证据质检草案"}</button> : <button className="confirm-button candidate-save" onClick={saveCandidateReview}>{savedCandidate ? "已保留为候选线索" : "保留为候选线索"}</button>}{savedCandidate && <p className="candidate-saved-note">已写回候选时间线，节点将标记为“待人工核验”；不会改变正式事件状态，也不会再次调用模型。</p>}{proposal && <div className="review-proposal"><div className="proposal-metrics"><span>事件匹配：<b>{proposal.eventMatch}</b></span><span>材料属性：<b>{proposal.contentKind}</b></span><span>置信：<b>{proposal.confidence}</b></span></div><p><b>拟议结论（模型草案）：</b>{proposal.suggestedConclusion}</p><blockquote>“{proposal.quote}”</blockquote><p className="form-note">{proposal.rationale}</p>{canPromote ? <button className="confirm-button" onClick={confirm}>确认并升格为正式证据</button> : <><div className="promotion-blocker"><b>暂不能升格</b><span>{promotionReason}</span></div><button className="confirm-button candidate-save" onClick={saveCandidateReview}>{savedCandidate ? "已保存为已质检候选" : "保存为已质检候选"}</button></>}</div>}</article>;
}

function CandidateResearchInbox({ task, run, onRerun, onRunChange }: { task: ResearchTask; run: AgentRun; onRerun: () => void; onRunChange: (run: AgentRun) => void }) {
  const [material, setMaterial] = useState<ImportedMaterial>(blankMaterial);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const candidates = run.evidence?.map((item) => ({
    title: item.title,
    source: item.publisher,
    sourceUrl: item.sourceUrl,
    excerpt: item.summary || item.quote,
    capturedAt: item.capturedAt.slice(0, 10),
    hasSource: Boolean(item.sourceUrl),
  })) ?? [];

  async function analyzeMaterial() {
    setReviewError(null);
    setProposal(null);
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...material, task }) });
      const data = (await response.json()) as { proposal?: AgentProposal; error?: string };
      if (!response.ok || !data.proposal) throw new Error(data.error || "无法生成核验草案");
      setProposal(data.proposal);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "材料核验失败");
    } finally {
      setLoading(false);
    }
  }

  function confirmProposal() {
    if (!proposal) return;
    const state = nextState("待人工核验", proposal, material);
    if (state === "待人工核验") {
      setReviewError("这条材料仍缺少足够权威的来源或无法确认属于同一事件；已保留为候选，不能建立正式事件。");
      return;
    }
    const item = evidenceFromImport(material, proposal, state);
    onRunChange({ ...run, id: `${run.id}-confirmed`, status: "待用户确认", stopReason: "人工已核验并确认首条权威证据，已建立正式事件工作台。", proposal, evidence: [item], timelineGroups: buildTimelineGroups([item]) });
  }

  return <main>
    <header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><a className="topbar-start" href="/">← 修改研究任务</a></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header>
    <section className="hero"><div><p className="eyebrow">RESEARCH INBOX · NOT A FORMAL EVENT</p><h1>{task.companyQuery}</h1><p className="subtitle">{task.eventQuery} · 截至 {task.cutoffDate} 的候选材料收件箱</p></div><div className="watchlist"><span>研究标的</span><b>{task.companyQuery}</b></div></section>
    <section className="inbox-layout">
      <aside className="left-column"><article className="panel conclusion-card"><div className="panel-label">尚未建立正式事件</div><div className="state-row"><span className="status-pill tone-amber">待人工核验</span><span className="version">候选池</span></div><p>Agent 找到的是可能相关的材料，不等于已识别出“同一投资事件”。在交易对手、原文链接或时间字段不完整时，系统不会伪造一条时间线。</p><div className="risk-callout"><strong>为什么没有时间线？</strong><span>当前材料不足以安全归并，也不能判断其是事实、观点、推测或传闻。</span></div></article><article className="panel market-card"><div className="panel-heading"><span>检索覆盖</span><small>非因果验证</small></div><div className="market-grid"><div><span>工具调用</span><b>{run.toolCalls.length} 次</b></div><div><span>候选片段</span><b>{candidates.length} 条</b></div><div><span>历史截点</span><b>{task.cutoffDate}</b></div></div><p className="fine-print">MCP 的返回先进入候选池；只有来源和事件归并通过后，才会成为可追溯证据。</p></article></aside>
      <section className="panel inbox-panel"><div className="timeline-header"><div><div className="panel-label">候选材料收件箱</div><h2>先核验，再建立时间线</h2></div><span>{candidates.length} 条待处理材料</span></div><p className="inbox-intro">这里展示 Agent 实际拿到的检索线索，但它们尚未获得“正式证据”资格。</p>{candidates.length ? <div className="candidate-list">{candidates.map((candidate, index) => <article className="candidate-card" key={`${candidate.title}-${index}`}><div><span className="candidate-index">候选 {String(index + 1).padStart(2, "0")}</span><span className={`candidate-status ${candidate.hasSource ? "has-source" : ""}`}>{candidate.hasSource ? "待事件归并" : "缺原文链接"}</span></div><h3>{candidate.title}</h3><p>{candidate.excerpt}</p><small>{candidate.source} · 抓取于 {candidate.capturedAt}</small><button className="candidate-use" onClick={() => { setMaterial({ title: candidate.title, publisher: candidate.source, sourceUrl: candidate.sourceUrl, disclosedAt: candidate.capturedAt, body: candidate.excerpt }); setProposal(null); setReviewError(null); }}>用此候选补充原文 →</button></article>)}</div> : <div className="timeline-empty">本次 MCP 未返回可展示的候选材料。请补充公司代码、交易对手或更具体的事件名称后重试。</div>}</section>
      <aside className="right-column"><article className="panel review-card"><div className="panel-heading"><span>人工核验</span><small>建立正式事件前</small></div><p className="form-note">先打开权威公告，补齐原文 URL 和正文；Agent 只生成草案，最后由你确认。</p><div className="review-form"><label>标题<input value={material.title} onChange={(event) => setMaterial({ ...material, title: event.target.value })} placeholder="公告标题" /></label><label>发布者<input value={material.publisher} onChange={(event) => setMaterial({ ...material, publisher: event.target.value })} placeholder="例如：交易所 / 上市公司" /></label><label>披露日期<input type="date" value={material.disclosedAt} onChange={(event) => setMaterial({ ...material, disclosedAt: event.target.value })} /></label><label>权威原文 URL<input value={material.sourceUrl} onChange={(event) => setMaterial({ ...material, sourceUrl: event.target.value })} placeholder="https://" /></label><label>原文正文 / 关键段落<textarea rows={6} value={material.body} onChange={(event) => setMaterial({ ...material, body: event.target.value })} placeholder="粘贴至少一段能支持事件结论的原文…" /></label></div>{reviewError && <div className="error-box">{reviewError}</div>}<button className="primary-button" onClick={() => void analyzeMaterial()} disabled={loading}>{loading ? "Agent 正在核验…" : "让 Agent 生成核验草案"}</button>{proposal && <div className="review-proposal"><div className="proposal-metrics"><span>匹配：<b>{proposal.eventMatch}</b></span><span>置信：<b>{proposal.confidence}</b></span></div><p><b>拟议结论：</b>{proposal.suggestedConclusion}</p><blockquote>“{proposal.quote}”</blockquote><p className="form-note">{proposal.rationale}</p><button className="confirm-button" onClick={confirmProposal}>确认并建立正式事件</button></div>}</article><article className="panel monitor-card"><div className="panel-heading"><span>Agent 本次判断</span><small>已停止</small></div><p className="form-note">{run.stopReason}</p><div className="inbox-next"><b>下一步建议</b><span>补充交易对手、标的名称或公告编号后重新检索；取得可直达原文后，再由 Agent 归并为正式事件。</span></div><button className="primary-button" onClick={onRerun}>补充线索后重新运行</button><AgentRunPanel run={run} task={task} /></article></aside>
    </section>
  </main>;
}

function ResearchLoading() {
  return <main><header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header><section className="execution-section result-content"><div className="research-loading panel"><span className="live-dot" />正在载入研究任务…</div></section></main>;
}

const toolNames: Record<AgentRun["toolCalls"][number]["tool"], string> = {
  search_event_notices: "公告检索",
  search_related_news: "新闻检索",
  get_disclosed_event_context: "披露事件检索",
  get_historical_market_context: "市场背景检索",
};

function runStatusExplanation(status: AgentRun["status"]) {
  if (status === "待用户确认") return "证据与事件归并已通过 Agent 草案检查；仍需你确认，才会建立或更新正式事件。";
  if (status === "无状态变化") return "已完成有限检索，但没有发现足以改变当前正式结论的新事实。";
  if (status === "待人工核验") return "材料缺少可直达原文、同一事件匹配不足、存在冲突，或 Agent 主动要求复核。";
  if (status === "失败") return "工具规划或外部数据调用失败；系统不会根据不完整结果生成结论。";
  return "Agent 正在执行受限检索。";
}

function AgentRunPanel({ run, task }: { run: AgentRun; task: ResearchTask }) {
  return <div className="run-card execution-card">
    <div className="execution-flow"><span>任务</span><i>→</i><span>检索计划</span><i>→</i><span>MCP 工具</span><i>→</i><span>证据草案</span><i>→</i><span>人工确认</span></div>
    <div><span className={`status-mini ${run.status === "失败" ? "tone-red" : run.status === "待用户确认" ? "tone-violet" : "tone-amber"}`}>{run.status}</span><small>{run.toolCalls.length} 次工具调用 · 截点 {task.cutoffDate}</small></div>
    <div className="agent-state-explainer"><b>当前状态为何是这样？</b><span>{runStatusExplanation(run.status)}</span><small>硬规则：最多 4 次调用；同一工具不可重复；无原文、非同一事件、非事实材料或要求复核的草案，均不能直接建立正式结论。</small></div>
    <p>{run.stopReason}</p>
    {run.toolCalls.map((trace, index) => <div className="run-trace" key={`${run.id}-${trace.tool}`}><b>{index + 1}. {trace.status === "完成" ? "✓" : "!"} {toolNames[trace.tool]}</b><span>{trace.source} · {trace.summary}</span></div>)}
    {run.proposal && <div className="run-proposal"><b>Agent 草案</b><span>{run.proposal.suggestedConclusion}</span>{run.proposal.conflict && <small>冲突：{run.proposal.conflict}</small>}</div>}
  </div>;
}
