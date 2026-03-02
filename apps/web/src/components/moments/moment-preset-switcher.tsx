'use client';

import {
  Zap,
  Lightbulb,
  Quote,
  ListChecks,
  BookOpen,
  Layers,
} from 'lucide-react';
import { cn } from '~/lib/utils';

export type MomentPreset =
  | 'default'
  | 'hook'
  | 'insight'
  | 'quote'
  | 'actionable'
  | 'story';

const presets: { value: MomentPreset; label: string; icon: typeof Zap }[] = [
  { value: 'default', label: 'All', icon: Layers },
  { value: 'hook', label: 'Hooks', icon: Zap },
  { value: 'insight', label: 'Insights', icon: Lightbulb },
  { value: 'quote', label: 'Quotes', icon: Quote },
  { value: 'actionable', label: 'How-to', icon: ListChecks },
  { value: 'story', label: 'Story', icon: BookOpen },
];

interface MomentPresetSwitcherProps {
  value: MomentPreset;
  onChange: (preset: MomentPreset) => void;
  disabled?: boolean;
}

export function MomentPresetSwitcher({
  value,
  onChange,
  disabled,
}: MomentPresetSwitcherProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map(({ value: preset, label, icon: Icon }) => (
        <button
          key={preset}
          type="button"
          disabled={disabled}
          onClick={() => onChange(preset)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            value === preset
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
          )}
        >
          <Icon className="size-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
