'use client';

import { RotateCcw, ChevronUp } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { MODEL_REGISTRY, type ModelId } from '@milkpod/ai/models';
import { AnthropicLogo, GoogleG, OpenAILogo } from '~/components/ui/icons';

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

interface RetrySendButtonProps {
  currentModelId: ModelId;
  allowedModelIds?: string[] | null;
  onRetry: (modelId?: ModelId) => void;
  disabled?: boolean;
}

export function RetrySendButton({
  currentModelId,
  allowedModelIds,
  onRetry,
  disabled,
}: RetrySendButtonProps) {
  const otherModels = MODEL_REGISTRY
    .filter((m) => m.id !== currentModelId)
    .filter((m) => !allowedModelIds || allowedModelIds.includes(m.id));

  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="shrink-0 gap-1.5 rounded-r-none rounded-l-xl bg-accent/35 pr-2 text-foreground hover:bg-accent/50 disabled:bg-muted-foreground/8 disabled:text-muted-foreground"
        onClick={() => onRetry()}
      >
        <RotateCcw className="size-3.5" />
        <span className="text-xs">Retry</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="shrink-0 rounded-l-none rounded-r-xl border-l border-foreground/10 bg-accent/35 px-1 text-foreground hover:bg-accent/50 disabled:bg-muted-foreground/8 disabled:text-muted-foreground"
          >
            <ChevronUp className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
          <DropdownMenuItem onClick={() => onRetry()}>
            <RotateCcw className="size-3.5" />
            Retry same
          </DropdownMenuItem>
          {otherModels.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                or switch model
              </DropdownMenuLabel>
              {otherModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onRetry(model.id as ModelId)}
                >
                  <ProviderIcon provider={model.provider} className="size-3.5 shrink-0" />
                  {model.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
