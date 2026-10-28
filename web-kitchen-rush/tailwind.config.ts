import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Phones held sideways: little height, so menus move to the sides (see ManagementGame).
      screens: { short: { raw: '(orientation: landscape) and (max-height: 520px)' } },
      fontFamily: { display: ['"Baloo 2"', 'Trebuchet MS', 'sans-serif'], body: ['Quicksand', 'Segoe UI', 'sans-serif'] },
      colors: {
        // Bioluminescent night: paper = panel surface, ink = text, teal = glow accent, tomato = main action.
        paper: '#120F2E', ink: '#E9E6FF', teal: '#4DF0FF', violet: '#A57BFF', tomato: '#FF6FB5', danger: '#FF5468', gold: '#FFE27A', abyss: '#0B0A24',
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        'cash-pulse': {
          '0%, 100%': { transform: 'translateY(0) rotate(0) scale(1)' },
          '40%': { transform: 'translateY(-3px) rotate(-8deg) scale(1.16)' },
          '70%': { transform: 'translateY(1px) rotate(3deg) scale(.98)' },
        },
        'cash-arrive': {
          from: { opacity: '0', marginTop: '18px' },
          to: { opacity: '1', marginTop: '12px' },
        },
        'guest-payment': {
          '0%': { opacity: '0', transform: 'translateY(5px) scale(.8)' },
          '12%': { opacity: '1', transform: 'translateY(-2px) scale(1.06)' },
          '22%': { opacity: '1', transform: 'translateY(-2px) scale(1)' },
          '76%': { opacity: '1', transform: 'translateY(-9px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-16px) scale(.98)' },
        },
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        'cash-pulse': 'cash-pulse .5s ease-out both',
        'cash-arrive': 'cash-arrive .22s ease-out both',
        'guest-payment': 'guest-payment 2.4s linear both',
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
