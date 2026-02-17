import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextShimmer } from '@/components/core/text-shimmer';
import type { SubagentInfo } from '../../types';
import { subagentStatusIconMap } from './types';

interface SubagentListProps {
  subagents: SubagentInfo[];
}

const SubagentList = memo(({ subagents }: SubagentListProps) => {
  const { t } = useTranslation();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const sortedSubagents = useMemo(
    () => [...subagents].sort((a, b) => a.messageIndex - b.messageIndex),
    [subagents]
  );

  useEffect(() => {
    setExpandedCards((prev) => {
      const next: Record<string, boolean> = {};
      sortedSubagents.forEach((subagent) => {
        const key = subagent.id;
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          next[key] = prev[key];
          return;
        }
        next[key] = false;
      });
      return next;
    });
  }, [sortedSubagents]);

  useEffect(() => {
    const hasRunning = subagents.some((subagent) => subagent.status === 'running');
    if (!hasRunning) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [subagents]);

  const formatRuntime = (subagent: SubagentInfo): string => {
    if (!subagent.startedAtMs) {
      return '--';
    }
    const endMs = subagent.finishedAtMs ?? nowMs;
    const elapsedSeconds = Math.max(0, Math.floor((endMs - subagent.startedAtMs) / 1000));
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds}${t('common.seconds')}`;
    }
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return t('chat.minutesAndSeconds', { minutes, seconds });
  };

  if (subagents.length === 0) {
    return <div className="status-panel-empty">{t('statusPanel.noSubagents')}</div>;
  }

  return (
    <div className="subagent-list">
      {sortedSubagents.map((subagent, index) => {
        const statusIcon = subagentStatusIconMap[subagent.status] ?? 'codicon-circle-outline';
        const statusClass = `status-${subagent.status}`;
        const isExpanded = expandedCards[subagent.id] ?? false;
        const statusLabel =
          subagent.status === 'running'
            ? t('statusPanel.subagentStatusRunning')
            : subagent.status === 'completed'
              ? t('statusPanel.subagentStatusCompleted')
              : t('statusPanel.subagentStatusError');
        // Show the most recent action; for running subagents default to "Thinking..."
        const displayAction = subagent.currentAction
          ? subagent.currentAction
          : subagent.status === 'running'
            ? t('statusPanel.subagentThinking')
            : subagent.description || t('statusPanel.subagentNoDescription');
        const runtimeText = formatRuntime(subagent);

        const toggleCard = () => {
          setExpandedCards((prev) => ({
            ...prev,
            [subagent.id]: !isExpanded,
          }));
        };

        return (
          <div key={subagent.id ?? index} className={`subagent-card ${statusClass}`}>
            <button type="button" className="subagent-card-header" onClick={toggleCard}>
              <span className={`subagent-status-icon ${statusClass}`}>
                <span className={`codicon ${statusIcon}`} />
              </span>

              <span className="subagent-card-main">
                <span className="subagent-card-title">{subagent.type || t('statusPanel.subagentTab')}</span>
                {subagent.status === 'running' ? (
                  <TextShimmer className="subagent-action-shimmer" duration={1.4}>
                    {displayAction}
                  </TextShimmer>
                ) : (
                  <span className="subagent-card-subtitle" title={displayAction}>
                    {displayAction}
                  </span>
                )}
              </span>

              <span className="subagent-status-meta">
                <span className="subagent-runtime" title={t('statusPanel.subagentRuntimeLabel', 'Runtime')}>
                  {runtimeText}
                </span>
                <span className={`subagent-status-pill ${statusClass}`}>
                  {statusLabel}
                </span>
              </span>

              <span className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'} subagent-chevron`} />
            </button>

            {isExpanded && (
              <div className="subagent-card-body">
                {subagent.description && (
                  <div className="subagent-detail-row">
                    <span className="subagent-detail-label">{t('statusPanel.subagentDescriptionLabel')}</span>
                    <span className="subagent-detail-value">{subagent.description}</span>
                  </div>
                )}
                {subagent.currentAction && (
                  <div className="subagent-detail-row">
                    <span className="subagent-detail-label">{t('statusPanel.subagentLastActionLabel')}</span>
                    <span className="subagent-detail-value">{subagent.currentAction}</span>
                  </div>
                )}
                {subagent.prompt && (
                  <div className="subagent-detail-row">
                    <span className="subagent-detail-label">{t('statusPanel.subagentPromptLabel')}</span>
                    <span className="subagent-detail-value">{subagent.prompt}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

SubagentList.displayName = 'SubagentList';

export default SubagentList;
