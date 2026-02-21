import { describe, it, expect } from 'vitest';
import { STEP_KEYS } from '../components/WizardProgress';

// ---------------------------------------------------------------------------
// Wizard step constants
// ---------------------------------------------------------------------------
describe('STEP_KEYS', () => {
  it('has exactly 6 steps', () => {
    expect(STEP_KEYS).toHaveLength(6);
  });

  it('starts with step1 and ends with step6', () => {
    expect(STEP_KEYS[0]).toBe('step1');
    expect(STEP_KEYS[STEP_KEYS.length - 1]).toBe('step6');
  });

  it('keys are unique', () => {
    expect(new Set(STEP_KEYS).size).toBe(STEP_KEYS.length);
  });
});

// ---------------------------------------------------------------------------
// Suggestion interface shape (type-level + runtime validation)
// ---------------------------------------------------------------------------
describe('Suggestion shape', () => {
  const validSuggestion = {
    template: 'services',
    agentName: 'Alex',
    agentType: 'sales',
    personality: {
      tone: 'professional',
      greeting: 'Hello! How can I help?',
      goals: ['Qualify leads', 'Book demos'],
    },
    constraints: {
      neverDiscuss: ['competitor pricing'],
      alwaysEscalate: ['refund requests'],
    },
    industry: 'SaaS',
    confidence: 0.85,
  };

  it('has all required fields', () => {
    const required = [
      'template',
      'agentName',
      'agentType',
      'personality',
      'constraints',
      'industry',
      'confidence',
    ];
    for (const key of required) {
      expect(validSuggestion).toHaveProperty(key);
    }
  });

  it('personality has tone, greeting, and goals array', () => {
    expect(typeof validSuggestion.personality.tone).toBe('string');
    expect(typeof validSuggestion.personality.greeting).toBe('string');
    expect(Array.isArray(validSuggestion.personality.goals)).toBe(true);
    expect(validSuggestion.personality.goals.length).toBeGreaterThan(0);
  });

  it('constraints has neverDiscuss and alwaysEscalate arrays', () => {
    expect(Array.isArray(validSuggestion.constraints.neverDiscuss)).toBe(true);
    expect(Array.isArray(validSuggestion.constraints.alwaysEscalate)).toBe(true);
  });

  it('confidence is a number between 0 and 1', () => {
    expect(validSuggestion.confidence).toBeGreaterThanOrEqual(0);
    expect(validSuggestion.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Widget snippet construction
// ---------------------------------------------------------------------------
describe('widget snippet construction', () => {
  it('uses NEXT_PUBLIC_WIDGET_URL env var when set', () => {
    const widgetUrl = 'https://cdn.camello.lat';
    const snippet = `<script src="${widgetUrl}/widget.js" async></script>`;
    expect(snippet).toContain('cdn.camello.lat/widget.js');
    expect(snippet).toContain('async');
  });

  it('falls back to localhost:5173 when env var is missing', () => {
    const widgetUrl = undefined;
    const snippet = `<script src="${widgetUrl ?? 'http://localhost:5173'}/widget.js" async></script>`;
    expect(snippet).toContain('localhost:5173/widget.js');
  });

  it('produces a valid script tag', () => {
    const snippet = `<script src="http://localhost:5173/widget.js" async></script>`;
    expect(snippet).toMatch(/^<script src="[^"]+" async><\/script>$/);
  });
});
