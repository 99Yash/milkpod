'use client';

import { useRef, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { useSharedChat } from '~/hooks/use-shared-chat';
import { ChatMessage } from '~/components/chat/message';

interface SharedChatPanelProps {
  token: string;
}

export function SharedChatPanel({ token }: SharedChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, rateLimitRemaining } =
    useSharedChat({ token });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (error) {
      if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Try again in an hour.');
      } else {
        toast.error(error.message || 'An error occurred');
      }
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

  return (
    <div className="flex h-full flex-col">
      <ScrollArea ref={scrollRef} className="flex-1 px-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12 text-center text-sm text-muted-foreground">
            Ask a question about this content.
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

      <div className="border-t bg-background p-4">
        {rateLimitRemaining !== null && rateLimitRemaining <= 3 && (
          <p className="mb-2 text-xs text-muted-foreground">
            {rateLimitRemaining} question{rateLimitRemaining !== 1 ? 's' : ''}{' '}
            remaining this hour
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this content..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !input.trim()}
            >
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
