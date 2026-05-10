import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./app/**/*.{ts,tsx,mdx}", "./components/**/*.{ts,tsx}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                bg: "#07080C",
                surface: "#11131B",
                "surface-2": "#161924",
                "surface-3": "#1B1F2C",
                border: "#1F2330",
                "border-strong": "#2A2F40",
                ink: { DEFAULT: "#ECEEF4", 2: "#A0A8BD", 3: "#5C6478", 4: "#3F4658" },
                accent: "#FFB86B",
                file: "#7C9EFF",
                green: "#6EE7B7",
                red: "#FF7A8A",
                purple: "#C49BFF",
                cyan: "#66E0FF",
                yellow: "#F9E27D",
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "ui-monospace", "monospace"],
                display: ["Inter", "system-ui", "sans-serif"],
            },
            animation: {
                "fade-up": "fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
                shimmer: "shimmer 2.4s linear infinite",
                pulse2: "pulse2 1.8s ease-out infinite",
                "spin-slow": "spin 18s linear infinite",
                "marquee": "marquee 40s linear infinite",
                "marquee-reverse": "marquee 40s linear infinite reverse",
            },
            keyframes: {
                fadeUp: {
                    "0%": { opacity: "0", transform: "translateY(12px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-1000px 0" },
                    "100%": { backgroundPosition: "1000px 0" },
                },
                pulse2: {
                    "0%, 100%": { boxShadow: "0 0 0 0 rgba(110, 231, 183, 0.45)" },
                    "70%": { boxShadow: "0 0 0 10px rgba(110, 231, 183, 0)" },
                },
                marquee: {
                    "0%": { transform: "translateX(0)" },
                    "100%": { transform: "translateX(-50%)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
