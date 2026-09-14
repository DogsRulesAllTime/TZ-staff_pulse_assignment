import styled, { keyframes } from 'styled-components'

const pulse = keyframes`
  from { opacity: 1; }
  to { opacity: 0.4; }
`

const SkeletonStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
`

const SkeletonBar = styled.div<{ $width: string }>`
  height: 20px;
  width: ${({ $width }) => $width};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.textMuted}33;
  animation: ${pulse} 1.2s ease-in-out infinite alternate;

  @media ${({ theme }) => theme.motion} {
    animation: none;
  }
`

export function LoadingSkeleton() {
  return (
    <SkeletonStack aria-busy="true" aria-label="Загрузка данных">
      <SkeletonBar $width="40%" />
      <SkeletonBar $width="60%" />
      <SkeletonBar $width="55%" />
      <SkeletonBar $width="70%" />
      <SkeletonBar $width="50%" />
    </SkeletonStack>
  )
}

const StateWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textMuted};
`

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}55;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.textMuted};
  }
`

export interface ErrorStateProps {
  onRetry: () => void
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <StateWrapper role="alert">
      <span>Не удалось загрузить данные организации</span>
      <RetryButton onClick={onRetry}>Повторить</RetryButton>
    </StateWrapper>
  )
}

export function EmptyState() {
  return (
    <StateWrapper>
      <span>Нет данных</span>
    </StateWrapper>
  )
}
