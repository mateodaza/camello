import type { Metadata } from 'next';
import { Jost, DM_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers';
import './globals.css';

const jost = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === 'es' ? 'Camello — Plataforma de Agentes IA' : 'Camello — AI Workforce Platform',
    description:
      locale === 'es'
        ? 'Crea agentes de IA que venden, atienden y crecen tu negocio por WebChat y WhatsApp'
        : 'Create AI agents that sell, support, and grow your business on WebChat and WhatsApp',
    metadataBase: new URL('https://camello.xyz'),
    openGraph: {
      title: locale === 'es' ? 'Camello — Plataforma de Agentes IA' : 'Camello — AI Workforce Platform',
      description:
        locale === 'es'
          ? 'Crea agentes de IA que venden, atienden y crecen tu negocio por WebChat y WhatsApp'
          : 'Create AI agents that sell, support, and grow your business on WebChat and WhatsApp',
      images: [{ url: '/og-image.jpeg', width: 1200, height: 630 }],
      siteName: 'Camello',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og-image.jpeg'],
    },
    icons: {
      icon: '/illustrations/camel-logo.jpeg',
      apple: '/illustrations/camel-logo.jpeg',
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${jost.variable} ${dmSans.variable}`}>
      <body className="font-body antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
