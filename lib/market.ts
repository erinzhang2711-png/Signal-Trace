import type { MarketPoint, MarketSeries } from "@/lib/types";

export type EventMarketReaction = {
  eventDate: string;
  observedDate: string;
  point: MarketPoint;
  previous?: MarketPoint;
  next?: MarketPoint;
};

export function marketReactionForEvent(series: MarketSeries | undefined, eventDate: string): EventMarketReaction | undefined {
  if (!series?.points.length || !eventDate) return undefined;
  const index = series.points.findIndex((point) => point.date >= eventDate);
  if (index < 0) return undefined;
  return {
    eventDate,
    observedDate: series.points[index].date,
    point: series.points[index],
    ...(index > 0 ? { previous: series.points[index - 1] } : {}),
    ...(index < series.points.length - 1 ? { next: series.points[index + 1] } : {}),
  };
}

export function returnFrom(base: number, current: number) {
  return ((current / base) - 1) * 100;
}
