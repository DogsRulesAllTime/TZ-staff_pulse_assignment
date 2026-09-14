export const theme = {
  colors: {
    background: '#f4f5f7',
    surface: '#ffffff',
    text: '#1f2430',
    textMuted: '#6b7280',
    performance: {
      good: '#2e9e5b',
      mid: '#e0a800',
      bad: '#d64545',
    },
    status: {
      online: '#2e9e5b',
      connecting: '#e0a800',
      offline: '#d64545',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    round: '9999px',
  },
  motion: '(prefers-reduced-motion: reduce)',
} as const;

export type Theme = typeof theme;

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
