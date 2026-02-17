import { useState, useCallback, useMemo, memo, useEffect, useRef, type CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import type { ClaudeMessage, ClaudeContentBlock, ToolResultBlock } from '../../types';

import MarkdownBlock from '../MarkdownBlock';
import {
  EditToolBlock,
  EditToolGroupBlock,
  ReadToolBlock,
  ReadToolGroupBlock,
  BashToolBlock,
  BashToolGroupBlock,
} from '../toolBlocks';
import { ContentBlockRenderer } from './ContentBlockRenderer';
import { formatTime } from '../../utils/helpers';
import { copyToClipboard } from '../../utils/copyUtils';
import { READ_TOOL_NAMES, EDIT_TOOL_NAMES, BASH_TOOL_NAMES, isToolName } from '../../utils/toolConstants';

export interface MessageItemProps {
  message: ClaudeMessage;
  messageIndex: number;
  isLast: boolean;
  streamingActive: boolean;
  isThinking: boolean;
  compactCompletedResponses: boolean;
  loadingStartTime?: number;
  t: TFunction;
  getMessageText: (message: ClaudeMessage) => string;
  getContentBlocks: (message: ClaudeMessage) => ClaudeContentBlock[];
  findToolResult: (toolId: string | undefined, messageIndex: number) => ToolResultBlock | null | undefined;
  extractMarkdownContent: (message: ClaudeMessage) => string;
}

type GroupedBlock =
  | { type: 'single'; block: ClaudeContentBlock; originalIndex: number }
  | { type: 'read_group'; blocks: ClaudeContentBlock[]; startIndex: number }
  | { type: 'edit_group'; blocks: ClaudeContentBlock[]; startIndex: number }
  | { type: 'bash_group'; blocks: ClaudeContentBlock[]; startIndex: number }
  | {
      type: 'subagent_group';
      taskBlock: ClaudeContentBlock;
      taskIndex: number;
      nestedBlocks: ClaudeContentBlock[];
      nestedStartIndex: number;
    };

/** Shared copy icon SVG used by both user and assistant message copy buttons */
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4l0 8a2 2 0 0 0 2 2l8 0a2 2 0 0 0 2 -2l0 -8a2 2 0 0 0 -2 -2l-8 0a2 2 0 0 0 -2 2zm2 0l8 0l0 8l-8 0l0 -8z" fill="currentColor" fillOpacity="0.9"/>
    <path d="M2 2l0 8l-2 0l0 -8a2 2 0 0 1 2 -2l8 0l0 2l-8 0z" fill="currentColor" fillOpacity="0.6"/>
  </svg>
);

interface CopyButtonProps {
  className?: string;
  isCopied: boolean;
  onClick: () => void;
  copyLabel: string;
  copySuccessText: string;
}

const CopyButton = memo(function CopyButton({
  className,
  isCopied,
  onClick,
  copyLabel,
  copySuccessText,
}: CopyButtonProps) {
  return (
    <button
      type="button"
      className={`message-copy-btn${className ? ` ${className}` : ''} ${isCopied ? 'copied' : ''}`}
      onClick={onClick}
      title={copyLabel}
      aria-label={copyLabel}
    >
      <span className="copy-icon">
        <CopyIcon />
      </span>
      <span className="copy-tooltip">{copySuccessText}</span>
    </button>
  );
});

function isToolBlockOfType(block: ClaudeContentBlock, toolNames: Set<string>): boolean {
  return block.type === 'tool_use' && isToolName(block.name, toolNames);
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

/** Extract the most recent action summary from a subagent nested block list */
function getLatestActionFromBlocks(blocks: ClaudeContentBlock[]): string {
  let latest = '';

  for (const block of blocks) {
    if (block.type !== 'tool_use') {
      continue;
    }

    const input = (block.input ?? {}) as Record<string, unknown>;
    const toolName = prettifyToolName(String(block.name ?? '')) || 'tool';
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

    let detail = '';
    for (const key of tryKeys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        detail = normalizeActionText(value);
        break;
      }
    }

    latest = detail ? `${toolName}: ${detail}` : toolName;
  }

  return latest;
}

