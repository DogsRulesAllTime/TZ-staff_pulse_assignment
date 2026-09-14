import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { describeStructuredFilter, parseNaturalQuery } from '@/domain/search';
import { useUiState } from '@/features/ui-state';

/**
 * Единая строка поиска (Task 12): естественный язык → `parseNaturalQuery`;
 * не распознано → прежний обычный текстовый поиск (`nameFilter`, старый
 * инпут MetricsTable переехал сюда).
 *
 * Композиция фильтров: распознанный запрос уходит в `structuredFilter`, а
 * `nameFilter` нейтрализуется ('') — иначе сырой текст запроса («команды с
 * бюджетом больше 1 млн») через matchesFilter вырезал бы все строки. Не
 * распознано → `structuredFilter: null`, текст целиком в `nameFilter`.
 * Парсинг и структурированный фильтр применяются сразу (мгновенная подпись
 * «распознано: …» и отклик строк); дебаунс 250 мс остаётся на текстовом
 * пути — в OrgDashboard (`useDebouncedValue(nameFilter)`).
 *
 * Текст ввода живёт в локальном состоянии (при распознанном запросе
 * `nameFilter` намеренно пуст, но поле должно продолжать показывать текст).
 */
export function AiSearchBar() {
  const { setNameFilter, setStructuredFilter } = useUiState();
  const [text, setText] = useState('');

  const parsed = useMemo(() => (text.trim() === '' ? null : parseNaturalQuery(text)), [text]);

  const handleChange = (value: string) => {
    setText(value);
    const nextParsed = value.trim() === '' ? null : parseNaturalQuery(value);
    setStructuredFilter(nextParsed);
    setNameFilter(nextParsed ? '' : value);
  };

  const hint =
    text.trim() === ''
      ? null
      : parsed
        ? `распознано: ${describeStructuredFilter(parsed)}`
        : 'обычный поиск';

  return (
    <Wrapper>
      <Input
        type="search"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Опишите, что ищете: „команды с бюджетом больше 1 млн“"
        aria-label="Фильтр по названию"
      />
      {/* <output> — семантическая live-область (неявный role="status"): подпись
          обновляется, пока пользователь печатает. */}
      {hint && <Hint>{hint}</Hint>}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Input = styled.input`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}55;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.text};
    outline-offset: 1px;
  }
`;

const Hint = styled.output`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.8125rem;
`;
