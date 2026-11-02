import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#163A5F",     // Confiabilidade, inteligência e tecnologia
          purple: "#7048A8",   // Transformação, inovação e conhecimento
          yellow: "#F5B942",   // Sinergia, dinamismo e prontidão
          dark: "#18202A",     // Grafite escuro para contraste e clareza
          light: "#F7F9FC",    // Grafite claro para fundos e legibilidade
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
