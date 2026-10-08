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
      <body className="min-h-screen bg-bg antialiased">
        <DemoBar />
        {children}
      </body>
    </html>
  );
}
