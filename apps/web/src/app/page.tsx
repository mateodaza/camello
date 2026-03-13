import { auth } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { PLAN_PRICES, PLAN_LIMITS } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';

const FEATURES = [
  { key: 'agents' as const, img: '/illustrations/camel-sales.jpeg' },
  { key: 'channels' as const, img: '/illustrations/camel-support.jpeg' },
  { key: 'knowledge' as const, img: '/illustrations/camel-knowledge.jpeg' },
  { key: 'analytics' as const, img: '/illustrations/camel-analytics.jpeg' },
];

const TIERS: PlanTier[] = ['starter', 'growth', 'scale'];

function plural(template: string, count: number): string {
  const parts = template.split('|').map((s) => s.trim());
  return count === 1 ? (parts[0] ?? template) : (parts[1] ?? parts[0] ?? template);
}

function formatLimit(value: number, label: string): string {
  if (value === Infinity) return label;
  return `${value.toLocaleString()} ${label}`;
}

export default async function LandingPage() {
  const { userId } = await auth();
  const isSignedIn = !!userId;

  const t = await getTranslations('landing');

  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-midnight/95 backdrop-blur-sm border-b border-cream/10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/illustrations/camel-logo.jpeg"
              alt="Camello"
              width={36}
              height={36}
              className="rounded-md"
              unoptimized
            />
            <span className="font-heading text-cream font-semibold tracking-wide uppercase text-sm">
              Camello
            </span>
          </Link>

          {/* Mobile: CTA only */}
          <Link
            href={isSignedIn ? '/dashboard' : '/onboarding'}
            className="md:hidden font-heading bg-teal hover:bg-teal/90 text-cream text-xs uppercase tracking-widest px-4 py-2 rounded-md transition-colors font-medium"
          >
            {isSignedIn ? 'Dashboard' : t('nav.getStarted')}
          </Link>

          {/* Desktop: full nav */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="font-heading text-cream/70 hover:text-cream text-sm uppercase tracking-widest transition-colors"
            >
              {t('nav.features')}
            </a>
            <a
              href="#pricing"
              className="font-heading text-cream/70 hover:text-cream text-sm uppercase tracking-widest transition-colors"
            >
              {t('nav.pricing')}
            </a>
            {isSignedIn ? null : (
              <Link
                href="/dashboard"
                className="font-heading text-cream/70 hover:text-cream text-sm uppercase tracking-widest transition-colors"
              >
                {t('nav.login')}
              </Link>
            )}
            <Link
              href={isSignedIn ? '/dashboard' : '/onboarding'}
              className="font-heading bg-teal hover:bg-teal/90 text-cream text-sm uppercase tracking-widest px-5 py-2 rounded-md transition-colors font-medium"
            >
              {isSignedIn ? 'Dashboard' : t('nav.getStarted')}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-midnight text-cream py-20 md:py-32">
        <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="space-y-6">
            <h1 className="font-heading font-bold text-5xl md:text-7xl uppercase tracking-tight leading-[0.95]">
              {t('hero.headline')}
            </h1>
            <p className="font-body text-lg md:text-xl text-cream/80 max-w-lg">
              {t('hero.subheadline')}
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <Link
                href="/onboarding"
                className="inline-block font-heading bg-teal hover:bg-teal/90 text-cream text-sm uppercase tracking-widest px-8 py-3.5 rounded-md transition-colors font-medium"
              >
                {t('hero.cta')}
              </Link>
              <span className="text-dune text-sm font-body flex items-center gap-1.5">
                {t('hero.trust')} <span aria-hidden="true">🇨🇴</span>
              </span>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <Image
              src="/illustrations/camel-sales.jpeg"
              alt="Camello AI Agent"
              width={520}
              height={520}
              className="rounded-2xl"
              priority
              unoptimized
            />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-sand py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-16 space-y-4">
            <h2 className="font-heading font-semibold text-3xl md:text-4xl text-charcoal tracking-tight">
              {t('features.title')}
            </h2>
            <p className="font-body text-lg text-dune">{t('features.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {FEATURES.map(({ key, img }) => (
              <div
                key={key}
                className="bg-cream border-2 border-charcoal/8 rounded-xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row gap-5 items-center sm:items-start"
              >
                <Image
                  src={img}
                  alt={t(`features.${key}.title`)}
                  width={152}
                  height={152}
                  className="rounded-lg shrink-0"
                  unoptimized
                />
                <div className="space-y-2 text-center sm:text-left">
                  <h3 className="font-heading font-semibold text-xl text-charcoal">
                    {t(`features.${key}.title`)}
                  </h3>
                  <p className="font-body text-dune leading-relaxed">
                    {t(`features.${key}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-teal py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-16 space-y-4">
            <h2 className="font-heading font-semibold text-3xl md:text-4xl text-cream tracking-tight">
              {t('pricing.title')}
            </h2>
            <p className="font-body text-lg text-cream/80">{t('pricing.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {TIERS.map((tier) => {
              const price = PLAN_PRICES[tier];
              const limits = PLAN_LIMITS[tier];
              const isPopular = tier === 'growth';

              const features = [
                <>
                  {limits.artifacts === Infinity
                    ? t('pricing.unlimited')
                    : limits.artifacts}{' '}
                  {plural(t('pricing.agents'), limits.artifacts)}
                </>,
                <>{formatLimit(limits.modules, t('pricing.modules'))}</>,
                <>{formatLimit(limits.channels, t('pricing.channels'))}</>,
                <>
                  {limits.resolutions_per_month.toLocaleString()}{' '}
                  {t('pricing.resolutions')}
                </>,
              ];

              return (
                <div
                  key={tier}
                  className={`relative bg-midnight rounded-xl p-6 md:p-8 border-2 ${
                    isPopular ? 'border-gold' : 'border-cream/20'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-midnight font-heading text-xs uppercase tracking-widest px-3 py-1 rounded-full font-semibold">
                      {t('pricing.popular')}
                    </span>
                  )}
                  <div className="space-y-6">
                    <h3 className="font-heading font-semibold text-xl text-cream">
                      {price.label}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading font-extrabold text-5xl text-cream tracking-tight">
                        ${price.monthly}
                      </span>
                      <span className="font-body text-cream/60">{t('pricing.monthly')}</span>
                    </div>
                    <ul className="space-y-3 font-body text-cream/80 text-sm">
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-teal mt-0.5 shrink-0">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/onboarding"
                      className={`block text-center font-heading text-sm uppercase tracking-widest px-6 py-3 rounded-md transition-colors font-medium ${
                        isPopular
                          ? 'bg-gold hover:bg-gold/90 text-midnight'
                          : 'bg-cream/10 hover:bg-cream/20 text-cream'
                      }`}
                    >
                      {t('pricing.cta')}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-midnight text-cream py-16 border-t border-cream/10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/illustrations/camel-logo.jpeg"
                  alt="Camello"
                  width={36}
                  height={36}
                  className="rounded-md"
                  unoptimized
                />
                <span className="font-heading font-semibold tracking-wide uppercase text-sm">
                  Camello
                </span>
              </div>
              <p className="text-sm text-dune font-body flex items-center gap-1.5">
                {t('footer.builtIn')} <span aria-hidden="true">🇨🇴</span>
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-sm uppercase tracking-widest text-cream/60">
                {t('footer.product')}
              </h4>
              <ul className="space-y-2 text-sm font-body">
                <li>
                  <a
                    href="#features"
                    className="text-cream/70 hover:text-cream transition-colors"
                  >
                    {t('footer.features')}
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="text-cream/70 hover:text-cream transition-colors"
                  >
                    {t('footer.pricing')}
                  </a>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-sm uppercase tracking-widest text-cream/60">
                {t('footer.company')}
              </h4>
              <ul className="space-y-2 text-sm font-body">
                <li>
                  <span className="text-cream/40">{t('footer.blog')}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-sm uppercase tracking-widest text-cream/60">
                {t('footer.legal')}
              </h4>
              <ul className="space-y-2 text-sm font-body">
                <li>
                  <Link
                    href="/privacy"
                    className="text-cream/70 hover:text-cream transition-colors"
                  >
                    {t('footer.privacy')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-cream/70 hover:text-cream transition-colors"
                  >
                    {t('footer.terms')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/refund"
                    className="text-cream/70 hover:text-cream transition-colors"
                  >
                    {t('footer.refund')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-cream/10 text-center text-sm text-dune font-body">
            &copy; {new Date().getFullYear()} {t('footer.copyright')}
          </div>
        </div>
      </footer>
    </div>
  );
}
