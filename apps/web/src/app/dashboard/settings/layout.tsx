import { SettingsNav } from './settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      <div className="px-6">{children}</div>
    </div>
  );
}
