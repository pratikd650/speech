import React from 'react';
import Button from 'react-bootstrap/Button';
import './App.css';

// https://medium.com/@bryanjenningz/how-to-record-and-play-audio-in-javascript-faa1b2b3e49b
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API
// https://medium.com/jeremy-gottfrieds-tech-blog/javascript-tutorial-record-audio-and-encode-it-to-mp3-2eedcd466e78
// https://github.com/gridcellcoder/cloud-speech-and-vision-demos/blob/master/src/app/services/gcloud-speech/gcloud-speech.service.ts
// https://github.com/muaz-khan/RecordRTC/blob/06c3d158a0b6dfc4b12679b951a43c4d80f180aa/dev/StereoAudioRecorder.js


class App extends React.Component {
  constructor(props) {
    super(props);

    const loc = window.location;
    //const wsUrl = (loc.protocol === "https:" ? "wss:" : "ws:")
    //  + "//" + loc.host + "/audioBlob"
    const wsUrl = "ws://localhost:8080/audioBlob";

    console.log(wsUrl);
    this.state = {
      isRecording: false,
      audioChunks:[],
      socket: new WebSocket(wsUrl),
    };
    console.log("socket readyState", this.state.socket.readyState);
    this.dataAvailable = this.dataAvailable.bind(this);
    this.textDataAvailable = this.textDataAvailable.bind(this);
    this.startRec = this.startRec.bind(this);
    this.stopRec = this.stopRec.bind(this);

    this.startRec2 = this.startRec2.bind(this);
    this.stopRec2 = this.stopRec2.bind(this);
    this.dataAvailable2 = this.dataAvailable2.bind(this);

    this.state.socket.addEventListener('message', this.textDataAvailable);
  }

  textDataAvailable(event) {
      console.log('Message from server ', event.data);
  }

  dataAvailable(event) {
    console.log("dataAvailable", event.data);
    this.setState(state => ({
      audioChunks: [...state.audioChunks, event.data]
    }));
  }

  dataAvailable2(data) {
    console.log("dataAvailable", data);
    this.setState(state => ({
      audioChunks: [...state.audioChunks, data]
    }));
  }

  startRec2() {

      const s = window.Recorder.isRecordingSupported();
      console.log("Supported ", s);
      const mediaRecorder = new window.Recorder({
        numberOfChannels:1,
        bitRate:16000,
        encoderSampleRate:16000,
        originalSampleRateOverride:16000,
        encoderPath: "/opus-recorder/dist/encoderWorker.min.js",
        //streamPages: true,

      })
      console.log("mediaRecorder", mediaRecorder);

      mediaRecorder.start();
      mediaRecorder.ondataavailable = this.dataAvailable2;
      mediaRecorder.onstart = () => {
        console.log("Recording is started");
      }
      mediaRecorder.onstop = () => {
        console.log("Recording is stopped");
      }
      mediaRecorder.onstreamerror = (e) => {
        console.err("Err encountered", e);
      }
      //mediaRecorder.ondataavailable = (typedArray) => {
      //  console.log("ondataavailable", typedArray);
      //}
      this.setState({mediaRecorder, audioChunks:[], isRecording:true});
  }

  startRec() {
    // sampling Rate doesn't work when using audio/webm; codecs=opus
    //const audioCtx = new AudioContext({sampleRate: 16000});
    navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      //const source = audioCtx.createMediaStreamSource(stream);
      //const dest = audioCtx.createMediaStreamDestination();
      //source.connect(dest);

      console.log("stream.tracks", stream.getTracks());
      // Chrome only supports audio/webm  with codecs=opus or codecs=pcm
      // Firefox suppors  audio/webm and audio/ogg
      // See https://stackoverflow.com/questions/41739837/all-mime-types-supported-by-mediarecorder-in-firefox-and-chrome
      //const mediaRecorder = new MediaRecorder(stream, {mimeType:"audio/webm; codecs=pcm" });
      //const mediaRecorder = new MediaRecorder(dest.stream, {mimeType:"audio/webm; codecs=opus" });
      const mediaRecorder = new MediaRecorder(stream, {mimeType:"audio/webm; codecs=opus" });

      // use timeSlice of 100ms
      //mediaRecorder.start(100);
      mediaRecorder.start();
      this.setState({mediaRecorder, stream, audioChunks:[], isRecording:true});

      mediaRecorder.addEventListener("dataavailable", this.dataAvailable);
    }); 
  }

  stopRec2() {
    this.state.mediaRecorder.stop();
    this.setState({isRecording:false});
    setTimeout(() => {
      // Blob constructor doesn't do any encoding, does it?
      //const blob = new Blob(this.state.audioChunks, { type : 'audio/ogg; codecs=opus' });
     //const blob = new Blob(this.state.audioChunks, { type : 'audio/mpeg-3' });
     console.log("audioChunks", this.state.audioChunks);
     const blob = new Blob(this.state.audioChunks, { type : 'audio/webm' });
     console.log("sending to backend", blob);
     this.state.socket.send(blob);
    }, 10);
  }

  stopRec() {
    this.state.mediaRecorder.stop();
    this.state.stream.getTracks().forEach(track => track.stop());
    this.setState({isRecording:false});
    // Wait for a little bit before sending the data
    setTimeout(() => {
      // Blob constructor doesn't do any encoding, does it?
      //const blob = new Blob(this.state.audioChunks, { type : 'audio/ogg; codecs=opus' });
     //const blob = new Blob(this.state.audioChunks, { type : 'audio/mpeg-3' });
     console.log("audioChunks", this.state.audioChunks);
     const blob = new Blob(this.state.audioChunks, { type : 'audio/webm' });
     console.log("sending to backend", blob);
     this.state.socket.send(blob);
    }, 10);
  }

  render() {
    return ( 
      <div>
      <h2>Speech Recording</h2>
      <Button
        variant="primary"
        disabled={this.state.isRecording}
        onClick={this.startRec2}
      >
        Record
      </Button>
      <Button
        variant="primary"
        disabled={!this.state.isRecording}
        onClick={this.stopRec2}
      >
        Stop
      </Button>
      </div>
    );
  }
}

export default App;
