import { useMemo } from 'react';
import type { ClaudeMessage, ClaudeContentBlock, ToolResultBlock, SubagentInfo, SubagentStatus } from '../types';

interface UseSubagentsParams {
  messages: ClaudeMessage[];
  getContentBlocks: (message: ClaudeMessage) => ClaudeContentBlock[];
  findToolResult: (toolUseId?: string, messageIndex?: number) => ToolResultBlock | null;
}

/**
 * Determine subagent status based on tool result
 */
function determineStatus(result: ToolResultBlock | null): SubagentStatus {
  if (!result) {
    return 'running';
  }
  if (result.is_error) {
    return 'error';
  }
  return 'completed';
}

function getRawContentArray(message: ClaudeMessage): Array<Record<string, unknown>> {
  const raw = message.raw;
  if (!raw || typeof raw === 'string') {
    return [];
  }

  const content = raw.message?.content ?? raw.content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter((entry) => Boolean(entry) && typeof entry === 'object') as Array<Record<string, unknown>>;
}

function parseTimestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function normalizeActionText(text: string | undefined): string {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

function prettifyToolName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getToolActionSummary(block: ClaudeContentBlock): string {
  if (block.type !== 'tool_use') {
    if (block.type === 'text') {
      return normalizeActionText(block.text);
    }
    if (block.type === 'thinking') {
      return normalizeActionText(block.thinking ?? block.text);
    }
    return '';
  }

  const toolNameRaw = String(block.name ?? '');
  const toolName = prettifyToolName(toolNameRaw) || 'tool';
  const input = (block.input ?? {}) as Record<string, unknown>;

  const tryKeys = [
    'description',
    'command',
    'query',
    'q',
    'path',
    'file_path',
    'url',
    'pattern',
    'tool',
  ];

  for (const key of tryKeys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return `${toolName}: ${normalizeActionText(value)}`;
    }
  }

  return toolName;
}

function findResultTimestampMs(messages: ClaudeMessage[], toolUseId: string): number | undefined {
  for (const message of messages) {
    const blocks = getRawContentArray(message);
    const found = blocks.some((block) =>
      block.type === 'tool_result' && String(block.tool_use_id ?? '') === toolUseId
    );
    if (found) {
      return parseTimestampMs(message.timestamp);
    }
  }
  return undefined;
}

/**
 * Hook to extract subagent information from Task tool calls
 */
export function useSubagents({
  messages,
  getContentBlocks,
  findToolResult,
}: UseSubagentsParams): SubagentInfo[] {
  return useMemo(() => {
    const subagents: SubagentInfo[] = [];

    messages.forEach((message, messageIndex) => {
      if (message.type !== 'assistant') return;

      const blocks = getContentBlocks(message);

      blocks.forEach((block, blockIndex) => {
        if (block.type !== 'tool_use') return;

        const toolName = block.name?.toLowerCase() ?? '';

        // Only process Task tool calls
        if (toolName !== 'task') return;

        const input = block.input as Record<string, unknown> | undefined;
        if (!input) return;

        // Defensive: ensure all string values are actually strings
        const id = String(block.id ?? `task-${messageIndex}-${subagents.length}`);
        const subagentType = String((input.subagent_type as string) ?? (input.subagentType as string) ?? 'Unknown');
        const description = String((input.description as string) ?? '');
        const prompt = String((input.prompt as string) ?? '');
        const startedAtMs = parseTimestampMs(message.timestamp);

        // Check tool result to determine status
        const result = findToolResult(block.id, messageIndex);
        const status = determineStatus(result);
        const finishedAtMs = block.id ? findResultTimestampMs(messages, block.id) : undefined;

        let currentAction = '';
        for (let i = blockIndex + 1; i < blocks.length; i += 1) {
          const nextBlock = blocks[i];
          if (nextBlock.type === 'tool_use' && (nextBlock.name?.toLowerCase() ?? '') === 'task') {
            break;
          }
          const summary = getToolActionSummary(nextBlock);
          if (summary) {
            currentAction = summary;
          }
        }

        subagents.push({
          id,
          type: subagentType,
          description,
          prompt,
          currentAction: currentAction || '',
          status,
          messageIndex,
          startedAtMs,
          finishedAtMs,
        });
      });
    });

    return subagents;
  }, [messages, getContentBlocks, findToolResult]);
}
