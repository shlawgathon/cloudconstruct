import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudConstruct",
  description: "AI-powered infrastructure prototyping with visual feedback",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

