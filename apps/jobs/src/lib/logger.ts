type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry = { level, ts: new Date().toISOString(), msg: message, ...data };
  (level === 'error' ? console.error : console.log)(JSON.stringify(entry));
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
};
