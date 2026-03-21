'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowUp, BrainCircuit, ChevronDown, MessageSquareText, Sparkles, Square } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useMilkpodChat } from '~/hooks/use-milkpod-chat';
import { useChatScroll } from '~/hooks/use-chat-scroll';
import { useChatSettings } from '~/hooks/use-chat-settings';
import { AiAvatar } from './ai-avatar';
import { ChatMessage } from './message';
import { ModelPicker } from './model-picker';
import { RetrySendButton } from './retry-send-button';
import { ShimmerText } from './shimmer-text';
import { WordLimitPicker } from './word-limit-picker';
import { DailyQuota } from './daily-quota';
import type { MilkpodMessage } from '@milkpod/ai/types';
import { MODEL_REGISTRY, getFallbackModelId, type ModelId } from '@milkpod/ai/models';
import {
  fetchChatMessages,
  fetchLatestThreadForAsset,
  fetchThreadsForAsset,
  getCachedChatMessages,
  primeChatMessagesCache,
} from '~/lib/api-fetchers';
import { getEntitlementsForPlan } from '@milkpod/ai/plans';
import { getCachedIsAdmin, getCachedPlan } from '~/lib/plan-cache';
import { useOptionalThreadList } from '~/contexts/thread-list-context';

// ---------------------------------------------------------------------------
// Legacy hook: used by collection-detail and agent-tab where thread data is
// NOT server-rendered. The route-based asset chat bypasses this entirely by
// passing `initialMessages` directly.
// ---------------------------------------------------------------------------

/**
 * Resolve messages for a thread with stale-while-revalidate semantics:
 * show cached data immediately, then refresh from the server in the background.
 */
function resolveThreadMessages(
  threadId: string,
  cancelled: () => boolean,
  onMessages: (msgs: MilkpodMessage[]) => void,
  onLoaded: () => void,
): void {
  const cached = getCachedChatMessages(threadId);

  if (cached) {
    onMessages(cached.messages);
    onLoaded();
    // Revalidate in background
    fetchChatMessages(threadId)
      .then((result) => {
        if (!cancelled() && result) onMessages(result.messages);
      })
      .catch(() => {});
    return;
  }

  fetchChatMessages(threadId, { preferCache: true })
    .then((result) => {
      if (cancelled()) return;
      if (result) {
        onMessages(result.messages);
      } else {
        toast.error('Failed to load chat history');
        onMessages([]);
      }
    })
    .catch(() => {
      if (!cancelled()) {
        toast.error('Failed to load chat history');
        onMessages([]);
      }
    })
    .finally(() => {
      if (!cancelled()) onLoaded();
    });
}

function deriveTitleFromMessages(messages: MilkpodMessage[]): string | null {
  const firstUserText = messages
    .find((message) => message.role === 'user')
    ?.parts.find((part) => part.type === 'text' && part.text.trim().length > 0);

  if (!firstUserText || firstUserText.type !== 'text') {
    return null;
  }

  const cleaned = firstUserText.text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/["'`]/g, '')
    .replace(/[.!?]+$/, '');

  if (!cleaned) return null;

  const words = cleaned.split(' ').slice(0, 4);
  const title = words.join(' ').trim();
  return title.length > 0 ? title : null;
}

function useRestoredThread(
  assetId?: string,
  explicitThreadId?: string,
) {
  const explicitCached = explicitThreadId
    ? getCachedChatMessages(explicitThreadId)
    : undefined;
  const [threadId, setThreadId] = useState<string | undefined>(explicitThreadId);
  const [messages, setMessages] = useState<MilkpodMessage[] | undefined>(
    explicitCached?.messages,
  );
  const [isLoading, setIsLoading] = useState(
    () => (explicitThreadId ? !explicitCached : !!assetId),
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    const onLoaded = () => { if (!cancelled) setIsLoading(false); };

    if (explicitThreadId) {
      setThreadId(explicitThreadId);
      setIsLoading(true);
      resolveThreadMessages(explicitThreadId, isCancelled, (msgs) => {
        if (!cancelled) setMessages(msgs);
      }, onLoaded);
      return () => { cancelled = true; };
    }

    if (!assetId) return;

    setIsLoading(true);
    fetchLatestThreadForAsset(assetId)
      .then((thread) => {
        if (cancelled) return;
        if (!thread) {
          onLoaded();
          return;
        }
        setThreadId(thread.id);
        resolveThreadMessages(thread.id, isCancelled, (msgs) => {
          if (!cancelled) setMessages(msgs);
        }, onLoaded);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to restore chat history');
        onLoaded();
      });
    return () => { cancelled = true; };
  }, [assetId, explicitThreadId]);

  return { threadId, messages, isLoading };
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  /** When provided, the panel renders immediately (no client-side fetch). */
  initialMessages?: MilkpodMessage[];
  /** Called when a draft thread is created on the backend. */
  onThreadCreated?: (threadId: string, title?: string | null) => void;
}

