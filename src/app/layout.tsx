import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Zero-Trust Machine Customer | M2M Autonomous Settlement Platform',
  description:
    'Autonomous Machine Customer reference architecture featuring Policy-as-Code Guard Mode, RFC 9449 DPoP, x402 payment settlements, and OpenZiti Zero-Trust overlay networking.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
