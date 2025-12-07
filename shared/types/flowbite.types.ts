/**
 * Custom Flowbite type definitions
 * Extend Flowbite React types as needed
 */

export interface FlowbiteThemeConfig {
  mode?: 'light' | 'dark' | 'auto';
}

export interface CustomFlowbiteTheme {
  button?: {
    color?: Record<string, string>;
    size?: Record<string, string>;
  };
  card?: {
    root?: {
      base?: string;
    };
  };
}

// Re-export common Flowbite types for convenience
// Note: These will be available after frontend dependencies are installed
export type { ButtonProps } from 'flowbite-react';
export type { CardProps } from 'flowbite-react';
// export type { NavbarProps } from 'flowbite-react'; // Temporarily disabled
export type { SidebarProps } from 'flowbite-react';
