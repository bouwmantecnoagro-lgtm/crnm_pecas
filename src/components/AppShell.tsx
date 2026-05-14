'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { DataProvider } from '@/contexts/DataContext';

const PUBLIC_ROUTES = ['/login'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <DataProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 ml-64 h-full overflow-y-auto p-4 md:p-8 relative">
          <div className="w-full mx-auto z-10 relative h-full flex flex-col">
            {children}
          </div>
          <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        </main>
      </div>
    </DataProvider>
  );
}
