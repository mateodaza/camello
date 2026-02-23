import type { AutonomyLevel } from '@camello/shared/types';

export interface PromptTemplates {
  identity: (name: string, role: string, company: string) => string;
  noOtherCompanies: string;
  safety: string;
  tone: (tone: string) => string;
  language: (lang: string) => string;
  channelStyle: (style: string) => string;
  styleNotes: string;
  channelGreeting: (greeting: string) => string;
  hardRules: string;
  knowledgeStart: string;
  knowledgeEnd: string;
  proactiveStart: string;
  proactiveInstruction: string;
  proactiveEnd: string;
  learningsStart: string;
  learningsEnd: string;
  modulesStart: string;
  modulesInstruction: string;
  autonomy: Record<AutonomyLevel, string>;
  modulesRules: string;
  modulesEnd: string;
  archetypeFramework: (framework: string) => string;
  customInstructions: (instructions: string) => string;
}
