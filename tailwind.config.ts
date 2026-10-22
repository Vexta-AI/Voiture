import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1e8',
          300: '#c2c8d3',
          400: '#8d96a7',
          500: '#646e82',
          600: '#4a5367',
          700: '#363d4e',
          800: '#1f2433',
          900: '#121621',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,22,33,0.04), 0 1px 3px rgba(18,22,33,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
