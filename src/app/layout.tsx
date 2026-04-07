import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";

// Display: Bricolage Grotesque — variable grotesk with optical sizing
// and a width axis. Modern, characterful, but never decorative —
// reads as "intentional editorial" not "fantasy serif". Used for the
// wordmark, page H1s, and the hero HDV numerals.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display-family",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "wdth"],
});

// Body: DM Sans — friendly geometric sans with great tabular figures.
// Reads cleanly at small sizes on a phone in daylight.
const dmSans = DM_Sans({
  variable: "--font-sans-family",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FlySchedule",
  description:
    "L'app pour gérer simplement le planning de réservation de votre avion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${bricolage.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface text-text">
        {children}
      </body>
    </html>
  );
}
