'use client';

import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { MilkpodMessage } from '@milkpod/ai/types';
import { isToolUIPart } from 'ai';
import { BrainCircuit, Languages } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import { toast } from 'sonner';
import { Spinner } from '~/components/ui/spinner';
import { serverUrl } from '~/lib/api';
import { getTranslationsForMessage, subscribeTranslations } from '~/lib/api-fetchers';
import { ActivitySteps } from './activity-steps';
import { AiAvatar } from './ai-avatar';
import { useAssetSource } from './asset-source-context';
import { ShimmerText } from './shimmer-text';
import { TimestampLink } from './timestamp-link';

// Matches [MM:SS], [HH:MM:SS], and ranges like [MM:SS–MM:SS] or [MM:SS-MM:SS]
// Also strips optional surrounding parentheses, e.g. ([08:03]) → [08:03]
const TS = /\d+(?::\d{2}){1,2}/;
const TIMESTAMP_RE = new RegExp(
  `\\(?\\[(${TS.source})(?:[–\\-](${TS.source}))?\\](?!\\()\\)?`,
  'g',
);

function parseSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function linkifyTimestamps(text: string): string {
  return text.replace(
    TIMESTAMP_RE,
    (_match, start: string, end: string | undefined) => {
      const startSec = parseSeconds(start);
      if (end) {
        const endSec = parseSeconds(end);
        return `[\\[${start}\\]](#t=${startSec}) – [\\[${end}\\]](#t=${endSec})`;
      }
      return `[\\[${start}\\]](#t=${startSec})`;
    },
  );
}

