/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
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
        editor: {
          bg: "#0a0c11",
          surface: "#101319",
          surfaceHover: "#1a1f2a",
          border: "#242a35",
          accent: "#7c5cff",
          accentSoft: "rgba(124, 92, 255, 0.14)",
          text: "#eef1f7",
          textMuted: "#98a2b3",
          playhead: "#ff5d73",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Segoe UI Variable", "system-ui", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        panel: "var(--qx-shadow)",
      },
      keyframes: {
        "qx-fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "qx-scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "qx-fade-in": "qx-fade-in 180ms cubic-bezier(0.2,0.8,0.2,1)",
        "qx-scale-in": "qx-scale-in 140ms cubic-bezier(0.2,0.8,0.2,1)",
      },
    },
  },
  plugins: [],
};
