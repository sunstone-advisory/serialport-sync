export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export type Handler = {
  pattern: RegExp
  callback: Function
}

export type LogEvent = {
  level: LogLevel
  message: string
  datetime: Date
}

export type Request = {
  description?: string
  timeoutMs: number
  successRegex: RegExp
  bufferRegex?: RegExp
  errorRegex?: RegExp
} & ({
  buffer: Buffer
  text?: never
} | {
  text: string
  buffer?: never
})

export type Context = {
  request: Request
  resolveFn: Function
  rejectFn: Function
  timeoutFn: NodeJS.Timeout
  response?: string
}
