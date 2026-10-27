import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'dist',
			'coverage',
			'storybook-static',
			'storybook-static-test',
			'playwright-report',
			'test-results',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked.map((config) => ({
		...config,
		files: ['**/*.{ts,tsx}'],
	})),
	...tseslint.configs.stylisticTypeChecked.map((config) => ({
		...config,
		files: ['**/*.{ts,tsx}'],
	})),
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...reactHooks.configs.flat.recommended.rules,
			'react-hooks/exhaustive-deps': 'error',
			'no-nested-ternary': 'error',
			'max-params': ['error', 3],
			'no-console': ['error', { allow: ['warn', 'error'] }],
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/no-deprecated': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
			'@typescript-eslint/no-confusing-void-expression': [
				'error',
				{ ignoreArrowShorthand: true, ignoreVoidOperator: false },
			],
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
		},
	},
	{ files: ['**/*.d.ts'], rules: { '@typescript-eslint/consistent-type-definitions': 'off' } },
	{
		files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
		rules: {
			'@typescript-eslint/no-deprecated': 'error',
		},
	},
)
