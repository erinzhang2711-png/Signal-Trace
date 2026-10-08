import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchEventMarketWindow } from "@/lib/ifind";

const inputSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  securityName: z.string().trim().max(80).optional(),
  securityCode: z.string().trim().max(32).optional(),
});

export async function POST(request: Request) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success || (!input.data.securityName && !input.data.securityCode)) return NextResponse.json({ error: "行情标的或日期不完整。" }, { status: 400 });
  const series = await fetchEventMarketWindow(input.data, input.data.eventDate, input.data.cutoffDate);
  if (!series) return NextResponse.json({ error: "iFinD 未返回该节点附近可识别的日频行情。" }, { status: 422 });
  return NextResponse.json({ series });
}
