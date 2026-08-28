import type { Metadata } from "next";
import "@fontsource-variable/open-sans/wght.css";
import "@fontsource-variable/open-sans/wght-italic.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow/800.css";
import "./design-tokens.css";
import "./globals.css";
import "./responsive.css";
import "./typography.css";

const title = "PRO7 Team Manager — Quản lý đội bóng 7 người";
const description = "Điều hành đội hình, trận đấu, chiến thuật và quỹ đội bóng trong một trung tâm chỉ huy hiện đại.";

export const metadata: Metadata = {
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PRO7", statusBarStyle: "black-translucent" },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
