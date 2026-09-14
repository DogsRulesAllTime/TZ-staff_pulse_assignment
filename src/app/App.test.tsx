import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import { theme } from '@/app/theme'

function renderApp() {
  // retry: false — jsdom has no API server; the dashboard settles into its
  // error state quickly while the header assertion stays independent of data.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('App', () => {
  it('renders the Staff Pulse header and the dashboard state', async () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Staff Pulse' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
