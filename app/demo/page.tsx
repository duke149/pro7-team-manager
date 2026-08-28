import type { Metadata } from "next";
import Pro7App from "../pro7-app";

export const metadata: Metadata = {
  title: "Bản Demo — PRO7 Team Manager",
  description: "Trải nghiệm đầy đủ các tính năng: Tổng quan, Đội hình, Trận đấu, Chiến thuật và Quỹ đội.",
};

export default function DemoPage() {
  return <Pro7App />;
}
