import {
  BookOpenText,
  BrainCircuit,
  FileSearch,
  Search,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type ToolKind = 'retrieve' | 'context' | 'read' | 'tool';
export type ActivityKind = 'thinking' | ToolKind;

export const TOOL_META: Record<
  ActivityKind,
  { label: string; icon: LucideIcon }
> = {
  thinking: { label: 'Thinking', icon: BrainCircuit },
  retrieve: { label: 'Search', icon: Search },
  context: { label: 'Context', icon: FileSearch },
  read: { label: 'Read', icon: BookOpenText },
  tool: { label: 'Tool', icon: Wrench },
};

/** Normalize `tool-retrieve_segments` → `retrieve`, etc. */
export function normalizeToolName(toolName: string): ToolKind {
  const normalized = toolName.replace(/^tool-/, '');

  switch (normalized) {
    case 'retrieve_segments':
      return 'retrieve';
    case 'get_transcript_context':
      return 'context';
    case 'read_transcript':
      return 'read';
    default:
      return 'tool';
  }
}
