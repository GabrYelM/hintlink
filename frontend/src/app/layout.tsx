import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Hintlink by Hefesto Company — Conectando universitários",
  description: "Uma plataforma de conexão de conhecimento para universitários (UFABC)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} font-sans antialiased bg-brand-light text-brand-dark selection:bg-brand-yellow selection:text-brand-dark`}>
        {children}
      </body>
    </html>
  );
}
