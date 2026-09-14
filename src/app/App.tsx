import styled, { createGlobalStyle } from 'styled-components'
import { OrgDashboard } from '@/components/OrgDashboard'
import { ConnectionBadge } from '@/components/shared/ConnectionBadge'
import { useSsePatches } from '@/features/useSsePatches'

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.background};
  }
`

const Header = styled.header`
  display: flex;
  align-items: center;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textMuted}22;
`

const Title = styled.h1`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
`

const Spacer = styled.div`
  flex: 1;
`

export function App() {
  // SSE-статус живёт на уровне App: подписка одна на приложение,
  // патчи применяются к кешу ORG_TREE_KEY внутри хука. lastPatch прокидывается
  // в OrgDashboard: инкрементальные агрегаты + fade-out ячеек (Task 8).
  const { status, lastPatch } = useSsePatches()

  return (
    <>
      <GlobalStyle />
      <Header>
        <Title>Staff Pulse</Title>
        <Spacer />
        <ConnectionBadge status={status} />
      </Header>
      <OrgDashboard lastPatch={lastPatch} />
    </>
  )
}
