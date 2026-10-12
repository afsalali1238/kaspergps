import type { Metadata } from 'next';
// Brand fonts, self-hosted from npm (@fontsource). The old Google Fonts @import in
// globals.css was dropped by the production build, so production showed system fonts;
// next/font/google would need Google at build time, which sandboxes and CI may block.
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import './globals.css';
import { PRODUCT_NAME } from '@/config/brand';
import { headers } from 'next/headers';
import { DemoBar } from '@/components/demo/DemoBar';
import { LocaleProvider, type Locale } from '@/i18n';
import { DbProvider } from '@/components/providers/DbProvider';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} GPS`,
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
  // Proxy tags Arabic customer requests (the /ar prefix, or kasper_lang=ar on
  // an unprefixed customer route) with x-kasper-locale. Console and /dev are
  // never tagged, so RTL starts on the first paint of customer screens only.
  const requestHeaders = await headers();
  const locale: Locale = requestHeaders.get('x-kasper-locale') === 'ar' ? 'ar' : 'en';

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-bg antialiased">
        <LocaleProvider locale={locale}>
          <DbProvider>
            <DemoBar />
            {children}
          </DbProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
