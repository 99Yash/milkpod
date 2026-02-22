'use client';

import { useRef, useEffect, useState } from 'react';
import { MessageSquareText, SendHorizonal, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useMilkpodChat } from '~/hooks/use-milkpod-chat';
import { ChatMessage } from './message';
import type { MilkpodMessage } from '@milkpod/ai/types';
import {
  fetchChatMessages,
  fetchLatestThreadForAsset,
} from '~/lib/api-fetchers';

interface ChatPanelProps {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  /** Server-fetched thread data. `null` = no thread exists, `undefined` = not fetched server-side. */
  initialThread?: {
    threadId: string;
    messages: MilkpodMessage[];
  } | null;
}

const SUGGESTIONS = ['Summarize', 'Key points', 'Action items'] as const;

function useRestoredThread(
  assetId?: string,
  explicitThreadId?: string,
  initialThread?: { threadId: string; messages: MilkpodMessage[] } | null,
) {
  const [threadId, setThreadId] = useState<string | undefined>(
    initialThread?.threadId ?? explicitThreadId
  );
  const [messages, setMessages] = useState<MilkpodMessage[] | undefined>(
    initialThread?.messages
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Server already provided initial data — skip client fetch
    if (initialThread !== undefined) return;

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
        // Set both together so useChat sees the id and messages in the same render
        if (result) setMessages(result.messages);
        setThreadId(thread.id);
      })
      .catch(() => {
        // No existing thread — start fresh
      })
      .finally(() => setIsLoading(false));
  }, [assetId, explicitThreadId, initialThread]);

  return { threadId, messages, isLoading };
}

export function ChatPanel({
  threadId: explicitThreadId,
  assetId,
  collectionId,
  initialThread,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    threadId: restoredThreadId,
    messages: persistedMessages,
    isLoading: isLoadingHistory,
  } = useRestoredThread(assetId, explicitThreadId, initialThread);

  const { messages, sendMessage, status, error } = useMilkpodChat({
    threadId: restoredThreadId,
    assetId,
    collectionId,
    initialMessages: persistedMessages,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    sendMessage({ text: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 px-4">
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
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && messages.at(-1)?.role !== 'assistant' && (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border/40 bg-background/70 p-3"
      >
        <div className="relative">
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
      </form>
    </div>
  );
}
