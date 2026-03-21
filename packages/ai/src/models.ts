import { z } from 'zod';

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: string;
  description: string;
  speed: number;
  intelligence: number;
  isDefault: boolean;
}

export const MODEL_REGISTRY: ModelDescriptor[] = [
  {
    id: 'openai:gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'OpenAI',
    description: 'Fast and capable. Great for quick lookups and detailed answers.',
    speed: 5,
    intelligence: 4,
    isDefault: true,
  },
  {
    id: 'anthropic:claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: 'Excellent reasoning and analysis. Strong at nuanced questions.',
    speed: 4,
    intelligence: 5,
    isDefault: false,
  },
  {
    id: 'google:gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Google\'s most capable model. Excellent at long-context understanding.',
    speed: 3,
    intelligence: 5,
    isDefault: false,
  },
  {
    id: 'google:gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Fast with strong reasoning. Good balance of speed and quality.',
    speed: 5,
    intelligence: 4,
    isDefault: false,
  },
  {
    id: 'google:gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description: 'Lightweight and quick. Best for simple lookups and summaries.',
    speed: 5,
    intelligence: 3,
    isDefault: false,
  },
];

export const DEFAULT_MODEL_ID = MODEL_REGISTRY.find((m) => m.isDefault)!.id;

// Non-empty tuple cast is safe — MODEL_REGISTRY always has at least one entry.
export const VALID_MODEL_IDS = MODEL_REGISTRY.map((m) => m.id) as [string, ...string[]];

export const modelIdSchema = z.enum(VALID_MODEL_IDS);

export type ModelId = z.infer<typeof modelIdSchema>;
