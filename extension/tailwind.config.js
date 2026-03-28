/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './*.html'],
  theme: {
    extend: {
      colors: {
        lens: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a5bffc',
          400: '#819ef8',
          500: '#6175f1',
          600: '#4c56e5',
          700: '#3d43ca',
          800: '#3438a4',
          900: '#2f3582',
          950: '#1c1f4d',
        },
        surface: {
          0:   '#0d0e14',
          1:   '#13141e',
          2:   '#1a1b28',
          3:   '#22243a',
          4:   '#2b2d48',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-in':   'slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in':    'fade-in 0.2s ease-out',
        'shimmer':    'shimmer 1.5s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
