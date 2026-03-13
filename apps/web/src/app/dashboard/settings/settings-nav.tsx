'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const SETTINGS_TABS = [
  { href: '/dashboard/settings/profile', key: 'navProfile' as const },
  { href: '/dashboard/settings/billing', key: 'navBilling' as const },
  { href: '/dashboard/settings/channels', key: 'navChannels' as const },
];

export function SettingsNav() {
  const t = useTranslations('settings');
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-charcoal/10 px-6 pb-0">
      {SETTINGS_TABS.map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            pathname.startsWith(href)
              ? 'border-b-2 border-teal text-charcoal'
              : 'text-dune hover:text-charcoal',
          )}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
