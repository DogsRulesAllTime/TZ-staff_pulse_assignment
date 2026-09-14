import styled from 'styled-components';
import type { TreeNode } from '@/domain/tree';
import { PerformanceDot } from '@/components/shared/PerformanceDot';

export interface OrgNodeRowProps {
  node: TreeNode;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Выделенный узел (например, кликом по строке таблицы); подсвечивается. */
  selectedId: string | null;
}

const Row = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $selected, theme }) => ($selected ? `${theme.colors.text}1f` : 'transparent')};
`;

const Chevron = styled.button<{ $open: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 0.15s ease;

  @media ${({ theme }) => theme.motion} {
    transition: none;
  }
`;

const ChevronSpacer = styled.span`
  flex-shrink: 0;
  width: 20px;
  height: 20px;
`;

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Headcount = styled.span`
  margin-left: auto;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.8125rem;
`;

const Children = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  /* Внутренняя часть grid-reveal (Task 9): min-height: 0 позволяет строке
     0fr сжаться до нуля, overflow: hidden — обрезать содержимое при анимации. */
  min-height: 0;
  overflow: hidden;
`;

/**
 * Reveal-обёртка анимации раскрытия (Task 9). Выбор подхода: grid-rows, а не
 * измерение высоты — проще и без JS: строка grid-template-rows 0fr → 1fr
 * плавно раскрывает содержимое, collapse идёт в обратную сторону.
 * Доступность: поддерево монтируется ПЕРСИСТЕНТНО (не условно), свёрнутое
 * содержимое помечается inert — фокусируемые элементы внутри выпадают из
 * tab-порядка и скрыты от вспомогательных технологий; состояние узла по-прежнему
 * передаёт aria-expanded на шевроне. prefers-reduced-motion — transition: none.
 */
const Reveal = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${({ $open }) => ($open ? '1fr' : '0fr')};
  transition: grid-template-rows 0.2s ease;

  @media ${({ theme }) => theme.motion} {
    transition: none;
  }
`;

export function OrgNodeRow({ node, expanded, onToggle, selectedId }: OrgNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={node.id === selectedId ? true : undefined}
    >
      <Row $selected={node.id === selectedId}>
        {hasChildren ? (
          <Chevron
            $open={isOpen}
            data-chevron
            aria-label={`${isOpen ? 'Свернуть' : 'Развернуть'} «${node.name}»`}
            onClick={() => onToggle(node.id)}
          >
            ▸
          </Chevron>
        ) : (
          <ChevronSpacer />
        )}
        <Name>{node.name}</Name>
        <Headcount>{node.headcount} чел.</Headcount>
        <PerformanceDot value={node.performance} />
      </Row>
      {hasChildren && (
        <Reveal $open={isOpen} data-reveal inert={!isOpen}>
          <Children role="group">
            {node.children.map((child) => (
              <OrgNodeRow
                key={child.id}
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                selectedId={selectedId}
              />
            ))}
          </Children>
        </Reveal>
      )}
    </li>
  );
}
