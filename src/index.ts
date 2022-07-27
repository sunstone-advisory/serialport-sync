import { SerialPort, ReadlineParser } from 'serialport'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Request, Context, LogEvent, LogLevel, Handler } from './types'

export interface SerialPortControllerInterface {
  'log': (message: LogEvent) => void
  'unexpected-message': (message: string) => void
}

export class SerialPortController extends TypedEmitter<SerialPortControllerInterface> {
  /* The serial port connection to the device */
  #serial: SerialPort

  /* The current request context to process against the serial port device */
  #current: Context

  /* Queue of requests to be processed against the serial port device */
  #queue: Context[] = []

  /* Function handlers for known sporadic or unsolicited messages from the serial port device */
  #handlers: Handler[] = []
  get handlers () {
    return this.#handlers
  }

  /**
   * SerialPortController constructor
   *
   * @param {object} options
   * @param {string} options.path The path of the serial port
   * @param {number} options.baudRate The baud rate of the port to be opened
   * @param {Handler[]} options.handlers Function handlers for known sporadic or unsolicited messages from the serial port device
   */
  constructor (options: { path: string; baudRate: number; handlers?: Handler[] }) {
    super()

    const logger = this.#logger

    const serialPort = new SerialPort({
      autoOpen: false, // opened in this.init()
      path: options.path,
      baudRate: options.baudRate
    })

    serialPort.on('error', (error: Error) => {
      logger.error(error.message)
    })

    const readlineParser = new ReadlineParser({ delimiter: '\r\n' })

    readlineParser.on('data', (data: string) => {
      this.#handleData(data)
    })

    serialPort.pipe(readlineParser)

    this.#serial = serialPort

    if (options.handlers) this.#handlers = options.handlers
  }

  /**
   * Opens the connection to the serial port.
   *
   * @returns {Promise<void>}
   */
  async open (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#serial.open((error) => {
        if (error) {
          this.#logger.error(error.message)
          return reject(error)
        }
        this.#logger.info(`Connection to serial port '${this.#serial.port.openOptions.path}' has been opened`)
        resolve()
      })
    })
  }

  /**
   * Closes the connection to the serial port.
   *
   * @returns {Promise<void>}
   */
  async close (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#serial.isOpen) {
        this.#serial.close((error) => {
          if (error) return reject(error)
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  /**
   * Indicates if the connection to the serial
   * port is open.
   *
   * @returns {boolean}
   */
  isOpen (): boolean {
    return this.#serial.isOpen
  }

  /**
   * Logger object to control output from the controller.
   * Log messages are created as {LogEvent} objects and
   * emitted through the 'log' event.
   */
  #logger = {
    debug: (message: string) => this.#logger.log(LogLevel.DEBUG, message),
    info: (message: string) => this.#logger.log(LogLevel.INFO, message),
    warn: (message: string) => this.#logger.log(LogLevel.WARN, message),
    error: (message: string) => this.#logger.log(LogLevel.ERROR, message),
    critical: (message: string) => this.#logger.log(LogLevel.CRITICAL, message),
    log: (level: LogLevel, message: string) => this.emit('log', { level, datetime: new Date(), message })
  }

  /**
   * Private function used to handle inbound data
   * received from the serial port connection. Each
   * line of data is processed against the current
   * request context.
   *
   * @param {string} data Inbound data from the serial device
   * @returns {void}
   */
  #handleData (data: string): void {
    this.#logger.info('<< ' + data)

    // match data against unsolicited handlers
    for (const handler of this.#handlers) {
      if (handler.pattern.test(data)) {
        this.#logger.info(`Inbound message matched unsolicited handler pattern: ${handler.pattern}. Calling custom handler function`)
        handler.callback(data)
        return
      }
    }

    // if no context exist there is nothing to do,
    // let the user know an unexpected message was
    // received.
    if (!this.#current) {
      this.#logger.warn('Unexpected inbound message, no active handler')
      this.emit('unexpected-message', data)
      return
    }

    const request = this.#current.request

    // if the response matches an expected error
    // format then reject the promise.
    if (request.errorRegex && request.errorRegex.test(data)) {
      this.#logger.debug('Received error response, calling reject handler')
      this.#current.rejectFn(this.#current.response)
      return this.#processQueue()
    }

    // append the response to the buffer
    if (request.bufferRegex && // do we need to buffer the response
      request.bufferRegex.test(data) && // does this match the buffer criteria
      request.text !== data) { // ignore echo of commands back to port
      if (this.#current.response === '') {
        this.#current.response += data
      } else {
        this.#current.response += '\n' + data
      }
    }

    // if the response messages the expected format
    // then resolve the promise.
    if (request.successRegex.test(data)) {
      this.#logger.debug('Received expected response, calling resolve handler')
      this.#current.resolveFn(this.#current.response)
      return this.#processQueue()
    }
  }

  /**
   * Private function to handle queue processing.
   * Once the current context has been handled,
   * this function will load up the next request
   * for processing.
   *
   * @returns {void}
   */
  #processQueue () {
    if (this.#current) {
      if (this.#current.timeoutFn) {
        clearTimeout(this.#current.timeoutFn)
      }
      this.#current = null
    }

    // process the next request in the queue...
    const next = this.#queue.shift()

    if (!next) return

    this.#current = next

    if (!this.#serial.isOpen) {
      next.rejectFn(Error('Serial connection is not open'))
      return
    }

    const request = next.request

    // set the timeoutFn if specified in request
    if (request.timeoutMs > 0) {
      next.timeoutFn = setTimeout(() => {
        this.#logger.warn(`Request timeout. Response not received within ${request.timeoutMs}ms`)
        next.rejectFn(Error('Timeout'))
        return this.#processQueue()
      }, request.timeoutMs)
    }

    // write either binary buffer or text to serial port
    if (next.request.buffer) {
      this.#logger.info(request.description ?? 'Writing binary to port')
      this.#logger.info('>> [BINARY] ' + request.buffer.toString('hex'))
      this.#serial.write(request.buffer)
    } else {
      this.#logger.info(request.description ?? 'Writing text to port')
      this.#logger.info('>> ' + request.text)
      this.#serial.write(request.text + '\r\n')
    }
  }

  /**
   * Executes a request against the serial port connection.
   * Each request contains criteria that determines
   * how the subsequent response messages from the serial
   * port device should be handled.
   *
   *
   * If the controller is currently busy handling another
   * request, this request will be added to the back of
   * the queue and processed once all prior requests have
   * been processed.
   *
   * @param {string} request.text The output data which will be written to the serial connection as a string
   * @param {Buffer} request.buffer The output data which will be written to the serial connection as hex
   * @param {number} request.timeoutMs The maximum time to wait until cancelling the request
   * @param {RegExp} request.successRegex Regular expression pattern that determines when to resolve the request
   * @param {RegExp} request.errorRegex Regular expression pattern that determines when to reject the request
   * @param {RegExp} request.bufferRegex Regular expression pattern that determines when to buffer the inbound data to the response buffer
   * @param {string} request.description Describes what the request is doing (used for logging purposes)
   *
   * @returns {Promise<string>}
   */
  async execute (request: Request): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!request.bufferRegex) request.bufferRegex = /^.+$/

      const context = {
        request,
        resolveFn: resolve,
        rejectFn: reject,
        timeoutFn: null,
        response: ''
      }

      this.#queue.push(context)

      if (!this.#current) this.#processQueue()
    })
  }
}
