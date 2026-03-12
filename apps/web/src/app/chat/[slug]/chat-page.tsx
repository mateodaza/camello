'use client';

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './chat-page.module.css';
import { generateQrSvg } from '@/lib/qr-svg';
import { SimpleMarkdown } from '@/components/simple-markdown';
import type { InfoData } from './page';

// ---------------------------------------------------------------------------
// i18n — inline string map (consumer-facing, keyed by artifact language)
// ---------------------------------------------------------------------------

const strings = {
  en: {
    placeholder: 'Type a message...',
    send: 'Send',
    typing: 'Thinking...',
    poweredBy: 'Powered by Camello',
    errorSession: 'Could not connect. Please try again.',
    errorSend: 'Failed to send. Try again.',
    errorNotFound: 'This chat link is invalid or no longer active.',
    budgetExceeded: 'This agent has reached its usage limit. Please try again later.',
    conversationLimit: 'This conversation has reached its message limit. Please start a new conversation.',
    dailyLimit: 'You have reached your daily message limit. Please try again tomorrow.',
    slowDown: 'Slow down — please wait a moment before sending another message.',
    retry: 'Retry',
    shareQr: 'Share QR',
    closeQr: 'Close',
    teamLabel: 'Team',
  },
  es: {
    placeholder: 'Escribe un mensaje...',
    send: 'Enviar',
    typing: 'Pensando...',
    poweredBy: 'Impulsado por Camello',
    errorSession: 'No se pudo conectar. Inténtalo de nuevo.',
    errorSend: 'No se pudo enviar. Inténtalo de nuevo.',
    errorNotFound: 'Este enlace de chat es inválido o ya no está activo.',
    budgetExceeded: 'Este agente alcanzó su límite de uso. Inténtalo más tarde.',
    conversationLimit: 'Esta conversación alcanzó su límite de mensajes. Inicia una nueva conversación.',
    dailyLimit: 'Alcanzaste tu límite diario de mensajes. Inténtalo mañana.',
    slowDown: 'Más despacio — espera un momento antes de enviar otro mensaje.',
    retry: 'Reintentar',
    shareQr: 'Compartir QR',
    closeQr: 'Cerrar',
    teamLabel: 'Equipo',
  },
} as const;

type Locale = keyof typeof strings;

function t(key: keyof (typeof strings)['en'], lang: string): string {
  const locale: Locale = lang in strings ? (lang as Locale) : 'en';
  return strings[locale][key];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'customer' | 'artifact' | 'human';
  content: string;
}

type PageState = 'idle' | 'connecting' | 'ready' | 'error';
type ErrorKind = 'not_found' | 'connection';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Debug helpers (dev only) ──────────────────────────────────────────────────
const DEBUG = process.env.NODE_ENV === 'development';
function dbg(label: string, data?: unknown) {
  if (!DEBUG) return;
  console.log(`%c[chat-page] ${label}`, 'color:#00897B;font-weight:bold', data ?? '');
}
function dbgWarn(label: string, data?: unknown) {
  if (!DEBUG) return;
  console.warn(`%c[chat-page] ${label}`, 'color:#E8613C;font-weight:bold', data ?? '');
}

// Social link icons (inline SVG paths)
const SOCIAL_ICONS: Record<string, string> = {
  twitter: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
  facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  website: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
};

// ---------------------------------------------------------------------------
// Browser fingerprint
// ---------------------------------------------------------------------------

