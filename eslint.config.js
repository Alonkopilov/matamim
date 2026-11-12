// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEBREW = '/[\\u0590-\\u05FF]/';
const HEBREW_MESSAGE =
  'Hebrew text belongs in i18n/locales, show it with t() so it can be translated.';

// Text components the components/ui/Text wrappers don't cover
const UNWRAPPED_TEXT = '/^(\\$Text|\\$TextInput|BottomSheetTextInput)$/';
const NO_FONT_CAP = ':not(:has(JSXAttribute[name.name="maxFontSizeMultiplier"]))';
const FONT_CAP_MESSAGE =
  'Pass maxFontSizeMultiplier={MAX_FONT_SCALE} from components/ui/Text, a large phone font size breaks the layout without it.';

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
        {
          selector: `JSXOpeningElement[name.name=${UNWRAPPED_TEXT}]${NO_FONT_CAP}`,
          message: FONT_CAP_MESSAGE,
        },
        {
          // Animated.Text and the like
          selector: `JSXOpeningElement[name.property.name=/^(Text|TextInput)$/]${NO_FONT_CAP}`,
          message: FONT_CAP_MESSAGE,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              message:
                'Import them from @/components/ui/Text, it caps how far the phone font size grows the text.',
            },
          ],
        },
      ],
    },
  },
]);
