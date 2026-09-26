import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hostnames locais das bancas fictícias (HMR e server actions em dev).
  allowedDevOrigins: ['trevo.localhost', 'aurora.localhost', 'boreal.localhost'],
  // O indicador do Next (só em dev) cobria o botão "Sair" do menu lateral do painel, no canto inferior esquerdo.
  devIndicators: { position: 'bottom-right' },
  // Importante: não usar `env` aqui. Ele embute valores no bundle do navegador.
};

export default nextConfig;
