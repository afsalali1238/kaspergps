import type { Metadata } from 'next';
import './globals.css';
import { DemoBar } from '@/components/demo/DemoBar';

export const metadata: Metadata = {
  title: 'Kasper GPS',
  description: 'Equipment tracking and rental management',
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23141518'/><text x='0' y='23' font-size='20' font-family='monospace' fill='%23FFC400'>K</text></svg>",
        type: "image/svg+xml",
      }
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts are loaded here rather than with a CSS @import: an @import after
            the Tailwind import breaks Turbopack's dev CSS parser. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-bg antialiased">
        <DemoBar />
        {children}
      </body>
    </html>
  );
}
