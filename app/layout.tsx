import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Penny — A little clarity for your money",
  description:
    "Penny is your adaptive money workspace, with pennybot as your AI assistant. Synthetic insights and human-approved PayPal Sandbox payments.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
