'use client';

import { useState } from 'react';
import {
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { cn } from '~/lib/utils';
import { formatRelativeDate } from '~/lib/format';

export interface ThreadListItem {
  id: string;
  title: string | null;
  createdAt: string | Date;
}

interface ThreadSidebarProps {
  threads: ThreadListItem[];
  activeThreadId: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
}

function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
}: Pick<
  ThreadSidebarProps,
  'threads' | 'activeThreadId' | 'onSelectThread' | 'onDeleteThread'
>) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
        <MessageSquareText className="size-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {threads.map((thread) => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onSelect={() => onSelectThread(thread.id)}
          onDelete={() => onDeleteThread(thread.id)}
        />
      ))}
    </div>
  );
}

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onDelete,
}: {
  thread: ThreadListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group relative flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="truncate pr-6 text-xs font-medium">
        {thread.title || 'New conversation'}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {formatRelativeDate(thread.createdAt)}
      </span>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            aria-label="Delete conversation"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1.5 right-1.5 rounded-sm p-0.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its
              messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  isOpen,
  onToggle,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ThreadSidebarProps) {
  return (
    <>
      {/* Desktop: inline sidebar */}
      <div className="hidden md:flex">
        {isOpen ? (
          <div className="flex w-60 shrink-0 flex-col border-r border-border/40">
            <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Threads
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onNewThread}
                  title="New thread"
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggle}
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="size-3.5" />
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ThreadList
                threads={threads}
                activeThreadId={activeThreadId}
                onSelectThread={onSelectThread}
                onDeleteThread={onDeleteThread}
              />
            </ScrollArea>
          </div>
        ) : (
          <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border/40 py-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              title="Expand sidebar"
            >
              <PanelLeftOpen className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onNewThread}
              title="New thread"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: sheet */}
      <MobileThreadSheet
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onNewThread={onNewThread}
        onDeleteThread={onDeleteThread}
      />
    </>
  );
}

function MobileThreadSheet({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: Omit<ThreadSidebarProps, 'isOpen' | 'onToggle'>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="m-2">
            <PanelLeftOpen className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border/40">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm">Threads</SheetTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  onNewThread();
                  setOpen(false);
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <ThreadList
              threads={threads}
              activeThreadId={activeThreadId}
              onSelectThread={(id) => {
                onSelectThread(id);
                setOpen(false);
              }}
              onDeleteThread={onDeleteThread}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
