'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { queryKeys } from '~/lib/query-keys';
import { toToastErrorMessage } from '~/lib/api';
import { authClient } from '~/lib/auth/client';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
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

const REVEAL_ON_HOVER_FOCUS =
  'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

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
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

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
    } catch (err) {
      toast.error(toToastErrorMessage(err, 'Failed to invite'));
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
    } catch (err) {
      toast.error(toToastErrorMessage(err, 'Failed to remove member'));
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
    } catch (err) {
      toast.error(toToastErrorMessage(err, 'Failed to revoke invite'));
    } finally {
      setRevokingInviteId(null);
    }
  };

  const members = data?.members ?? [];
  const pendingInvites = data?.pendingInvites ?? [];
  // The server's service-layer authz (`AssetMemberService.invite/remove/revoke`)
  // is the source of truth; this flag only shapes the UI so non-owners don't
  // see controls that would 403. Until the session loads we pessimistically
  // treat the caller as non-owner to avoid flashing the invite form.
  const isOwner =
    !!currentUserId &&
    members.some((m) => m.userId === currentUserId && m.role === 'owner');

  return (
    <div className="space-y-4">
      {isOwner ? (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="Add people by email"
            aria-label="Invitee email"
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
            <SelectTrigger
              size="sm"
              className="w-24 shrink-0"
              aria-label="Invitee role"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            onClick={handleInvite}
            disabled={inviting || !email.trim()}
          >
            {inviting ? <Spinner className="size-4" /> : 'Invite'}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Spinner className="size-4" />
        </div>
      ) : (
        <div>
          <p className="pb-2 text-xs font-medium text-muted-foreground">
            People with access
          </p>
          <ul className="-mx-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <Avatar className="size-8">
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
                {m.role === 'owner' ? (
                  <span className="text-xs text-muted-foreground">Owner</span>
                ) : (
                  <>
                    <span className="text-xs capitalize text-muted-foreground">
                      {m.role}
                    </span>
                    {isOwner ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`size-7 p-0 text-muted-foreground hover:text-destructive ${REVEAL_ON_HOVER_FOCUS}`}
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
                  </>
                )}
              </li>
            ))}

            {pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Mail className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pending invite · {inv.role}
                  </p>
                </div>
                {isOwner ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`size-7 p-0 text-muted-foreground hover:text-destructive ${REVEAL_ON_HOVER_FOCUS}`}
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
                ) : null}
              </li>
            ))}
          </ul>

          {isOwner && members.length === 1 && pendingInvites.length === 0 ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Only you can see this. Invite someone above to collaborate.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
