import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Camello — AI Workforce Platform',
  description: 'The Shopify of AI workforces',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
