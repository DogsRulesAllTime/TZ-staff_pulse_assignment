import styled, { useTheme } from 'styled-components';
import type { DefaultTheme } from 'styled-components';

/** Цветовой индикатор эффективности: ≥ 80 зелёный, 50–79 жёлтый, < 50 красный. */
function performanceColor(value: number, theme: DefaultTheme): string {
  if (value >= 80) return theme.colors.performance.good;
  if (value >= 50) return theme.colors.performance.mid;
  return theme.colors.performance.bad;
}

const Dot = styled.span<{ $color: string }>`
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.radii.round};
  background: ${({ $color }) => $color};
`;

export interface PerformanceDotProps {
  value: number;
}

export function PerformanceDot({ value }: PerformanceDotProps) {
  const theme = useTheme();
  return (
    <Dot
      $color={performanceColor(value, theme)}
      data-dot
      title={`Эффективность: ${value}`}
      aria-label={`Эффективность: ${value}`}
    />
  );
}
