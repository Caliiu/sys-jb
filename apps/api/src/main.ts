import { setDefaultResultOrder } from 'node:dns';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { loadConfig } from './config/config.js';

// Chamadas aos provedores (PlayFivers, resultados, horóscopo) saem por IPv4 quando o destino tem os dois: as listas de
// IP liberado dos provedores usam o IPv4 do servidor, e o IPv6 de saída costuma mudar (endereços temporários).
setDefaultResultOrder('ipv4first');

const config = loadConfig(process.env);
const app = await createApp(config);
await app.listen(config.port, config.host);
new Logger('Bootstrap').log(`API ouvindo em http://${config.host}:${config.port}`);