async function getVisitorFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  const raw = parts.join('|');
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (const ch of raw) {
    hash = (hash << 5) - hash + ch.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatPageProps {
  slug: string;
  ssrInfo: InfoData | null;
}

export default function ChatPage({ slug, ssrInfo }: ChatPageProps) {
  const [state, setState] = useState<PageState>('idle');
  const [lang, setLang] = useState(ssrInfo?.language ?? 'en');
  const [tenantName, setTenantName] = useState(ssrInfo?.tenant_name ?? '');
  const [token, setToken] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('connection');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [hasUserSent, setHasUserSent] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initCalled = useRef(false);

  const profile = ssrInfo?.profile ?? null;
  const quickActions = ssrInfo?.quick_actions ?? [];

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  // Bootstrap: create session + load history (skip /info — have ssrInfo)
  const bootstrap = useCallback(async () => {
    if (initCalled.current) return;
    initCalled.current = true;
    setState('connecting');

    dbg('bootstrap start', { API_URL, slug, NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });

    try {
      const fingerprint = await getVisitorFingerprint();
      const sessionUrl = `${API_URL}/api/widget/session`;
      dbg('POST session →', sessionUrl);

      const sessionRes = await fetch(sessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_slug: slug, visitor_fingerprint: fingerprint }),
      });

      dbg('session response', { status: sessionRes.status, ok: sessionRes.ok, url: sessionRes.url });

      if (!sessionRes.ok) {
        const body = await sessionRes.text().catch(() => '(unreadable)');
        dbgWarn('session failed', { status: sessionRes.status, body });
        setErrorKind(sessionRes.status === 400 ? 'not_found' : 'connection');
        setState('error');
        return;
      }

      const session = await sessionRes.json() as {
        token: string;
        tenant_name: string;
        artifact_name: string;
        language?: string;
      };

      dbg('session ok', { tenant_name: session.tenant_name, artifact_name: session.artifact_name, language: session.language, tokenPrefix: session.token?.slice(0, 20) + '…' });

      setToken(session.token);
      setTenantName(session.tenant_name);
      setLang(session.language ?? 'en');

      // Load history
      const historyUrl = `${API_URL}/api/widget/history`;
      dbg('GET history →', historyUrl);
      const historyRes = await fetch(historyUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
      });

      let restoredMessages: ChatMessage[] = [];
      let restoredConvId: string | null = null;

      dbg('history response', { status: historyRes.status, ok: historyRes.ok });

      if (historyRes.ok) {
        const history = await historyRes.json() as {
          conversation_id: string | null;
          messages: Array<{ id: string; role: string; content: string }>;
        };
        dbg('history loaded', { conversation_id: history.conversation_id, messageCount: history.messages.length });
        if (history.messages.length > 0) {
          restoredMessages = history.messages
            .filter((m) => m.role === 'customer' || m.role === 'artifact' || m.role === 'human')
            .map((m) => ({ role: m.role as ChatMessage['role'], content: m.content }));
          restoredConvId = history.conversation_id;
          setHasUserSent(true);
          // Seed known server IDs so polling doesn't duplicate restored messages
          for (const m of history.messages) {
            knownServerIdsRef.current.add(m.id);
          }
        }
      } else {
        dbgWarn('history failed', { status: historyRes.status });
      }

      // Show greeting from SSR info if no history
      if (restoredMessages.length === 0 && ssrInfo?.greeting) {
        restoredMessages = [{ role: 'artifact', content: ssrInfo.greeting }];
      }

      dbg('bootstrap complete → ready', { restoredMessageCount: restoredMessages.length, conversationId: restoredConvId });
      setChatMessages(restoredMessages);
      setConversationId(restoredConvId);
      setState('ready');
    } catch (err) {
      dbgWarn('bootstrap threw', err);
      setErrorKind('connection');
      setState('error');
    }
  }, [slug, ssrInfo]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Send message
  const handleSend = useCallback(async (text: string) => {
    if (!token || isSending || !text.trim() || inputDisabled) {
      dbgWarn('handleSend blocked', { hasToken: !!token, isSending, hasText: !!text.trim(), inputDisabled });
      return;
    }
    setIsSending(true);
    setSendError(null);
    setHasUserSent(true);

    const trimmed = text.trim();
    setChatMessages((prev) => [...prev, { role: 'customer', content: trimmed }]);

    const messageUrl = `${API_URL}/api/widget/message`;
    dbg('POST message →', { url: messageUrl, conversationId, textLength: trimmed.length });

    try {
      const res = await fetch(messageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, conversation_id: conversationId }),
      });
      dbg('message response', { status: res.status, ok: res.ok, url: res.url });

      if (res.status === 429) {
        setSendError(t('slowDown', lang));
        setChatMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as {
        conversation_id: string;
        response_text: string;
        budget_exceeded?: boolean;
        conversation_limit_reached?: boolean;
        daily_limit_reached?: boolean;
      };

      setConversationId(data.conversation_id);

      if (data.budget_exceeded) {
        setChatMessages((prev) => [...prev, { role: 'artifact', content: t('budgetExceeded', lang) }]);
        setInputDisabled(true);
      } else if (data.conversation_limit_reached) {
        setChatMessages((prev) => [...prev, { role: 'artifact', content: t('conversationLimit', lang) }]);
        setInputDisabled(true);
      } else if (data.daily_limit_reached) {
        setChatMessages((prev) => [...prev, { role: 'artifact', content: t('dailyLimit', lang) }]);
        setInputDisabled(true);
      } else {
        setChatMessages((prev) => [...prev, { role: 'artifact', content: data.response_text }]);
      }
    } catch (err) {
      dbgWarn('message send threw', err);
      setSendError(t('errorSend', lang));
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  }, [token, isSending, conversationId, lang, inputDisabled]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleSend(input);
    setInput('');
    inputRef.current?.focus();
  };

  // Poll /history for new messages (owner replies)
  const knownServerIdsRef = useRef<Set<string>>(new Set());
  const isSendingRef = useRef(false);
  isSendingRef.current = isSending;

  useEffect(() => {
    if (!conversationId || !token || inputDisabled) return;

    const poll = async () => {
      if (isSendingRef.current) return;

      try {
        const res = await fetch(`${API_URL}/api/widget/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json() as {
          conversation_id: string | null;
          messages: Array<{ id: string; role: string; content: string }>;
        };

        if (!data.messages) return;

        // Content-based dedup: optimistic messages use client IDs, server uses UUIDs
        setChatMessages((prev) => {
          const localContents = new Set(prev.map((m) => `${m.role}:${m.content}`));
          const newMsgs: ChatMessage[] = [];

          for (const sm of data.messages) {
            if (knownServerIdsRef.current.has(sm.id)) continue;
            if (sm.role !== 'human' && sm.role !== 'artifact' && sm.role !== 'customer') continue;

            knownServerIdsRef.current.add(sm.id);
            const key = `${sm.role}:${sm.content}`;
            if (localContents.has(key)) continue;

            newMsgs.push({ role: sm.role as ChatMessage['role'], content: sm.content });
          }

          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      } catch {
        // Non-critical — silently retry next interval
      }
    };

    // Poll on interval + immediately when tab becomes visible (catches replies sent while tab was hidden)
    const interval = setInterval(poll, 5000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [conversationId, token, inputDisabled]);

  // QR code — generated from our own deterministic SVG encoder (no user-controlled HTML)
  const chatUrl = typeof window !== 'undefined'
    ? window.location.href
    : `https://camello.xyz/chat/${slug}`;
  const qrSvgHtml = showQr ? generateQrSvg(chatUrl, { moduleSize: 3, margin: 2 }) : '';

  // ── Error state ──
  if (state === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-cream px-6 text-center">
        <Image
          src="/illustrations/camel-logo.jpeg"
          alt="Camello"
          width={48}
          height={48}
          className="mb-4 rounded-lg"
          unoptimized
        />
        <p className="mb-4 font-body text-charcoal">
          {t(errorKind === 'not_found' ? 'errorNotFound' : 'errorSession', lang)}
        </p>
        <button
          onClick={() => { initCalled.current = false; bootstrap(); }}
          className="rounded-md bg-teal px-5 py-2 font-heading text-sm font-medium uppercase tracking-widest text-cream transition-colors hover:bg-teal/90"
        >
          {t('retry', lang)}
        </button>
      </div>
    );
  }

  // ── Loading state ──
  if (state !== 'ready') {
    return (
      <div className="flex h-dvh items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/illustrations/camel-logo.jpeg"
            alt="Camello"
            width={48}
            height={48}
            className="animate-pulse rounded-lg"
            unoptimized
          />
          <span className="font-body text-sm text-dune">
            {state === 'connecting' ? '...' : ''}
          </span>
        </div>
      </div>
    );
  }

  // ── Ready state ──
  return (
    <div className="flex h-dvh flex-col bg-cream">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-charcoal/8 bg-midnight px-4 py-3">
        <Image
          src="/illustrations/camel-logo.jpeg"
          alt="Camello"
          width={28}
          height={28}
          className="shrink-0 rounded-md"
          unoptimized
        />
        <span className="flex-1 font-heading text-xs font-bold uppercase tracking-widest text-cream/50">
          Camello
        </span>
        <button
          onClick={() => setShowQr(true)}
          className="shrink-0 rounded-md p-1.5 text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
          aria-label={t('shareQr', lang)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="3" height="3" />
            <rect x="18" y="18" width="3" height="3" />
            <rect x="18" y="14" width="3" height="1" />
            <rect x="14" y="18" width="1" height="3" />
          </svg>
        </button>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">

          {/* Business card — collapsible professional profile */}
          {profile && (profile.tagline || profile.bio || profile.avatarUrl || profile.location || profile.hours || (profile.socialLinks && profile.socialLinks.length > 0)) && (
            <div className="mb-3 overflow-hidden rounded-2xl border border-charcoal/8 bg-white shadow-sm">
              {/* Compact header — always visible, click to toggle */}
              <button
                onClick={() => setCardExpanded((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-charcoal/[0.02]"
              >
                {profile.avatarUrl && (
                  <img
                    src={profile.avatarUrl}
                    alt={tenantName}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full border border-teal/20 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm font-bold text-charcoal">
                    {tenantName}
                  </p>
                  {profile.tagline && (
                    <p className="truncate font-body text-xs text-dune">{profile.tagline}</p>
                  )}
                </div>
                {/* Social icons inline when collapsed (desktop) */}
                {!cardExpanded && profile.socialLinks && profile.socialLinks.length > 0 && (
                  <div className="hidden shrink-0 gap-1.5 sm:flex">
                    {profile.socialLinks.slice(0, 3).map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-charcoal/5 text-dune transition-colors hover:bg-teal/10 hover:text-teal"
                        aria-label={link.platform}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d={SOCIAL_ICONS[link.platform.toLowerCase()] ?? SOCIAL_ICONS.website} />
                        </svg>
                      </a>
                    ))}
                  </div>
                )}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`shrink-0 text-dune/40 transition-transform duration-200 ${cardExpanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded details */}
              {cardExpanded && (
                <div className="border-t border-charcoal/5 px-4 pb-4 pt-3">
                  {profile.bio && (
                    <p className="font-body text-sm leading-relaxed text-dune">{profile.bio}</p>
                  )}
                  {/* Location + Hours + Social — horizontal row */}
                  {(profile.location || profile.hours || (profile.socialLinks && profile.socialLinks.length > 0)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      {profile.location && (
                        <span className="flex items-center gap-1 font-body text-xs text-dune/80">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-teal/60"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {profile.location}
                        </span>
                      )}
                      {profile.hours && (
                        <span className="flex items-center gap-1 font-body text-xs text-dune/80">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-teal/60"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {profile.hours}
                        </span>
                      )}
                      {profile.socialLinks && profile.socialLinks.length > 0 && (
                        <>
                          {(profile.location || profile.hours) && (
                            <span className="h-3.5 w-px bg-charcoal/10" />
                          )}
                          <div className="flex gap-1.5">
                            {profile.socialLinks.map((link, i) => (
                              <a
                                key={i}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal/5 text-dune transition-colors hover:bg-teal/10 hover:text-teal"
                                aria-label={link.platform}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                  <path d={SOCIAL_ICONS[link.platform.toLowerCase()] ?? SOCIAL_ICONS.website} />
                                </svg>
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick action buttons (hide after first user message) */}
          {quickActions.length > 0 && !hasUserSent && (
            <div className="mb-2 flex flex-wrap gap-2">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    handleSend(action.message);
                    setInput('');
                  }}
                  className="rounded-full border border-teal/30 bg-teal/5 px-3 py-1.5 font-body text-xs font-medium text-teal transition-colors hover:bg-teal/10"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 font-body text-sm leading-relaxed ${
                  msg.role === 'customer'
                    ? 'whitespace-pre-wrap bg-teal text-cream'
                    : 'bg-sand text-charcoal'
                }`}
              >
                {msg.role === 'customer' ? msg.content : <SimpleMarkdown text={msg.content} />}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isSending && (
            <div className="flex justify-start">
              <div className={`flex items-center gap-1 rounded-2xl bg-sand px-4 py-3 text-dune ${styles.typing}`}>
                <span /><span /><span />
              </div>
            </div>
          )}

          {/* Send error banner */}
          {sendError && (
            <div className="text-center font-body text-xs text-sunset">
              {sendError}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-charcoal/8 bg-cream px-4 py-3">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-2xl items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputDisabled ? '' : t('placeholder', lang)}
            maxLength={4000}
            disabled={inputDisabled}
            autoFocus
            className="flex-1 rounded-xl border border-charcoal/15 bg-white px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-dune focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending || inputDisabled}
            className="shrink-0 rounded-xl bg-teal px-5 py-2.5 font-heading text-sm font-medium uppercase tracking-wider text-cream transition-colors hover:bg-teal/90 disabled:opacity-50"
          >
            {t('send', lang)}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="border-t border-charcoal/8 bg-cream py-2 text-center">
        <Link
          href="https://camello.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-xs text-dune transition-colors hover:text-charcoal"
        >
          {t('poweredBy', lang)}
        </Link>
      </div>

      {/* QR Modal — SVG generated by our deterministic encoder (only <rect> elements, no user HTML) */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 backdrop-blur-sm"
          onClick={() => setShowQr(false)}
        >
          <div
            className="mx-4 max-w-xs rounded-xl bg-white p-6 text-center shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 font-heading text-sm font-semibold text-charcoal">{tenantName}</p>
            <div
              className="mx-auto mb-4 inline-block"
              dangerouslySetInnerHTML={{ __html: qrSvgHtml }}
            />
            <p className="mb-4 break-all font-body text-xs text-dune">{chatUrl}</p>
            <button
              onClick={() => setShowQr(false)}
              className="rounded-md bg-charcoal/10 px-4 py-2 font-heading text-xs font-medium uppercase tracking-wider text-charcoal transition-colors hover:bg-charcoal/20"
            >
              {t('closeQr', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
