
// Copied from https://github.com/googleapis/nodejs-speech/blob/master/samples/infiniteStreaming.js

// Imports the Google Cloud client library
// Currently, only v1p1beta1 contains result-end-time
const speech = require('@google-cloud/speech').v1p1beta1;
const WebSocket = require('ws');

const client = new speech.SpeechClient();
const fs = require('fs');
const log = require('./util.js').log;
const logErr = require('./util.js').logErr;
//let phrases = ["Sachi", "Shrey"];
let phrases = [];

// Google API has 5 minute streaming limit
//const streamingLimit = 290000;
const streamingLimit = 55000;

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
    this.isOpen = true;

    // Note: 
    // 1) The client side detects silence and does a startStream, and endStream
    //   The streamId is incremented everytime this happens, 
    //   so a combination of clientId + streamId can uniquely identify a stream.
    //   The server will be transcribing each client's stream in parallel.
    //
    // 2) The streaming API has a limit of 5 minutes. So just before 5 minutes are up
    //   there will timer that will close and reopen the stream. Any non final results will
    //   we sent again to be re-transcribed,
    //   The restartCounter will be incremented every time the stream is restarted. However
    //   the streamId will remain the same.
    //
    // 3) Every stream will have set of results. Some results will be final and some won't be
    //   After a result is final, that portion of the audio will not be transcribed again by the API
    //   each final result will have resultEndTime, - this is time in seconds (and nanoseconds) 
    //   from the time the stream was started/restarted.
    //   Results don'd have a startTime, it is implicit that the startTime is resultEndTime
    //   of the last final stream, or 0 if there was no final stream before this
    //   We augment the result to add this startTime
    //
    //   We also keep a cumulative restartTime, which is the difference betwen the beginning of 
    //   stream start and begining of the most recent stream restart. And add this to 
    //   the startTime and endTime. This way the client is completely unaware of the internal restarts
    // 
    
    // Have we started/restarted a new stream ?
    this.newStream = true;

    // number of times the stream has been restarted
    this.restartCounter = 0;

    // audio Input is any array of chunks (buffer)
    this.audioInput = [];
    this.audioInputSize = 0; // total size of all the buffers

    // the end time (in seconds) of the last result. 
    // the End time is calculated from the beginning of start/restart stream
    this.resultEndTime = 0;

    // the end time of the last final result.
    this.finalEndTime = 0;

    // the start time (in seconds) of the current result. 
    // It is calculated fom beginning of start/restart stream
    this.startTime = 0;
  
    // the time between the  of beginning of start stream and the beginning of the most current restart stream.
    this.restartTime = 0;


    this.lastTranscriptWasFinal = false;

    this.restartTimer = null;

    this.config = {
      encoding: useOpus ? 'OGG_OPUS' : 'LINEAR16',
      sampleRateHertz: useOpus ? 48000 : 16000,
      languageCode: 'en_us',
      enableAutomaticPunctuation: true,
      speechContexts: [{ phrases: phrases}],
    };

    this.request = {
      config : this.config,
      interimResults: true,
    };

    this.startStreamInternal();
  }
  
  startStreamInternal() {
    this.fd = fs.openSync("/tmp/audio", "w");
    log("gcloud: Starting recognize stream", this.streamId);

    this.recognizeStream = client
      .streamingRecognize(this.request)
      .on('error', err => {
        logErr('gcloud: API request error ', this.streamId, err);
        if (err.code === 11) {
          // restartStream();
        } else {
          logErr('gcloud: API request error ', this.streamId, err);
        }
      })
      .on('data', data => {
        if (data.results && data.results.length > 0
          && data.results[0].alternatives && data.results[0].alternatives.length > 0) {
          log("gcloud got data ", this.streamId, 
            "startTime:", this.startTime, "transcript:", data.results[0].alternatives[0].transcript);
          const r = data.results[0];
          r.startTime = this.restartTime + this.startTime;

          this.resultEndTime = +r.resultEndTime.seconds +  // Use unary + to convert to number
            Math.round(r.resultEndTime.nanos / 1_000_000) / 1000; // round to milliseconds
          r.endTime = this.restartTime + this.resutlEndTime;

          if (r.isFinal) {
            this.lastTranscriptWasFinal = true;
            this.finalEndTime = this.resultEndTime;
            this.startTime = this.resultEndTime;
            log("gcloud. setting startTime ", this.streamId, 
              "restartTime:", this.restartTime, "endTime:", this.endTime, "startTime:", this.startTime);
          } else {
            this.lastTranscriptWasFinal = false;
          }
          speechCallback(r)
        } else {
          logErr("gcloud got unexpecteddata ", data)
        }
        
      });
    
    // Restart stream when streamingLimit expires
    this.restartTimer = setTimeout(() => this.restartStreamInternal(), streamingLimit);
  }

  restartStreamInternal() {
    log("gcloud in restart", this.streamId, "restartCounter:", this.restartCounter);
    // The recognizeStream will not work any more after 5 minutes
    // so we need to close it
    if (this.recognizeStream) {
      this.recognizeStream.end();
      // some other results might come in after 5 mins are over, ignore them
      this.recognizeStream.removeAllListeners();
      this.recognizeStream = null;
    }

    //calculate how many bytes for which we don't have a final
    const finalSize = Math.floor(this.config.sampleRateHertz * this.finalEndTime);
    this.restartTime += this.finalEndTime;
    log("gcloud. restarting stream", this.streamId, 
      "restartTime:", this.restartTime, "finalEndTime:", this.finalEndTime, "finalSize:", finalSize,
      "audioInput.length:", this.audioInput.length, "audioInputSize:", this.audioInputSize);
    
      if (finalSize < this.audioInputSize) {
      // skip over finalSize and transfer the rest
      let size = 0, i = -1, lastSize = 0;
      while (size <= finalSize) {
        lastSize = size;
        size = size + this.audioInput[++i].length;
      }

      log("gcloud. restart carryover buffer", this.streamId,
        "audioInput.length:", this.audioInput.length, "audioInput.i:", i, 
        "finalSize:", finalSize,  "audioInputSize:", this.audioInputSize, 
        "size:", size, "lastSize:", lastSize);
      const newAudioInput = [];
      let newAudioInputSize = 0;
      // The i th block caused it to go over finalSize
      // copy the remaining part of the block and the rest of the blocks
      if (i < this.audioInput.length) {
        const chunk = this.audioInput[i];
        newAudioInput.push(chunk.slice(finalSize - lastSize, 
          Math.min(chunk.length, this.audioInputSize - lastSize)));
        newAudioInputSize = newAudioInput[0].length;
      }
      i++; // now copy from this block onwards
      for(; i < this.audioInput.length ; i++) {
        newAudioInput.push(this.audioInput[i]);
        newAudioInputSize += this.audioInput[i].length;
      }

      this.audioInput = newAudioInput;
      this.audioInputSize = newAudioInputSize;
    }
    fs.closeSync(this.fd);

    this.restartCounter ++;

    this.newStream = true;
    // Call start - which will set a timer again
    this.startStreamInternal();
  }

  endStream() {
    // Clear out the restartTimer, so that it doesn't get triggered
    // when the stream has ended
    if (this.restartTimer) {
      log("gcloud: clearing restart timer", this.streamId);
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
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

  write(chunk) {

    // Did we just open up a new stream, after running into the 5 minute timeout?
    // and there is some pending audio ?
    if (this.newStream && this.audioInput.length !== 0) {
      log("gcloud: onrestart stream writing buffer", this.streamId, 
      "length:", this.audioInputSize); 
      for(const chunk1 of this.audioInput) {
        fs.writeSync(this.fd, chunk1);
        this.recognizeStream.write(chunk1);
  
      }
      this.newStream = false;
    } else {

    }

    // save the chunk, into audioInput, because we might have to repeat it 
    // when we restart the stream
    this.audioInput.push(chunk);
    this.audioInputSize += chunk.length;

    if (this.recognizeStream) {
      //log("gcloud: writing buffer", this.streamId,
      //  "length:", chunk.length)
      fs.writeSync(this.fd, chunk);
      this.recognizeStream.write(chunk);
    }
    //if (this.isOpen) {
    //} else {
    //  this.pendingBuf.push(message);
    //  log("gcloud: pending write buffer of size ", message.length);
    //}
  }
  
}


module.exports = {
  Stream:Stream
};
