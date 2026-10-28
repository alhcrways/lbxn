import { resolve } from 'node:path';
import { createSocialServer } from './server';

const port = Number(process.env.SOCIAL_PORT ?? 4317);
const host = process.env.SOCIAL_HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SOCIAL_PORT 无效');
const dataFile = resolve(process.env.SOCIAL_DATA_FILE ?? '.social-data/server.json');
const server = createSocialServer({ dataFile });
server.on('error', error => { console.error('通信服务启动失败：', error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`春日部好友通信服务：http://${host}:${port}\n数据文件：${dataFile}\n局域网测试时设置 SOCIAL_HOST=0.0.0.0；公网部署请配置 HTTPS。`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.closeAllConnections(); server.close(() => process.exit(0));
});
