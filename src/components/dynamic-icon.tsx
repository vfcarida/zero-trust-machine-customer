'use client';

import React from 'react';
import * as Icons from 'lucide-react';

interface DynamicIconProps extends Icons.LucideProps {
  readonly name: string;
}

/**
 * Renders a Lucide icon dynamically by name.
 * Falls back to HelpCircle if the icon name is not found.
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as any)[name] as React.FC<Icons.LucideProps> | undefined;
  return IconComponent ? <IconComponent {...props} /> : <Icons.HelpCircle {...props} />;
};
