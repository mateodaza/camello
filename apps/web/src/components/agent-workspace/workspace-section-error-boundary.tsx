'use client';

import { Component, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface FallbackProps {
  reset: () => void;
}

function SectionErrorFallback({ reset }: FallbackProps) {
  const t = useTranslations('agentWorkspace');
  return (
    <div className="rounded-xl border border-sunset/20 bg-sunset/5 p-4">
      <p className="text-sm font-medium text-sunset">{t('errorBoundaryTitle')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 text-xs font-medium text-teal hover:underline min-h-[36px]"
      >
        {t('errorBoundaryRetry')}
      </button>
    </div>
  );
}

interface State {
  hasError: boolean;
}

export class WorkspaceSectionErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[WorkspaceSectionErrorBoundary]', error, info);
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return <SectionErrorFallback reset={this.reset} />;
    }
    return this.props.children;
  }
}
