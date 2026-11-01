// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEBREW = '/[\\u0590-\\u05FF]/';
const HEBREW_MESSAGE =
  'Hebrew text belongs in i18n/locales, show it with t() so it can be translated.';

module.exports = defineConfig([
  expoConfig,
  {
    // Edge functions run on Deno, which resolves npm: and jsr: imports itself
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    files: ['app/**', 'components/**', 'stores/**', 'utils/**', 'schemas/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${HEBREW}]`, message: HEBREW_MESSAGE },
        { selector: `TemplateElement[value.raw=${HEBREW}]`, message: HEBREW_MESSAGE },
        { selector: `JSXText[value=${HEBREW}]`, message: HEBREW_MESSAGE },
      ],
    },
  },
]);
