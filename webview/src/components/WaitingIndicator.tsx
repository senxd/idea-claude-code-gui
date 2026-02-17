import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextShimmer } from '@/components/core/text-shimmer';

interface WaitingIndicatorProps {
  startTime?: number;
  /** When true the label switches from "Thinking" to "Connecting". */
  isConnecting?: boolean;
}

export const WaitingIndicator = ({ startTime, isConnecting }: WaitingIndicatorProps) => {
  const { t } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (startTime) {
      return Math.floor((Date.now() - startTime) / 1000);
    }
    return 0;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (startTime) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      } else {
        setElapsedSeconds(prev => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} ${t('common.seconds')}`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return t('chat.minutesAndSeconds', { minutes, seconds: remainingSeconds });
  };

  const label = isConnecting
    ? t('chat.connecting', 'Connecting')
    : t('chat.thinking', 'Thinking');

  return (
    <div className="waiting-indicator">
      <span className="waiting-text">
        <TextShimmer className="waiting-text-shimmer" duration={1} repeat={0}>
          {`${label} (${t('chat.elapsedTime', { time: formatElapsedTime(elapsedSeconds) })})`}
        </TextShimmer>
      </span>
    </div>
  );
};

export default WaitingIndicator;
