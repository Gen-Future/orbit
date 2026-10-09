import type { Metadata, Viewport } from 'next';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './globals.css';
import './nebula.css';
import './report-foundry.css';
export const metadata: Metadata = {
  title: 'Orbit · 让重要的事，进入轨道',
  description: '你的 AI 原生工作轨道。捕捉意图，推进重要的事。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Orbit', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#10120f' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
