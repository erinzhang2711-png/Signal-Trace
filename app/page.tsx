"use client";

import { useEffect, useMemo, useState } from "react";
import { evidenceFromImport, nextState } from "@/lib/evidence";
import { EVENT_META, SEED_EVIDENCE, SEED_VERSIONS } from "@/lib/seed-data";
import type { AgentProposal, AgentRun, EvidenceItem, EventState, EventVersion, ImportedMaterial } from "@/lib/types";

const STORAGE_KEY = "signaltrace-hygon-sugon-v1";

const stateTone: Record<EventState, string> = {
  "筹划中": "tone-amber",
  "预案披露": "tone-blue",
  "持续推进": "tone-violet",
  "待人工核验": "tone-amber",
  "已否认": "tone-red",
  "已完成": "tone-green",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function blankMaterial(): ImportedMaterial {
  return { title: "", publisher: "", sourceUrl: "", disclosedAt: "2025-09-06", body: "" };
}

export default function Home() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>(SEED_EVIDENCE);
  const [versions, setVersions] = useState<EventVersion[]>(SEED_VERSIONS);
  const [material, setMaterial] = useState<ImportedMaterial>(blankMaterial);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [selected, setSelected] = useState<EvidenceItem>(SEED_EVIDENCE[SEED_EVIDENCE.length - 1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [monitoring, setMonitoring] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const parsed = JSON.parse(saved) as { evidence: EvidenceItem[]; versions: EventVersion[]; agentRuns?: AgentRun[] };
        setEvidence(parsed.evidence);
        setVersions(parsed.versions);
        setAgentRuns(parsed.agentRuns ?? []);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (evidence.length === SEED_EVIDENCE.length && versions.length === SEED_VERSIONS.length) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ evidence, versions, agentRuns: agentRuns.slice(0, 5) }));
  }, [agentRuns, evidence, versions]);

  const current = versions[versions.length - 1];
  const timeline = useMemo(() => [...evidence].sort((a, b) => a.disclosedAt.localeCompare(b.disclosedAt)), [evidence]);

  async function analyze() {
    setError(null);
    setProposal(null);
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(material),
      });
      const data = (await response.json()) as { proposal?: AgentProposal; error?: string };
      if (!response.ok || !data.proposal) throw new Error(data.error || "无法生成更新提议");
      setProposal(data.proposal);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 分析失败");
    } finally {
      setLoading(false);
    }
  }

  async function monitor() {
    setError(null);
    setMonitoring(true);
    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentState: current.state, currentConclusion: current.conclusion }),
      });
      const data = (await response.json()) as { run?: AgentRun; error?: string };
      if (!data.run) throw new Error(data.error || "监测没有返回运行记录");
      setAgentRuns((runs) => [data.run!, ...runs].slice(0, 5));
      setNotice(data.run.status === "待用户确认" ? "Agent 已完成 iFinD 数据核查并生成草案；仍需补齐可直达原文后才能写入正式时间线。" : `本次监测已停止：${data.run.stopReason}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent 监测失败");
    } finally {
      setMonitoring(false);
    }
  }

  function acceptProposal() {
    if (!proposal) return;
    const state = nextState(current.state, proposal, material);
    const item = evidenceFromImport(material, proposal, state);
    const version: EventVersion = {
      id: `v-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state,
      conclusion: state === "待人工核验" ? current.conclusion : proposal.suggestedConclusion,
      changeReason: state === "待人工核验" ? "材料证据不足或来源等级不足，已进入人工核验队列。" : proposal.rationale,
      evidenceIds: [item.id],
    };
    setEvidence((items) => [...items, item]);
    setVersions((items) => [...items, version]);
    setSelected(item);
    setNotice(state === "待人工核验" ? "已加入待人工核验队列，正式结论未改变。" : "已确认更新，事件时间线与当前结论已生成新版本。");
    setProposal(null);
    setMaterial(blankMaterial());
  }

  function useDemoMaterial() {
    setMaterial({
      title: "市场消息：相关交易已完成",
      publisher: "",
      sourceUrl: "",
      disclosedAt: "2025-09-07",
      body: "市场流传消息称海光信息与中科曙光的交易已经完成，预计将直接提升相关公司收益。该消息未附公司公告、交易所链接或原始文件。",
    });
    setNotice("已填入无来源传闻示例：用于演示 Agent 不会把未经证实的信息写入正式结论。");
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div>
        <div className="topbar-meta"><span className="live-dot" /> 历史快照 · 2025.09.06 <span className="divider" /> 不构成投资建议</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">EVIDENCE-FIRST EVENT INTELLIGENCE</p>
          <h1>{EVENT_META.title}</h1>
          <p className="subtitle">把每一次结论变化，带回原始证据。</p>
        </div>
        <div className="watchlist"><span>关注标的</span>{EVENT_META.watchlist.map((item) => <b key={item}>{item}</b>)}</div>
      </section>

      {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice(null)}>关闭</button></div>}

      <section className="dashboard">
        <aside className="left-column">
          <article className="panel conclusion-card">
            <div className="panel-label">当前事件状态</div>
            <div className="state-row"><span className={`status-pill ${stateTone[current.state]}`}>{current.state}</span><span className="version">版本 {versions.length}</span></div>
            <p>{current.conclusion}</p>
            <div className="risk-callout"><strong>风险提示</strong><span>该事项仍存在审批、审核与时间不确定性；系统不输出买卖建议或确定性预测。</span></div>
          </article>

          <article className="panel market-card">
            <div className="panel-heading"><span>市场反应</span><small>非因果验证</small></div>
            <div className="market-grid">
              <div><span>观察窗口</span><b>05.23 — 06.10</b></div>
              <div><span>交易状态</span><b>停牌 / 复牌</b></div>
              <div><span>数据口径</span><b>历史快照</b></div>
            </div>
            <p className="fine-print">首版仅展示事件窗口与交易状态。价格、成交额等字段需接入扶摇/iFinD 后按来源、时点与单位补全；缺失时不生成数值结论。</p>
          </article>

          <article className="panel version-card">
            <div className="panel-heading"><span>结论演化</span><small>{versions.length} 个版本</small></div>
            <ol className="versions">{versions.map((version) => <li key={version.id}><i className={stateTone[version.state]} /><div><b>{version.state}</b><span>{formatDate(version.createdAt)}</span><p>{version.changeReason}</p></div></li>)}</ol>
          </article>
        </aside>

        <section className="center-column panel">
          <div className="timeline-header"><div><div className="panel-label">证据时间线</div><h2>同一事件，不同可信度</h2></div><span>{timeline.length} 条可追溯材料</span></div>
          <div className="legend"><span><i className="dot official" />交易所/公司公告</span><span><i className="dot ir" />投资者关系</span><span><i className="dot user" />用户导入</span></div>
          <div className="timeline">{timeline.map((item) => <button className={`timeline-item ${selected.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item)}>
            <div className="date"><b>{formatDate(item.disclosedAt)}</b><span>披露</span></div><i className={`line-dot ${item.sourceTier === "交易所/公司公告" ? "official" : item.sourceTier === "公司投资者关系" ? "ir" : "user"}`} />
            <div className="timeline-copy"><div><span className="kind-tag">{item.contentKind}</span>{item.statusEffect && <span className={`status-mini ${stateTone[item.statusEffect]}`}>{item.statusEffect}</span>}</div><h3>{item.title}</h3><p>{item.summary}</p><small>{item.publisher}</small></div>
          </button>)}</div>
        </section>

        <aside className="right-column">
          <article className="panel evidence-card">
            <div className="panel-heading"><span>证据详情</span><span className={`source-tag ${selected.sourceTier === "交易所/公司公告" ? "official" : "user"}`}>{selected.sourceTier}</span></div>
            <h3>{selected.title}</h3><blockquote>“{selected.quote}”</blockquote><p>{selected.impact}</p>
            <dl><div><dt>发生</dt><dd>{selected.occurredAt}</dd></div><div><dt>披露</dt><dd>{selected.disclosedAt}</dd></div><div><dt>抓取</dt><dd>{formatDate(selected.capturedAt)}</dd></div></dl>
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">打开原始来源 ↗</a>
          </article>

          <article className="panel monitor-card">
            <div className="panel-heading"><span>Agent 监测运行</span><small>最多 4 次工具调用</small></div>
            <p className="form-note">固定查询 2025.05.01—09.06：公告、新闻、披露事件和历史行情。模型只决定查什么；MCP 返回与状态变更都受规则和人工确认约束。</p>
            <button className="primary-button" onClick={monitor} disabled={monitoring}>{monitoring ? "正在调用 iFinD 工具…" : "立即监测历史快照"}</button>
            {agentRuns[0] && <div className="run-card"><div><span className={`status-mini ${agentRuns[0].status === "失败" ? "tone-red" : agentRuns[0].status === "待用户确认" ? "tone-violet" : "tone-amber"}`}>{agentRuns[0].status}</span><small>{agentRuns[0].toolCalls.length} 次工具调用</small></div><p>{agentRuns[0].stopReason}</p>{agentRuns[0].toolCalls.map((trace) => <div className="run-trace" key={`${agentRuns[0].id}-${trace.tool}`}><b>{trace.status === "完成" ? "✓" : "!"} {trace.tool}</b><span>{trace.source}</span></div>)}{agentRuns[0].proposal && <p className="run-proposal"><b>草案：</b>{agentRuns[0].proposal.suggestedConclusion}</p>}</div>}
          </article>

          <article className="panel import-card">
            <div className="panel-heading"><span>导入新线索</span><small>需人工确认</small></div>
            <p className="form-note">Agent 只提出更新建议；无来源或冲突材料不会自动改变正式结论。</p>
            <label>标题<input value={material.title} onChange={(e) => setMaterial({ ...material, title: e.target.value })} placeholder="材料标题" /></label>
            <div className="form-two"><label>发布者<input value={material.publisher} onChange={(e) => setMaterial({ ...material, publisher: e.target.value })} placeholder="可留空" /></label><label>披露日<input type="date" value={material.disclosedAt} onChange={(e) => setMaterial({ ...material, disclosedAt: e.target.value })} /></label></div>
            <label>来源 URL<input value={material.sourceUrl} onChange={(e) => setMaterial({ ...material, sourceUrl: e.target.value })} placeholder="https://" /></label>
            <label>正文<textarea value={material.body} onChange={(e) => setMaterial({ ...material, body: e.target.value })} placeholder="粘贴公告、新闻或研究材料正文…" rows={5} /></label>
            <button className="demo-link" onClick={useDemoMaterial}>填入“无来源传闻”测试样例</button>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-button" onClick={analyze} disabled={loading}>{loading ? "正在生成证据提议…" : "让 Agent 分析线索"}</button>
          </article>

          {proposal && <article className="panel proposal-card">
            <div className="panel-heading"><span>Agent 更新提议</span><span className={`status-mini ${stateTone[proposal.proposedState]}`}>{proposal.proposedState}</span></div>
            <div className="proposal-metrics"><span>匹配：<b>{proposal.eventMatch}</b></span><span>置信：<b>{proposal.confidence}</b></span><span>类型：<b>{proposal.contentKind}</b></span></div>
            <p><b>拟议结论：</b>{proposal.suggestedConclusion}</p><blockquote>“{proposal.quote}”</blockquote>{proposal.conflict && <div className="conflict">潜在冲突：{proposal.conflict}</div>}<p className="rationale">{proposal.rationale}</p>
            <button className="confirm-button" onClick={acceptProposal}>确认并创建新版本</button>
          </article>}
        </aside>
      </section>
    </main>
  );
}
