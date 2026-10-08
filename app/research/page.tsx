"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { evidenceFromImport, nextState } from "@/lib/evidence";
import type { AgentProposal, AgentRun, EvidenceItem, EventState, ImportedMaterial, ResearchTask } from "@/lib/types";

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
  }, [task, validTask]);

  useEffect(() => {
    if (startedTask.current === taskKey) return;
    startedTask.current = taskKey;
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
  }, [runResearch, storageKey, taskKey]);

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
  const canBuildTimeline = run.status === "待用户确认" && evidence.some((item) => item.sourceUrl && item.quote);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!canBuildTimeline) return <CandidateResearchInbox task={task} run={run} onRerun={onRerun} onRunChange={onRunChange} />;

  const selected = evidence.find((item) => item.id === selectedId) ?? evidence[0];
  const state = run.proposal?.proposedState ?? "待人工核验";
  const conclusion = run.proposal?.suggestedConclusion || (evidence.length ? "已检索到候选材料，正在等待 Agent 归并与原文核验；当前不建立正式事件结论。" : "本次未检索到可展示材料，正式事件状态保持待人工核验。");

  return <main>
    <header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div><a className="topbar-start" href="/">← 开始新研究</a></div><div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div></header>
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

function CandidateResearchInbox({ task, run, onRerun, onRunChange }: { task: ResearchTask; run: AgentRun; onRerun: () => void; onRunChange: (run: AgentRun) => void }) {
  const [material, setMaterial] = useState<ImportedMaterial>(blankMaterial);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const candidates = run.evidence?.length ? run.evidence.map((item) => ({
    title: item.title,
    source: item.publisher,
    sourceUrl: item.sourceUrl,
    excerpt: item.summary || item.quote,
    capturedAt: item.capturedAt.slice(0, 10),
    hasSource: Boolean(item.sourceUrl),
  })) : run.toolCalls.filter((trace) => trace.status === "完成" && trace.excerpt).map((trace) => ({
    title: `${trace.source} 返回的检索片段`,
    source: trace.source,
    sourceUrl: "",
    excerpt: trace.excerpt ?? trace.summary,
    capturedAt: trace.capturedAt.slice(0, 10),
    hasSource: false,
  }));

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
    onRunChange({ ...run, id: `${run.id}-confirmed`, status: "待用户确认", stopReason: "人工已核验并确认首条权威证据，已建立正式事件工作台。", proposal, evidence: [item] });
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
