import styled, { createGlobalStyle } from 'styled-components'
import { OrgDashboard } from '@/components/OrgDashboard'

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

export function App() {
  return (
    <>
      <GlobalStyle />
      <Header>
        <Title>Staff Pulse</Title>
      </Header>
      <OrgDashboard />
    </>
  )
}
