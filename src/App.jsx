import React from 'react';
import { Button, Image, Navbar, Nav, Form} from 'react-bootstrap';
import './App.css';
import { BrowserRouter as Router, Route, NavLink } from "react-router-dom";
import MicSettings from './MicSettings'
import Conversation from './Conversation'
import SpeechSettings from './SpeechSettings'
import Harker from './Harker'

// https://medium.com/@bryanjenningz/how-to-record-and-play-audio-in-javascript-faa1b2b3e49b
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API
// https://medium.com/jeremy-gottfrieds-tech-blog/javascript-tutorial-record-audio-and-encode-it-to-mp3-2eedcd466e78
// https://github.com/gridcellcoder/cloud-speech-and-vision-demos/blob/master/src/app/services/gcloud-speech/gcloud-speech.service.ts
// https://github.com/muaz-khan/RecordRTC/blob/06c3d158a0b6dfc4b12679b951a43c4d80f180aa/dev/StereoAudioRecorder.js


class App extends React.Component {

  constructor(props) {
    super(props);

    const loc = window.location;
    console.log(loc.host);
    const wsUrl = loc.host === "localhost:3000" ? "ws://localhost:8080/audioBlob" : "wss://" + loc.host + "/audioBlob";
    console.log("wsUrl", wsUrl);

    this.state = {
      wsUrl: wsUrl,
      isRecording: false,
      isSpeaking: false,
      devices:[],
      selectedDevice: "default",
      audioChunks:[],
      results:[],
      clients: new Map(),
      icons: new Map(),
      interim: new Map(),

      useOpus: false,
      ws: null,
      phrases:[],
      phrasesChanged: false,

      idToken: null,
      profile: {},

      fftSize: 32,
      minDecibels: -50,
      maxDecibels: -30,
      smoothingTimeConstant: 0.85,

    };
    this.dataAvailable = this.dataAvailable.bind(this);
    this.textDataAvailable = this.textDataAvailable.bind(this);
    this.startRec = this.startRec.bind(this);
    this.stopRec = this.stopRec.bind(this);

    this.startRec2 = this.startRec2.bind(this);
    this.stopRec2 = this.stopRec2.bind(this);
    this.dataAvailable2 = this.dataAvailable2.bind(this);

    this.micSettings = React.createRef();
  }

  wsConnect() {
    const ws = new WebSocket(this.state.wsUrl + "?id_token=" + this.state.idToken);
    ws.onopen = ev => {
      this.setState({ws: ws});
    };
    ws.onclose = ev => {
      console.log("Server closed connection");
      this.setState({ws: null});

    };
    ws.onmessage = ev => {
      const cmd = JSON.parse(ev.data);
      console.log("onmessage", cmd);

      // Is the message about list of current connected clients
      if (cmd.oper === "clients") {
        this.clientId = cmd.clientId;
        console.log("clients", cmd.clients);

        this.setState(state => {
          const clients = new Map(state.clients);
          cmd.clients.forEach(client => clients.set(client.clientId, client.openIdToken));
          const icons = new Map();
          cmd.clients.forEach(client => icons.set(client.openIdToken.given_name, client.openIdToken.picture));
          console.log("client Map", clients);
          console.log("icons Map", icons);
          return {clientId: cmd.clientId, clients: clients, icons:icons}
        });
      }
      // Is the message about the phrases  ?
      else if (cmd.oper === "phrases") {
        this.setState({phrases: cmd.phrases ? cmd.phrases : []});
      }
      // Is the message about the transcription of one client ?
      else if (cmd.oper === "result") {
        const result = cmd.result;

        this.setState(state => {

          const interim = new Map(this.state.interim); // clone the interim
          const results = this.state.results.slice(); // clone the results

          // If we don't have a result entry for storing interim result create one
          if (!interim.has(cmd.clientId)) {
            interim.set(cmd.clientId, results.length);
            results.push({clientId: cmd.clientId});
          }

          // save the results whether it is interim or final into this array
          results[interim.get(cmd.clientId)] = {clientId: cmd.clientId, result: result.results[0]};

          // if this is a final result, clear out the interim index for this client
          // Is this an interim result
          if (result.results[0].isFinal) {
            interim.delete(cmd.clientId);
          }
          return { interim: interim, results: results };
        });

      }

     };
  }

