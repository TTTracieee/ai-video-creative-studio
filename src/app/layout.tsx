import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Frame — AI Video Creative Studio",
  description:
    "Turn a marketing brief into an editable storyboard, consistent prompts, and reviewed video clips.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
