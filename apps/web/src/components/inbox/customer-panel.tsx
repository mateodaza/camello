'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Mail,
  Phone,
  Calendar,
  Monitor,
  MessageCircle,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDate, fmtTimeAgo, humanize, fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInboxPanel } from './inbox-layout';
import { useToast } from '@/hooks/use-toast';

interface CustomerPanelProps {
  conversationId: string | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityItem = {
  type: 'execution' | 'stage_change';
  timestamp: Date;
  moduleName?: string | undefined;
  moduleSlug?: string | undefined;
  input?: unknown;
  output?: unknown;
  fromStage?: string | undefined;
  toStage?: string | undefined;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function activityIcon(item: ActivityItem) {
  if (item.type === 'stage_change') return { Icon: ArrowRight, className: 'text-teal' };
  if (item.moduleSlug === 'escalate_to_human') return { Icon: AlertTriangle, className: 'text-sunset' };
  return { Icon: CheckCircle, className: 'text-teal' };
}

function activityLabel(
  t: ReturnType<typeof useTranslations<'inbox'>>,
  item: ActivityItem,
): string {
  if (item.type === 'stage_change') {
    return t('chatStageChanged', {
      from: humanize(item.fromStage ?? ''),
      to: humanize(item.toStage ?? ''),
    });
  }
  const out = (item.output as Record<string, unknown> | null | undefined);
  switch (item.moduleSlug) {
    case 'qualify_lead':
      return out?.score != null
        ? t('chatModuleQualifyLead', { score: String(out.score) })
        : t('chatModuleQualifyLeadNoScore');
    case 'send_quote':
      return out?.amount != null
        ? t('chatModuleSendQuote', { amount: fmtMoney(Number(out.amount)) })
        : t('chatModuleSendQuoteNoAmount');
    case 'book_meeting':      return t('chatModuleBookMeeting');
    case 'send_followup':     return t('chatModuleSendFollowup');
    case 'create_ticket':     return t('chatModuleCreateTicket');
    case 'escalate_to_human': return t('chatModuleEscalateToHuman');
    case 'collect_payment':
      return out?.amount != null
        ? t('chatModuleCollectPayment', { amount: fmtMoney(Number(out.amount)) })
        : t('chatModuleCollectPaymentNoAmount');
    case 'capture_interest':  return t('chatModuleCaptureInterest');
    case 'draft_content':     return t('chatModuleDraftContent');
    default:
      return t('chatModuleFallback', { name: humanize(item.moduleSlug ?? 'action') });
  }
}

// ── Activity list with collapse ───────────────────────────────────────────────

const ACTIVITY_PREVIEW_COUNT = 5;

function ActivityList({
  items,
  t,
}: {
  items: ActivityItem[];
  t: ReturnType<typeof useTranslations<'inbox'>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = items.length > ACTIVITY_PREVIEW_COUNT;
  const visible = showToggle && !expanded ? items.slice(-ACTIVITY_PREVIEW_COUNT) : items;

  return (
    <div className="divide-y divide-charcoal/8">
      {showToggle && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-xs text-teal hover:text-teal/80 font-medium"
        >
          {t('activityShowAll', { count: items.length })}
        </button>
      )}
      {visible.map((item, idx) => {
        const { Icon, className } = activityIcon(item);
        return (
          <div key={idx} className="flex gap-3 items-start py-2">
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', className)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-charcoal">{activityLabel(t, item)}</p>
              <p className="text-xs text-dune">{fmtTimeAgo(item.timestamp)}</p>
            </div>
          </div>
        );
      })}
      {showToggle && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-xs text-teal hover:text-teal/80 font-medium"
        >
          {t('activityShowLess')}
        </button>
      )}
    </div>
  );
}

// ── Collapsible section wrapper ───────────────────────────────────────────────

function CollapsibleSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-charcoal/8">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`section-${id}`}
          onClick={onToggle}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sand/40"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-dune">{title}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 text-dune transition-transform', open && 'rotate-180')}
          />
        </button>
      </h3>
      <div id={`section-${id}`} hidden={!open} className="px-4 pb-4">{children}</div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function CustomerPanel({ conversationId }: CustomerPanelProps) {
  if (conversationId === null) return null;
  return <CustomerPanelInner conversationId={conversationId} />;
}

function CustomerPanelInner({ conversationId }: { conversationId: string }) {
  const t = useTranslations('inbox');
  const utils = trpc.useUtils();
  const { goToChat } = useInboxPanel();
  const { addToast } = useToast();

  const conv = trpc.conversation.byId.useQuery(
    { id: conversationId },
    { refetchInterval: 30_000 },
  );
  const act = trpc.conversation.activity.useQuery(
    { conversationId },
    { refetchInterval: 30_000 },
  );
  const notes = trpc.agent.leadNotes.useQuery(
    { leadId: conv.data?.leadId ?? '' },
    { enabled: !!conv.data?.leadId, refetchInterval: 30_000 },
  );
  const addNoteMut = trpc.agent.addLeadNote.useMutation({
    onSuccess: (_result, variables) => {
      setNoteText('');
      utils.agent.leadNotes.invalidate({ leadId: variables.leadId });
    },
    onError: () => {
      addToast(t('notesAddError'), 'error');
    },
  });

  const [infoOpen, setInfoOpen]         = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [notesOpen, setNotesOpen]       = useState(true);
  const [noteText, setNoteText]         = useState('');

  // Loading skeleton — only while the request is in-flight
  if (conv.isLoading) {
    return (
      <div className="flex flex-col gap-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-charcoal/8 px-4 py-3">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Conversation not found (stale / invalid ID)
  if (!conv.data) {
    return (
      <div className="flex items-center justify-center py-12 px-4">
        <p className="text-sm text-dune text-center">{t('conversationNotFound')}</p>
      </div>
    );
  }

  const data = conv.data;
  const memFacts =
    (data.customerMemory as { facts?: { key: string; value: string }[] } | null)?.facts ?? [];

  // Fallback: use memory facts for email/phone when top-level columns are empty
  const displayEmail = data.customerEmail ?? memFacts.find((f) => f.key === 'email')?.value ?? null;
  const displayPhone = data.customerPhone ?? memFacts.find((f) => f.key === 'phone')?.value ?? null;

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Mobile back-to-chat row */}
      <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-charcoal/8 shrink-0">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-dune hover:text-charcoal"
          onClick={goToChat}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detailsBackToChat')}
        </button>
      </div>

      {/* ── Section A: Customer Info ─────────────────────────────────── */}
      <CollapsibleSection
        id="customer-info"
        title={t('customerInfoSection')}
        open={infoOpen}
        onToggle={() => setInfoOpen((v) => !v)}
      >
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-4 mt-1">
          <div
            className="rounded-full w-10 h-10 bg-teal/15 text-teal font-semibold uppercase flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {data.customerName?.[0] ?? '?'}
          </div>
          <p className="text-sm font-semibold text-charcoal truncate">{data.customerName}</p>
        </div>

        {/* Info rows */}
        <div className="space-y-2">
          {/* Email */}
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-dune shrink-0" aria-hidden="true" />
            <span className="text-sm text-charcoal truncate">{displayEmail ?? '—'}</span>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-dune shrink-0" aria-hidden="true" />
            <span className="text-sm text-charcoal truncate">{displayPhone ?? '—'}</span>
          </div>

          {/* Channel */}
          <div className="flex items-center gap-2">
            {data.customerChannel === 'whatsapp' ? (
              <MessageCircle className="h-4 w-4 text-dune shrink-0" aria-hidden="true" />
            ) : (
              <Monitor className="h-4 w-4 text-dune shrink-0" aria-hidden="true" />
            )}
            <span className="text-sm text-charcoal">
              {data.customerChannel === 'whatsapp'
                ? t('customerChannelWhatsApp')
                : t('customerChannelWebChat')}
            </span>
          </div>

          {/* First seen */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-dune shrink-0" aria-hidden="true" />
            <span className="text-sm text-charcoal">{fmtDate(data.customerFirstSeenAt)}</span>
          </div>
        </div>

        {/* Memory facts — exclude name/email/phone (already shown in info fields above) */}
        {memFacts.filter((f) => !['name', 'email', 'phone'].includes(f.key)).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-dune mb-2">
              {t('customerMemoryFacts')}
            </p>
            <div className="space-y-1">
              {memFacts.filter((f) => !['name', 'email', 'phone'].includes(f.key)).map((fact) => (
                <div key={fact.key} className="flex gap-2">
                  <span className="text-xs text-dune w-24 shrink-0 truncate">{fact.key}</span>
                  <span className="text-sm text-charcoal">{fact.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section B: Activity Timeline ─────────────────────────────── */}
      <CollapsibleSection
        id="activity-timeline"
        title={t('activitySection')}
        open={timelineOpen}
        onToggle={() => setTimelineOpen((v) => !v)}
      >
        {act.isError ? (
          <p className="text-sm text-sunset py-4 text-center">{t('activityLoadError')}</p>
        ) : (act.data ?? []).length === 0 ? (
          <p className="text-sm text-dune py-4 text-center">{t('activityEmpty')}</p>
        ) : (
          <ActivityList items={act.data ?? []} t={t} />
        )}
      </CollapsibleSection>

      {/* ── Section C: Notes ─────────────────────────────────────────── */}
      <CollapsibleSection
        id="notes"
        title={t('notesSection')}
        open={notesOpen}
        onToggle={() => setNotesOpen((v) => !v)}
      >
        {!data.leadId ? (
          <p className="text-sm text-dune">{t('notesNoLead')}</p>
        ) : (
          <div className="space-y-3">
            {/* Notes list */}
            {notes.isError ? (
              <p className="text-sm text-sunset">{t('notesLoadError')}</p>
            ) : (notes.data ?? []).length === 0 ? (
              <p className="text-sm text-dune">{t('notesEmpty')}</p>
            ) : (
              <div>
                {(notes.data ?? []).map((note) => (
                  <div key={note.id} className="text-sm text-charcoal border-b border-charcoal/8 py-2">
                    <p className="text-xs text-dune mb-1">
                      {note.author === 'owner' ? t('notesAuthorYou') : t('notesAuthorSystem')}
                      {' · '}
                      {fmtTimeAgo(note.createdAt)}
                    </p>
                    <p>{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add note form */}
            <div className="space-y-2">
              <label htmlFor="note-textarea" className="sr-only">
                {t('notesPlaceholder')}
              </label>
              <textarea
                id="note-textarea"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={3}
                maxLength={500}
                className="w-full resize-none text-sm rounded-md border border-charcoal/20 bg-cream px-3 py-2 text-charcoal placeholder:text-dune focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
              <Button
                size="sm"
                type="button"
                className="min-h-[36px]"
                disabled={addNoteMut.isPending || !noteText.trim()}
                onClick={() =>
                  addNoteMut.mutate({
                    leadId: data.leadId!,
                    content: noteText.trim(),
                  })
                }
              >
                {addNoteMut.isPending ? t('notesAdding') : t('notesAdd')}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