function groupBlocks(blocks: ClaudeContentBlock[]): GroupedBlock[] {
  const groupedBlocks: GroupedBlock[] = [];
  let currentReadGroup: ClaudeContentBlock[] = [];
  let readGroupStartIndex = -1;
  let currentEditGroup: ClaudeContentBlock[] = [];
  let editGroupStartIndex = -1;
  let currentBashGroup: ClaudeContentBlock[] = [];
  let bashGroupStartIndex = -1;

  const flushReadGroup = () => {
    if (currentReadGroup.length > 0) {
      groupedBlocks.push({
        type: 'read_group',
        blocks: [...currentReadGroup],
        startIndex: readGroupStartIndex,
      });
      currentReadGroup = [];
      readGroupStartIndex = -1;
    }
  };

  const flushEditGroup = () => {
    if (currentEditGroup.length > 0) {
      groupedBlocks.push({
        type: 'edit_group',
        blocks: [...currentEditGroup],
        startIndex: editGroupStartIndex,
      });
      currentEditGroup = [];
      editGroupStartIndex = -1;
    }
  };

  const flushBashGroup = () => {
    if (currentBashGroup.length > 0) {
      groupedBlocks.push({
        type: 'bash_group',
        blocks: [...currentBashGroup],
        startIndex: bashGroupStartIndex,
      });
      currentBashGroup = [];
      bashGroupStartIndex = -1;
    }
  };

  blocks.forEach((block, idx) => {
    if (isToolBlockOfType(block, READ_TOOL_NAMES)) {
      flushEditGroup();
      flushBashGroup();
      if (currentReadGroup.length === 0) {
        readGroupStartIndex = idx;
      }
      currentReadGroup.push(block);
    } else if (isToolBlockOfType(block, EDIT_TOOL_NAMES)) {
      flushReadGroup();
      flushBashGroup();
      if (currentEditGroup.length === 0) {
        editGroupStartIndex = idx;
      }
      currentEditGroup.push(block);
    } else if (isToolBlockOfType(block, BASH_TOOL_NAMES)) {
      flushReadGroup();
      flushEditGroup();
      if (currentBashGroup.length === 0) {
        bashGroupStartIndex = idx;
      }
      currentBashGroup.push(block);
    } else {
      flushReadGroup();
      flushEditGroup();
      flushBashGroup();
      groupedBlocks.push({ type: 'single', block, originalIndex: idx });
    }
  });

  flushReadGroup();
  flushEditGroup();
  flushBashGroup();

  return groupedBlocks;
}

function offsetGroupedBlocks(groups: GroupedBlock[], offset: number): GroupedBlock[] {
  return groups.map((group) => {
    if (group.type === 'single') {
      return { ...group, originalIndex: group.originalIndex + offset };
    }
    if (group.type === 'read_group' || group.type === 'edit_group' || group.type === 'bash_group') {
      return { ...group, startIndex: group.startIndex + offset };
    }
    return group;
  });
}

function groupBlocksWithSubagents(blocks: ClaudeContentBlock[]): GroupedBlock[] {
  const groupedBlocks: GroupedBlock[] = [];
  let segmentStart = 0;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    const toolName = block.type === 'tool_use' ? block.name?.toLowerCase() : '';

    if (block.type === 'tool_use' && toolName === 'task') {
      if (segmentStart < i) {
        const segment = blocks.slice(segmentStart, i);
        groupedBlocks.push(...offsetGroupedBlocks(groupBlocks(segment), segmentStart));
      }

      const nestedBlocks: ClaudeContentBlock[] = [];
      let j = i + 1;

      while (j < blocks.length) {
        const nextBlock = blocks[j];
        if (nextBlock.type === 'thinking') {
          nestedBlocks.push(nextBlock);
          j += 1;
          continue;
        }
        if (nextBlock.type !== 'tool_use') {
          break;
        }
        const nextToolName = nextBlock.name?.toLowerCase();
        if (nextToolName === 'task') {
          break;
        }
        if (nextToolName !== 'todowrite') {
          nestedBlocks.push(nextBlock);
        }
        j += 1;
      }

      groupedBlocks.push({
        type: 'subagent_group',
        taskBlock: block,
        taskIndex: i,
        nestedBlocks,
        nestedStartIndex: i + 1,
      });

      segmentStart = j;
      i = j;
      continue;
    }
    i += 1;
  }

  if (segmentStart < blocks.length) {
    const trailing = blocks.slice(segmentStart);
    groupedBlocks.push(...offsetGroupedBlocks(groupBlocks(trailing), segmentStart));
  }

  return groupedBlocks;
}

