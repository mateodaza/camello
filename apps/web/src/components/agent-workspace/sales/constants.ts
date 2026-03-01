export const STAGES = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
export type Stage = typeof STAGES[number];

export const CLOSED_STAGES: Stage[] = ['closed_won', 'closed_lost'];

export const SCORES = ['hot', 'warm', 'cold'] as const;

export const scoreDots: Record<string, string> = {
  hot: 'bg-teal',
  warm: 'bg-gold',
  cold: 'bg-charcoal/30',
};

export function stageKey(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
