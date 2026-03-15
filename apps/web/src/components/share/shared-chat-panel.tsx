'use client';

import { useRef, useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ScrollArea } from '~/components/ui/scroll-area';
import { toast } from 'sonner';
import { useSharedChat } from '~/hooks/use-shared-chat';
import { AiAvatar } from '~/components/chat/ai-avatar';
import { ChatMessage } from '~/components/chat/message';
import { ShimmerText } from '~/components/chat/shimmer-text';

interface SharedChatPanelProps {
  token: string;
}

export function SharedChatPanel({ token }: SharedChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

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
      <ScrollArea className="flex-1 px-4">
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
      </ScrollArea>

      <div className="border-t bg-background p-4">
        {rateLimitRemaining !== null && rateLimitRemaining <= 3 && (
          <p className="mb-2 text-xs text-muted-foreground">
            {rateLimitRemaining} question{rateLimitRemaining !== 1 ? 's' : ''}{' '}
            remaining this hour
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-xl border border-ring/15 bg-background shadow-xs transition-[box-shadow,border-color,background-color] duration-200 focus-within:border-ring/45 focus-within:bg-accent/12 focus-within:outline-1 focus-within:outline-ring/60 focus-within:ring-[3px] focus-within:ring-ring/35"
        >
          <div className="flex gap-2 p-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this content..."
              className="min-h-[44px] max-h-[120px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:outline-none"
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
