import type { EventEmitter } from 'node:events';

const guarded = new WeakSet<EventEmitter>();

/** 桌面程序可能继承已被启动器关闭的日志管道；只处理这种日志输出错误。 */
export function guardConsolePipes(streams: EventEmitter[] = [process.stdout, process.stderr]) {
  for (const stream of streams) {
    if (guarded.has(stream)) continue;
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') return;
      // 其他错误仍交给正常异常处理，避免隐藏真实故障。
      throw error;
    });
    guarded.add(stream);
  }
}
