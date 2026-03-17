import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('lucide-react', () => ({
  Info: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Info', className }),
}));

import { InfoTooltip } from '../components/ui/tooltip';

describe('NC-286 — InfoTooltip', () => {

  it('1 — shows tooltip on hover, hides on mouse leave', () => {
    render(React.createElement(InfoTooltip, { label: 'Test tooltip text' }));
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    const button = screen.getByRole('button', { name: /more information/i });

    expect(tooltip).toHaveAttribute('aria-hidden', 'true');

    fireEvent.mouseEnter(button);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');

    fireEvent.mouseLeave(button);
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('2 — renders Info icon and tooltip text in DOM', () => {
    render(React.createElement(InfoTooltip, { label: 'Skills tooltip' }));
    expect(document.querySelector('[data-icon="Info"]')).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Skills tooltip');
  });

  it('3 — shows tooltip on tap and auto-hides after 3s', () => {
    vi.useFakeTimers();
    render(React.createElement(InfoTooltip, { label: 'Tap tooltip' }));
    const button = screen.getByRole('button', { name: /more information/i });
    const tooltip = screen.getByRole('tooltip', { hidden: true });

    expect(tooltip).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(button);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');

    vi.useRealTimers();
  });

});
