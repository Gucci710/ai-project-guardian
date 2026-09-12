import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Project Guardian — AIの判断に、信頼の証拠を。",
  description: "計画・QAレビュー・攻撃シミュレーション・自己修復・再検証を通じて、AIの判断の根拠を示すプロジェクト検証エージェント。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
