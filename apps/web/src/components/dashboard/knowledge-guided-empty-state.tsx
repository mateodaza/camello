'use client';

import { Globe, FileText, Zap } from 'lucide-react';

// TODO: spec ambiguity — plan specified this as a named export from knowledge/page.tsx,
// but Next.js App Router forbids non-reserved named exports from page files.
// Moved to this component file instead.
export function KnowledgeGuidedEmptyState({
  onAddType,
  t,
}: {
  onAddType: (type: 'url' | 'upload') => void;
  t: (key: string) => string;
}) {
  const cards = [
    {
      icon: Globe,
      titleKey: 'guidedUrlTitle',
      descKey: 'guidedUrlDesc',
      exampleKey: 'guidedUrlExample',
      actionKey: 'guidedUrlAction',
      type: 'url' as const,
    },
    {
      icon: FileText,
      titleKey: 'guidedDocTitle',
      descKey: 'guidedDocDesc',
      exampleKey: 'guidedDocExample',
      actionKey: 'guidedDocAction',
      type: 'upload' as const,
    },
    {
      icon: Zap,
      titleKey: 'guidedFactsTitle',
      descKey: 'guidedFactsDesc',
      exampleKey: 'guidedFactsExample',
      actionKey: 'guidedFactsAction',
      type: 'upload' as const,
    },
  ];

  return (
    <div className="py-8">
      <p className="font-heading text-lg font-semibold text-charcoal">{t('guidedEmptyTitle')}</p>
      <p className="mt-1 text-sm text-dune">{t('guidedEmptySubtitle')}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.titleKey}
              className="flex flex-col rounded-xl border border-charcoal/10 bg-cream p-4"
            >
              <Icon className="h-6 w-6 text-teal" />
              <p className="mt-3 font-medium text-charcoal">{t(card.titleKey)}</p>
              <p className="mt-1 text-sm text-dune">{t(card.descKey)}</p>
              <p className="mt-1 text-xs text-dune/70">{t(card.exampleKey)}</p>
              <button
                type="button"
                onClick={() => onAddType(card.type)}
                className="mt-4 rounded-md bg-teal px-3 py-1.5 text-sm font-medium text-white hover:bg-teal/90"
              >
                {t(card.actionKey)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
