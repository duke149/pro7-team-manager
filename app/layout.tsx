import type { Metadata } from "next";
import "./globals.css";

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
  return <html lang="vi"><body>{children}</body></html>;
}
