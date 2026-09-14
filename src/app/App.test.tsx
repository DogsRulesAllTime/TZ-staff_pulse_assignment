import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { theme } from '@/app/theme';

// jsdom не имеет EventSource, а тестовое окружение не поднимает API-сервер:
// подставляем минимальный фейк, чтобы App мог смонтировать SSE-подписку.
class FakeEventSource {
  close() {}
  addEventListener() {}
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  // retry: false — jsdom has no API server; the dashboard settles into its
  // error state quickly while the header assertion stays independent of data.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders the Staff Pulse header and the dashboard state', async () => {
    renderApp();

    expect(screen.getByRole('heading', { name: 'Staff Pulse' })).toBeInTheDocument();
    // SSE-бейдж в шапке: изначально соединение устанавливается.
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Подключение…');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
