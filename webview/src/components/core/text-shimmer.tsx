import { useMemo, type CSSProperties, type ElementType, type JSX } from 'react';
import { motion } from 'motion/react';

export type TextShimmerProps<T extends ElementType = 'span'> = {
  children: string;
  as?: T;
  className?: string;
  duration?: number;
  spread?: number;
  repeat?: number | typeof Infinity;
};

const joinClassNames = (...classNames: Array<string | undefined>): string =>
  classNames.filter(Boolean).join(' ');

export function TextShimmer<T extends ElementType = 'span'>({
  children,
  as,
  className,
  duration = 2,
  spread = 2,
  repeat = Infinity,
}: TextShimmerProps<T>) {
  const Component = (as ?? 'span') as keyof JSX.IntrinsicElements;
  const MotionComponent = useMemo(() => motion.create(Component), [Component]);
  const dynamicSpread = Math.max(children.length * spread, 18);

  const style = {
    '--spread': `${dynamicSpread}px`,
    '--text-shimmer-base': 'var(--vscode-descriptionForeground, #858585)',
    '--text-shimmer-highlight': 'var(--vscode-foreground, #d4d4d4)',
    backgroundImage:
      'linear-gradient(90deg, transparent calc(50% - var(--spread)), var(--text-shimmer-highlight), transparent calc(50% + var(--spread))), linear-gradient(var(--text-shimmer-base), var(--text-shimmer-base))',
  } as CSSProperties;

  return (
    <MotionComponent
      className={joinClassNames('text-shimmer-core', className)}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{
        repeat,
        duration,
        ease: 'linear',
      }}
      style={style}
    >
      {children}
    </MotionComponent>
  );
}
