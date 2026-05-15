'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Tractor, FileText, Settings, LogOut, Zap, ShieldCheck } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { createClient } from '@/lib/supabase/client';

export default function Sidebar() {
  const pathname = usePathname();
  const { acoes } = useData();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      setIsAdmin(data?.role === 'ADMIN');
    })();
  }, []);

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/login';
  }

  // Contar ações pendentes para o badge
  const acoesPendentes = acoes.filter((a: any) => ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status)).length;

  return (
    <div className="w-64 h-screen border-r border-[#ffffff15] bg-[#00000030] backdrop-blur-xl flex flex-col p-4 fixed left-0 top-0">
      <div className="flex flex-col items-center gap-3 mb-10 mt-6 px-2">
        {/*
          A imagem fornecida possui as letras em branco nativamente, combinando perfeitamente com o fundo escuro do dashboard.
          Certifique-se de salvar o novo anexo branco como "logo-bouwman.png" dentro da pasta "public".
        */}
        <img src="/logo-bouwman.png" alt="Bouwman Service" className="w-48" />
        <div className="text-center mt-2 border-t border-white/10 w-full pt-3">
          <h1 className="font-bold text-sm tracking-widest text-sky-400 uppercase">CRM <span className="opacity-70 font-light text-white">Peças</span></h1>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <NavItem href="/" icon={<LayoutDashboard size={18} />} label="Visão Geral" active={pathname === '/'} />
        
        <div className="pt-2 pb-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Comercial</p>
          <NavItem href="/orcamentos" icon={<FileText size={18} />} label="Tabela de Orçamentos" active={pathname === '/orcamentos'} />
          <NavItem href="/orcamentos/pipeline" icon={<LayoutDashboard size={18} />} label="Pipeline Comercial" active={pathname === '/orcamentos/pipeline'} />
          <NavItem href="/maquinas" icon={<Tractor size={18} />} label="Parque de Máquinas" active={pathname === '/maquinas'} />
          <NavItem 
            href="/acoes" 
            icon={<Zap size={18} />} 
            label="Ações Comerciais" 
            active={pathname === '/acoes'} 
            badge={acoesPendentes > 0 ? acoesPendentes : undefined}
          />
        </div>

        <div className="pt-2 pb-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Sucesso do Cliente</p>
          <NavItem href="/clientes" icon={<Users size={18} />} label="Tabela de Clientes" active={pathname === '/clientes'} />
          <NavItem href="/clientes/carteira" icon={<LayoutDashboard size={18} />} label="CS Pipeline (Retenção)" active={pathname === '/clientes/carteira'} />
        </div>

        {isAdmin && (
          <div className="pt-2 pb-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Administração</p>
            <NavItem href="/admin/usuarios" icon={<ShieldCheck size={18} />} label="Usuários" active={pathname.startsWith('/admin/usuarios')} />
          </div>
        )}
      </nav>

      <div className="mt-auto border-t border-[#ffffff15] pt-4 space-y-2">
        <NavItem href="#" icon={<Settings size={18} />} label="Configurações" />
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-left"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </div>
  );
}

function NavItem({ href, icon, label, active = false, badge }: { href: string, icon: React.ReactNode, label: string, active?: boolean, badge?: number }) {
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="min-w-[20px] h-5 flex items-center justify-center text-[10px] font-black bg-violet-500 text-white rounded-full px-1.5 animate-pulse shadow-lg shadow-violet-500/30">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
