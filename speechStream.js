
// Copied from https://github.com/googleapis/nodejs-speech/blob/master/samples/infiniteStreaming.js

// Imports the Google Cloud client library
// Currently, only v1p1beta1 contains result-end-time
const speech = require('@google-cloud/speech').v1p1beta1;
const WebSocket = require('ws');

const client = new speech.SpeechClient();
const fs = require('fs');

class Stream {
  /**
   *
   * @param ws - the websocket client object - one created for each connection
   * @param wss - the websocket server object - there is only one server object
   */
  constructor(ws, wss) {
    this.recognizeStream = null;
    this.ws = ws; // store the websocket so we can send back results
    this.wss = wss; // use it to get a list of all client
    this.startStream = this.startStream.bind(this);
    this.speechCallback = this.speechCallback.bind(this);
    ws.my_log("INFO", "Creating stream");
  }

  getRecognizeStream() {
     return this.recognizeStream;
  }



  /*
      // convert raw pcm to wav file
      ffmpeg -f s16le -ar 16000 -ac 1 -i /tmp/audio /tmp/output.wav

   */
  startStream(useOpus, phrases) {
    const config = {
      encoding: useOpus ? 'OGG_OPUS' : 'LINEAR16',
      sampleRateHertz: useOpus ? 48000 : 16000,
      languageCode: 'en_us',
      speechContexts: [{ phrases: phrases}],
    };

    const request = {
      config : config,
      interimResults: true,
    };

    //this.fd = fs.openSync("/tmp/audio", "w");

    // Clear current audioInput
    // Initiate (Reinitiate) a recognize stream
    this.recognizeStream = client
      .streamingRecognize(request)
      .on('error', err => {
        this.ws.my_log("ERROR", 'API request error ', err);
        if (err.code === 11) {
          // restartStream();
        } else {
          this.ws.my_log("ERROR", 'API request error ', err);
        }
      })
      .on('data', this.speechCallback);
    
  }
  
  endStream() {
    if (this.recognizeStream) {

      this.ws.my_log("INFO", "Closing stream");

      this.recognizeStream.end();

      // Null out and create a copy of the recognize stream,
      // the original stream cannot be written to any more
      // however this stream may be still replying
      const recognizeStream1 = this.recognizeStream;
      this.recognizeStream = null;
      //const fd1 = this.fd;

      //fs.closeSync(fd1);

      // after ending the stream, the server may be still replying back, wait for 2 seconds
      setTimeout(() => recognizeStream1.removeListener('data', this.speechCallback), 2000);

      /*
      // DOn't remove this listener
      // remove the speechCallback listener after 1 second
      setTimeout(() => {
        this.recognizeStream.removeListener('data', this.speechCallback);
        this.recognizeStream = null;
      }, 1000);

       */
    }
  }

  write(message) {
    if (this.recognizeStream) {
      //fs.writeSync(this.fd, message);
      this.recognizeStream.write(message);
    } else {
      this.ws.my_log("ERROR", "got buffer of size ", message, " after recognize Stream was closed")
    }
  }

  speechCallback(data)  {
    const cmd = {
      oper:"result",
      clientId: this.ws.clientId,
      result: data,
    };
    // Send trasncription data to all clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(cmd));
      }
    });
  };
  
}

