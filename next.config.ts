import type { NextConfig } from "next";

// Fixa o root do Turbopack neste diretório. Sem isso, o Next.js detecta um
// package-lock.json fantasma em C:\Users\fabiano.luz\ e usa essa pasta como
// workspace root, o que faz as rotas em src/app/api/ retornarem 404.
const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
