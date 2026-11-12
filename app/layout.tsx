import type { Metadata } from "next";
import "./globals.css";
import "./modern.css";
export const metadata: Metadata = {
  title: "Penny — A little clarity for your money",
  description:
    "Your adaptive money workspace: private accounts, reviewed transactions, savings insights and pennybot. Explore PayPal Sandbox with fictional demo data.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
