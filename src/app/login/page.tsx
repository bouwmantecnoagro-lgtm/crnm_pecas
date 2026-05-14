import LoginButton from './LoginButton';

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">CRM Peças</h1>
          <p className="text-sm text-slate-600">Acesso restrito a colaboradores Bouwman</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {decodeURIComponent(error)}
          </div>
        )}

        <LoginButton />

        <p className="text-xs text-center text-slate-400">
          Você será redirecionado para o login Microsoft corporativo
        </p>
      </div>
    </div>
  );
}
