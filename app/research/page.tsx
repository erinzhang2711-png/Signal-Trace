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
  return <Suspense fallback={<ResearchLoading />}>\n+    <ResearchWorkspace />\n+  </Suspense>;
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
      {run && <><div className="section-title"><p className="eyebrow">AGENT EXECUTION TRACE</p><h2>从任务到证据，而不是从回答到结论</h2></div><AgentRunPanel run={run} task={task} /><ResearchTimeline task={task} evidence={run.evidence ?? []} /><div className="next-step"><b>下一步</b><span>候选证据中没有直达原文的材料只能停留在待核验层；补齐权威 URL/正文后才能建立正式结论。</span></div><button className="return-button" onClick={() => void runResearch()}>重新运行本次研究</button></>}
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

function ResearchTimeline({ task, evidence }: { task: ResearchTask; evidence: EvidenceItem[] }) {
  const ordered = [...evidence].sort((left, right) => left.disclosedAt.localeCompare(right.disclosedAt));
  return <section className="research-timeline panel">
    <div className="timeline-header"><div><div className="panel-label">候选证据时间线</div><h2>{task.companyQuery} · {task.eventQuery}</h2></div><span>{ordered.length} 条从 MCP 提取的候选证据</span></div>
    {ordered.length === 0 ? <div className="timeline-empty">本次 MCP 返回没有可安全结构化的同一事件证据节点。请在事件关键词中补充交易对手、标的或事件名称，例如“收购 ××公司”，再重试。</div> : <div className="research-timeline-list">{ordered.map((item) => <article className="research-timeline-item" key={item.id}>
      <div className="research-date"><b>{item.disclosedAt}</b><span>{item.sourceTier}</span></div>
      <div className="research-timeline-copy"><div><span className="kind-tag">{item.contentKind}</span>{item.statusEffect && <span className={`status-mini ${stateTone[item.statusEffect]}`}>{item.statusEffect}</span>}</div><h3>{item.title}</h3><p>{item.summary || "该条材料仅保留了标题与原文片段。"}</p>{item.quote && <blockquote>“{item.quote}”</blockquote>}<small>{item.publisher} · {item.sourceLabel || "待补原文链接"}</small>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">打开原始来源 ↗</a> : <em>未提供可直达原文，不能写入正式结论</em>}</div>
    </article>)}</div>}
  </section>;
}
