'use client';

import { useRef, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useMilkpodChat } from '~/hooks/use-milkpod-chat';
import { ChatMessage } from './message';
import type { MilkpodMessage } from '@milkpod/ai/types';
import { api } from '~/lib/api';

interface ChatPanelProps {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
}

function usePersistedMessages(threadId?: string) {
  const [messages, setMessages] = useState<MilkpodMessage[] | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!threadId) return;

    setIsLoading(true);
    api.api.chat({ threadId })
      .get()
      .then(({ data }) => {
        if (data && 'messages' in data) {
          setMessages(data.messages as MilkpodMessage[]);
        }
      })
      .catch(() => {
        toast.error('Failed to load chat history');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [threadId]);

  return { messages, isLoading };
}

export function ChatPanel({ threadId, assetId, collectionId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages: persistedMessages, isLoading: isLoadingHistory } =
    usePersistedMessages(threadId);

  const { messages, sendMessage, status, error } = useMilkpodChat({
    threadId,
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
      <ScrollArea ref={scrollRef} className="flex-1 px-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12 text-center text-sm text-muted-foreground">
            Ask a question about the transcript to get started.
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
        className="border-t bg-background p-4"
      >
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the video..."
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button type="submit" size="sm" disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
