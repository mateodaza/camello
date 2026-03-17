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
  definition: SkillDefinition;
  body: string;
  tokens: number;
}

export interface SkillResolutionContext {
  locale: string;
  agentType: SkillType;
  activeModules: string[];
  detectedIntents?: string[];
  detectedKeywords?: string[];
}
