import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ClaudeContentBlock,
  ClaudeContentOrResultBlock,
  ClaudeMessage,
  ToolResultBlock,
} from '../types';
import { MessageList } from './MessageList';
import {
  normalizeBlocks as normalizeBlocksUtil,
  getMessageText as getMessageTextUtil,
} from '../utils/messageUtils';
import { extractMarkdownContent } from '../utils/copyUtils';

const DEMO_IMAGE_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="180" viewBox="0 0 440 180">' +
      '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#1f6feb"/><stop offset="100%" stop-color="#2ea043"/></linearGradient></defs>' +
      '<rect width="440" height="180" fill="url(#g)"/>' +
      '<text x="24" y="74" fill="#fff" font-size="24" font-family="Segoe UI, Arial, sans-serif">UI Preview Artifact</text>' +
      '<text x="24" y="108" fill="#dbeafe" font-size="15" font-family="Segoe UI, Arial, sans-serif">stream + tools + subagents + status</text>' +
    '</svg>'
  );

type DemoState = {
  loading: boolean;
  streamingActive: boolean;
  isThinking: boolean;
  loadingStartTime: number | null;
  loadingElapsedSeconds?: number | null;
};

type DemoSnapshot = {
  rawMessages: ClaudeMessage[];
  demoState: DemoState;
  agentMessageIndex: number;
};

type DemoEvent = {
  at: number;
  label: string;
  apply: (snapshot: DemoSnapshot, isoAt: (offset: number) => string, baseTimeMs: number) => DemoSnapshot;
};

function makeInitialSnapshot(): DemoSnapshot {
  return {
    rawMessages: [],
    demoState: {
      loading: false,
      streamingActive: false,
      isThinking: false,
      loadingStartTime: null,
      loadingElapsedSeconds: null,
    },
    agentMessageIndex: -1,
  };
}

function updateAgentMessage(
  snapshot: DemoSnapshot,
  rawContent: ClaudeContentOrResultBlock[],
  isStreaming: boolean,
  timestamp: string
): DemoSnapshot {
  const idx = snapshot.agentMessageIndex;
  if (idx < 0 || idx >= snapshot.rawMessages.length) {
    return snapshot;
  }
  const nextMessages = [...snapshot.rawMessages];
  const currentRaw = typeof nextMessages[idx].raw === 'object' && nextMessages[idx].raw
    ? nextMessages[idx].raw as Record<string, unknown>
    : {};
  nextMessages[idx] = {
    ...nextMessages[idx],
    raw: { ...currentRaw, content: rawContent },
    isStreaming,
    timestamp: nextMessages[idx].timestamp || timestamp,
  };
  return {
    ...snapshot,
    rawMessages: nextMessages,
  };
}

function appendTextToAgentMessage(
  snapshot: DemoSnapshot,
  text: string,
  isStreaming: boolean,
  timestamp: string
): DemoSnapshot {
  const idx = snapshot.agentMessageIndex;
  if (idx < 0 || idx >= snapshot.rawMessages.length) {
    return snapshot;
  }

  const current = snapshot.rawMessages[idx];
  let existingContent: ClaudeContentOrResultBlock[] = [];
  if (current.raw && typeof current.raw !== 'string') {
    const content = current.raw.content ?? current.raw.message?.content;
    if (Array.isArray(content)) {
      existingContent = content as ClaudeContentOrResultBlock[];
    }
  }

  const nextMessages = [...snapshot.rawMessages];
  const currentRaw = typeof current.raw === 'object' && current.raw
    ? current.raw as Record<string, unknown>
    : {};
  nextMessages[idx] = {
    ...current,
    raw: {
      ...currentRaw,
      content: [
        ...existingContent,
        { type: 'text', text },
      ],
    },
    isStreaming,
    timestamp: current.timestamp || timestamp,
  };

  return {
    ...snapshot,
    rawMessages: nextMessages,
  };
}

