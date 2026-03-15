import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'ChevronRight', className }),
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

});
