import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HServer | Family Mindmap',
  description: 'Better than Obsidian - 1.8TB SSD Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
<head>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0070f3" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
</head>
      <body className="bg-slate-900 text-slate-100 min-h-screen">
        {/* This is where your page.tsx content will be injected */}
        {children}
        <script
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `,
  }}
        />
      </body>
    </html>
  );
}
