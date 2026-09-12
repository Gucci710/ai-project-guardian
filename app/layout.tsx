import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Guardian | AI Project Guardian — AIエージェントの起動許可プロトコル",
  description: "AIエージェントの危険な権限を診断し、制限を設計・強制・再検証。必要な仕事を残して、検証範囲内で制限付き起動を許可します。",
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
