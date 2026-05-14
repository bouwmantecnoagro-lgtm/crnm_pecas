import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_DOMAINS = ['@bouwman.com.br'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=C%C3%B3digo+de+autoriza%C3%A7%C3%A3o+ausente', url.origin),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error?.message ?? 'Falha na autenticação')}`,
        url.origin,
      ),
    );
  }

  const email = data.user.email?.toLowerCase().trim() ?? '';
  const domainOk = ALLOWED_DOMAINS.some((d) => email.endsWith(d));

  if (!domainOk) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(
        '/login?error=Apenas+contas+%40bouwman.com.br+podem+acessar+este+aplicativo',
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(new URL('/', url.origin));
}
