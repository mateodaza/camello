import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Use a simple function mock instead of Proxy
vi.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) => React.createElement('svg', { 'data-icon': 'ChevronDown', className }),
  Bot: ({ className }: { className?: string }) => React.createElement('svg', { 'data-icon': 'Bot', className }),
  MessageSquare: ({ className }: { className?: string }) => React.createElement('svg', { 'data-icon': 'MessageSquare', className }),
}));

import AgentPage from '../app/dashboard/agent/page';

describe('probe', () => {
  it('trivial', () => {
    expect(typeof AgentPage).toBe('function');
  });
});
