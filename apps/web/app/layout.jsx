import { Michroma, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Michroma({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-michroma",
  display: "swap",
});

const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});


export const metadata = {
  title: "Polarsight | Campus Cybersecurity Training & Placement, India",
  description:
    "Polarsight runs hands-on cybersecurity training inside colleges. Live attack ranges, graded labs and placement preparation, built with the teams who do the hiring.",
  openGraph: {
    title: "Polarsight | Where students become defenders",
    description:
      "Hands-on cybersecurity training delivered on campus, with placement preparation built in.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0B0F14",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-invert focus:px-5 focus:py-3 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-on-invert"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
