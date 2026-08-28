import type { Metadata } from "next";
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
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <head>
        <link
          rel="preload"
          href="/fonts/be-vietnam-pro-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