export const MessageItem = memo(function MessageItem({
  message,
  messageIndex,
  isLast,
  streamingActive,
  isThinking,
  compactCompletedResponses,
  loadingStartTime,
  t,
  getMessageText,
  getContentBlocks,
  findToolResult,
  extractMarkdownContent,
}: MessageItemProps): React.ReactElement {
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);

  // Track timeout to properly cleanup on unmount
  const copyTimeoutRef = useRef<number | null>(null);

  // Manage thinking expansion state locally to avoid prop drilling and unnecessary re-renders
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedSubagents, setExpandedSubagents] = useState<Record<string, boolean>>({});

  const toggleThinking = useCallback((blockKey: string) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [blockKey]: !prev[blockKey],
    }));
  }, []);

  const isThinkingExpanded = useCallback(
    (blockKey: string) => {
      if (Object.prototype.hasOwnProperty.call(expandedThinking, blockKey)) {
        return Boolean(expandedThinking[blockKey]);
      }
      // Default-expand newly created thinking blocks.
      return true;
    },
    [expandedThinking]
  );

  const isSubagentExpanded = useCallback((key: string, defaultExpanded: boolean) => {
    if (Object.prototype.hasOwnProperty.call(expandedSubagents, key)) {
      return Boolean(expandedSubagents[key]);
    }
    return defaultExpanded;
  }, [expandedSubagents]);

  const isLastAssistantMessage = message.type === 'assistant' && isLast;
  const isMessageStreaming = streamingActive && isLastAssistantMessage;

  // Cache markdown content extraction for better performance
  const markdownContent = useMemo(() => {
    // Only extract for user and assistant messages that need copy functionality
    if (message.type === 'user' || message.type === 'assistant') {
      return extractMarkdownContent(message);
    }
    return '';
  }, [message, extractMarkdownContent]);

  const handleCopyMessage = useCallback(async () => {
    // Prevent copying if message is empty or already in "copied" state
    if (!markdownContent.trim() || copiedMessageIndex === messageIndex) return;

    const success = await copyToClipboard(markdownContent);
    if (success) {
      setCopiedMessageIndex(messageIndex);

      // Clear any existing timeout before setting new one
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }

      // Set new timeout and store ID for cleanup
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageIndex(null);
        copyTimeoutRef.current = null;
      }, 1500);
    }
  }, [markdownContent, messageIndex, copiedMessageIndex]);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  // Memoize blocks and grouped blocks to avoid recalculation on every render
  const blocks = useMemo(() => getContentBlocks(message), [message, getContentBlocks]);
  // Default-expand newly created root thinking blocks.
  useEffect(() => {
    setExpandedThinking((prev) => {
      let changed = false;
      const next: Record<string, boolean> = { ...prev };
      blocks.forEach((block, index) => {
        if (block.type !== 'thinking') return;
        const key = `root-${index}`;
        if (!(key in next)) {
          next[key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [blocks]);

  const isEmptyStreamingPlaceholder =
    message.type === 'assistant' &&
    isMessageStreaming &&
    blocks.length === 0 &&
    !(message.content && message.content.trim().length > 0);

  // Ref to track the last auto-expanded thinking block index to avoid overriding user interaction
  const lastAutoExpandedIndexRef = useRef<number>(-1);

  // Auto-expand the latest thinking block during streaming
  useEffect(() => {
    if (!isMessageStreaming) return;

    const thinkingIndices = blocks
      .map((block, index) => (block.type === 'thinking' ? index : -1))
      .filter((index) => index !== -1);

    if (thinkingIndices.length === 0) return;

    const lastThinkingIndex = thinkingIndices[thinkingIndices.length - 1];

    if (lastThinkingIndex !== lastAutoExpandedIndexRef.current) {
      setExpandedThinking((prev) => {
        const newState: Record<string, boolean> = { ...prev };
        // Collapse all thinking blocks
        thinkingIndices.forEach((idx) => {
          newState[`root-${idx}`] = false;
        });
        // Expand the latest one
        newState[`root-${lastThinkingIndex}`] = true;
        return newState;
      });
      lastAutoExpandedIndexRef.current = lastThinkingIndex;
    }
  }, [blocks, isMessageStreaming]);

  const groupedBlocks = useMemo(() => groupBlocksWithSubagents(blocks), [blocks]);
  const shouldCompactCompletedAssistant =
    compactCompletedResponses &&
    message.type === 'assistant' &&
    !isMessageStreaming;

  useEffect(() => {
    if (shouldCompactCompletedAssistant) {
      setShowExecutionDetails(false);
    }
  }, [shouldCompactCompletedAssistant, messageIndex]);

  const isExecutionDetailGroup = useCallback((grouped: GroupedBlock): boolean => {
    if (
      grouped.type === 'read_group' ||
      grouped.type === 'edit_group' ||
      grouped.type === 'bash_group'
    ) {
      return true;
    }

    if (grouped.type === 'single') {
      return grouped.block.type === 'thinking' || grouped.block.type === 'tool_use';
    }

    return false;
  }, []);

  const [primaryGroups, executionDetailGroups, subagentGroups] = useMemo((): [GroupedBlock[], GroupedBlock[], GroupedBlock[]] => {
    if (!shouldCompactCompletedAssistant) {
      return [groupedBlocks, [], []];
    }

    const primary: GroupedBlock[] = [];
    const details: GroupedBlock[] = [];
    const subagents: GroupedBlock[] = [];

    for (let i = 0; i < groupedBlocks.length; i++) {
      const grouped = groupedBlocks[i];
      if (grouped.type === 'subagent_group') {
        subagents.push(grouped);
      } else if (isExecutionDetailGroup(grouped)) {
        details.push(grouped);
      } else {
        // Check if this text block is followed by an execution detail block;
        // if so, it describes that tool call and belongs in execution details.
        const next = groupedBlocks[i + 1];
        if (next && isExecutionDetailGroup(next)) {
          details.push(grouped);
        } else {
          primary.push(grouped);
        }
      }
    }

    return [primary, details, subagents];
  }, [groupedBlocks, isExecutionDetailGroup, shouldCompactCompletedAssistant]);

  const hasRenderableContent = useMemo(() => {
    return blocks.some((block) => {
      if (block.type === 'tool_use') {
        const toolName = block.name?.toLowerCase();
        return toolName !== 'task' && toolName !== 'todowrite';
      }
      if (block.type === 'text') {
        return Boolean(block.text?.trim());
      }
      return true;
    });
  }, [blocks]);
  const messageStyle = useMemo(
    () => ({ contentVisibility: 'auto', containIntrinsicSize: '0 320px' } as const),
    []
  );

  const renderStandardGroupedBlock = (
    grouped: GroupedBlock,
    keyPrefix: string,
    nested = false
  ) => {
    const shouldApplyStreamingBlockEntrance =
      isMessageStreaming &&
      !(grouped.type === 'single' && grouped.block.type === 'thinking');
    const wrapperClass = [
      nested ? 'content-block content-block-subagent' : 'content-block',
      shouldApplyStreamingBlockEntrance ? 'streaming-block-entrance' : '',
    ].filter(Boolean).join(' ');
    const getStreamingEntranceStyle = (order: number): CSSProperties | undefined => {
      if (!shouldApplyStreamingBlockEntrance) return undefined;
      return { ['--stream-order' as string]: Math.max(0, order) } as CSSProperties;
    };

    if (grouped.type === 'read_group') {
      const readItems = grouped.blocks.map((b) => {
        const block = b as { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> };
        return {
          name: block.name,
          input: block.input,
          result: findToolResult(block.id, messageIndex),
        };
      });

      if (readItems.length === 1) {
        return (
          <div
            key={`${keyPrefix}-readgroup-${grouped.startIndex}`}
            className={wrapperClass}
            style={getStreamingEntranceStyle(grouped.startIndex)}
          >
            <ReadToolBlock input={readItems[0].input} />
          </div>
        );
      }

      return (
        <div
          key={`${keyPrefix}-readgroup-${grouped.startIndex}`}
          className={wrapperClass}
          style={getStreamingEntranceStyle(grouped.startIndex)}
        >
          <ReadToolGroupBlock items={readItems} isStreaming={isMessageStreaming} />
        </div>
      );
    }

    if (grouped.type === 'edit_group') {
      const editItems = grouped.blocks.map((b) => {
        const block = b as { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> };
        return {
          name: block.name,
          input: block.input,
          result: findToolResult(block.id, messageIndex),
        };
      });

      if (editItems.length === 1) {
        return (
          <div
            key={`${keyPrefix}-editgroup-${grouped.startIndex}`}
            className={wrapperClass}
            style={getStreamingEntranceStyle(grouped.startIndex)}
          >
            <EditToolBlock
              name={editItems[0].name}
              input={editItems[0].input}
              result={editItems[0].result}
            />
          </div>
        );
      }

      return (
        <div
          key={`${keyPrefix}-editgroup-${grouped.startIndex}`}
          className={wrapperClass}
          style={getStreamingEntranceStyle(grouped.startIndex)}
        >
          <EditToolGroupBlock items={editItems} isStreaming={isMessageStreaming} />
        </div>
      );
    }

    if (grouped.type === 'bash_group') {
      const bashItems = grouped.blocks.map((b) => {
        const block = b as { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> };
        return {
          name: block.name,
          input: block.input,
          result: findToolResult(block.id, messageIndex),
          toolId: block.id,
        };
      });

      if (bashItems.length === 1) {
        return (
          <div
            key={`${keyPrefix}-bashgroup-${grouped.startIndex}`}
            className={wrapperClass}
            style={getStreamingEntranceStyle(grouped.startIndex)}
          >
            <BashToolBlock
              name={bashItems[0].name}
              input={bashItems[0].input}
              result={bashItems[0].result}
              toolId={bashItems[0].toolId}
            />
          </div>
        );
      }

      return (
        <div
          key={`${keyPrefix}-bashgroup-${grouped.startIndex}`}
          className={wrapperClass}
          style={getStreamingEntranceStyle(grouped.startIndex)}
        >
          <BashToolGroupBlock
            items={bashItems}
            deniedToolIds={window.__deniedToolIds}
            isStreaming={isMessageStreaming}
          />
        </div>
      );
    }

    if (grouped.type !== 'single') {
      return null;
    }

    const { block, originalIndex: blockIndex } = grouped;
    const thinkingKey = nested ? `${keyPrefix}-thinking-${blockIndex}` : `root-${blockIndex}`;
    return (
      <div
        key={`${keyPrefix}-${blockIndex}`}
        className={wrapperClass}
        style={getStreamingEntranceStyle(blockIndex)}
      >
        <ContentBlockRenderer
          block={block}
          messageIndex={messageIndex}
          messageType={message.type}
          messageTimestamp={message.timestamp}
          isStreaming={isMessageStreaming}
          isThinkingExpanded={isThinkingExpanded(thinkingKey)}
          isThinking={isThinking}
          isLastMessage={isLast}
          isLastBlock={blockIndex === blocks.length - 1}
          loadingStartTime={loadingStartTime}
          t={t}
          onToggleThinking={() => toggleThinking(thinkingKey)}
          findToolResult={findToolResult}
        />
      </div>
    );
  };

  const renderGroupedBlocks = () => {
    if (message.type === 'error') {
      return <MarkdownBlock content={getMessageText(message)} />;
    }

    if (isEmptyStreamingPlaceholder) {
      // The WaitingIndicator (rendered by MessageList) handles the
      // "Thinking → Connecting" transition, so nothing to render here.
      return null;
    }

    const renderGroupList = (groups: GroupedBlock[]) => groups.map((grouped, index) => {
      if (grouped.type !== 'subagent_group') {
        return renderStandardGroupedBlock(grouped, `${messageIndex}`, false);
      }

      const taskTool = grouped.taskBlock as { id?: string; input?: Record<string, unknown> };
      const taskInput = taskTool.input || {};
      const subagentType = String((taskInput.subagent_type as string) ?? (taskInput.subagentType as string) ?? t('statusPanel.subagentTab'));
      const description = String((taskInput.description as string) ?? '').trim();
      const taskResult = findToolResult(taskTool.id, messageIndex);
      const status = !taskResult ? 'running' : taskResult.is_error ? 'error' : 'completed';
      const subagentKey = `${messageIndex}-subagent-${grouped.taskIndex}-${index}`;
      const expanded = isSubagentExpanded(subagentKey, false);
      const nestedGroupedBlocks = groupBlocks(grouped.nestedBlocks);
      const latestAction = getLatestActionFromBlocks(grouped.nestedBlocks);
      const summaryText =
        latestAction
        || description
        || (status === 'running'
          ? t('statusPanel.subagentThinking')
          : t('statusPanel.subagentNoDescription'));

      return (
        <div
          key={subagentKey}
          className={`subagent-thread-card status-${status}${isMessageStreaming ? ' streaming-block-entrance' : ''}`}
          style={isMessageStreaming ? ({ ['--stream-order' as string]: Math.max(0, grouped.taskIndex) } as CSSProperties) : undefined}
        >
          <button
            type="button"
            className={`subagent-thread-header ${expanded ? 'expanded' : ''}`}
            onClick={() => {
              setExpandedSubagents((prev) => ({
                ...prev,
                [subagentKey]: !expanded,
              }));
            }}
          >
            <span className="subagent-thread-title">
              <span className="subagent-thread-avatar codicon codicon-hubot" />
              <span>{subagentType}</span>
            </span>
            <span className={`subagent-thread-status status-${status}`}>
              {status === 'running'
                ? t('statusPanel.subagentStatusRunning')
                : status === 'completed'
                  ? t('statusPanel.subagentStatusCompleted')
                  : t('statusPanel.subagentStatusError')}
            </span>
            <span className={`subagent-thread-chevron codicon codicon-chevron-right ${expanded ? 'expanded' : ''}`} />
          </button>

          {summaryText && (
            <div className="subagent-thread-summary" title={summaryText}>
              <span className="subagent-thread-summary-label">Latest</span>
              {summaryText}
            </div>
          )}

          {expanded && (
            <div className="subagent-thread-body">
              {nestedGroupedBlocks.length > 0
                ? nestedGroupedBlocks.map((nested, nestedIndex) => (
                    <div
                      key={`${subagentKey}-nested-wrap-${nestedIndex}`}
                      className="subagent-body-item-enter"
                      style={{ ['--subagent-order' as string]: nestedIndex } as CSSProperties}
                    >
                      {renderStandardGroupedBlock(nested, `${subagentKey}-nested`, true)}
                    </div>
                  ))
                : (
                  <div className="subagent-thread-empty">{t('statusPanel.noSubagents')}</div>
                )}
            </div>
          )}
        </div>
      );
    });

    const primaryRendered = renderGroupList(primaryGroups);
    const hasExecutionDetails = shouldCompactCompletedAssistant && executionDetailGroups.length > 0;
    const hasSubagents = shouldCompactCompletedAssistant && subagentGroups.length > 0;

    if (!hasExecutionDetails && !hasSubagents) {
      return primaryRendered;
    }

    return (
      <>
        {hasSubagents && renderGroupList(subagentGroups)}
        {hasExecutionDetails && (
          <div className="message-execution-details">
            <button
              type="button"
              className="message-execution-details-toggle"
              onClick={() => setShowExecutionDetails((prev) => !prev)}
            >
              <span className={`codicon ${showExecutionDetails ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
              <span>
                {showExecutionDetails
                  ? t('chat.hideExecutionDetails', 'Hide execution details')
                  : t('chat.showExecutionDetails', 'Show execution details')}
              </span>
            </button>
            <div className={`message-execution-details-content ${showExecutionDetails ? 'expanded' : 'collapsed'}`}>
              {renderGroupList(executionDetailGroups)}
            </div>
          </div>
        )}
        {primaryRendered}
      </>
    );
  };

  if (isEmptyStreamingPlaceholder) {
    return <></>;
  }

  if (message.type === 'assistant' && !isMessageStreaming && !hasRenderableContent) {
    return <></>;
  }

  return (
    <div className={`message ${message.type}`} style={messageStyle}>
      {/* Timestamp and copy button for user messages */}
      {message.type === 'user' && message.timestamp && (
        <div className="message-header-row">
          <div className="message-timestamp-header">
            {formatTime(message.timestamp)}
          </div>
          <CopyButton
            className="message-copy-btn-inline"
            isCopied={copiedMessageIndex === messageIndex}
            onClick={handleCopyMessage}
            copyLabel={t('markdown.copyMessage')}
            copySuccessText={t('markdown.copySuccess')}
          />
        </div>
      )}

      {/* Copy button for assistant messages only */}
      {message.type === 'assistant' && !isMessageStreaming && (
        <CopyButton
          isCopied={copiedMessageIndex === messageIndex}
          onClick={handleCopyMessage}
          copyLabel={t('markdown.copyMessage')}
          copySuccessText={t('markdown.copySuccess')}
        />
      )}

      {/* Role label for non-user/assistant messages */}
      {message.type !== 'assistant' && message.type !== 'user' && (
        <div className="message-role-label">
          {message.type}
        </div>
      )}

      <div className="message-content">
        {renderGroupedBlocks()}
      </div>
    </div>
  );
});
