export type SkillTriggerMode = 'always' | 'intent' | 'keyword';
export type SkillType = 'sales' | 'support' | 'marketing' | 'general';

export interface SkillTrigger {
  mode: SkillTriggerMode;
  intents?: string[];
  keywords?: string[];
}

export interface SkillDefinition {
  slug: string;
  name: string;
  description: string;
  type: SkillType;
  trigger: SkillTrigger;
  priority: number;
  token_budget: number;
  requires_modules: string[];
  conflicts_with: string[];
  locale: string[];
  version: number;
  body: string;
  source: 'platform' | 'tenant';
}

export interface ResolvedSkill {
  slug: string;
  name: string;
  body: string;
  priority: number;
  source: 'platform' | 'tenant';
}

export interface SkillResolutionContext {
  intent: { type: string; confidence: number };
  messageText: string;
  artifactType: string;
  activeModuleSlugs: string[];
  locale: string;
}
