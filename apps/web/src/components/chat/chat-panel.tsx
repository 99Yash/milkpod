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

export type InitialThread =
  | { status: 'loaded'; threadId: string; messages: MilkpodMessage[] }
  | { status: 'empty' };

interface ChatPanelProps {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  initialThread?: InitialThread;
  onThreadIdChange?: (threadId: string | undefined) => void;
}

const SUGGESTIONS = ['Summarize', 'Key points', 'Action items'] as const;

function useRestoredThread(
  assetId?: string,
  explicitThreadId?: string,
  initialThread?: InitialThread,
) {
  const [threadId, setThreadId] = useState<string | undefined>(() => {
    if (initialThread?.status === 'loaded') return initialThread.threadId;
    return explicitThreadId;
  });
  const [messages, setMessages] = useState<MilkpodMessage[] | undefined>(
    () => (initialThread?.status === 'loaded' ? initialThread.messages : undefined),
  );
  // Start in the loading state when a client-side fetch will be needed so
  // the spinner renders on the very first frame (before the effect fires).
  const [isLoading, setIsLoading] = useState(() => {
    if (initialThread) return false;
    return !!explicitThreadId || !!assetId;
  });

  useEffect(() => {
    // Server already resolved thread state — skip client fetch
    if (initialThread) return;

    // If an explicit threadId is provided, load messages directly
    if (explicitThreadId) {
      setThreadId(explicitThreadId);
      setIsLoading(true);
      fetchChatMessages(explicitThreadId)
        .then((result) => {
          if (result) setMessages(result.messages);
        })
        .catch(() => toast.error('Failed to load chat history'))
        .finally(() => setIsLoading(false));
      return;
    }

    // Otherwise, look up the latest thread for this asset
    if (!assetId) return;

    setIsLoading(true);
    fetchLatestThreadForAsset(assetId)
      .then(async (thread) => {
        if (!thread) return;
        const result = await fetchChatMessages(thread.id);
        if (result) setMessages(result.messages);
        setThreadId(thread.id);
      })
      .catch(() => toast.error('Failed to restore chat history'))
      .finally(() => setIsLoading(false));
  }, [assetId, explicitThreadId, initialThread]);

  return { threadId, messages, isLoading };
}

/**
 * Outer shell: resolves thread data, shows a spinner while loading, then
 * mounts ChatPanelContent once messages are ready. This guarantees
 * useMilkpodChat/useChat always initialises with the correct messages
 * (useChat treats its `messages` option as initial state, so passing
 * `undefined` first and updating later doesn't work).
 */
export function ChatPanel({
  threadId: explicitThreadId,
  assetId,
  collectionId,
  initialThread,
  onThreadIdChange,
}: ChatPanelProps) {
  const {
    threadId: restoredThreadId,
    messages: persistedMessages,
    isLoading: isLoadingHistory,
  } = useRestoredThread(assetId, explicitThreadId, initialThread);

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
      onThreadIdChange={onThreadIdChange}
    />
  );
}

function ChatPanelContent({
  threadId,
  assetId,
  collectionId,
  initialMessages,
  onThreadIdChange,
}: {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  initialMessages?: MilkpodMessage[];
  onThreadIdChange?: (threadId: string | undefined) => void;
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

  // Notify parent when the chat auto-creates a thread
  useEffect(() => {
    onThreadIdChange?.(chatThreadId);
  }, [chatThreadId, onThreadIdChange]);

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
