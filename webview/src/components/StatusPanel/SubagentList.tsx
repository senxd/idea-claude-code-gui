import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubagentInfo } from '../../types';
import { subagentStatusIconMap } from './types';

interface SubagentListProps {
  subagents: SubagentInfo[];
}

const SubagentList = memo(({ subagents }: SubagentListProps) => {
  const { t } = useTranslation();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

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
        next[key] = subagent.status === 'running';
      });
      return next;
    });
  }, [sortedSubagents]);

  if (subagents.length === 0) {
    return <div className="status-panel-empty">{t('statusPanel.noSubagents')}</div>;
  }

  return (
    <div className="subagent-list">
      {sortedSubagents.map((subagent, index) => {
        const statusIcon = subagentStatusIconMap[subagent.status] ?? 'codicon-circle-outline';
        const statusClass = `status-${subagent.status}`;
        const isExpanded = expandedCards[subagent.id] ?? subagent.status === 'running';
        const statusLabel =
          subagent.status === 'running'
            ? t('statusPanel.subagentStatusRunning')
            : subagent.status === 'completed'
              ? t('statusPanel.subagentStatusCompleted')
              : t('statusPanel.subagentStatusError');
        const title = subagent.description || subagent.prompt || t('statusPanel.subagentNoDescription');

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
                <span className="subagent-card-subtitle" title={title}>
                  {title}
                </span>
              </span>

              <span className={`subagent-status-pill ${statusClass}`}>
                {statusLabel}
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
