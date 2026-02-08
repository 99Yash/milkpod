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
import type { Asset } from '@milkpod/api/types';
import { cn } from '~/lib/utils';

interface AddAssetToCollectionDialogProps {
  collectionId: string;
  existingAssetIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

export function AddAssetToCollectionDialog({
  collectionId,
  existingAssetIds,
  open,
  onOpenChange,
  onAdded,
}: AddAssetToCollectionDialogProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setSelectedId(null);
    api.api.assets
      .get()
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          const available = (data as Asset[]).filter(
            (a) => !existingAssetIds.includes(a.id)
          );
          setAssets(available);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open, existingAssetIds]);

  const handleAdd = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.api.collections({ id: collectionId }).items.post({
        assetId: selectedId,
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
          <DialogTitle>Add asset to collection</DialogTitle>
          <DialogDescription>
            Select an asset to add.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : assets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No available assets to add. All your assets are already in this
              collection.
            </p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors flex items-center gap-3',
                    selectedId === a.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {a.thumbnailUrl && (
                    <div className="shrink-0 w-12 overflow-hidden rounded">
                      <img
                        src={a.thumbnailUrl}
                        alt={a.title}
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium line-clamp-1">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={saving || !selectedId}>
            {saving ? <Spinner className="size-4" /> : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
