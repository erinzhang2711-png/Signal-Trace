"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { researchTaskWarning } from "@/lib/task-validation";
import type { ResearchTask } from "@/lib/types";
import { readWatchlist, WATCHLIST_STORAGE_KEY, type FollowedEvent } from "@/lib/watchlist";

const EMPTY_TASK: ResearchTask = { companyQuery: "", eventQuery: "", cutoffDate: new Date().toISOString().slice(0, 10) };

export default function Home() {
  const router = useRouter();
  const [task, setTask] = useState<ResearchTask>(EMPTY_TASK);
  const [error, setError] = useState<string | null>(null);
  const [followedEvents, setFollowedEvents] = useState<FollowedEvent[]>([]);

  useEffect(() => {
    setFollowedEvents(readWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)));
  }, []);

  function startResearch() {
    if (!task.companyQuery.trim() || !task.eventQuery.trim()) {
      setError("请填写公司/标的与事件关键词，再启动 Agent。");
      return;
    }
    const taskWarning = researchTaskWarning(task);
    if (taskWarning) {
      setError(taskWarning);
      return;
    }
    setError(null);
    const params = new URLSearchParams({ company: task.companyQuery.trim(), event: task.eventQuery.trim(), cutoff: task.cutoffDate });
    router.push(`/research?${params.toString()}`);
  }

  function removeFollowedEvent(id: string) {
    const updated = followedEvents.filter((event) => event.id !== id);
    setFollowedEvents(updated);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(updated));
  }

  return <main>
    <header className="topbar">
      <div className="topbar-left"><div className="brand"><span className="brand-mark">S</span><span>SignalTrace</span><em>证见</em></div></div>
      <div className="topbar-meta">金融事件证据 Agent <span className="divider" /> 不构成投资建议</div>
    </header>
    <section className="research-hero">
      <p className="eyebrow">START WITH A RESEARCH QUESTION</p>
      <h1>开始研究一个投资事件</h1>
      <p>输入标的与足以识别同一事件的线索。Agent 将规划 iFinD MCP 检索、比较证据，并把不确定结论留给你确认。</p>
      <div className="research-card panel">
        <div className="research-step"><span>01</span><div><b>定义研究任务</b><small>不需要先知道公告编号；请带上交易对手、标的或事件名称，避免“收购”这类宽泛检索。</small></div></div>
        <label>公司 / 标的<input value={task.companyQuery} onChange={(event) => setTask({ ...task, companyQuery: event.target.value })} placeholder="例如：国泰君安、海通证券" /></label>
        <label>事件关键词<input value={task.eventQuery} onChange={(event) => setTask({ ...task, eventQuery: event.target.value })} placeholder="例如：收购 ××公司、定增、并购重组、业绩预告" /></label>
        <label>历史截点<input type="date" value={task.cutoffDate} onChange={(event) => setTask({ ...task, cutoffDate: event.target.value })} /></label>
        {researchTaskWarning(task) && <div className="error-box">{researchTaskWarning(task)}</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button research-button" onClick={startResearch}>让 Agent 开始研究 →</button>
      </div>
      {followedEvents.length > 0 && <section className="followed-events panel"><div className="panel-heading"><span>已关注事件</span><small>此浏览器本地保存</small></div><p className="fine-print">从这里重新打开已关注的研究；当前版本不在后台自动抓取新公告。</p><div className="followed-event-list">{followedEvents.map((event) => <div className="followed-event-row" key={event.id}><button onClick={() => { const params = new URLSearchParams({ company: event.task.companyQuery, event: event.task.eventQuery, cutoff: event.task.cutoffDate }); router.push(`/research?${params.toString()}`); }}><b>{event.eventName}</b><span>{event.securities.map((security) => `${security.name}${security.code ? ` ${security.code}` : ""}`).join(" · ")} · 截至 {event.task.cutoffDate}</span></button><button className="unfollow-button" aria-label={`取消关注 ${event.eventName}`} onClick={() => removeFollowedEvent(event.id)}>取消关注</button></div>)}</div></section>}
    </section>
  </main>;
}
