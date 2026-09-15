import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b1bacb',
          400: '#8794ad',
          500: '#687693',
          600: '#535e79',
          700: '#444d62',
          800: '#3b4253',
          900: '#343947',
          950: '#23262f',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          200: '#bcdeff',
          300: '#8ec9ff',
          400: '#59aaff',
          500: '#3388fb',
          600: '#1c69f0',
          700: '#1553dd',
          800: '#1845b3',
          900: '#1a3d8d',
          950: '#142756',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
