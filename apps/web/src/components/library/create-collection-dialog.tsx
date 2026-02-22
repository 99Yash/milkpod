'use client';

import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { api } from '~/lib/api';
import { Plus } from 'lucide-react';

interface CreateCollectionDialogProps {
  onCreated?: () => void;
}

export function CreateCollectionDialog({
  onCreated,
}: CreateCollectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.api.collections.post({
        name: trimmed,
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      setOpen(false);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          New collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Group related assets together for scoped Q&A.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              placeholder="Collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <Input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? <Spinner className="size-4" /> : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
