"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { AgentRun, EvidenceItem, EventState, ResearchTask } from "@/lib/types";

const stateTone: Record<EventState, string> = {
  "筹划中": "tone-amber",
  "预案披露": "tone-blue",
  "持续推进": "tone-violet",
  "待人工核验": "tone-amber",
  "已否认": "tone-red",
  "已完成": "tone-green",
};

export default function ResearchPage() {
  return (
    <Suspense fallback={<ResearchLoading />}>
      <ResearchWorkspace />
    </Suspense>
  );
}

function ResearchWorkspace() {
  const router = useRouter();
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
  const validTask = Boolean(task.companyQuery && task.eventQuery && /^\d{4}-\d{2}-\d{2}$/.test(task.cutoffDate));

  const runResearch = useCallback(async () => {
    if (!validTask) {
      setError("研究任务不完整，请返回首页重新填写公司、事件关键词和历史截点。");
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
      if (!response.ok || !data.run) throw new Error(data.error || "Agent 监测没有返回运行记录");
      setRun(data.run);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent 监测失败");
    } finally {
      setLoading(false);
    }
  }, [task, validTask]);

  useEffect(() => {
    if (startedTask.current === taskKey) return;
    startedTask.current = taskKey;
    void runResearch();
  }, [runResearch, taskKey]);

  if (run) return <ResearchDashboard task={task} run={run} onBack={() => router.push("/")} onRerun={() => void runResearch()} />;

  return <main>
    <header className="topbar">
      <div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><button className="topbar-start" onClick={() => router.push("/")}>← 修改研究任务</button></div>
      <div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div>
    </header>
    <section className="result-hero">
      <p className="eyebrow">EVENT RESEARCH WORKSPACE</p>
      <h1>{task.companyQuery || "未命名研究"}</h1>
      <p>{task.eventQuery || "未提供事件关键词"} <span className="divider" /> 历史截点 {task.cutoffDate || "未提供"}</p>
    </section>
    <section className="execution-section result-content">
      {loading && <div className="research-loading panel"><span className="live-dot" />Agent 正在调用 iFinD MCP 检索公告、新闻、披露事件与历史市场背景…</div>}
      {error && <div className="error-box">{error}</div>}
    </section>
  </main>;
}

