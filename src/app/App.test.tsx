import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { theme } from './theme'

describe('App', () => {
  it('renders the Staff Pulse header', () => {
    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Staff Pulse' })).toBeInTheDocument()
  })
})
