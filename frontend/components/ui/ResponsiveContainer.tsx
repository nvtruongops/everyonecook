import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
}

const widths: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-[1200px]',
};

export default function ResponsiveContainer({
  children,
  className = '',
  maxWidth = '7xl',
}: Props): React.ReactElement {
  return (
    <div
      className={`${widths[maxWidth]} mx-auto px-4 sm:px-6 w-full max-w-full overflow-x-hidden ${className}`}
    >
      {children}
    </div>
  );
}
