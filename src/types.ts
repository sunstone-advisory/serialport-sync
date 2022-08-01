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

export type RegexRequest = {
  description?: string
  data: Buffer | string
  timeoutMs: number
  successRegex: RegExp
  bufferRegex?: RegExp
  errorRegex?: RegExp
}

export type BinaryRequest = {
  description?: string
  data: Buffer | string
  interval: number
  maxBufferSize: number
}

export type Context = {
  mode: 'regex' | 'binary'
  resolveFn: Function
  rejectFn: Function
  timeoutFn?: NodeJS.Timeout
  response?: string
} & ({
  binary: BinaryRequest
  regex?: never
}
| {
  binary?: never
  regex: RegexRequest
})
