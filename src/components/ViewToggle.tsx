import styled from 'styled-components';
import { useUiState, type DashboardView } from '@/features/ui-state';

const Group = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}55;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};

  /* На split-view (≥1280px) оба вида видны одновременно — переключатель не нужен. */
  @media (min-width: 1280px) {
    display: none;
  }
`;

const Button = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $active, theme }) => ($active ? theme.colors.text : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.surface : theme.colors.textMuted)};
  font: inherit;
  cursor: pointer;

  &:hover:not([aria-pressed='true']) {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export function ViewToggle() {
  const { view, setView } = useUiState();

  const options: { value: DashboardView; label: string }[] = [
    { value: 'tree', label: 'Дерево' },
    { value: 'table', label: 'Таблица' },
  ];

  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- role="group" на стилизованном div: fieldset тянет UA-стили (рамка/отступы), семантика группы и aria-label уже есть */}
      <Group role="group" aria-label="Переключение вида">
        {options.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            $active={view === value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </Button>
        ))}
      </Group>
    </>
  );
}
