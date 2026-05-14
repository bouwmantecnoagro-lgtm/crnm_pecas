import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Bouwman - CRM Peças',
  description: 'CRM Preditivo de Peças e Máquinas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      {/* suppressHydrationWarning: ignora classes injetadas por extensões do
          navegador (ex.: "remail_body") que alteram o <body> antes do React hidratar. */}
      <body className="antialiased font-sans bg-slate-950 text-slate-100" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
