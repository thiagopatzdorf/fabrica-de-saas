import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Banco de Questões — Estude para concursos públicos",
  description:
    "Banco de questões gratuito de concursos públicos. Resolva questões, acompanhe seu progresso e descubra sua chance de passar.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#6d3ff2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        <main className={cn("flex-1", isAuthenticated && "pb-16 sm:pb-0")}>
          {children}
        </main>
        {isAuthenticated ? <BottomNav /> : null}
      </body>
    </html>
  );
}
