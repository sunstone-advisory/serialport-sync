# serialport-synchronous
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

## Overview
serialport-synchronous is a simple promise based library for Node.js that allows for synchronous request-response styled communication with serialport

## Installation
```bash
npm install serialport-synchronous
```

## Usage Scenario
In this example the serialport device has been configured to return a temperature value when it receives the command `getTemp`. We specify the expected response as a regular expression, and when the library receives that response the promise is resolved.

The serialport device also echos back the text: `Received: getTemp`, which we have no use for. This is ignored through the use of the `bufferRegex` property which is used to determine what should be buffered and returned in the promise resolver.

The `errorRegex` is used to determine if the response was deemed unsuccessful and the reject resolver should be invoked.

In this example, we assume the serialport device takes a while to initilise. When it is ready it will send the `READY` command. Through the use of the handlers property, we configure the `main()` function to run when we receive the `READY` command.

#### Success Scenario:
 1.  `<< READY`
 1.  `>> getTemp`
 1.  `<< Received: getTemp`
 1.  `<< Temp: 23.22`

#### Error Scenario:
 1. `<< READY`
 1. `>> getTemp`
 1. `<< ERROR`

### Sample Code
```js
import { SerialPortController } from '../src/index'

const TEMP_REGEX = /^Temp: (\d+\.\d+)$/
const ERROR_REGEX = /^ERROR$/
const READY_REGEX = /^READY$/

const controller = new SerialPortController({
  path: '/dev/ttyUSB0',
  baudRate: 19200,
  handlers: [{
    pattern: READY_REGEX,
    callback: main // call the main() function when READY_REGEX has matched.
  }]
})

// push the log events from the library to the console
controller.on('log', (log) => console[log.level.toLowerCase()](`${log.datetime.toISOString()} [${log.level.toUpperCase()}] ${log.message}`))

// open the serial port connection
controller.open()

async function main () {
  try {
    // send the getTemp text to the serialport
    const result = await controller.execute({
      description: 'Querying current temperature', // optional, used for logging purposes
      text: 'getTemp',                             // mandatory, the text to send
      successRegex: TEMP_REGEX,                    // mandatory, the regex required to resolve the promise
      bufferRegex: TEMP_REGEX,                     // optional, the regex match required to buffer the response
      errorRegex: ERROR_REGEX,                     // optional, the regex match required to reject the promise
      timeoutMs: 1000                              // mandatory, the maximum time to wait before rejecting the promise
    })
    
    // parse the response to extract the temp value
    const temp = result.match(TEMP_REGEX)[1]
    console.log(`\nThe temperature reading was ${temp}c`)
  } catch (error) {
    console.error('Error occured querying temperature')
    console.error(error)
  }
}
```

### Output
```bash
2022-07-20T01:33:56.855Z [INFO] Connection to serial port '/dev/ttyUSB0' has been opened
2022-07-20T01:33:58.391Z [INFO] << READY
2022-07-20T01:33:58.392Z [INFO] Inbound message matched unsolicited handler pattern: /^READY$/. Calling custom handler function
2022-07-20T01:33:58.396Z [INFO] Querying current temperature
2022-07-20T01:33:58.397Z [INFO] >> [TEXT] getTemp
2022-07-20T01:33:58.415Z [INFO] << Received: getTemp
2022-07-20T01:33:58.423Z [INFO] << Temp: 16.89
2022-07-20T01:33:58.423Z [DEBUG] Received expected response, calling resolve handler

The temperature reading was 16.89c
```