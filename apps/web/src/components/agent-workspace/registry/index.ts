import { salesSections } from './sales';
import { supportSections } from './support';
import { marketingSections } from './marketing';
import type { ComponentType } from 'react';

export const sectionRegistry: Record<string, ComponentType<{ artifactId: string }>[]> = {
  sales: salesSections,
  support: supportSections,
  marketing: marketingSections,
  custom: [],
};
