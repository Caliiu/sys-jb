import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hostnames locais das bancas fictícias (HMR e server actions em dev).
  allowedDevOrigins: ['trevo.localhost', 'aurora.localhost', 'boreal.localhost'],
  // Importante: não usar `env` aqui. Ele embute valores no bundle do navegador.
};

export default nextConfig;
