import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { redirectSpy, notFoundSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn(),
  notFoundSpy: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectSpy,
  notFound: notFoundSpy,
}));

import AnalyticsPage from '@/app/dashboard/analytics/page';
import DocsPage from '@/app/dashboard/docs/page';

beforeEach(() => {
  vi.clearAllMocks();
  redirectSpy.mockImplementation(() => { throw new Error('redirect'); });
  notFoundSpy.mockImplementation(() => { throw new Error('notFound'); });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// NC-280: /dashboard/analytics redirects to /dashboard/agent
describe('NC-280 — analytics page redirect', () => {
  it('calls redirect("/dashboard/agent") on render', () => {
    try {
      render(React.createElement(AnalyticsPage as unknown as React.FC));
    } catch {
      // redirect() throws internally — expected in test environment
    }
    expect(redirectSpy).toHaveBeenCalledWith('/dashboard/agent');
  });
});

// NC-280: /dashboard/docs → 404 (notFound stub)
describe('NC-280 — docs page returns 404', () => {
  it('calls notFound() on render (route returns 404)', () => {
    try {
      render(React.createElement(DocsPage as unknown as React.FC));
    } catch {
      // notFound() throws internally — expected in test environment
    }
    expect(notFoundSpy).toHaveBeenCalled();
  });
});
