import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('legal');

  return (
    <div className="min-h-screen bg-sand font-body text-charcoal">
      {/* Nav */}
      <nav className="bg-midnight text-cream py-4 px-6">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/illustrations/camel-logo.jpeg"
              alt="Camello"
              width={32}
              height={32}
              className="rounded-md"
              unoptimized
            />
            <span className="font-heading font-semibold tracking-wide uppercase text-sm">
              Camello
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-heading uppercase tracking-widest">
            <Link
              href="/terms"
              className="text-cream/70 hover:text-cream transition-colors"
            >
              {t('terms')}
            </Link>
            <Link
              href="/privacy"
              className="text-cream/70 hover:text-cream transition-colors"
            >
              {t('privacy')}
            </Link>
            <Link
              href="/refund"
              className="text-cream/70 hover:text-cream transition-colors"
            >
              {t('refund')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">{children}</main>

      {/* Footer */}
      <footer className="bg-midnight text-cream py-8 px-6">
        <div className="mx-auto max-w-4xl text-center text-sm text-dune font-body">
          &copy; {new Date().getFullYear()} Camello. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
