import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'コミットトラッカー',
  description: '日次コミット管理・LINE共有ツール',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
