import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { ClaudeContentBlock, ToolResultBlock } from '../../types';

import MarkdownBlock from '../MarkdownBlock';
import CollapsibleTextBlock from '../CollapsibleTextBlock';
import { TextEffect } from '../core/text-effect';
import { TextShimmer } from '../core/text-shimmer';
import {
  BashToolBlock,
  EditToolBlock,
  GenericToolBlock,
} from '../toolBlocks';
import { EDIT_TOOL_NAMES, BASH_TOOL_NAMES, isToolName } from '../../utils/toolConstants';

const thinkingEntranceVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.01 },
    },
  },
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(10px) brightness(0%)',
      y: 0,
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px) brightness(100%)',
      transition: {
        duration: 0.4,
      },
    },
  },
} as const;

const thinkingExitViaReversedEntranceVariants = {
  container: {
    hidden: { opacity: 1 },
    visible: {
      opacity: 0,
      transition: { staggerChildren: 0.01, staggerDirection: -1 },
    },
  },
  item: {
    hidden: {
      opacity: 1,
      filter: 'blur(0px) brightness(100%)',
      y: 0,
    },
    visible: {
      opacity: 0,
      y: 0,
      filter: 'blur(10px) brightness(0%)',
      transition: {
        duration: 0.4,
      },
    },
  },
} as const;