const SUGGESTIONS = ['Summarize', 'Key points', 'Action items'] as const;

/**
 * Outer shell: resolves thread data, shows a spinner while loading, then
 * mounts ChatPanelContent once messages are ready.
 *
 * When `initialMessages` is provided (route-based flow), skips the
 * client-side fetch entirely and renders immediately.
 */
export function ChatPanel({
  threadId,
  assetId,
  collectionId,
  initialMessages,
  onThreadCreated,
}: ChatPanelProps) {
  // Route-based flow: server already provided messages
  if (initialMessages !== undefined) {
    return (
      <ChatPanelContent
        threadId={threadId}
        assetId={assetId}
        collectionId={collectionId}
        initialMessages={initialMessages}
        onThreadCreated={onThreadCreated}
      />
    );
  }

  // Legacy flow: collection/agent consumers — fetch client-side
  return (
    <LegacyChatPanel
      threadId={threadId}
      assetId={assetId}
      collectionId={collectionId}
      onThreadCreated={onThreadCreated}
    />
  );
}

function LegacyChatPanel({
  threadId: explicitThreadId,
  assetId,
  collectionId,
  onThreadCreated,
}: Omit<ChatPanelProps, 'initialMessages'>) {
  const {
    threadId: restoredThreadId,
    messages: persistedMessages,
    isLoading: isLoadingHistory,
  } = useRestoredThread(assetId, explicitThreadId);

  if (isLoadingHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ChatPanelContent
      threadId={restoredThreadId}
      assetId={assetId}
      collectionId={collectionId}
      initialMessages={persistedMessages}
      onThreadCreated={onThreadCreated}
    />
  );
}