  wsDisconnect() {
    if (this.state.ws) {
      this.state.ws.close();
      this.setState({ws: null});
    }
  }

  setProp(propName, value) {
    this.setState({[propName]: value});
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


  // recording with WebAudio  MediaRecorder
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
     this.state.ws.send(blob);
    }, 10);
  }

  // Recording with MediaRecorder opus-recorder which is webasm of libopus
  startRec2() {
      const s = window.Recorder.isRecordingSupported();
      console.log("Supported ", s);
      const mediaRecorder = new window.Recorder({
        numberOfChannels:1,
        encoderSampleRate:48000,
        originalSampleRateOverride:48000,
        encoderPath: "/opus-recorder/dist/encoderWorker.min.js",
        //streamPages: true,

      });
      console.log("mediaRecorder", mediaRecorder);

      mediaRecorder.start();
      mediaRecorder.ondataavailable = this.dataAvailable2;
      mediaRecorder.onstart = () => {
        console.log("Recording is started");
      };
      mediaRecorder.onstop = () => {
        console.log("Recording is stopped");
      };
      mediaRecorder.onstreamerror = (e) => {
        console.error("Err encountered", e);
      };
      //mediaRecorder.ondataavailable = (typedArray) => {
      //  console.log("ondataavailable", typedArray);
      //}
      this.setState({mediaRecorder, audioChunks:[], isRecording:true});
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
     this.state.ws.send(blob);
    }, 10);
  }

  startSpeech() {
    if (this.state.useOpus) {
      this.opusRecorder.start();
      this.opusRecorder.ondataavailable = (data) => {
        console.log("sending data " , data);
        if (this.state.ws) {
          this.state.ws.send(data);
        }
      };
      this.opusRecorder.onstart = () => {
        console.log("OpusRecording is started");
      };
      this.opusRecorder.onstop = () => {
        console.log("OpusRecording is stopped");
      };
      this.opusRecorder.onstreamerror = (e) => {
        console.log("OpusRecoding Err encountered", e);
      };
    }
    this.chunkIndex = 0;
    const cmd = {oper:"start", useOpus:this.state.useOpus};
    if (this.state.ws) {
      this.state.ws.send(JSON.stringify(cmd));
      if (!this.state.useOpus) {
        this.skippedBuffers.forEach(buf => {
          console.log("sending (lastBuffer) data " , this.chunkIndex++);
          this.state.ws.send(buf);
        });
        // clear out the skipped buffers
        this.skippedBuffers = [];
      }
    }
    this.isSpeaking = true;
    this.setState({isSpeaking: true});
  }

  stopSpeech() {
    this.isSpeaking = false;
    if (this.state.useOpus) {
      this.opusRecorder.stop();
    }
    // tell the backend we are ending, then close the connection
    const cmd = {oper:"end"};
    if (this.state.ws) {
      this.state.ws.send(JSON.stringify(cmd));
    }
    this.setState({isSpeaking: false});

  }

  // https://github.com/muaz-khan/WebRTC-Experiment/blob/master/hark/hark.js
  // https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js#L128-L205
  // https://www.twilio.com/blog/audio-visualisation-web-audio-api--react

  // Recording to analyser node
  startRec3() {
    this.audioCtx = new AudioContext({sampleRate: this.state.useOpus ? 48000 : 16000});
    //const audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = this.state.fftSize;
    this.analyser.minDecibels = this.state.minDecibels;
    this.analyser.maxDecibels = this.state.maxDecibels;
    this.analyser.smoothingTimeConstant = this.state.smoothingTimeConstant;

    this.skippedBuffers = [];

    this.chunkIndex = 0;

    // Create a line delay to give time to speech detection
    //this.lineDelay = audioCtx.createDelay(3);

    if (this.state.useOpus) {
      const s = window.Recorder.isRecordingSupported();
      console.log("Opus Supported ", s);

      this.opusRecorder = new window.Recorder({
        numberOfChannels:1,
        encoderPath: "/opus-recorder/dist/encoderWorker.min.js",
        streamPages: true,
        encoderSampleRate:48000,
        originalSampleRateOverride: 48000,
      });

    }
    else {
      this.scriptProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);

    }

    //console.log("selectedDevice", this.state.selectedDevice);
    navigator.mediaDevices.getUserMedia({ audio:{ deviceId:this.state.selectedDevice} })
    .then(stream => {
      this.stream = stream;
      //console.log("Number of tracks", stream.getTracks().length);
      // create a source from the selected microphone
      this.source = this.audioCtx.createMediaStreamSource(this.stream);

      // connect the source to the analyser and to the destination
      this.source.connect(this.analyser);

      if (this.state.useOpus) {
      } else {
        //source.connect(this.lineDelay);
        //this.lineDelay.connect(this.scriptProcessor)
        this.source.connect(this.scriptProcessor);

        this.scriptProcessor.connect(this.audioCtx.destination);
        this.scriptProcessor.onaudioprocess = (event) => {

          // we're only using one audio channel here...
          let leftChannel = event.inputBuffer.getChannelData(0);

          // Harker speech detection require is set to 50ms, so we need to buffer 100ms of speech.
          // at 16K sample rate, we need to keep 1600 samples ,
          // since we used a buffer size of 2048, just one additional buffer is fine
          const data = this.convertFloat32ToInt16(leftChannel);
          if (this.state.ws && this.isSpeaking) {
            console.log("sending data ", this.chunkIndex++);
            this.state.ws.send(data);
          } else {
            // Accumulate 8 buffers , each buffer is of size 2048, i.e. 2048/16000 of a second  i.e 128ms
            // so we keep last 1 second before voice detection.
            if (this.skippedBuffers.length > 8) {
              this.skippedBuffers.shift();
            }
            this.skippedBuffers.push(data);

          }
        };

      }

      this.harker = new Harker(this.audioCtx, this.source, this.stream, {});
      this.harker.on("speaking", () => this.startSpeech());
      this.harker.on("stopped_speaking", () => this.stopSpeech());


      // create MediaRecorder at the destination
      //const mediaRecorder = new MediaRecorder(stream, {mimeType:"audio/webm; codecs=pcm" });
      //const dest = audioCtx.createMediaStreamDestination();
      //source.connect(dest);
      //const mediaRecorder = new MediaRecorder(dest.stream);
      // use timeSlice of 100ms
      //mediaRecorder.start(100);
      //mediaRecorder.addEventListener("dataavailable", this.dataAvailable);

      //const cmd = {oper:"start", useOpus:this.state.useOpus};
      //this.wsConnect(cmd);

      // Start the canvasAnimation if the micSettings tab is active
      const comp = this.micSettings.current;
      if (comp) {
        comp.animReq =  window.requestAnimationFrame(comp.canvasDraw.bind(comp));
      }
      this.setState({
        audioCtx: this.audioCtx,
        stream : this.stream,
        analyser :this.analyser,
        harker:this.harker,
        isRecording:true});

    }); 
  }


  savePhrases() {
    this.state.ws.send(JSON.stringify({oper:"updatePhrases", phrases: this.state.phrases}))
  }

  stopRec3() {

    // Stop the harker
    this.state.harker.stop();

    // Disconnect analyser
    this.source.disconnect(this.analyser);

    // Disconnect scriptProcessor
    if (this.state.useOpus) {
    } else {
      this.source.disconnect(this.scriptProcessor);
      this.scriptProcessor.disconnect(this.audioCtx.destination);
    }
    this.audioCtx.close();

    // tell the microphone device to stop
    this.state.stream.getTracks().forEach(track => track.stop());
    window.clearInterval(this.state.interval);

    // tell the canvas animation to stop
    const comp = this.micSettings.current;
    console.log("comp", comp);
    if (comp && comp.animReq) {
      window.cancelAnimationFrame(comp.animReq);
    }
    this.setState({isRecording:false});
  }


  // Audio is  present in FLoat32 samples, need to convert to Int16 for backend
  convertFloat32ToInt16 (buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l >= 0) {
      buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
      l = l - 1;
    }
    return buf.buffer;
  }

  onSignIn(user) {
    const profile = user.getBasicProfile();
    this.setState({
      profile: {
        id : profile.getId(),
        name: profile.getName(),
        givenName: profile.getGivenName(),
        familyName: profile.getFamilyName(),
        imageUrl: profile.getImageUrl(),
        email: profile.getEmail()
      },
      idToken: user.getAuthResponse().id_token,
    }, () => {
      console.log('Signed in as ' + profile.getName());
      this.wsConnect();
    });
    // Note: we never call wsDisconnect
  }

  componentDidMount() {
    console.log("rendering button");

    /*
    window.gapi.load('auth2', function() {
      window.gapi.auth2.init({
        client_id: '480181438061-hthmagt8t2cn56l8d08ek4e33njo9h5k.apps.googleusercontent.com',
        scope: 'profile'
      })
      .then(() => {
          const auth2 = window.gapi.auth2.getAuthInstance();
          // Sign in the user if they are currently signed in.
          if (auth2.isSignedIn.get() === true) {
            auth2.signIn({prompt:"select_account"});
          }
          else {
            console.log("User is not signed in");
          }

      });

      */
    window.gapi.signin2.render('my-signin2', {
      'scope': 'profile email',
      'width': 200,
      'height': 50,
      'theme': 'dark',
      'onsuccess': this.onSignIn.bind(this)
    });

  }

  render() {
    if (!this.state.idToken) {
      return <div id="my-signin2"/>;
    }
    return (
    <Router>
      <Navbar bg="dark" variant="dark">
        <Nav className="mr-auto">
          <NavLink exact className="nav-link" to="/">Conversation</NavLink>
          <NavLink className="nav-link" to="/mic">Mic Settings</NavLink>
          <NavLink className="nav-link" to="/speech">Speech Settings</NavLink>
       </Nav>
        <Form inline>
          <Button
            variant={this.state.isRecording ? "danger" : "success"}
            onClick={this.state.isRecording ? this.stopRec3.bind(this) : this.startRec3.bind(this)}
          >
            <span className={this.state.isSpeaking ? "spinner-grow spinner-grow-sm" : ""} role="status" aria-hidden="true"/>

            {this.state.isRecording ? "Stop Recording" : "Start Recording"}

          </Button>
          <Image src={this.state.profile.imageUrl} roundedCircle className="ml-2" style={{height:"2.4rem"}}/>
        </Form>
      </Navbar>
      <Route path="/" exact render={routeProps => (
        <Conversation
          isRecording={this.state.isRecording}
          clients={this.state.clients}
          results={this.state.results}
        />
      )}/>
      <Route path="/mic/"  render={routeProps => (
        <MicSettings
          ref={this.micSettings}
          analyser={this.state.analyser}
          isRecording={this.state.isRecording}
          selectedDevice={this.state.selectedDevice}
          fftSize={this.state.fftSize}
          minDecibels={this.state.minDecibels}
          maxDecibels={this.state.maxDecibels}
          smoothingTimeConstant={this.state.smoothingTimeConstant}
          setProp={this.setProp.bind(this)}
        />
      )}/>
      <Route path="/speech/" render={routeProps => (
        <SpeechSettings
          phrases={this.state.phrases}
          phrasesChanged={this.state.phrasesChanged}
          updatePhrases={phrases => this.setState({phrases: phrases, phrasesChanged: true})}
          savePhrases={() => {
            this.savePhrases();
            this.setState({phrasesChanged: false})
          }}
        />
      )}/>
      <div className="bg-dark">
        <span className="text-white">
          Connected:
        </span>
        {Array.from(this.state.icons).map(([name, icon]) =>
            <Image src={icon} roundedCircle className="ml-2" style={{height:"2.4rem"}}/>
        )}
      </div>
    </Router>
    );
  }
}

export default App;
