import React, { useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getFileIcon } from '../../utils/fileIcons';
import { TokenIndicator } from './TokenIndicator';
import type { SelectedAgent } from './types';

interface ContextBarProps {
  activeFile?: string;
  selectedLines?: string;
  percentage?: number;
  usedTokens?: number;
  maxTokens?: number;
  last5hTokens?: number;
  weekTokens?: number;
  last5hPercent?: number;
  weekPercent?: number;
  last5hResetsAt?: string;
  showUsage?: boolean;
  onClearFile?: () => void;
  onAddAttachment?: (files: FileList) => void;
  selectedAgent?: SelectedAgent | null;
  onClearAgent?: () => void;
  /** Current provider (for conditional rendering) */
  currentProvider?: string;
  /** Whether there are messages (for rewind button visibility) */
  hasMessages?: boolean;
  /** Rewind callback */
  onRewind?: () => void;
}

export const ContextBar: React.FC<ContextBarProps> = memo(({
  activeFile,
  selectedLines,
  percentage = 0,
  usedTokens,
  maxTokens,
  last5hTokens,
  weekTokens,
  last5hPercent,
  weekPercent,
  last5hResetsAt,
  showUsage = true,
  onClearFile,
  onAddAttachment,
  selectedAgent,
  onClearAgent,
  currentProvider = 'claude',
  hasMessages = false,
  onRewind,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddAttachment?.(e.target.files);
    }
    e.target.value = '';
  }, [onAddAttachment]);

  // Extract filename from path
  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  const getFileIconSvg = (path: string) => {
    const fileName = getFileName(path);
    const extension = fileName.indexOf('.') !== -1 ? fileName.split('.').pop() : '';
    return getFileIcon(extension, fileName);
  };

  const displayText = activeFile ? (
    selectedLines ? `${getFileName(activeFile)}#${selectedLines}` : getFileName(activeFile)
  ) : '';

  const fullDisplayText = activeFile ? (
    selectedLines ? `${activeFile}#${selectedLines}` : activeFile
  ) : '';
  const hasRightTools = currentProvider === 'claude' && Boolean(onRewind);
  const hasContentAfterWindowUsage = Boolean(selectedAgent) || Boolean(displayText) || hasRightTools;

  const formatCompactTokens = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '--';
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return `${Math.round(value)}`;
  };

  const formatWindowUsagePercent = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '--%';
    }

    const percentage = Math.max(0, Math.min(100, value));
    return percentage >= 10 ? `${Math.round(percentage)}%` : `${percentage.toFixed(1)}%`;
  };

  const formatResetTime = (isoString?: string): string | undefined => {
    if (!isoString) return undefined;
    try {
      const resetDate = new Date(isoString);
      if (Number.isNaN(resetDate.getTime())) return undefined;
      return resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return undefined;
    }
  };

  return (
    <div className="context-bar">
      {/* Tool Icons Group */}
      <div className="context-tools">
        <div
          className="context-tool-btn"
          onClick={handleAttachClick}
          title="Add attachment"
        >
          <span className="codicon codicon-attach" />
        </div>

        {/* Token Indicator */}
        {showUsage && (
          <div className="context-token-indicator">
            <TokenIndicator
              percentage={percentage}
              usedTokens={usedTokens}
              maxTokens={maxTokens}
              size={14}
            />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden-file-input"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div className="context-tool-divider" />
      </div>

      {showUsage && (() => {
        const resetTime = formatResetTime(last5hResetsAt);
        const fiveHourTooltip = resetTime
          ? `5h: ${formatCompactTokens(last5hTokens)} tokens (${formatWindowUsagePercent(last5hPercent)}) | Resets at ${resetTime}`
          : `5h: ${formatCompactTokens(last5hTokens)} tokens (${formatWindowUsagePercent(last5hPercent)})`;
        return (
          <div className="context-window-usage">
            <span className="window-usage-item" title={fiveHourTooltip}>5h {formatWindowUsagePercent(last5hPercent)}</span>
            <span className="window-usage-item" title={`Week: ${formatCompactTokens(weekTokens)} tokens (${formatWindowUsagePercent(weekPercent)})`}>Week {formatWindowUsagePercent(weekPercent)}</span>
            {hasContentAfterWindowUsage && <div className="context-tool-divider" />}
          </div>
        );
      })()}

      {/* Selected Agent Chip */}
      {selectedAgent && (
        <div 
          className="context-item has-tooltip" 
          data-tooltip={selectedAgent.name}
          style={{ cursor: 'default' }}
        >
          <span 
            className="codicon codicon-robot" 
            style={{ marginRight: 4 }}
          />
          <span className="context-text">
            <span dir="ltr">
              {selectedAgent.name.length > 3 
                ? `${selectedAgent.name.slice(0, 3)}...` 
                : selectedAgent.name}
            </span>
          </span>
          <span 
            className="codicon codicon-close context-close" 
            onClick={onClearAgent}
            title="Remove agent"
          />
        </div>
      )}

      {/* Active Context Chip */}
      {displayText && (
        <div
          className="context-item has-tooltip"
          data-tooltip={fullDisplayText}
          style={{ cursor: 'default' }}
        >
          {activeFile && (
            <span
              className="context-file-icon"
              style={{
                marginRight: 4,
                display: 'inline-flex',
                alignItems: 'center',
                width: 16,
                height: 16
              }}
              dangerouslySetInnerHTML={{ __html: getFileIconSvg(activeFile) }}
            />
          )}
          <span className="context-text">
            <span dir="ltr">{displayText}</span>
          </span>
          <span
            className="codicon codicon-close context-close"
            onClick={onClearFile}
            title="Remove file context"
          />
        </div>
      )}

      {/* Right side tools */}
      <div className="context-tools-right">
        {/* Rewind button */}
        {currentProvider === 'claude' && onRewind && (
          <button
            className="context-tool-btn has-tooltip"
            onClick={onRewind}
            disabled={!hasMessages}
            data-tooltip={t('rewind.tooltip')}
          >
            <span className="codicon codicon-discard" />
          </button>
        )}
      </div>
    </div>
  );
});
