import type { ResearchTask } from "@/lib/types";

export function researchTaskWarning(task: ResearchTask): string | null {
  const isMerger = /换股|吸收合并|合并|并购|重组/.test(task.eventQuery);
  const mixesHaitongInternational = /国泰君安/.test(task.companyQuery) && /海通国际/.test(task.companyQuery);

  if (isMerger && mixesHaitongInternational) {
    return "“国泰君安＋海通国际”的并购检索可能混淆了主体：国泰君安换股吸收合并的交易对手是“海通证券”。如研究该交易，请改填“国泰君安、海通证券”。";
  }

  return null;
}
