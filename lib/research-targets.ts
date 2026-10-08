export type ResearchTargetStatus = "当前交易" | "历史主体" | "已退市";

export type ResearchTarget = {
  id: string;
  name: string;
  code?: string;
  status: ResearchTargetStatus;
  successor?: string;
};

export const RESEARCH_TARGETS: ResearchTarget[] = [
  { id: "catl", name: "宁德时代", code: "300750.SZ", status: "当前交易" },
  { id: "hygon", name: "海光信息", code: "688041.SH", status: "当前交易" },
  { id: "sugon", name: "中科曙光", code: "603019.SH", status: "当前交易" },
  { id: "guotai-haitong", name: "国泰海通", code: "601211.SH", status: "当前交易" },
  { id: "guotai-junan-history", name: "国泰君安", code: "原 601211.SH", status: "历史主体", successor: "国泰海通（601211.SH）" },
  { id: "haitong-securities-history", name: "海通证券", code: "原 600837.SH", status: "已退市", successor: "国泰海通（601211.SH）" },
  { id: "haitong-international", name: "海通国际", code: "0665.HK", status: "当前交易" },
  { id: "tesla", name: "特斯拉", code: "TSLA", status: "当前交易" },
];

export function targetSuggestions(input: string) {
  const query = input.trim().toLowerCase();
  if (query.length < 2) return [];
  return RESEARCH_TARGETS.filter((target) => `${target.name} ${target.code ?? ""} ${target.successor ?? ""}`.toLowerCase().includes(query));
}

export function companyQueryForTargets(targets: ResearchTarget[]) {
  return targets.map((target) => target.name).join("、");
}

export function targetStatusLabel(target: ResearchTarget) {
  if (target.status === "当前交易") return target.code ?? "代码待确认";
  return `${target.status}${target.code ? ` · ${target.code}` : ""}`;
}

export function serializeResearchTargets(targets: ResearchTarget[]) {
  return JSON.stringify(targets.map(({ id, name, code, status, successor }) => ({ id, name, code, status, successor })));
}

export function parseResearchTargets(value: string | null, companyQuery: string): ResearchTarget[] {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((target) => target && typeof target === "object" && typeof (target as ResearchTarget).id === "string" && typeof (target as ResearchTarget).name === "string")) return parsed as ResearchTarget[];
    } catch {
      // Fall back to names from a direct research URL.
    }
  }
  return companyQuery.split(/[、，,]/).map((name) => name.trim()).filter(Boolean).map((name) => ({ id: `query-${name}`, name, status: "历史主体" as const }));
}
