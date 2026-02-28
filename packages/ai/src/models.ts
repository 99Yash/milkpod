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
    id: 'openai:gpt-5.2',
    name: 'GPT-5.2',
    provider: 'OpenAI',
    description: 'Most capable model. Best for complex analysis and nuanced questions.',
    speed: 3,
    intelligence: 5,
    isDefault: true,
  },
  {
    id: 'openai:gpt-4.1',
    name: 'GPT-4.1',
    provider: 'OpenAI',
    description: 'Strong all-rounder. Great for detailed answers with good speed.',
    speed: 4,
    intelligence: 4,
    isDefault: false,
  },
  {
    id: 'openai:gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    description: 'Fast and efficient. Great for quick lookups and simple questions.',
    speed: 5,
    intelligence: 3,
    isDefault: false,
  },
  {
    id: 'openai:o4-mini',
    name: 'o4 Mini',
    provider: 'OpenAI',
    description: 'Compact reasoning model. Thinks step-by-step for accurate answers.',
    speed: 4,
    intelligence: 4,
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
