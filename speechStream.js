
// Copied from https://github.com/googleapis/nodejs-speech/blob/master/samples/infiniteStreaming.js

// Imports the Google Cloud client library
// Currently, only v1p1beta1 contains result-end-time
const speech = require('@google-cloud/speech').v1p1beta1;
const WebSocket = require('ws');

const client = new speech.SpeechClient();
const fs = require('fs');
const log = require('./util.js').log;
const logErr = require('./util.js').logErr;
let phrases = ["Sachi", "Shrey"];

class Stream {

  /*
      // convert raw pcm to wav file
      ffmpeg -f s16le -ar 16000 -ac 1 -i /tmp/audio /tmp/output.wav

   */
  constructor(speechCallback, clientId, streamId) {
    console.log("in gcloud");
    const useOpus = false;
    this.clientId = clientId;
    this.streamId = streamId;
    this.startTime = 0;
    this.isOpen = true;

    const config = {
      encoding: useOpus ? 'OGG_OPUS' : 'LINEAR16',
      sampleRateHertz: useOpus ? 48000 : 16000,
      languageCode: 'en_us',
      enableAutomaticPunctuation: true,
      speechContexts: [{ phrases: phrases}],
    };

    const request = {
      config : config,
      interimResults: true,
    };

    this.fd = fs.openSync("/tmp/audio", "w");

    log("gcloud: Starting recognize stream", streamId);

    // Clear current audioInput
    // Initiate (Reinitiate) a recognize stream
    this.recognizeStream = client
      .streamingRecognize(request)
      .on('error', err => {
        logErr('gcloud: API request error ', streamId, err);
        if (err.code === 11) {
          // restartStream();
        } else {
          logErr('gcloud: API request error ', streamId, err);
        }
      })
      .on('data', data => {
        if (data.results && data.results.length > 0
          && data.results[0].alternatives && data.results[0].alternatives.length > 0) {
          log("gcloud got data ", streamId, this.startTime, data.results[0].alternatives[0].transcript);
          const r = data.results[0];
          r.startTime = this.startTime;
          if (r.isFinal) {
            this.startTime = r.resultEndTime.seconds + r.resultEndTime.nanos/1000000000;
            log("gcloud. setting startTime to", streamId, r.resultEndTime, this.startTime)
          }
          speechCallback(r)
        } else {
          log("gcloud got data ", data)
        }
        
      });

   
    
  }
  
  endStream() {
    if (this.isOpen) {
      log("gcloud: Closing recognize stream", this.streamId);
      this.recognizeStream.end();
      this.isOpen = false;
      fs.closeSync(this.fd);
    }
    else {
      logErr("gcloud: Trying to close already closed recognize stream ", this.streamId);
    }
  }

  write(message) {
    //if (this.isOpen) {
      log("gcloud: write buffer of size", message.length, this.streamId)
      fs.writeSync(this.fd, message);
      this.recognizeStream.write(message);
    //} else {
    //  this.pendingBuf.push(message);
    //  log("gcloud: pending write buffer of size ", message.length);
    //}
  }
  
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
