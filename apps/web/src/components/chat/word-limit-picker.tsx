'use client';

import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { WORD_LIMIT_OPTIONS } from '@milkpod/ai/limits';

interface WordLimitPickerProps {
  value: number | null;
  onChange: (limit: number | null) => void;
}

function getLabel(value: number | null): string {
  const option = WORD_LIMIT_OPTIONS.find((o) => o.value === value);
  return option?.label ?? `${value} words`;
}

export function WordLimitPicker({ value, onChange }: WordLimitPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground">
          {getLabel(value)}
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" side="top" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {WORD_LIMIT_OPTIONS.map((option) => (
                <CommandItem
                  key={String(option.value)}
                  value={String(option.value)}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <span className="text-[13px]">{option.label}</span>
                  {option.value === value && <Check className="size-3" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
