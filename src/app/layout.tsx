import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import { CustomToaster } from "@/components/custom-toaster";
import { Noise } from "@/components/ui/noise";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ResumeWise",
    template: "%s | ResumeWise",
  },
  description: "AI-powered resume editor. Tailored resumes for every application.",
  openGraph: {
    title: "ResumeWise",
    description: "AI-powered resume editor. Tailored resumes for every application.",
    type: "website",
    siteName: "ResumeWise",
  },
  twitter: {
    card: "summary_large_image",
    title: "ResumeWise",
    description: "AI-powered resume editor. Tailored resumes for every application.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const themeInit = `(function(){try{var t=localStorage.getItem("theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="dark"||(t!=="light"&&m)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased bg-background text-foreground">
        {children}
        <Noise />
        <CustomToaster />
      </body>
    </html>
  );
}
