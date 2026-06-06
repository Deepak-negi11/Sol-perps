import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
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
  title: "Satr Trading Terminal",
  description: "Advanced Decentralized Perpetual Trading Terminal on Solana",
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