function ChatPanelContent({
  threadId,
  assetId,
  collectionId,
  initialMessages,
  onThreadCreated,
}: {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  initialMessages?: MilkpodMessage[];
  onThreadCreated?: (threadId: string, title?: string | null) => void;
}) {
  const [input, setInput] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { modelId, setModelId, wordLimit, setWordLimit } = useChatSettings();

  const { messages, setMessages, sendMessage, clearError, stop, regenerate, status, error, threadId: chatThreadId, wordsRemaining, plan: chatPlan, isAdmin: chatIsAdmin } = useMilkpodChat({
    threadId,
    assetId,
    collectionId,
    modelId,
    wordLimit,
    initialMessages,
  });

  // Derive allowed model IDs locally from the plan — no API call needed.
  // chatPlan is set from X-Plan response header; getCachedPlan() is set by sidebar's billing summary fetch.
  const isAdmin = chatIsAdmin === true || getCachedIsAdmin() === true;
  const plan = chatPlan ?? getCachedPlan();
  const allowedModelIds =
    isAdmin || !plan ? null : getEntitlementsForPlan(plan).allowedModelIds;

  const isLoading = status === 'streaming' || status === 'submitted';

  const {
    showScrollToBottom,
    scrollToBottom,
    scrollToBottomIfNeeded,
    handlers: scrollHandlers,
  } = useChatScroll({ scrollRef, composerRef });

  // Notify parent when a draft thread is created (threadId was undefined, now has a value)
  const notifiedRef = useRef(false);
  useEffect(() => {
    const requestSettled = status !== 'submitted' && status !== 'streaming';

    if (chatThreadId && !threadId && !notifiedRef.current && requestSettled) {
      notifiedRef.current = true;
      onThreadCreated?.(chatThreadId, deriveTitleFromMessages(messages));
    }
  }, [chatThreadId, threadId, onThreadCreated, status, messages]);

  // Unsend: on error, remove the failed user message and restore it to the input box
  useEffect(() => {
    if (!error) return;

    const raw = error.message || 'An error occurred';
    const suggestFallback = raw.endsWith('[fallback]');
    const message = suggestFallback ? raw.replace(' [fallback]', '') : raw;

    if (suggestFallback) {
      const fallbackId = getFallbackModelId(modelId, allowedModelIds);
      const fallbackName = fallbackId
        ? MODEL_REGISTRY.find((m) => m.id === fallbackId)?.name
        : null;

      toast.error(message, {
        description: fallbackName
          ? `${fallbackName} is available — use the retry button to switch.`
          : undefined,
        duration: 6000,
      });
    } else {
      toast.error(message);
    }

    setShowRetry(suggestFallback);

    const lastMsg = messages.at(-1);
    if (lastMsg?.role === 'user') {
      const textPart = lastMsg.parts.find((p) => p.type === 'text');
      if (textPart && 'text' in textPart) {
        setInput(textPart.text);
      }
      setMessages(messages.slice(0, -1));
    }
    clearError();
  }, [error, messages, setMessages, clearError, modelId, allowedModelIds]);

  useEffect(() => {
    if (!chatThreadId) return;
    primeChatMessagesCache(chatThreadId, messages);
  }, [chatThreadId, messages]);

  // Update sidebar title in real-time when the server streams a data-threadTitle part
  const threadListCtx = useOptionalThreadList();
  const appliedTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadListCtx) return;
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === 'data-threadTitle') {
          const { threadId: tid, title } = part.data;
          if (tid && title && appliedTitleRef.current !== title) {
            appliedTitleRef.current = title;
            threadListCtx.setThreads((prev) =>
              prev.map((t) => (t.id === tid ? { ...t, title } : t)),
            );
          }
        }
      }
    }
  }, [messages, threadListCtx]);

  // Fallback title sync: after a response settles, refresh thread list a few times
  // so async server-side title generation is reflected without page refresh.
  const titleSyncInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!threadListCtx || !chatThreadId) return;

    const requestSettled = status !== 'submitted' && status !== 'streaming';
    if (!requestSettled) return;

    const targetThread = threadListCtx.threads.find((t) => t.id === chatThreadId);
    if (!targetThread || targetThread.title) return;
    if (titleSyncInFlightRef.current.has(chatThreadId)) return;

    titleSyncInFlightRef.current.add(chatThreadId);
    let cancelled = false;

    void (async () => {
      const MAX_ATTEMPTS = 4;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) break;

        try {
          const updated = await fetchThreadsForAsset(threadListCtx.assetId);
          if (cancelled) break;

          threadListCtx.setThreads(updated);
          const refreshed = updated.find((thread) => thread.id === chatThreadId);
          if (refreshed?.title) {
            break;
          }
        } catch {
          // ignore transient refresh failures
        }

        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1200 * (attempt + 1)),
          );
        }
      }

      titleSyncInFlightRef.current.delete(chatThreadId);
    })();

    return () => {
      cancelled = true;
    };
  }, [chatThreadId, status, threadListCtx]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages, status, scrollToBottomIfNeeded]);

  const isModelBlocked = allowedModelIds != null && !allowedModelIds.includes(modelId);
  const isWordBudgetExhausted = wordsRemaining === 0;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isModelBlocked) {
        toast.error('This model requires a paid plan.', {
          action: {
            label: 'View plans',
            onClick: () => { window.location.href = '/pricing'; },
          },
          duration: 8000,
        });
        return;
      }
      if (isWordBudgetExhausted) {
        toast.error('Daily word limit reached. Resets at midnight UTC.', {
          action: {
            label: 'View plans',
            onClick: () => { window.location.href = '/pricing'; },
          },
          duration: 8000,
        });
        return;
      }
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      setShowRetry(false);
      setInput('');
      sendMessage({ text: trimmed });
    },
    [input, isLoading, isModelBlocked, isWordBudgetExhausted, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex h-full flex-col font-open-runde">
      {/* Scrollable message area */}
      <div className="relative min-h-0 flex-1">
        {/* Top fade mask */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-card to-transparent" />
        {/* Bottom fade mask */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-card to-transparent" />
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-y-contain px-5 lg:px-6"
          onScroll={scrollHandlers.onScroll}
          onWheel={scrollHandlers.onWheel}
          onPointerDown={scrollHandlers.onPointerDown}
          onPointerUp={scrollHandlers.onPointerUp}
        >
          <div
            className="mx-auto max-w-4xl"
            onClickCapture={scrollHandlers.onClickCapture}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-b from-accent/30 to-accent/10 shadow-sm ring-1 ring-ring/15">
                  <MessageSquareText className="size-6 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-foreground">
                    Ask about this video
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Get answers with timestamps from the transcript.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        if (isModelBlocked) {
                          toast.error('This model requires a paid plan.', {
                            action: {
                              label: 'View plans',
                              onClick: () => { window.location.href = '/pricing'; },
                            },
                            duration: 8000,
                          });
                          return;
                        }
                        if (isWordBudgetExhausted) {
                          toast.error('Daily word limit reached. Resets at midnight UTC.', {
                            action: {
                              label: 'View plans',
                              onClick: () => { window.location.href = '/pricing'; },
                            },
                            duration: 8000,
                          });
                          return;
                        }
                        sendMessage({ text: suggestion });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background py-2 pl-3 pr-3.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-ring/25 hover:bg-accent/18 hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    >
                      <Sparkles className="size-3" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2 py-4">
                {messages.map((message, i) => {
                  const isLast = i === messages.length - 1;
                  return (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={
                        isLoading &&
                        message.role === 'assistant' &&
                        isLast
                      }
                      onRetry={
                        !isLoading &&
                        message.role === 'assistant' &&
                        isLast
                          ? () => regenerate({ messageId: message.id })
                          : undefined
                      }
                    />
                  );
                })}
                {isLoading && messages.at(-1)?.role !== 'assistant' && (
                  <div className="flex gap-3 py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                    <AiAvatar />
                    <div className="flex items-center gap-2 pt-1">
                      <BrainCircuit className="size-4 shrink-0 text-muted-foreground/45 animate-pulse" />
                      <ShimmerText
                        active
                        className="text-[13px] font-medium text-muted-foreground/65"
                      >
                        Thinking
                      </ShimmerText>
                      <span className="inline-flex items-center gap-1" aria-hidden>
                        {[0, 1, 2].map((idx) => (
                          <span
                            key={idx}
                            className="size-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none"
                            style={{
                              animationDelay: `${idx * 160}ms`,
                              animationDuration: '1s',
                            }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scroll-to-bottom button */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center transition-opacity duration-200 ${showScrollToBottom ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            tabIndex={showScrollToBottom ? 0 : -1}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronDown className="size-3.5" />
            Scroll to bottom
          </button>
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-3 pb-3 pt-2">
        <form
          ref={composerRef}
          onSubmit={handleSubmit}
          className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-ring/15 bg-background/95 shadow-sm transition-[box-shadow,border-color] duration-200 focus-within:border-ring/45 focus-within:outline-1 focus-within:outline-ring/60 focus-within:ring-[3px] focus-within:ring-ring/35 focus-within:shadow-md"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the video..."
            className="min-h-0 max-h-[140px] resize-none border-0 !bg-transparent px-4 pt-3 pb-2 text-[15px] leading-snug shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:outline-none md:text-[15px]"
            rows={1}
          />
          <div className="flex items-center gap-1.5 px-3 pb-3">
            <ModelPicker value={modelId} onChange={setModelId} allowedModelIds={allowedModelIds} />
            <WordLimitPicker value={wordLimit} onChange={setWordLimit} />
            <div className="ml-auto flex items-center gap-2">
              <DailyQuota remaining={wordsRemaining} />
              {isLoading ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Stop generating"
                  className="shrink-0 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20"
                  onClick={stop}
                >
                  <Square className="size-3 fill-current" />
                </Button>
              ) : showRetry && input.trim() ? (
                <RetrySendButton
                  currentModelId={modelId}
                  allowedModelIds={allowedModelIds}
                  disabled={!input.trim()}
                  onRetry={(switchModelId) => {
                    if (switchModelId) setModelId(switchModelId);
                    setShowRetry(false);
                    const trimmed = input.trim();
                    if (!trimmed) return;
                    setInput('');
                    sendMessage({ text: trimmed });
                  }}
                />
              ) : (
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Send message"
                  className="shrink-0 rounded-xl bg-accent/35 text-foreground hover:bg-accent/50 disabled:bg-muted-foreground/8 disabled:text-muted-foreground"
                  disabled={!input.trim()}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
