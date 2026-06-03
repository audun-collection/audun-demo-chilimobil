import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Audun cool fjord palette — navy primary, soft-blue accent,
        // paper bg. Ramp tuned to the Audun website brand tokens.
        ink: {
          50: "#f0f5f9", // app background — cool paper
          100: "#e8eff5", // sidebar / hover wash
          150: "#f4f8fb", // card paper
          200: "#dbe4ee", // header / row separator
          300: "#c8d4e0", // standard border
          400: "#a4b4c4", // hover border
          500: "#5d7895", // muted foreground (Audun mute)
          600: "#3f5773", // secondary foreground
          700: "#2a405b",
          800: "#1f3047",
          900: "#1a2e44", // primary foreground (Audun ink)
        },
        accent: {
          // Brand-primary is the navy ink itself; lighter shades are
          // the soft-blue "fjord dot" used in the logo / accents.
          50: "#eaf1f8",
          100: "#d6e0eb",
          200: "#b8c8d8", // soft-blue (Audun accent dot)
          400: "#5d7895",
          500: "#1a2e44", // primary brand action colour
          600: "#152538",
          700: "#0e1d2c",
        },
        // Status / state pastels retuned for the cool palette.
        sage: {
          50: "#dfeee0",
          700: "#2f5b3a",
        },
        clay: {
          50: "#f8ded2",
          100: "#fbe6d5",
          700: "#8a2b1b",
        },
        amber: {
          50: "#fff1de",
          700: "#9a4612",
        },
      },
      fontFamily: {
        // getaudun.com type system, loaded via next/font (see layout.tsx).
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        serif: [
          "var(--font-eb-garamond)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "'SF Mono'",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Tighter base — reference runs at 13px; we settle at 13.5 for comfort.
        sm: ["0.84rem", { lineHeight: "1.5" }],
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "8px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
