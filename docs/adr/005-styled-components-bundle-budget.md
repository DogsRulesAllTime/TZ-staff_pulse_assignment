# ADR-005: styled-components и бюджет бандла

**Статус:** принято

**Контекст.** styled-components — «будет плюсом» в задании; одновременно Bonus-этап
требует production-бандл ≤200 КБ gzip и запрещает UI-библиотеки.

**Решение.** styled-components v6 с дизайн-токенами в `app/theme.ts` (цвета performance,
типографика, отступы). Никакого inline-CSS. Бюджет бандла проверяется скриптом
`pnpm check:size` (gzip-размер `dist/assets/*.js` ≤ 200_000 байт), вызывается в `pnpm build`.

**Альтернативы.**
- *CSS-модули* — дешевле по бандлу, но плюс задания не берём.
- *Tailwind* — конфликтует с выбором styled-components как «плюса». Отклонено.

**Последствия.** styled-components v6 + React + TanStack Query + zod ≈ 150–180 КБ gzip —
укладываемся, но каждая новая зависимость проходит через `check:size`. `prefers-reduced-motion`
реализуется общим хелпером токена `motion` в теме.
