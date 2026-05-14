'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email offline_access',
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      setLoading(false);
      window.location.href = `/login?error=${encodeURIComponent(error.message)}`;
    }
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-[#2F2F2F] hover:bg-black text-white font-medium py-3 px-4 rounded-md transition disabled:opacity-60"
    >
      <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
      {loading ? 'Redirecionando…' : 'Entrar com Microsoft'}
    </button>
  );
}
