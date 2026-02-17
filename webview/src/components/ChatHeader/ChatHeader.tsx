import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';

import { BackIcon } from '../Icons';

export interface ChatHeaderProps {
  currentView: 'chat' | 'history' | 'settings';
  sessionTitle: string;
  t: TFunction;
  onBack: () => void;
  onNewSession: (skipConfirm: boolean) => void;
  onNewTab: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onRenameSession: (newTitle: string) => void;
}

export function ChatHeader({
  currentView,
  sessionTitle,
  t,
  onBack,
  onNewSession,
  onNewTab,
  onHistory,
  onSettings,
  onRenameSession,
}: ChatHeaderProps): React.ReactElement | null {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(sessionTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingTitle) {
      setEditingTitle(sessionTitle);
    }
  }, [sessionTitle, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const commitTitleEdit = () => {
    const nextTitle = editingTitle.replace(/\s+/g, ' ').trim();
    setIsEditingTitle(false);
    if (!nextTitle || nextTitle === sessionTitle) {
      return;
    }
    onRenameSession(nextTitle);
  };

  if (currentView === 'settings') {
    return null;
  }

  return (
    <div className="header">
      <div className="header-left">
        {currentView === 'history' ? (
          <button className="back-button" onClick={onBack} data-tooltip={t('common.back')}>
            <BackIcon /> {t('common.back')}
          </button>
        ) : (
          isEditingTitle ? (
            <input
              ref={titleInputRef}
              className="session-title-input"
              type="text"
              value={editingTitle}
              maxLength={50}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitleEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingTitle(sessionTitle);
                  setIsEditingTitle(false);
                }
              }}
              aria-label={t('history.editTitle')}
            />
          ) : (
            <div
              className="session-title"
              title={sessionTitle}
              onDoubleClick={() => setIsEditingTitle(true)}
            >
              {sessionTitle}
            </div>
          )
        )}
      </div>
      <div className="header-right">
        {currentView === 'chat' && (
          <>
            <button
              className="icon-button"
              onClick={(e) => onNewSession(Boolean(e.metaKey || e.ctrlKey))}
              data-tooltip={t('common.newSession')}
            >
              <span className="codicon codicon-plus" />
            </button>
            <button
              className="icon-button"
              onClick={onNewTab}
              data-tooltip={t('common.newTab')}
            >
              <span className="codicon codicon-split-horizontal" />
            </button>
            <button
              className="icon-button"
              onClick={onHistory}
              data-tooltip={t('common.history')}
            >
              <span className="codicon codicon-history" />
            </button>
            <button
              className="icon-button"
              onClick={onSettings}
              data-tooltip={t('common.settings')}
            >
              <span className="codicon codicon-settings-gear" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
