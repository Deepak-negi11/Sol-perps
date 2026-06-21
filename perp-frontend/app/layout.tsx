import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import "./nyxora-terminal.css";
import "./nyxora-polish.css";
import "./nyxora.css";
import WalletContextProvider from "./components/WalletContextProvider";
import { ToastProvider } from "./components/Toast";

const inter = Inter({
  variable: "--font-ui-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nyxora Trading Terminal",
  description: "Ratio perpetual trading terminal on Solana devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${robotoMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <WalletContextProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}
