import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI Community Engine", description: "AI 투자 토론 시뮬레이션 운영센터" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {return <html lang="ko"><body>{children}</body></html>}
