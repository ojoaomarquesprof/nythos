import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nythos — Gestão Clínica para Psicólogos",
    template: "%s | Nythos",
  },
  description:
    "Plataforma de gestão clínica e financeira para psicólogos. Agenda, prontuário eletrônico, fluxo de caixa e área do paciente.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nythos",
  },
  icons: {
    icon: "/logo-icon.png",
    shortcut: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Nythos",
    title: "Nythos — Gestão Clínica para Psicólogos",
    description:
      "Plataforma completa de gestão clínica e financeira para psicólogos.",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

import Script from "next/script";

import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="font-sans h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col bg-background">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster position="top-center" richColors />

        {/* Service Worker Registration */}
        <Script
          id="sw-registration"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function() { console.log('[Nythos] SW registered'); })
                    .catch(function() { console.log('[Nythos] SW registration failed'); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
