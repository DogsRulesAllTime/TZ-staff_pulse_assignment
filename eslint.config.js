import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'pnpm-lock.yaml', 'coverage'] },

  // Base (non-type-checked) rules for every JS/TS file, incl. config files.
  tseslint.configs.recommended,

  // Type-checked rules for app and server sources (TS project awareness).
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}', 'server/**/*.{ts,tsx}'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),

  reactHooks.configs.flat['recommended-latest'],

  {
    ...reactRefresh.configs.vite,
    files: ['src/**/*.{ts,tsx}'],
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Паттерн styled-components: `interface DefaultTheme extends Theme {}`
      // в module augmentation — осмысленный пустой интерфейс с одним extends.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
