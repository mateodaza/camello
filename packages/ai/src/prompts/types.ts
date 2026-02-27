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
  primaryKnowledgeStart: string;
  primaryKnowledgeEnd: string;
  supportingKnowledgeStart: string;
  supportingKnowledgeEnd: string;
  knowledgeExtractionHint: string;
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
  /** Injected when RAG search ran but returned zero results. */
  emptyRagWarning: string;
  /** Customer memory section — untrusted, user-reported facts. */
  customerMemoryStart: string;
  customerMemoryInstruction: string;
  customerMemoryEnd: string;
}
