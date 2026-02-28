'use client';

import { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>({ value: '', onChange: () => {} });

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ defaultValue, value, onValueChange, className, children }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value! : internal;

  function handleChange(v: string) {
    if (!controlled) setInternal(v);
    onValueChange?.(v);
  }

  return (
    <TabsContext.Provider value={{ value: current, onChange: handleChange }}>
      <div className={cn('flex flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center gap-1 rounded-lg bg-charcoal/8 p-1 text-charcoal/60',
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const ctx = useContext(TabsContext);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.onChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-cream text-charcoal shadow-sm' : 'hover:bg-cream/50',
        className,
      )}
      {...props}
    />
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <div className={cn('mt-4', className)} {...props} />;
}
