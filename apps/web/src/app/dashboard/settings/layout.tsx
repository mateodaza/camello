import { getTranslations } from 'next-intl/server';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings');
  return (
    <div className="px-6 py-4">
      <h1 className="font-heading text-xl font-bold text-charcoal pb-4 md:text-2xl">
        {t('pageTitle')}
      </h1>
      {children}
    </div>
  );
}
