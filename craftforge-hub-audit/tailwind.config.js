/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e1e2e',
          alt: '#11111b',
        },
        border: '#313244',
        primary: {
          DEFAULT: '#89b4fa',
          hover: '#74a8f5',
        },
        secondary: {
          DEFAULT: '#a6e3a1',
          hover: '#8bd88a',
        },
        accent: {
          DEFAULT: '#f5c2e7',
          hover: '#eba0d4',
        },
        neutral: '#45475a',
        error: '#f38ba8',
        warning: '#fab387',
        text: {
          primary: '#cdd6f4',
          secondary: '#a6adc8',
          muted: '#6c7086',
        },
      },
      fontFamily: {
        heading: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        caption: '0.75rem',
        body: '0.875rem',
        subheading: '1rem',
        heading: '1.25rem',
        display: '1.5rem',
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
      },
      boxShadow: {
        card: '0 2px 4px rgba(0,0,0,0.4)',
        glow: '0 0 12px rgba(137,180,250,0.3)',
      },
      animation: {
        'status-pulse': 'pulse 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateY(-10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}