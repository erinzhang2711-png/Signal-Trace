import type { ResearchTask } from "@/lib/types";

export const WATCHLIST_STORAGE_KEY = "signaltrace-followed-events-v1";

export type FollowedEvent = {
  id: string;
  eventName: string;
  task: ResearchTask;
  securities: Array<{ name: string; code?: string }>;
  followedAt: string;
};

export function followedEventId(task: ResearchTask) {
  return `${task.companyQuery}|${task.eventQuery}|${task.cutoffDate}`;
}

export function readWatchlist(value: string | null): FollowedEvent[] {
  if (!value) return [];
  try {
    const items = JSON.parse(value) as unknown;
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is FollowedEvent => Boolean(
      item && typeof item === "object" && "id" in item && "eventName" in item && "task" in item,
    ));
  } catch {
    return [];
  }
}
