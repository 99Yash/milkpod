'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { BrainCircuit, MessageSquareText, SendHorizonal, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useMilkpodChat } from '~/hooks/use-milkpod-chat';
import { useChatSettings } from '~/hooks/use-chat-settings';
import { AiAvatar } from './ai-avatar';
import { ChatMessage } from './message';
import { ModelPicker } from './model-picker';
import { ShimmerText } from './shimmer-text';
import { WordLimitPicker } from './word-limit-picker';
import { DailyQuota } from './daily-quota';
import type { MilkpodMessage } from '@milkpod/ai/types';
import {
  fetchChatMessages,
  fetchLatestThreadForAsset,
  getCachedChatMessages,
  primeChatMessagesCache,
} from '~/lib/api-fetchers';
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
  onThreadCreated?: (threadId: string) => void;
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
  onThreadCreated?: (threadId: string) => void;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { modelId, setModelId, wordLimit, setWordLimit } = useChatSettings();

  const { messages, sendMessage, status, error, threadId: chatThreadId, wordsRemaining } = useMilkpodChat({
    threadId,
    assetId,
    collectionId,
    modelId,
    wordLimit,
    initialMessages,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Notify parent when a draft thread is created (threadId was undefined, now has a value)
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (chatThreadId && !threadId && !notifiedRef.current) {
      notifiedRef.current = true;
      onThreadCreated?.(chatThreadId);
    }
  }, [chatThreadId, threadId, onThreadCreated]);

  useEffect(() => {
    if (error) {
      toast.error(error.message || 'An error occurred');
    }
  }, [error]);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      setInput('');
      sendMessage({ text: trimmed });
    },
    [input, isLoading, sendMessage],
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
      <ScrollArea className="min-h-0 flex-1 px-4">
        <div className="mx-auto max-w-3xl">
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
                    onClick={() => sendMessage({ text: suggestion })}
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
              {messages.map((message, i) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    isLoading &&
                    message.role === 'assistant' &&
                    i === messages.length - 1
                  }
                />
              ))}
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
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ring/15 bg-background/95 shadow-sm transition-[box-shadow,border-color,background-color] duration-200 focus-within:border-ring/45 focus-within:bg-accent/16 focus-within:outline-1 focus-within:outline-ring/60 focus-within:ring-[3px] focus-within:ring-ring/35 focus-within:shadow-md"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the video..."
            className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-[15px] shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:outline-none md:text-[15px]"
            rows={1}
            disabled={isLoading}
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <ModelPicker value={modelId} onChange={setModelId} />
            <WordLimitPicker value={wordLimit} onChange={setWordLimit} />
            <div className="ml-auto flex items-center gap-2">
              <DailyQuota remaining={wordsRemaining} />
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label="Send message"
                className="rounded-xl bg-accent/35 text-foreground hover:bg-accent/50 disabled:bg-muted-foreground/8 disabled:text-muted-foreground"
                disabled={isLoading || !input.trim()}
              >
                <SendHorizonal className="size-4 translate-x-px" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
