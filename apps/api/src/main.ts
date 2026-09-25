import { Logger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { loadConfig } from './config/config.js';

const config = loadConfig(process.env);
const app = await createApp(config);
await app.listen(config.port, config.host);
new Logger('Bootstrap').log(`API ouvindo em http://${config.host}:${config.port}`);
