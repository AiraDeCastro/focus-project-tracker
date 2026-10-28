import type { Metadata } from "next";
import { Nunito, Outfit } from "next/font/google";
import "./globals.css";

const body = Nunito({ variable: "--font-body", subsets: ["latin"] });
const head = Outfit({ variable: "--font-head", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Focus Trail",
  description:
    "Focus Trail keeps you on one project at a time, tracked by your GitHub milestones. A full-stack app built by Aira De Castro.",
};

/** Applies the saved theme before first paint so the page does not flash. */
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${head.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