function isPlainTextForEntranceAnimation(content: string): boolean {
  if (!content.trim()) return false;
  return !(
    /```/.test(content) ||
    /(^|\s)`[^`]/.test(content) ||
    /^\s{0,3}#{1,6}\s/m.test(content) ||
    /^\s*[-*+]\s+/m.test(content) ||
    /^\s*\d+\.\s+/m.test(content) ||
    /^\s*>\s+/m.test(content) ||
    /!\[[^\]]*]\([^)]+\)/.test(content) ||
    /\[[^\]]+]\([^)]+\)/.test(content) ||
    /^\s*\|.+\|\s*$/m.test(content)
  );
}

function getFileIcon(mediaType?: string): string {
  if (!mediaType) return 'codicon-file';
  if (mediaType.startsWith('text/')) return 'codicon-file-text';
  if (mediaType.includes('json')) return 'codicon-json';
  if (mediaType.includes('javascript') || mediaType.includes('typescript')) return 'codicon-file-code';
  if (mediaType.includes('pdf')) return 'codicon-file-pdf';
  return 'codicon-file';
}

function getExtension(fileName?: string): string {
  if (!fileName) return '';
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
}

function formatCompactElapsed(elapsedSeconds: number): string {
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatThoughtSentence(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes > 0) {
    return `Thought for ${minutes} minute${minutes === 1 ? '' : 's'} and ${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  return `Thought for ${seconds} second${seconds === 1 ? '' : 's'}`;
}

export interface ContentBlockRendererProps {
  block: ClaudeContentBlock;
  messageIndex: number;
  messageType: string;
  messageTimestamp?: string;
  isStreaming: boolean;
  isThinkingExpanded: boolean;
  isThinking: boolean;
  isLastMessage: boolean;
  isLastBlock?: boolean;
  loadingStartTime?: number;
  t: TFunction;
  onToggleThinking: () => void;
  findToolResult: (toolId: string | undefined, messageIndex: number) => ToolResultBlock | null | undefined;
}

const THINKING_AUTO_COLLAPSE_DELAY_MS = 350;
const THINKING_STATUS_TRANSITION_MS = 420;
type ThinkingStatusPhase = 'active' | 'transitioning' | 'thought';

export function ContentBlockRenderer({
  block,
  messageIndex,
  messageType,
  messageTimestamp,
  isStreaming,
  isThinkingExpanded,
  isThinking,
  isLastMessage,
  isLastBlock = false,
  loadingStartTime,
  t,
  onToggleThinking,
  findToolResult,
}: ContentBlockRendererProps): React.ReactElement | null {
  const hasAutoCollapsedThinkingRef = useRef(false);
  const thinkingStatusTimerRef = useRef<number | null>(null);
  const localThinkingStartTimeRef = useRef<number | null>(null);
  const wasActiveThinkingRef = useRef(isThinking && isLastMessage && isLastBlock);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (loadingStartTime) return Math.max(0, Math.floor((Date.now() - loadingStartTime) / 1000));
    return 0;
  });
  const [thinkingStatusPhase, setThinkingStatusPhase] = useState<ThinkingStatusPhase>(
    () => (isThinking && isLastMessage && isLastBlock ? 'active' : 'thought')
  );
  const thinkingText = block.type === 'thinking'
    ? (block.text ?? block.thinking ?? t('chat.noThinkingContent'))
    : '';
  const isActiveThinkingBlock =
    isThinking &&
    isLastMessage &&
    isLastBlock;
  const shouldAutoCollapseThinking =
    block.type === 'thinking' &&
    isThinkingExpanded &&
    messageType === 'assistant' &&
    !isActiveThinkingBlock;

  useEffect(() => {
    if (!isActiveThinkingBlock) {
      if (localThinkingStartTimeRef.current !== null) {
        localThinkingStartTimeRef.current = null;
      }
      // If we never observed active timing but do have a timestamp, avoid "0 seconds".
      if (elapsedSeconds === 0 && messageTimestamp) {
        const parsed = Date.parse(messageTimestamp);
        if (!Number.isNaN(parsed)) {
          const fallbackSeconds = Math.max(1, Math.floor((Date.now() - parsed) / 1000));
          setElapsedSeconds(fallbackSeconds);
        }
      }
      return;
    }

    if (!loadingStartTime && localThinkingStartTimeRef.current === null) {
      localThinkingStartTimeRef.current = Date.now();
    }

    const updateElapsed = () => {
      const start = loadingStartTime ?? localThinkingStartTimeRef.current;
      if (!start) return;
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    updateElapsed();

    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [loadingStartTime, isActiveThinkingBlock, messageTimestamp, elapsedSeconds]);

  useEffect(() => {
    if (thinkingStatusTimerRef.current !== null) {
      window.clearTimeout(thinkingStatusTimerRef.current);
      thinkingStatusTimerRef.current = null;
    }

    if (isActiveThinkingBlock) {
      setThinkingStatusPhase('active');
      wasActiveThinkingRef.current = true;
      return;
    }

    if (wasActiveThinkingRef.current) {
      setThinkingStatusPhase('transitioning');
      thinkingStatusTimerRef.current = window.setTimeout(() => {
        setThinkingStatusPhase('thought');
        thinkingStatusTimerRef.current = null;
      }, THINKING_STATUS_TRANSITION_MS);
    } else {
      setThinkingStatusPhase('thought');
    }

    wasActiveThinkingRef.current = false;
  }, [isActiveThinkingBlock, elapsedSeconds, t]);

  useEffect(() => {
    return () => {
      if (thinkingStatusTimerRef.current !== null) {
        window.clearTimeout(thinkingStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasAutoCollapsedThinkingRef.current || !shouldAutoCollapseThinking) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!hasAutoCollapsedThinkingRef.current && isThinkingExpanded) {
        onToggleThinking();
        hasAutoCollapsedThinkingRef.current = true;
      }
    }, THINKING_AUTO_COLLAPSE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [shouldAutoCollapseThinking, isThinkingExpanded, onToggleThinking]);

  if (block.type === 'text') {
    const textContent = block.text ?? '';
    const shouldAnimateStreamingText =
      messageType !== 'user' &&
      isStreaming &&
      isLastMessage;
    const shouldAnimateNonStreamingAssistantText =
      messageType === 'assistant' &&
      !isStreaming &&
      isPlainTextForEntranceAnimation(textContent);
    const shouldAnimateWithTextEffect =
      shouldAnimateStreamingText || shouldAnimateNonStreamingAssistantText;

    return messageType === 'user' ? (
      <CollapsibleTextBlock content={textContent} />
    ) : shouldAnimateWithTextEffect ? (
      <TextEffect
        className="streaming-text-effect"
        per="char"
        trigger={`${messageIndex}:${textContent}`}
        variants={thinkingEntranceVariants}
      >
        {textContent}
      </TextEffect>
    ) : (
      <MarkdownBlock
        content={textContent}
        isStreaming={isStreaming}
      />
    );
  }

  if (block.type === 'image' && block.src) {
    const handleImagePreview = () => {
      const previewRoot = document.getElementById('image-preview-root');
      if (!previewRoot || !block.src) return;

      previewRoot.innerHTML = '';
      const overlay = document.createElement('div');
      overlay.className = 'image-preview-overlay';
      overlay.onclick = () => overlay.remove();

      const img = document.createElement('img');
      img.src = block.src;
      img.alt = t('chat.imagePreview');
      img.className = 'image-preview-content';
      img.onclick = (e) => e.stopPropagation();

      const closeBtn = document.createElement('div');
      closeBtn.className = 'image-preview-close';
      closeBtn.textContent = '×';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
      };

      overlay.appendChild(img);
      overlay.appendChild(closeBtn);
      previewRoot.appendChild(overlay);
    };

    return (
      <div
        className={`message-image-block ${messageType === 'user' ? 'user-image' : ''}`}
        onClick={handleImagePreview}
        style={{ cursor: 'pointer' }}
        title={t('chat.clickToPreview')}
      >
        <img
          src={block.src}
          alt={t('chat.userUploadedImage')}
          style={{
            maxWidth: messageType === 'user' ? '200px' : '100%',
            maxHeight: messageType === 'user' ? '150px' : 'auto',
            borderRadius: '8px',
            objectFit: 'contain',
          }}
        />
      </div>
    );
  }

  if (block.type === 'attachment') {
    const ext = getExtension(block.fileName);
    const displayName = block.fileName || t('chat.unknownFile');
    return (
      <div className="message-attachment-chip" title={displayName}>
        <span className={`message-attachment-chip-icon codicon ${getFileIcon(block.mediaType)}`} />
        {ext && <span className="message-attachment-chip-ext">{ext}</span>}
        <span className="message-attachment-chip-name">{displayName}</span>
      </div>
    );
  }

  if (block.type === 'thinking') {
    const shouldAnimateThinkingText =
      isActiveThinkingBlock &&
      isStreaming &&
      isLastMessage &&
      isLastBlock &&
      messageType === 'assistant' &&
      isPlainTextForEntranceAnimation(thinkingText);
    const shouldAnimateCompletedThinkingText =
      !isActiveThinkingBlock &&
      messageType === 'assistant' &&
      isPlainTextForEntranceAnimation(thinkingText);
    const thinkingStatusText = isActiveThinkingBlock
      ? `${t('common.thinking')} (${formatCompactElapsed(elapsedSeconds)})`
      : formatThoughtSentence(elapsedSeconds);
    const compactElapsedText = formatCompactElapsed(elapsedSeconds);
    const transitionThinkingText = `${t('common.thinking')} (${compactElapsedText})`;

    return (
      <div className="thinking-block">
        <div
          className="thinking-header"
          onClick={onToggleThinking}
        >
          <span className="thinking-title">
            {thinkingStatusPhase === 'active' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TextShimmer
                  className="thinking-title-shimmer"
                  duration={1.05}
                  repeat={Infinity}
                >
                  {t('common.thinking')}
                </TextShimmer>
                <span className="thinking-title-elapsed">({compactElapsedText})</span>
              </span>
            ) : thinkingStatusPhase === 'transitioning' ? (
              <TextEffect
                className="thinking-title-effect"
                per="char"
                trigger={`thinking-out:${transitionThinkingText}`}
                variants={thinkingExitViaReversedEntranceVariants}
              >
                {transitionThinkingText}
              </TextEffect>
            ) : (
              <TextEffect
                className="thinking-title-effect"
                per="char"
                trigger={`thought-in:${thinkingStatusText}`}
                variants={thinkingEntranceVariants}
              >
                {thinkingStatusText}
              </TextEffect>
            )}
          </span>
          <span className={`thinking-icon codicon codicon-chevron-right ${isThinkingExpanded ? 'expanded' : 'collapsed'}`} />
        </div>
        <div className={`thinking-content ${isThinkingExpanded ? 'expanded' : 'collapsed'}`}>
          {shouldAnimateThinkingText || shouldAnimateCompletedThinkingText ? (
            <TextEffect
              className="thinking-streaming-text"
              per="char"
              trigger={`${messageIndex}:${thinkingText}`}
              variants={thinkingEntranceVariants}
            >
              {thinkingText}
            </TextEffect>
          ) : (
            <MarkdownBlock
              content={thinkingText}
              isStreaming={isStreaming}
            />
          )}
        </div>
      </div>
    );
  }

  if (block.type === 'tool_use') {
    const toolName = block.name?.toLowerCase();

    if (toolName === 'todowrite') {
      return null;
    }

    if (toolName === 'task') {
      return null;
    }

    if (isToolName(block.name, EDIT_TOOL_NAMES)) {
      return (
        <EditToolBlock
          name={block.name}
          input={block.input}
          result={findToolResult(block.id, messageIndex)}
          toolId={block.id}
        />
      );
    }

    if (isToolName(block.name, BASH_TOOL_NAMES)) {
      return (
        <BashToolBlock
          name={block.name}
          input={block.input}
          result={findToolResult(block.id, messageIndex)}
          toolId={block.id}
        />
      );
    }

    return (
      <GenericToolBlock
        name={block.name}
        input={block.input}
        result={findToolResult(block.id, messageIndex)}
        toolId={block.id}
      />
    );
  }

  return null;
}
