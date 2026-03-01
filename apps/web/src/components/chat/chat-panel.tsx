'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MessageSquareText, SendHorizonal, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useMilkpodChat } from '~/hooks/use-milkpod-chat';
import { useChatSettings } from '~/hooks/use-chat-settings';
import { ChatMessage } from './message';
import { ModelPicker } from './model-picker';
import { WordLimitPicker } from './word-limit-picker';
import { DailyQuota } from './daily-quota';
import type { MilkpodMessage } from '@milkpod/ai/types';
import {
  fetchChatMessages,
  fetchLatestThreadForAsset,
} from '~/lib/api-fetchers';

// ---------------------------------------------------------------------------
// Legacy hook: used by collection-detail and agent-tab where thread data is
// NOT server-rendered. The route-based asset chat bypasses this entirely by
// passing `initialMessages` directly.
// ---------------------------------------------------------------------------

function useRestoredThread(
  assetId?: string,
  explicitThreadId?: string,
) {
  const [threadId, setThreadId] = useState<string | undefined>(explicitThreadId);
  const [messages, setMessages] = useState<MilkpodMessage[] | undefined>();
  const [isLoading, setIsLoading] = useState(() => !!explicitThreadId || !!assetId);

  useEffect(() => {
    let cancelled = false;

    if (explicitThreadId) {
      setThreadId(explicitThreadId);
      setIsLoading(true);
      fetchChatMessages(explicitThreadId)
        .then((result) => {
          if (cancelled) return;
          if (result) {
            setMessages(result.messages);
          } else {
            toast.error('Failed to load chat history');
            setMessages([]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            toast.error('Failed to load chat history');
            setMessages([]);
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => { cancelled = true; };
    }

    if (!assetId) return;

    setIsLoading(true);
    fetchLatestThreadForAsset(assetId)
      .then(async (thread) => {
        if (cancelled || !thread) return;
        const result = await fetchChatMessages(thread.id);
        if (cancelled) return;
        if (result) {
          setMessages(result.messages);
        } else {
          toast.error('Failed to load chat history');
          setMessages([]);
        }
        setThreadId(thread.id);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to restore chat history');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    <div className="flex h-full flex-col">
      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 px-4">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <MessageSquareText className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Ask about this video
                </p>
                <p className="text-xs text-muted-foreground">
                  Get answers with timestamps from the transcript.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage({ text: suggestion })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="size-3" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1 py-4">
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
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border/40 bg-background/70 p-3"
      >
        <div className="relative mx-auto max-w-3xl">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the video..."
            className="min-h-[48px] max-h-[140px] resize-none border-border/40 bg-background/70 pr-12"
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon-sm"
            className="absolute bottom-1.5 right-1.5 z-10 rounded-full"
            disabled={isLoading || !input.trim()}
          >
            <SendHorizonal className="size-4" />
          </Button>
        </div>
        <div className="mx-auto mt-1.5 flex max-w-3xl items-center gap-1">
          <ModelPicker value={modelId} onChange={setModelId} />
          <WordLimitPicker value={wordLimit} onChange={setWordLimit} />
          <div className="ml-auto">
            <DailyQuota remaining={wordsRemaining} />
          </div>
        </div>
      </form>
    </div>
  );
}
