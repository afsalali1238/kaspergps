import type { Metadata } from 'next';
import './globals.css';
import { headers } from 'next/headers';
import { DemoBar } from '@/components/demo/DemoBar';
import { LocaleProvider, type Locale } from '@/i18n';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The proxy tags /ar/... requests with x-kasper-locale (see proxy.ts), so the
  // very first paint is already in the right language and direction.
  const requestHeaders = await headers();
  const locale: Locale = requestHeaders.get('x-kasper-locale') === 'ar' ? 'ar' : 'en';

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-bg antialiased">
        <LocaleProvider locale={locale}>
          <DemoBar />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
