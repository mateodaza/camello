import type { ReactNode } from 'react';

/**
 * Lightweight markdown renderer — handles bold, italic, bullet/numbered lists,
 * and paragraph breaks. Returns React elements (no dangerouslySetInnerHTML).
 */

function formatInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Match **bold** first, then *italic* (non-greedy)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<em key={key++}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let elKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    if (listType === 'ol') {
      elements.push(
        <ol key={elKey++} className="ml-4 list-decimal space-y-0.5">
          {listItems}
        </ol>,
      );
    } else {
      elements.push(
        <ul key={elKey++} className="ml-4 list-disc space-y-0.5">
          {listItems}
        </ul>,
      );
    }
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const ulMatch = line.match(/^[*-]\s+(.+)/);
    const olMatch = line.match(/^\d+\.\s+(.+)/);

    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={listItems.length}>{formatInline(ulMatch[1])}</li>);
    } else if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={listItems.length}>{formatInline(olMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim()) {
        elements.push(<p key={elKey++}>{formatInline(line)}</p>);
      }
    }
  }
  flushList();

  return <div className="space-y-1.5">{elements}</div>;
}
