import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../prompt-builder.js';
import type { RagChunk } from '@camello/shared/types';
import type { ResolvedSkill } from '../skills/types.js';

const baseCtx = {
  artifact: {
    name: 'Sofia',
    role: 'sales assistant',
    type: 'sales',
    personality: { tone: 'friendly', language: 'en' },
    constraints: {},
    config: {},
    companyName: 'Acme Corp',
  },
  ragContext: [] as RagChunk[],
  learnings: [],
};

describe('skill prompt injection', () => {
  it('no skills section when resolvedSkills is undefined', () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).not.toContain('--- ACTIVE SKILLS ---');
  });

  it('no skills section when resolvedSkills is empty array', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, resolvedSkills: [] });
    expect(prompt).not.toContain('--- ACTIVE SKILLS ---');
  });

  it('renders skill with correct opening tag, body, and closing tag', () => {
    const skill: ResolvedSkill = {
      slug: 'test-slug',
      name: 'Test Skill',
      body: '## Goal\nAchieve the objective.',
      priority: 10,
      source: 'platform',
    };
    const prompt = buildSystemPrompt({ ...baseCtx, resolvedSkills: [skill] });

    // Section header present
    expect(prompt).toContain('--- ACTIVE SKILLS ---');
    expect(prompt).toContain('Follow these situational guidelines');

    // Exact per-skill rendering: opening tag, body, closing tag
    expect(prompt).toContain('[SKILL: test-slug]');
    expect(prompt).toContain('## Goal\nAchieve the objective.');
    expect(prompt).toContain('[/SKILL: test-slug]');

    // Opening tag appears before body, body before closing tag
    const openIdx = prompt.indexOf('[SKILL: test-slug]');
    const bodyIdx = prompt.indexOf('## Goal');
    const closeIdx = prompt.indexOf('[/SKILL: test-slug]');
    expect(openIdx).toBeLessThan(bodyIdx);
    expect(bodyIdx).toBeLessThan(closeIdx);

    // Section position: after archetype, before personality
    const frameworkIdx = prompt.indexOf('BEHAVIORAL FRAMEWORK');
    const skillsIdx = prompt.indexOf('--- ACTIVE SKILLS ---');
    const toneIdx = prompt.indexOf('Tone: friendly');
    expect(frameworkIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(toneIdx);
  });

  it('multiple skills rendered in provided order with correct tags', () => {
    const skills: ResolvedSkill[] = [
      { slug: 'high-priority', name: 'HP Skill', body: 'HP body.', priority: 10, source: 'platform' },
      { slug: 'low-priority', name: 'LP Skill', body: 'LP body.', priority: 5, source: 'platform' },
    ];
    const prompt = buildSystemPrompt({ ...baseCtx, resolvedSkills: skills });

    // Both skills present with correct tags
    expect(prompt).toContain('[SKILL: high-priority]');
    expect(prompt).toContain('[/SKILL: high-priority]');
    expect(prompt).toContain('[SKILL: low-priority]');
    expect(prompt).toContain('[/SKILL: low-priority]');

    // Order preserved
    expect(prompt.indexOf('[SKILL: high-priority]')).toBeLessThan(prompt.indexOf('[SKILL: low-priority]'));

    // high-priority closing tag appears before low-priority opening tag (no interleaving)
    expect(prompt.indexOf('[/SKILL: high-priority]')).toBeLessThan(prompt.indexOf('[SKILL: low-priority]'));
  });
});
