'use client';

import { useState } from 'react';
import { ChevronDown, Check, Zap, Brain } from 'lucide-react';
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
import { cn } from '~/lib/utils';
import { MODEL_REGISTRY, type ModelDescriptor } from '@milkpod/ai/models';

function RatingBar({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 w-3 rounded-full',
            i < value ? 'bg-foreground/70' : 'bg-muted-foreground/20',
          )}
        />
      ))}
    </div>
  );
}

function ModelDetail({ model }: { model: ModelDescriptor }) {
  return (
    <div className="space-y-3 p-3">
      <div>
        <p className="text-sm font-medium">{model.name}</p>
        <p className="text-xs text-muted-foreground">{model.provider}</p>
      </div>
      <p className="text-xs text-muted-foreground">{model.description}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3" /> Speed
          </span>
          <RatingBar value={model.speed} />
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Brain className="size-3" /> Intelligence
          </span>
          <RatingBar value={model.intelligence} />
        </div>
      </div>
    </div>
  );
}

interface ModelPickerProps {
  value: string;
  onChange: (id: string) => void;
}

export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selected = MODEL_REGISTRY.find((m) => m.id === value) ?? MODEL_REGISTRY[0]!;
  const hovered = MODEL_REGISTRY.find((m) => m.id === hoveredId) ?? selected;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
          {selected.name}
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <div className="flex">
          <Command className="w-[200px] border-r">
            <CommandList>
              <CommandGroup>
                {MODEL_REGISTRY.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHoveredId(model.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs">{model.name}</span>
                    {model.id === value && <Check className="size-3" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="w-[220px]">
            <ModelDetail model={hovered} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
