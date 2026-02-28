'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, MessageSquare, Bot, BookOpen,
  BarChart3, CreditCard, ChevronsLeft, ChevronsRight, User, HelpCircle,
} from 'lucide-react';
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';

const navItems = [
  { href: '/dashboard', labelKey: 'overview' as const, icon: LayoutDashboard },
  { href: '/dashboard/conversations', labelKey: 'conversations' as const, icon: MessageSquare },
  { href: '/dashboard/artifacts', labelKey: 'agents' as const, icon: Bot },
  { href: '/dashboard/knowledge', labelKey: 'knowledge' as const, icon: BookOpen },
  { href: '/dashboard/analytics', labelKey: 'analytics' as const, icon: BarChart3 },
  { href: '/dashboard/settings/billing', labelKey: 'billing' as const, icon: CreditCard },
  { href: '/dashboard/settings/profile', labelKey: 'profile' as const, icon: User },
  { href: '/dashboard/docs', labelKey: 'help' as const, icon: HelpCircle },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const t = useTranslations('sidebar');

  return (
    <>
      {/* Header: logo + toggle */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-cream/10',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/illustrations/camel-logo.jpeg"
            alt="Camello"
            width={28}
            height={28}
            className="shrink-0 rounded-md"
            unoptimized
          />
          {!collapsed && (
            <span className="font-heading text-sm font-semibold uppercase tracking-wide text-cream">
              Camello
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            aria-label={t('collapse')}
            className="rounded-md p-1 text-cream/50 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expand toggle when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          aria-label={t('expand')}
          className="mx-auto mt-2 rounded-md p-1.5 text-cream/50 transition-colors hover:bg-cream/10 hover:text-cream"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      )}

      {/* Organization switcher */}
      <div
        className={cn(
          'border-b border-cream/10',
          collapsed ? 'flex justify-center p-2' : 'p-3',
        )}
      >
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: collapsed ? 'w-10 overflow-hidden' : 'w-full',
              organizationSwitcherTrigger: cn(
                'text-cream/80 hover:text-cream [&>*]:text-cream/80 [&>*]:hover:text-cream',
                collapsed ? 'px-0' : 'w-full',
              ),
            },
          }}
        />
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-1', collapsed ? 'p-2' : 'p-3')}>
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const isActive = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href) ||
              (href === '/dashboard/artifacts' && pathname.startsWith('/dashboard/agents'));

          return (
            <Tooltip key={href} label={t(labelKey)} show={collapsed}>
              <Link
                href={href}
                className={cn(
                  'flex items-center rounded-md font-heading text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-teal/20 text-cream'
                    : 'text-cream/70 hover:bg-cream/10 hover:text-cream',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && t(labelKey)}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* User button */}
      <div
        className={cn(
          'border-t border-cream/10',
          collapsed ? 'flex justify-center p-3' : 'p-4',
        )}
      >
        <UserButton afterSignOutUrl="/" />
      </div>
    </>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();

  // Auto-close mobile sidebar on navigation
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden h-full flex-col overflow-hidden bg-midnight transition-[width] duration-200 ease-in-out md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-midnight/30 md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-midnight md:hidden">
            <SidebarContent collapsed={false} onToggle={() => onMobileClose?.()} />
          </aside>
        </>
      )}
    </>
  );
}