function getAgentContent(snapshot: DemoSnapshot): ClaudeContentOrResultBlock[] {
  const idx = snapshot.agentMessageIndex;
  if (idx < 0 || idx >= snapshot.rawMessages.length) {
    return [];
  }
  const current = snapshot.rawMessages[idx];
  if (!current.raw || typeof current.raw === 'string') {
    return [];
  }
  const content = current.raw.content ?? current.raw.message?.content;
  if (!Array.isArray(content)) {
    return [];
  }
  return content as ClaudeContentOrResultBlock[];
}

function isToolResultCarrierUserMessage(message: ClaudeMessage): boolean {
  if (message.type !== 'user') return false;
  const raw = message.raw;
  if (!raw || typeof raw === 'string') return false;
  const content = raw.content ?? raw.message?.content;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((block) => block && typeof block === 'object' && (block as Record<string, unknown>).type === 'tool_result');
}

function buildDemoEvents(): DemoEvent[] {
  return [
    {
      at: 120,
      label: 'User prompt appears',
      apply: (snapshot, isoAt) => ({
        ...snapshot,
        rawMessages: [
          {
            type: 'user',
            content:
              'Design pass: improve chat stream hierarchy, tool readability, and subagent cards. Keep motion subtle.',
            timestamp: isoAt(-9000),
          },
        ],
      }),
    },
    {
      at: 420,
      label: 'Assistant starts thinking',
      apply: (snapshot, isoAt, _baseTimeMs) => {
        const nextAgentIndex = snapshot.rawMessages.length;
        return {
          ...snapshot,
          agentMessageIndex: nextAgentIndex,
          demoState: {
            loading: true,
            streamingActive: true,
            isThinking: true,
            loadingStartTime: null,
            loadingElapsedSeconds: 5,
          },
          rawMessages: [
            ...snapshot.rawMessages,
            {
              type: 'assistant',
              isStreaming: true,
              timestamp: isoAt(420),
              raw: {
                uuid: 'demo-assistant-main',
                content: [
                  {
                    type: 'thinking',
                    thinking: 'Reviewing stream structure and planning staged UI updates.',
                  },
                ],
              },
            },
          ],
        };
      },
    },
    {
      at: 1100,
      label: 'Thinking completes',
      apply: (snapshot, isoAt) => {
        const updated = updateAgentMessage(
          snapshot,
          [
            {
              type: 'thinking',
              thinking: 'Reviewing stream structure and planning staged UI updates.',
            },
          ],
          true,
          isoAt(1100)
        );
        return {
          ...updated,
          demoState: {
            ...updated.demoState,
            loading: false,
            streamingActive: false,
            isThinking: false,
            loadingElapsedSeconds: 15,
          },
        };
      },
    },
    {
      at: 1550,
      label: 'Read tool calls stream in',
      apply: (snapshot, isoAt) =>
        updateAgentMessage(
          snapshot,
          [
            {
              type: 'thinking',
              thinking: 'Reviewing stream structure and planning staged UI updates.',
            },
            {
              type: 'text',
              text: 'Starting with repository inspection and command grouping baseline.',
            },
            {
              type: 'tool_use',
              id: 'demo-read-1',
              name: 'read',
              input: { file_path: 'webview/src/components/MessageItem/MessageItem.tsx' },
            },
            {
              type: 'tool_use',
              id: 'demo-read-2',
              name: 'read',
              input: { file_path: 'webview/src/styles/less/components/message.less' },
            },
          ],
          true,
          isoAt(1550)
        ),
    },
    {
      at: 2050,
      label: 'Read results return',
      apply: (snapshot, isoAt) => ({
        ...snapshot,
        rawMessages: [
          ...snapshot.rawMessages,
          {
            type: 'user',
            timestamp: isoAt(2050),
            raw: {
              content: [
                { type: 'tool_result', tool_use_id: 'demo-read-1', content: 'File read successfully.' },
                { type: 'tool_result', tool_use_id: 'demo-read-2', content: 'File read successfully.' },
              ],
            },
          },
        ],
      }),
    },
    {
      at: 2550,
      label: 'Edit/Bash/Subagent phase',
      apply: (snapshot, isoAt) => {
        const existing = getAgentContent(snapshot);
        return (
        updateAgentMessage(
          snapshot,
          [
            ...existing,
            { type: 'text', text: 'Applying edits and running a small command batch to validate UI behavior.' },
            {
              type: 'tool_use',
              id: 'demo-edit-1',
              name: 'edit',
              input: {
                file_path: 'webview/src/styles/less/components/tools.less',
                description: 'remove timeline connectors',
              },
            },
            {
              type: 'tool_use',
              id: 'demo-edit-2',
              name: 'edit',
              input: {
                file_path: 'webview/src/components/MessageItem/ContentBlockRenderer.tsx',
                description: 'update entrance effect trigger',
              },
            },
            {
              type: 'tool_use',
              id: 'demo-bash-1',
              name: 'shell_command',
              input: {
                description: 'Run lint subset',
                command: 'npm run lint -- webview/src/components/MessageItem/ContentBlockRenderer.tsx',
              },
            },
            {
              type: 'tool_use',
              id: 'demo-bash-2',
              name: 'shell_command',
              input: {
                description: 'Build webview',
                command: 'npm run build --prefix webview',
              },
            },
            {
              type: 'tool_use',
              id: 'demo-task-1',
              name: 'task',
              input: {
                subagent_type: 'Code Review',
                description: 'Review animation constraints and identify regressions.',
                prompt: 'Inspect the motion layer and verify that blur is text-only.',
              },
            },
            {
              type: 'thinking',
              thinking: 'Subagent: validating that block-level blur is disabled for thinking containers.',
            },
            {
              type: 'tool_use',
              id: 'demo-sub-read-1',
              name: 'read',
              input: { file_path: 'webview/src/styles/less/components/message.less' },
            },
            {
              type: 'tool_use',
              id: 'demo-sub-search-1',
              name: 'grep',
              input: { pattern: 'streaming-block-entrance', path: 'webview/src' },
            },
            {
              type: 'tool_use',
              id: 'demo-task-2',
              name: 'task',
              input: {
                subagent_type: 'Visual QA',
                description: 'Check spacing, collapse affordances, and final polish.',
                prompt: 'Ensure readability and no left timeline lines in batch command block.',
              },
            },
            {
              type: 'tool_use',
              id: 'demo-sub-read-2',
              name: 'read',
              input: { file_path: 'webview/src/components/toolBlocks/BashToolGroupBlock.tsx' },
            },
          ],
          true,
          isoAt(2550)
        ));
      },
    },
    {
      at: 3050,
      label: 'All tool results return',
      apply: (snapshot, isoAt) => ({
        ...snapshot,
        rawMessages: [
          ...snapshot.rawMessages,
          {
            type: 'user',
            timestamp: isoAt(3050),
            raw: {
              content: [
                { type: 'tool_result', tool_use_id: 'demo-edit-1', content: 'Updated tools.less.' },
                { type: 'tool_result', tool_use_id: 'demo-edit-2', content: 'Updated ContentBlockRenderer.tsx.' },
                { type: 'tool_result', tool_use_id: 'demo-bash-1', content: 'Lint passed.', is_error: false },
                { type: 'tool_result', tool_use_id: 'demo-bash-2', content: 'Build passed.', is_error: false },
                { type: 'tool_result', tool_use_id: 'demo-sub-read-1', content: 'Read complete.' },
                { type: 'tool_result', tool_use_id: 'demo-sub-search-1', content: '2 matches found.' },
                { type: 'tool_result', tool_use_id: 'demo-sub-read-2', content: 'Read complete.' },
                { type: 'tool_result', tool_use_id: 'demo-task-1', content: 'Subagent review finished.' },
                { type: 'tool_result', tool_use_id: 'demo-task-2', content: 'Visual QA finished.' },
              ],
            },
          },
        ],
      }),
    },
    {
      at: 3550,
      label: 'Assistant final summary appears',
      apply: (snapshot, isoAt) => {
        const updated = appendTextToAgentMessage(
          snapshot,
          'Implementation complete.\n\n- Removed timeline guide lines from batch command rows.\n- Updated thinking entrance animation to text-only blur/brightness reveal.\n- Preserved subtle stagger for readability.',
          true,
          isoAt(3550)
        );
        return {
          ...updated,
          demoState: {
            ...updated.demoState,
            loading: false,
            streamingActive: true,
            isThinking: false,
            loadingElapsedSeconds: updated.demoState.loadingElapsedSeconds ?? null,
          },
        };
      },
    },
    {
      at: 3720,
      label: 'Streaming stops',
      apply: (snapshot) => {
        const idx = snapshot.agentMessageIndex;
        if (idx < 0 || idx >= snapshot.rawMessages.length) {
          return snapshot;
        }
        const nextMessages = [...snapshot.rawMessages];
        nextMessages[idx] = {
          ...nextMessages[idx],
          isStreaming: false,
        };
        return {
          ...snapshot,
          rawMessages: nextMessages,
          demoState: {
            ...snapshot.demoState,
            loading: false,
            streamingActive: false,
            isThinking: false,
            loadingElapsedSeconds: snapshot.demoState.loadingElapsedSeconds ?? null,
          },
        };
      },
    },
    {
      at: 4080,
      label: 'Artifacts and error example appended',
      apply: (snapshot, isoAt) => ({
        ...snapshot,
        rawMessages: [
          ...snapshot.rawMessages,
          {
            type: 'assistant',
            timestamp: isoAt(4080),
            raw: {
              content: [
                {
                  type: 'text',
                  text:
                    '### Preview Artifacts\n' +
                    '- Image block and attachment chip rendering\n' +
                    '- Markdown list, quote, and code style\n\n' +
                    '> Final polish pass ready for your feedback.\n\n' +
                    '```ts\nconst status = "ready for UI iteration";\n```',
                },
                {
                  type: 'image',
                  src: DEMO_IMAGE_DATA_URI,
                  mediaType: 'image/svg+xml',
                  alt: 'Demo preview artifact',
                },
                {
                  type: 'attachment',
                  fileName: 'ui-pass-notes.md',
                  mediaType: 'text/markdown',
                },
              ],
            },
          },
          {
            type: 'error',
            content: 'Example error block: a follow-up network request was intentionally simulated as failed.',
            timestamp: isoAt(4200),
          },
        ],
      }),
    },
  ];
}

