'use client';

import { useState } from 'react';
import { ChevronDown, Check, Zap, Brain, Lock } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { cn } from '~/lib/utils';
import { MODEL_REGISTRY, type ModelDescriptor, type ModelId } from '@milkpod/ai/models';
import { AnthropicLogo, GoogleG, OpenAILogo } from '~/components/ui/icons';
import { toast } from 'sonner';

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case 'Anthropic':
      return <AnthropicLogo className={className} />;
    case 'OpenAI':
      return <OpenAILogo className={className} />;
    case 'Google':
      return <GoogleG className={className} />;
    default:
      return null;
  }
}

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
      <div className="flex items-center gap-2">
        <ProviderIcon provider={model.provider} className="size-4 shrink-0" />
        <div>
          <p className="text-sm font-medium">{model.name}</p>
          <p className="text-xs text-muted-foreground">{model.provider}</p>
        </div>
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
  value: ModelId;
  onChange: (id: ModelId) => void;
  /** Model IDs the user's plan allows. When null/undefined, all models are shown as available (loading state). */
  allowedModelIds?: string[] | null;
}

export function ModelPicker({ value, onChange, allowedModelIds }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selected = MODEL_REGISTRY.find((m) => m.id === value) ?? MODEL_REGISTRY[0]!;
  const hovered = MODEL_REGISTRY.find((m) => m.id === hoveredId) ?? selected;

  const isAllowed = (id: string) => !allowedModelIds || allowedModelIds.includes(id);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-accent/22 hover:text-foreground data-[state=open]:bg-accent/30 data-[state=open]:text-foreground"
        >
          <ProviderIcon provider={selected.provider} className="size-3.5" />
          {selected.name}
          <ChevronDown
            className={cn('size-3 transition-transform duration-200', open && 'rotate-180')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="h-[240px] w-[420px] border-ring/20 p-0 font-open-runde"
        side="top"
        align="start"
      >
        <div className="flex h-full">
          <Command className="w-[200px] border-r border-border/60 bg-transparent">
            <CommandInput placeholder="Search models..." className="h-8 text-xs" />
            <CommandList className="min-h-0 flex-1">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                No models found.
              </CommandEmpty>
              <CommandGroup>
                {MODEL_REGISTRY.map((model) => {
                  const locked = !isAllowed(model.id);
                  return (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      keywords={[model.name, model.provider]}
                      onSelect={(id) => {
                        if (locked) {
                          toast.error('This model requires a paid plan.', {
                            action: {
                              label: 'View plans',
                              onClick: () => { window.location.href = '/pricing'; },
                            },
                            duration: 8000,
                          });
                          return;
                        }
                        onChange(id as ModelId);
                        setOpen(false);
                      }}
                      onMouseEnter={() => setHoveredId(model.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={cn('flex items-center gap-2', locked && 'opacity-50')}
                    >
                      <ProviderIcon
                        provider={model.provider}
                        className="size-3.5 shrink-0"
                      />
                      <span className="flex-1 truncate text-xs">{model.name}</span>
                      {locked ? (
                        <Lock className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        model.id === value && <Check className="size-3 shrink-0" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="w-[220px] overflow-y-auto">
            <ModelDetail model={hovered} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
