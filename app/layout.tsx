import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "证见 SignalTrace | 投资事件证据 Agent",
  description: "让投资事件的每次结论变化都能回到原始证据。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
