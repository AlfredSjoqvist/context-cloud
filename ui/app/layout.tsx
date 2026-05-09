import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardian",
  description: "Live event stream for the Guardian agent",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