const streamdownComponents: Components = {
  a: ({ href, children, node: _, ...rest }) => {
    if (typeof href === 'string' && href.startsWith('#t=')) {
      const seconds = Number(href.slice(3));
      if (!Number.isFinite(seconds) || seconds < 0) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      return <TimestampLink seconds={seconds}>{children}</TimestampLink>;
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
};

const TEXT_CLASS =
  'text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1';

function isActivityPart(part: MilkpodMessage['parts'][number]) {
  return part.type === 'reasoning' || isToolUIPart(part);
}

/**
 * Detects whether text is predominantly non-Latin (e.g. Hindi, Arabic, CJK).
 * Used to decide whether to show the translate toggle on a message.
 */
function isNonLatinText(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length < 10) return false;
  const latinCount = (letters.match(/[\p{Script=Latin}]/gu) ?? []).length;
  return latinCount / letters.length < 0.5;
}

interface ChatMessageProps {
  message: MilkpodMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const assetSource = useAssetSource();
  const [partsRef] = useAutoAnimate({
    duration: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });

  // Reactively subscribe to translations store — fires when background
  // fetch populates translations after the component has already mounted.
  const savedTranslations = useSyncExternalStore(
    subscribeTranslations,
    () => getTranslationsForMessage(message.id),
    () => undefined, // SSR snapshot
  );

  // Pre-populate translation cache synchronously from store on first render
  // to avoid a flash of untranslated content.
  const translationCache = useRef<Map<number, string>>(new Map());
  const initializedRef = useRef(false);
  if (!initializedRef.current && savedTranslations && Object.keys(savedTranslations).length > 0) {
    for (const [idx, txt] of Object.entries(savedTranslations)) {
      translationCache.current.set(Number(idx), txt);
    }
    initializedRef.current = true;
  }

  const hasSavedTranslations = initializedRef.current;

  // Translation state — initialize from saved translations to avoid flash
  const [showTranslation, setShowTranslation] = useState(hasSavedTranslations);
  const [translationState, setTranslationState] = useState<
    'idle' | 'streaming' | 'done'
  >(hasSavedTranslations ? 'done' : 'idle');
  const [streamingPartIndex, setStreamingPartIndex] = useState<number | null>(
    null,
  );
  const [streamedText, setStreamedText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // Track whether the user has manually toggled — prevents async arrivals
  // from overriding the user's choice to show original.
  const userToggledRef = useRef(false);

  // When translations arrive asynchronously (after mount), populate cache
  // and show translation — but only if the user hasn't toggled manually.
  useEffect(() => {
    if (
      savedTranslations &&
      Object.keys(savedTranslations).length > 0 &&
      !initializedRef.current
    ) {
      for (const [idx, txt] of Object.entries(savedTranslations)) {
        translationCache.current.set(Number(idx), txt);
      }
      initializedRef.current = true;
      if (!userToggledRef.current) {
        setTranslationState('done');
        setShowTranslation(true);
      }
    }
  }, [savedTranslations]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleTranslateToggle = useCallback(async () => {
    userToggledRef.current = true;

    // Toggle back to original
    if (showTranslation) {
      setShowTranslation(false);
      setTranslationState('idle');
      return;
    }

    // All parts cached — instant show
    const textParts = message.parts
      .map((p, i) => ({ part: p, index: i }))
      .filter(
        (e) => e.part.type === 'text' && e.part.text.trim().length > 0,
      );

    if (textParts.every((e) => translationCache.current.has(e.index))) {
      setShowTranslation(true);
      setTranslationState('done');
      return;
    }

    // Start streaming translation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTranslationState('streaming');

    for (const entry of textParts) {
      if (controller.signal.aborted) return;
      if (translationCache.current.has(entry.index)) continue;
      if (entry.part.type !== 'text') continue;

      setStreamingPartIndex(entry.index);
      setStreamedText('');

      try {
        const res = await fetch(`${serverUrl}/api/chat/translate`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: entry.part.text,
            messageId: message.id,
            partIndex: entry.index,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error('Translation failed');
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let result = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) return;
          result += decoder.decode(value, { stream: true });
          setStreamedText(result);
        }

        translationCache.current.set(entry.index, result);
      } catch (err) {
        if (controller.signal.aborted) return;
        toast.error('Translation failed. Please try again.');
        setTranslationState('idle');
        setStreamingPartIndex(null);
        setStreamedText('');
        return;
      }
    }

    if (!controller.signal.aborted) {
      setStreamingPartIndex(null);
      setStreamedText('');
      setTranslationState('done');
      setShowTranslation(true);
    }
  }, [showTranslation, message.id, message.parts]);

  const shouldLinkify = !!assetSource && assetSource.sourceType !== 'upload';
  const hasRenderableAssistantPart = message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    return !isUser && isActivityPart(part);
  });

  // --- User message ---
  if (isUser) {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
          {message.parts.map((part, i) =>
            part.type === 'text' ? (
              <Streamdown
                key={i}
                className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              >
                {part.text}
              </Streamdown>
            ) : null,
          )}
        </div>
      </div>
    );
  }

  // --- Assistant message ---
  const hasActivityParts = message.parts.some(isActivityPart);
  const hasTextContent = message.parts.some(
    (p) => p.type === 'text' && p.text.trim().length > 0,
  );

  // Show translate button if: message has saved translations, translation is
  // in progress/done, or the text is predominantly non-Latin.
  const showTranslateButton =
    !isStreaming &&
    hasTextContent &&
    (translationState !== 'idle' ||
      translationCache.current.size > 0 ||
      isNonLatinText(
        message.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p.type === 'text' ? p.text : ''))
          .join(' '),
      ));

  return (
    <div className="flex gap-3 py-2">
      <AiAvatar />

      <div ref={partsRef} className="min-w-0 flex-1 space-y-3 pt-0.5">
        {/* Collapsible activity steps (reasoning + tool calls) */}
        {hasActivityParts && (
          <ActivitySteps
            parts={message.parts}
            isStreaming={!!isStreaming}
            hasTextContent={hasTextContent}
          />
        )}

        {/* Text content */}
        {message.parts.map((part, i) => {
          if (part.type !== 'text') return null;

          const originalMarkdown = shouldLinkify
            ? linkifyTimestamps(part.text)
            : part.text;
          const cached = translationCache.current.get(i);
          const isPartStreaming = streamingPartIndex === i;

          // Currently streaming this part — grid overlay with blur dissolve
          if (isPartStreaming) {
            const streamed = shouldLinkify
              ? linkifyTimestamps(streamedText)
              : streamedText;
            return (
              <div
                key={i}
                className="grid rounded-2xl rounded-tl-md bg-muted/40 px-4 py-3"
              >
                {/* Blurred original underneath */}
                <div
                  className="col-start-1 row-start-1 select-none blur-[3px] opacity-20 transition-[filter,opacity] duration-500"
                  aria-hidden
                >
                  <Streamdown className={TEXT_CLASS}>
                    {originalMarkdown}
                  </Streamdown>
                </div>
                {/* Streaming translation on top */}
                {streamedText && (
                  <div className="col-start-1 row-start-1">
                    <Streamdown
                      isAnimating
                      className={TEXT_CLASS}
                      components={
                        shouldLinkify ? streamdownComponents : undefined
                      }
                    >
                      {streamed}
                    </Streamdown>
                  </div>
                )}
              </div>
            );
          }

          const isWaiting =
            translationState === 'streaming' &&
            streamingPartIndex !== null &&
            streamingPartIndex < i &&
            !cached;
          const showingTranslated = showTranslation && !!cached;

          // Has cached translation — animate height between original ↔ translated
          if (cached) {
            const translated = shouldLinkify
              ? linkifyTimestamps(cached)
              : cached;
            return (
              <div
                key={i}
                className="rounded-2xl rounded-tl-md bg-muted/40"
              >
                {/* Original — collapses when showing translation */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    showingTranslated
                      ? 'grid-rows-[0fr]'
                      : 'grid-rows-[1fr]'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="px-4 py-3">
                      <Streamdown
                        className={TEXT_CLASS}
                        components={
                          shouldLinkify
                            ? streamdownComponents
                            : undefined
                        }
                      >
                        {originalMarkdown}
                      </Streamdown>
                    </div>
                  </div>
                </div>
                {/* Translation — expands when shown */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    showingTranslated
                      ? 'grid-rows-[1fr]'
                      : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="px-4 py-3">
                      <Streamdown
                        className={TEXT_CLASS}
                        components={
                          shouldLinkify
                            ? streamdownComponents
                            : undefined
                        }
                      >
                        {translated}
                      </Streamdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // No translation — just the original
          return (
            <div
              key={i}
              className={`rounded-2xl rounded-tl-md bg-muted/40 px-4 py-3 transition-[filter,opacity] duration-300 ${
                isWaiting ? 'blur-[2px] opacity-40' : ''
              }`}
            >
              <Streamdown
                isAnimating={isStreaming}
                className={TEXT_CLASS}
                components={shouldLinkify ? streamdownComponents : undefined}
              >
                {originalMarkdown}
              </Streamdown>
            </div>
          );
        })}

        {/* Translate toggle */}
        {showTranslateButton && (
          <button
            type="button"
            onClick={handleTranslateToggle}
            disabled={translationState === 'streaming'}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            {translationState === 'streaming' ? (
              <Spinner className="size-3" />
            ) : (
              <Languages className="size-3" />
            )}
            {translationState === 'streaming'
              ? 'Translating...'
              : showTranslation
                ? 'Show original'
                : 'Translate'}
          </button>
        )}

        {/* Initial thinking state (before any parts arrive) */}
        {isStreaming && !hasRenderableAssistantPart && (
          <div className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <BrainCircuit className="size-4 shrink-0 text-muted-foreground/45 animate-pulse" />
            <ShimmerText
              active
              className="text-[13px] font-medium text-muted-foreground/65"
            >
              Thinking
            </ShimmerText>
            <span className="inline-flex items-center gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none"
                  style={{
                    animationDelay: `${index * 160}ms`,
                    animationDuration: '1s',
                  }}
                />
              ))}
            </span>
          </div>
        )}

        {/* Output length notice */}
        {!isStreaming && message.metadata?.finishReason === 'length' && (
          <p className="mt-1 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            Response trimmed due to output limit — try a higher word limit or
            ask a follow-up.
          </p>
        )}
      </div>
    </div>
  );
}