/*
class InfiniteStream {
  constructor() {
    // Streaming limit is 5 minutes. see https://cloud.google.com/speech-to-text/quotas
    this.streamingLimit = 10000; // ms - set to low number for demo purposes
    this.recognizeStream = null;
    this.restartCounter = 0;
    this.audioInput = [];
    this.lastAudioInput = [];
    this.resultEndTime = 0;
    this.isFinalEndTime = 0;
    this.finalRequestEndTime = 0;
    this.newStream = true;
    this.bridgingOffset = 0;
    this.lastTranscriptWasFinal = false;

    this.config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    };
  
    this.request = {
      config : this.config,
      interimResults: true,
    };

    this.startStream = this.startStream.bind(this);
    this.restartStream = this.restartStream.bind(this);
    this.speechCallback = this.speechCallback.bind(this);

  }
  
  startStream() {
    // Clear current audioInput
    // Initiate (Reinitiate) a recognize stream
    this.recognizeStream = client
      .streamingRecognize(this.request)
      .on('error', err => {
        if (err.code === 11) {
          // restartStream();
        } else {
          console.error('API request error ' + err);
        }
      })
      .on('data', this.speechCallback);
  
    // Restart stream when streamingLimit expires
    setTimeout(this.restartStream, this.streamingLimit);
  }
  
  speechCallback(stream)  {
    // Convert API result end time from seconds + nanoseconds to milliseconds
    const resultEndTime =
      stream.results[0].resultEndTime.seconds * 1000 +
      Math.round(stream.results[0].resultEndTime.nanos / 1000000);
  
    // Calculate correct time based on offset from audio sent twice
    const correctedTime =
      resultEndTime - bridgingOffset + streamingLimit * restartCounter;
  
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    let stdoutText = '';
    if (stream.results[0] && stream.results[0].alternatives[0]) {
      stdoutText =
        correctedTime + ': ' + stream.results[0].alternatives[0].transcript;
    }
  
    if (stream.results[0].isFinal) {
      process.stdout.write(chalk.green(`${stdoutText}\n`));
  
      isFinalEndTime = resultEndTime;
      lastTranscriptWasFinal = true;
    } else {
      // Make sure transcript does not exceed console character length
      if (stdoutText.length > process.stdout.columns) {
        stdoutText =
          stdoutText.substring(0, process.stdout.columns - 4) + '...';
      }
      process.stdout.write(chalk.red(`${stdoutText}`));
  
      lastTranscriptWasFinal = false;
    }
  };
  
  audioInputStreamTransform = new Transform({
    transform: (chunk, encoding, callback) => {
      if (this.newStream && this.lastAudioInput.length !== 0) {
        // Approximate math to calculate time of chunks
        const chunkTime = this.streamingLimit / lastAudioInput.length;
        if (chunkTime !== 0) {
          if (this.bridgingOffset < 0) {
            this.bridgingOffset = 0;
          }
          if (this.bridgingOffset > this.finalRequestEndTime) {
            this.bridgingOffset = this.finalRequestEndTime;
          }
          const chunksFromMS = Math.floor(
            (this.finalRequestEndTime - this.bridgingOffset) / chunkTime
          );
          bridgingOffset = Math.floor(
            (this.lastAudioInput.length - this.chunksFromMS) * chunkTime
          );
  
          for (let i = chunksFromMS; i < lastAudioInput.length; i++) {
            recognizeStream.write(this.lastAudioInput[i]);
          }
        }
        newStream = false;
      }
  
      // audioInput is an array, chunk is a Buffer ? so audioInput is an array of Buffers?
      this.audioInput.push(chunk);
  
      if (this.recognizeStream) {
        this.recognizeStream.write(chunk);
      }
  
      callback();
    },
  });
  
  restartStream() {
    if (this.recognizeStream) {
      this.recognizeStream.removeListener('data', speechCallback);
      this.recognizeStream = null;
    }
    if (this.resultEndTime > 0) {
      this.finalRequestEndTime = this.isFinalEndTime;
    }
    this.resultEndTime = 0;
  
    this.lastAudioInput = [];
    this.lastAudioInput = this.audioInput;
  
    this.restartCounter++;
  
    if (!this.lastTranscriptWasFinal) {
      process.stdout.write(`\n`);
    }
    process.stdout.write(
      chalk.yellow(`${this.streamingLimit * this.restartCounter}: RESTARTING REQUEST\n`)
    );
  
    this.newStream = true;
  
    this.startStream();
  }
}
*/

module.exports = {
  Stream:Stream
};
