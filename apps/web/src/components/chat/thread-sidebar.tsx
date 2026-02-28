'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Ellipsis,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  onRenameThread: (threadId: string, title: string) => void;
  onRegenerateTitle: (threadId: string) => void;
}

type ThreadListProps = Pick<
  ThreadSidebarProps,
  | 'threads'
  | 'activeThreadId'
  | 'onSelectThread'
  | 'onDeleteThread'
  | 'onRenameThread'
  | 'onRegenerateTitle'
>;

function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  onRegenerateTitle,
}: ThreadListProps) {
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
          onRename={(title) => onRenameThread(thread.id, title)}
          onRegenerateTitle={() => onRegenerateTitle(thread.id)}
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
  onRename,
  onRegenerateTitle,
}: {
  thread: ThreadListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onRegenerateTitle: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    setEditValue(thread.title || '');
    setIsEditing(true);
  }, [thread.title]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== thread.title) {
      onRename(trimmed);
    }
  }, [editValue, thread.title, onRename]);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateTitle();
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerateTitle]);

  if (isEditing) {
    return (
      <div
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2',
          isActive ? 'bg-accent' : 'bg-muted',
        )}
      >
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="w-full bg-transparent text-xs font-medium outline-none placeholder:text-muted-foreground"
          placeholder="Thread title..."
        />
      </div>
    );
  }

  return (
    <>
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
          'group relative flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <div className="flex w-full min-w-0 items-center">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {isRegenerating ? 'Generating title...' : (thread.title || 'New conversation')}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Thread options"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground',
                  isActive
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <Ellipsis className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
              >
                <Pencil className="mr-2 size-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleRegenerate();
                }}
              >
                <RefreshCw className="mr-2 size-3.5" />
                Regenerate title
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeDate(thread.createdAt)}
        </span>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  onRenameThread,
  onRegenerateTitle,
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
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ThreadList
                threads={threads}
                activeThreadId={activeThreadId}
                onSelectThread={onSelectThread}
                onDeleteThread={onDeleteThread}
                onRenameThread={onRenameThread}
                onRegenerateTitle={onRegenerateTitle}
              />
            </div>
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
        onRenameThread={onRenameThread}
        onRegenerateTitle={onRegenerateTitle}
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
  onRenameThread,
  onRegenerateTitle,
}: Omit<ThreadSidebarProps, 'isOpen' | 'onToggle'>) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5 md:hidden">
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <PanelLeftOpen className="size-4" />
          </Button>
        </SheetTrigger>
        <span className="truncate text-xs font-medium text-muted-foreground">
          Threads
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0"
          onClick={onNewThread}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <SheetContent side="left" className="w-[85vw] p-0" showClose={false}>
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={(id) => {
              onSelectThread(id);
              setOpen(false);
            }}
            onDeleteThread={onDeleteThread}
            onRenameThread={onRenameThread}
            onRegenerateTitle={onRegenerateTitle}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