function buildTimeline(baseTimeMs: number): { events: DemoEvent[]; snapshots: DemoSnapshot[] } {
  const isoAt = (offset: number) => new Date(baseTimeMs + offset).toISOString();
  const events = buildDemoEvents();
  const snapshots: DemoSnapshot[] = [makeInitialSnapshot()];

  for (const event of events) {
    const nextSnapshot = event.apply(snapshots[snapshots.length - 1], isoAt, baseTimeMs);
    snapshots.push(nextSnapshot);
  }

  return { events, snapshots };
}

export default function ChatStreamPseudoDemo(): React.ReactElement {
  const { t } = useTranslation();
  const [rawMessages, setRawMessages] = useState<ClaudeMessage[]>([]);
  const [demoState, setDemoState] = useState<DemoState>({
    loading: false,
    streamingActive: false,
    isThinking: false,
    loadingStartTime: null,
  });
  const [compactCompletedResponses, setCompactCompletedResponses] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.75);
  const [isPlaying, setIsPlaying] = useState(true);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => buildTimeline(Date.now()), [timelineVersion]);
  const { events, snapshots } = timeline;
  const maxStep = events.length;

  useEffect(() => {
    const snapshot = snapshots[currentStep] ?? snapshots[0];
    setRawMessages(snapshot.rawMessages);
    if (
      snapshot.demoState.loadingElapsedSeconds !== null &&
      snapshot.demoState.loadingElapsedSeconds !== undefined
    ) {
      setDemoState({
        ...snapshot.demoState,
        loadingStartTime: Date.now() - snapshot.demoState.loadingElapsedSeconds * 1000,
      });
    } else {
      setDemoState(snapshot.demoState);
    }
  }, [snapshots, currentStep]);

  const messages = useMemo(
    () => rawMessages.filter((message) => !isToolResultCarrierUserMessage(message)),
    [rawMessages]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, demoState.loading]);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentStep >= maxStep) {
      setIsPlaying(false);
      return;
    }

    const eventIndex = currentStep;
    const previousAt = eventIndex === 0 ? 0 : events[eventIndex - 1].at;
    const nextAt = events[eventIndex].at;
    const baseDelay = Math.max(40, nextAt - previousAt);
    const adjustedDelay = Math.max(40, Math.round(baseDelay / playbackSpeed));

    const id = window.setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, maxStep));
    }, adjustedDelay);

    return () => window.clearTimeout(id);
  }, [isPlaying, currentStep, maxStep, events, playbackSpeed]);

  const localizeIdentity = useCallback((text: string) => text, []);

  const getMessageText = useCallback((message: ClaudeMessage) => {
    return getMessageTextUtil(message, localizeIdentity, t);
  }, [localizeIdentity, t]);

  const getContentBlocks = useCallback((message: ClaudeMessage): ClaudeContentBlock[] => {
    const normalized = normalizeBlocksUtil(message.raw, localizeIdentity, t);
    if (normalized && normalized.length > 0) {
      return normalized;
    }
    if (message.content) {
      return [{ type: 'text', text: message.content }];
    }
    return [];
  }, [localizeIdentity, t]);

  const findToolResult = useCallback((toolId: string | undefined, messageIndex: number) => {
    if (!toolId) return null;

    const findInRawContent = (raw: ClaudeMessage['raw']): ToolResultBlock | null => {
      if (!raw || typeof raw === 'string') return null;
      const content = raw.content ?? raw.message?.content;
      if (!Array.isArray(content)) return null;

      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'tool_result' &&
          String((block as Record<string, unknown>).tool_use_id ?? '') === toolId
        ) {
          return block as ToolResultBlock;
        }
      }
      return null;
    };

    for (let i = messageIndex + 1; i < rawMessages.length; i += 1) {
      const found = findInRawContent(rawMessages[i].raw);
      if (found) return found;
    }
    return null;
  }, [rawMessages]);

  const replay = useCallback(() => {
    setTimelineVersion((prev) => prev + 1);
    setCurrentStep(0);
    setIsPlaying(true);
  }, []);

  const activeEventLabel = currentStep === 0
    ? 'Initial state'
    : events[Math.min(currentStep - 1, events.length - 1)]?.label ?? 'Initial state';

  const progressPercent = maxStep > 0 ? (currentStep / maxStep) * 100 : 0;

  const containerStyle = useMemo(
    () =>
      ({
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }) as const,
    []
  );

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Chat Stream Pseudo Demo</div>
          <button
            type="button"
            onClick={replay}
            style={{
              border: '1px solid var(--border-primary)',
              background: 'var(--button-bg)',
              color: 'var(--text-primary)',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            style={{
              border: '1px solid var(--border-primary)',
              background: 'var(--button-bg)',
              color: 'var(--text-primary)',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            Speed
            <select
              value={String(playbackSpeed)}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              style={{
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 12,
              }}
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={compactCompletedResponses}
              onChange={(e) => setCompactCompletedResponses(e.target.checked)}
            />
            Compact Completed Responses
          </label>

          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
            Open with <code>?demo=chat-stream</code>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="range"
            min={0}
            max={maxStep}
            step={1}
            value={currentStep}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentStep(Number(e.target.value));
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>
              Step {currentStep}/{maxStep} ({Math.round(progressPercent)}%)
            </span>
            <span style={{ marginLeft: 10 }}>Event: {activeEventLabel}</span>
          </div>
        </div>
      </div>

      <div className="messages-container" style={{ flex: 1 }}>
        <MessageList
          messages={messages}
          streamingActive={demoState.streamingActive}
          isThinking={demoState.isThinking}
          compactCompletedResponses={compactCompletedResponses}
          loading={demoState.loading}
          loadingStartTime={demoState.loadingStartTime}
          t={t}
          getMessageText={getMessageText}
          getContentBlocks={getContentBlocks}
          findToolResult={findToolResult}
          extractMarkdownContent={extractMarkdownContent}
          messagesEndRef={messagesEndRef}
        />
      </div>
    </div>
  );
}
