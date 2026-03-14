import { useMemo, useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  formatSpeakerId,
  sanitizeSpeakerNames,
  type SpeakerNamesMap,
} from './speaker-names';

interface SpeakerNamesPopoverProps {
  speakerIds: string[];
  speakerNames: SpeakerNamesMap;
  onSaveSpeakerNames: (speakerNames: SpeakerNamesMap) => Promise<void>;
  isSavingSpeakerNames?: boolean;
}

export function SpeakerNamesPopover({
  speakerIds,
  speakerNames,
  onSaveSpeakerNames,
  isSavingSpeakerNames,
}: SpeakerNamesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftSpeakerNames, setDraftSpeakerNames] = useState<SpeakerNamesMap>({});

  useEffect(() => {
    if (!open) return;

    const nextDraft: SpeakerNamesMap = {};
    for (const speakerId of speakerIds) {
      nextDraft[speakerId] = speakerNames[speakerId] ?? '';
    }
    setDraftSpeakerNames(nextDraft);
  }, [open, speakerIds, speakerNames]);

  const hasChanges = useMemo(() => {
    return speakerIds.some((speakerId) => {
      const draftValue = (draftSpeakerNames[speakerId] ?? '').trim();
      const existingValue = (speakerNames[speakerId] ?? '').trim();
      return draftValue !== existingValue;
    });
  }, [draftSpeakerNames, speakerIds, speakerNames]);

  if (speakerIds.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-lg"
        >
          <Users className="size-3.5" />
          <span className="hidden sm:inline">Know these people?</span>
          <span className="sm:hidden">Speakers</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] space-y-3 p-3"
      >
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">Name speakers</h3>
          <p className="text-xs text-muted-foreground">
            Add names for diarized speakers. Leave blank to keep the generic label.
          </p>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {speakerIds.map((speakerId) => (
            <div key={speakerId} className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`speaker-name-${speakerId}`}
                  className="text-xs font-medium text-foreground"
                >
                  {formatSpeakerId(speakerId)}
                </label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {speakerId}
                </span>
              </div>
              <Input
                id={`speaker-name-${speakerId}`}
                value={draftSpeakerNames[speakerId] ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraftSpeakerNames((prev) => ({
                    ...prev,
                    [speakerId]: value,
                  }));
                }}
                placeholder="e.g. Mehdi Hasan"
                className="h-8 text-sm"
                maxLength={80}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={Boolean(isSavingSpeakerNames)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!hasChanges || Boolean(isSavingSpeakerNames)}
            onClick={async () => {
              const sanitized = sanitizeSpeakerNames(draftSpeakerNames);
              await onSaveSpeakerNames(sanitized);
              setOpen(false);
            }}
          >
            {isSavingSpeakerNames ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving
              </>
            ) : (
              'Save names'
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
