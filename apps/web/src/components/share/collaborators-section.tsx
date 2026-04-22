'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { queryKeys } from '~/lib/query-keys';
import { toToastErrorMessage } from '~/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';

interface CollaboratorsSectionProps {
  assetId: string;
}

type InviteRole = 'editor' | 'viewer';

function getInitials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase() || '?';
}

export function CollaboratorsSection({ assetId }: CollaboratorsSectionProps) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.assetMembers(assetId);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const [inviting, setInviting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await api.api
        .assets({ id: assetId })
        .members.get();
      if (error) throw new Error(toToastErrorMessage(error.value));
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey, exact: true });

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setInviting(true);
    try {
      const { error } = await api.api
        .assets({ id: assetId })
        .members.post({ email: trimmed, role });
      if (error) {
        toast.error(toToastErrorMessage(error.value, 'Failed to invite'));
        return;
      }
      setEmail('');
      await invalidate();
      toast.success('Invite sent');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      const { error } = await api.api
        .assets({ id: assetId })
        .members({ userId })
        .delete();
      if (error) {
        toast.error(toToastErrorMessage(error.value, 'Failed to remove member'));
        return;
      }
      await invalidate();
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setRevokingInviteId(inviteId);
    try {
      const { error } = await api.api
        .assets({ id: assetId })
        .invites({ inviteId })
        .delete();
      if (error) {
        toast.error(
          toToastErrorMessage(error.value, 'Failed to revoke invite'),
        );
        return;
      }
      await invalidate();
    } finally {
      setRevokingInviteId(null);
    }
  };

  const members = data?.members ?? [];
  const pendingInvites = data?.pendingInvites ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Collaborators
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !inviting) handleInvite();
          }}
          disabled={inviting}
          className="flex-1"
        />
        <Select
          value={role}
          onValueChange={(v) => setRole(v as InviteRole)}
          disabled={inviting}
        >
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleInvite}
          disabled={inviting || !email.trim()}
        >
          {inviting ? <Spinner className="size-4" /> : 'Invite'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner className="size-4" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <Avatar className="size-7">
                {m.image ? <AvatarImage src={m.image} alt={m.name} /> : null}
                <AvatarFallback className="text-[10px] font-semibold">
                  {getInitials(m.name, m.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email}
                </p>
              </div>
              <Badge
                variant={m.role === 'owner' ? 'default' : 'secondary'}
                className="capitalize"
              >
                {m.role}
              </Badge>
              {m.role !== 'owner' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(m.userId)}
                  disabled={removingUserId === m.userId}
                  aria-label={`Remove ${m.name}`}
                >
                  {removingUserId === m.userId ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              ) : null}
            </div>
          ))}

          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2"
            >
              <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                <Mail className="size-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{inv.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  Invited · awaiting signup
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {inv.role}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRevokeInvite(inv.id)}
                disabled={revokingInviteId === inv.id}
                aria-label={`Revoke invite for ${inv.email}`}
              >
                {revokingInviteId === inv.id ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>
          ))}

          {members.length === 1 && pendingInvites.length === 0 ? (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Only you can see this video. Invite someone above to collaborate.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
