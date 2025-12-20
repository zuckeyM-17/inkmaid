import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inkmaid",
  description: "手書きとAIで直感的に図解するプラットフォーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

