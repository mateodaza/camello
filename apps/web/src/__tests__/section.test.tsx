import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'ChevronRight', className }),
  Info: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Info', className }),
}));

import { Section } from '../components/dashboard/section';

describe('NC-281 — Section primitive', () => {

  it('1 — renders collapsed when defaultOpen is false', () => {
    render(React.createElement(Section, { title: 'Test', defaultOpen: false }, 'content'));
    const details = document.querySelector('details');
    expect(details).not.toHaveAttribute('open');
  });

  it('2 — auto-opens when autoOpen prop changes from false to true after mount', async () => {
    const { rerender } = render(
      React.createElement(Section, { title: 'Test', autoOpen: false }, 'content'),
    );
    const details = document.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');

    // Simulate async data arriving (prop changes false → true)
    rerender(React.createElement(Section, { title: 'Test', autoOpen: true }, 'content'));

    await waitFor(() => {
      expect(details).toHaveAttribute('open');
    });
  });

  it('3 — clicking tooltip button inside summary does not toggle section', () => {
    render(
      React.createElement(Section, { title: 'Skills', tooltip: 'Help text', defaultOpen: false }, 'content'),
    );
    const details = document.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');

    const button = screen.getByRole('button', { name: /more information/i });
    fireEvent.click(button);

    // Section must remain closed — e.preventDefault() on <summary> suppressed the toggle
    expect(details).not.toHaveAttribute('open');
  });

});
