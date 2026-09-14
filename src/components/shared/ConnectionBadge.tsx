import styled from 'styled-components'
import type { SseStatus } from '@/features/useSsePatches'

const LABELS: Record<SseStatus, string> = {
  online: 'Онлайн',
  connecting: 'Подключение…',
  offline: 'Оффлайн',
}

const Badge = styled.span<{ $status: SseStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.round};
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${({ theme, $status }) => theme.colors.status[$status]};
  border: 1px solid
    ${({ theme, $status }) => `${theme.colors.status[$status]}55`};
  background: ${({ theme, $status }) => `${theme.colors.status[$status]}14`};

  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: ${({ theme }) => theme.radii.round};
    background: ${({ theme, $status }) => theme.colors.status[$status]};
  }
`

/**
 * Индикатор состояния SSE-соединения в шапке. Презентационный: статус
 * приходит снаружи, цвета — из theme.colors.status.
 */
export function ConnectionBadge({ status }: { status: SseStatus }) {
  return <Badge $status={status} data-testid="connection-badge">{LABELS[status]}</Badge>
}
