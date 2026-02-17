import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';

type MotionState = Record<string, unknown>;

export interface TextEffectVariants {
  container: {
    hidden?: MotionState;
    visible?: MotionState & { transition?: Record<string, unknown> };
    exit?: MotionState & { transition?: Record<string, unknown> };
  };
  item: {
    hidden?: MotionState;
    visible?: MotionState & { transition?: Record<string, unknown> };
    exit?: MotionState & { transition?: Record<string, unknown> };
  };
}

export interface TextEffectProps {
  children: string;
  className?: string;
  per?: 'char' | 'line';
  trigger?: boolean | number | string;
  variants: TextEffectVariants;
  withExit?: boolean;
}

const joinClassNames = (...classNames: Array<string | undefined>): string =>
  classNames.filter(Boolean).join(' ');

export function TextEffect({
  children,
  className,
  per = 'char',
  trigger,
  variants,
  withExit = false,
}: TextEffectProps) {
  const units = useMemo(() => {
    if (per === 'char') {
      return Array.from(children);
    }
    const lines = children.split('\n');
    return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line));
  }, [children, per]);

  const content = (
    <motion.span
      key={String(trigger ?? 'default')}
      className={joinClassNames('text-effect-core', className)}
      variants={variants.container as any}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {units.map((unit, index) => (
        <motion.span
          key={`${index}-${unit}`}
          variants={variants.item as any}
          style={{
            display: per === 'line' ? 'block' : 'inline-block',
            whiteSpace: 'pre-wrap',
          }}
        >
          {unit === ' ' ? '\u00A0' : unit}
        </motion.span>
      ))}
    </motion.span>
  );

  if (withExit) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        {content}
      </AnimatePresence>
    );
  }

  return content;
}