function ResearchDashboard({ task, run, onBack, onRerun }: { task: ResearchTask; run: AgentRun; onBack: () => void; onRerun: () => void }) {
  const evidence = useMemo<EvidenceItem[]>(() => {
    if (run.evidence?.length) return [...run.evidence].sort((left, right) => left.disclosedAt.localeCompare(right.disclosedAt));
    return run.toolCalls.filter((trace) => trace.status === "完成" && trace.excerpt).map((trace, index) => ({
      id: `raw-${trace.tool}-${index}`,
      title: `${trace.source} 返回的待归并材料`,
      publisher: trace.source,
      sourceUrl: "",
      sourceLabel: "MCP 原始检索片段 · 待补原文链接",
      sourceTier: "媒体报道" as const,
      contentKind: "事实" as const,
      occurredAt: trace.capturedAt.slice(0, 10),
      disclosedAt: trace.capturedAt.slice(0, 10),
      capturedAt: trace.capturedAt,
      updatedAt: trace.capturedAt,
      quote: "",
      summary: trace.excerpt ?? trace.summary,
      impact: "工具已返回材料，但 Agent 尚未归并为同一事件证据；不会改变正式结论。",
      statusEffect: "待人工核验" as const,
    }));
  }, [run]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = evidence.find((item) => item.id === selectedId) ?? evidence[0];
  const state = run.proposal?.proposedState ?? "待人工核验";
  const conclusion = run.proposal?.suggestedConclusion || (evidence.length ? "已检索到候选材料，正在等待 Agent 归并与原文核验；当前不建立正式事件结论。" : "本次未检索到可展示材料，正式事件状态保持待人工核验。");

  return <main>
    <header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><button className="topbar-start" onClick={onBack}>← 开始新研究</button></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header>
    <section className="hero"><div><p className="eyebrow">EVIDENCE-FIRST EVENT INTELLIGENCE</p><h1>{task.companyQuery}</h1><p className="subtitle">{task.eventQuery} · 截至 {task.cutoffDate} 的可追溯研究快照</p></div><div className="watchlist"><span>研究标的</span><b>{task.companyQuery}</b></div></section>
    <section className="dashboard">
      <aside className="left-column">
        <article className="panel conclusion-card"><div className="panel-label">当前事件状态</div><div className="state-row"><span className={`status-pill ${stateTone[state]}`}>{state}</span><span className="version">本次运行</span></div><p>{conclusion}</p><div className="risk-callout"><strong>风险提示</strong><span>候选材料不等于正式结论；未直达原文或未识别交易对手时，系统不会升级事件状态。</span></div></article>
        <article className="panel market-card"><div className="panel-heading"><span>检索覆盖</span><small>非因果验证</small></div><div className="market-grid"><div><span>工具调用</span><b>{run.toolCalls.length} 次</b></div><div><span>候选材料</span><b>{evidence.length} 条</b></div><div><span>数据口径</span><b>历史快照</b></div></div><p className="fine-print">公告、新闻、披露事件与市场背景由 MCP 查询；市场数据仅作上下文，不输出涨跌预测或买卖建议。</p></article>
        <article className="panel version-card"><div className="panel-heading"><span>结论演化</span><small>1 个版本</small></div><ol className="versions"><li><i className={stateTone[state]} /><div><b>{state}</b><span>{task.cutoffDate}</span><p>{run.stopReason}</p></div></li></ol></article>
      </aside>
      <section className="center-column panel"><div className="timeline-header"><div><div className="panel-label">证据时间线</div><h2>同一事件，不同可信度</h2></div><span>{evidence.length} 条候选材料</span></div><div className="legend"><span><i className="dot official" />交易所/公司公告</span><span><i className="dot ir" />投资者关系</span><span><i className="dot user" />待归并材料</span></div><div className="timeline">{evidence.length ? evidence.map((item) => <button className={`timeline-item ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><div className="date"><b>{item.disclosedAt}</b><span>{item.sourceTier}</span></div><i className={`line-dot ${item.sourceTier === "交易所/公司公告" ? "official" : item.sourceTier === "公司投资者关系" ? "ir" : "user"}`} /><div className="timeline-copy"><div><span className="kind-tag">{item.contentKind}</span>{item.statusEffect && <span className={`status-mini ${stateTone[item.statusEffect]}`}>{item.statusEffect}</span>}</div><h3>{item.title}</h3><p>{item.summary}</p><small>{item.publisher}</small></div></button>) : <div className="timeline-empty">本次没有检索到可展示材料。请补充公司代码、交易对手或更具体的事件名称后重新运行。</div>}</div></section>
      <aside className="right-column">
        <article className="panel evidence-card"><div className="panel-heading"><span>证据详情</span><span className={`source-tag ${selected?.sourceTier === "交易所/公司公告" ? "official" : "user"}`}>{selected?.sourceTier ?? "待核验"}</span></div>{selected ? <><h3>{selected.title}</h3>{selected.quote && <blockquote>“{selected.quote}”</blockquote>}<p>{selected.impact}</p><dl><div><dt>披露 / 抓取</dt><dd>{selected.disclosedAt}</dd></div><div><dt>来源</dt><dd>{selected.publisher}</dd></div></dl><small className="source-reference">{selected.sourceLabel}</small>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">打开公告原文 ↗</a> : <span className="fine-print">暂无直达原文，保留为待归并材料。</span>}</> : <p className="fine-print">选择时间线节点后查看材料详情。</p>}</article>
        <article className="panel monitor-card"><div className="panel-heading"><span>Agent 监测运行</span><small>最多 4 次工具调用</small></div><p className="form-note">Agent 负责规划检索、比较材料与生成草案；规则层阻止无来源材料直接改写结论。</p><button className="primary-button" onClick={onRerun}>重新运行本次研究</button><AgentRunPanel run={run} task={task} /></article>
      </aside>
    </section>
  </main>;
}

function ResearchLoading() {
  return <main><header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header><section className="execution-section result-content"><div className="research-loading panel"><span className="live-dot" />正在载入研究任务…</div></section></main>;
}

function AgentRunPanel({ run, task }: { run: AgentRun; task: ResearchTask }) {
  return <div className="run-card execution-card">
    <div className="execution-flow"><span>任务</span><i>→</i><span>检索计划</span><i>→</i><span>MCP 工具</span><i>→</i><span>证据草案</span><i>→</i><span>人工确认</span></div>
    <div><span className={`status-mini ${run.status === "失败" ? "tone-red" : run.status === "待用户确认" ? "tone-violet" : "tone-amber"}`}>{run.status}</span><small>{run.toolCalls.length} 次工具调用 · 截点 {task.cutoffDate}</small></div>
    <p>{run.stopReason}</p>
    {run.toolCalls.map((trace, index) => <div className="run-trace" key={`${run.id}-${trace.tool}`}><b>{index + 1}. {trace.status === "完成" ? "✓" : "!"} {trace.tool}</b><span>{trace.source} · {trace.summary}</span></div>)}
    {run.proposal && <div className="run-proposal"><b>Agent 草案</b><span>{run.proposal.suggestedConclusion}</span>{run.proposal.conflict && <small>冲突：{run.proposal.conflict}</small>}</div>}
  </div>;
}
