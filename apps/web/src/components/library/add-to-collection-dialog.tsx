'use client';

import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { api } from '~/lib/api';
import type { Collection } from '@milkpod/api/types';
import { cn } from '~/lib/utils';

interface AddToCollectionDialogProps {
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

export function AddToCollectionDialog({
  assetId,
  open,
  onOpenChange,
  onAdded,
}: AddToCollectionDialogProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setSelectedId(null);
    api.api.collections
      .get()
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          setCollections(data as Collection[]);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open]);

  const handleAdd = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.api.collections({ id: selectedId }).items.post({
        assetId,
      });
      onOpenChange(false);
      onAdded?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
          <DialogDescription>
            Choose a collection to add this asset to.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : collections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No collections yet. Create one from the Library tab first.
            </p>
          ) : (
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selectedId === c.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <p className="font-medium">{c.name}</p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {c.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving || !selectedId}
          >
            {saving ? <Spinner className="size-4" /> : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
