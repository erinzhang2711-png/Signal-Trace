import type { MarketSeries, ResearchTask } from "./types";

export function marketIdentityForTask(task: ResearchTask): Pick<MarketSeries, "securityName" | "securityCode"> | undefined {
  // These are successor identities, not an inference from a price series. They
  // remove ambiguity only for a precisely recognised, completed merger.
  if (/国泰君安/.test(task.companyQuery) && /海通证券/.test(task.companyQuery) && /换股|吸收合并|合并|重组/.test(task.eventQuery)) {
    return { securityName: "国泰海通", securityCode: "601211.SH" };
  }
  const code = task.companyQuery.match(/\b\d{6}(?:\.(?:SH|SZ))?\b/i)?.[0];
  const name = (task.companyQuery.split(/[、，,]/)[0] ?? task.companyQuery).replace(/\b\d{6}\b/g, "").trim();
  return code || name ? { ...(name ? { securityName: name } : {}), ...(code ? { securityCode: code } : {}) } : undefined;
}
