import React from 'react';
import { Button, Image, Navbar, Nav, Form} from 'react-bootstrap';
import './App.css';
import { BrowserRouter as Router, Route, NavLink } from "react-router-dom";
import Conversation from './Conversation'
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
      clients: new Map(),
      icons: new Map(),
      results: new Map(),
      streamId: 0,
      provider: 'gcloud', // can be 'aws' also
      
      ws: null,

      idToken: null,
      profile: {},
    };
  }


  setResult(result) {
    const results = new Map(this.state.results); // clone the results
    const key = "" + result.clientId + "_" + result.streamId + "_" + result.restartCounter;
    // If we are about to insert a new result, delete the oldest, if we have exceeded max size
    if (!results.has(key) && results.size > 1000) {
      const firstKey = results.values().next;
      results.delete(firstKey);
    }

    const resultMap = results.has(key) ? new Map(results.get(key)) : new Map();
    results.set(key, resultMap);

    resultMap.set(result.startTime, result);
    console.log("setResult", result);
    this.setState({results});
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
  
          return {clientId: cmd.clientId, clients: clients, icons:icons}
        });
      }
  
      // Is the message about the transcription of one client ?
      else if (cmd.oper === "result") {
        if (cmd.provider === "aws") {
          // aws's return object is very similar to aws, but it uses capital Alternatives, and capital Transscript
          // change them to lowercase
          cmd.result.alternatives = cmd.result.Alternatives;
          cmd.result.alternatives.forEach(alt => {
            alt.transcript = alt.Transcript;
          })
          this.setResult({clientId: cmd.clientId, streamId: cmd.streamId, 
            startTime:cmd.result.StartTime,
            result: cmd.result, isFinal:!cmd.result.IsPartial});
        } else {
          this.setResult({clientId: cmd.clientId, streamId: cmd.streamId, 
            startTime:cmd.result.startTime,
            result: cmd.result, isFinal:cmd.result.isFinal});
        }
       
      }
      else if (cmd.oper === "pong") {
        console.log("Got pong reply from server");
      }
    };

    // Set a timer for 20 seconds, so that websocket doesn't get disconnected
    window.setInterval(() => {
      ws.send(JSON.stringify({oper:"ping"}));
      console.log("Sending ping");
    }, 20000);
    
   
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

  startSpeech() {
    this.chunkIndex = 0;
    const streamId = this.state.streamId + 1;
    const cmd = {oper:"start", streamId, provider:this.state.provider};
    if (this.state.ws) {
      this.state.ws.send(JSON.stringify(cmd));
      
      this.skippedBuffers.forEach(buf => {
        console.log("sending (lastBuffer) data " , this.chunkIndex++);
        this.state.ws.send(buf);
      });
      // clear out the skipped buffers
      this.skippedBuffers = [];

    }
    this.isSpeaking = true;
    this.setState({isSpeaking: true, streamId});
  }

  stopSpeech() {
    if (!this.isSpeaking) {
      // already stopped
      return;
    }
    this.isSpeaking = false;
    // tell the backend we are ending, then close the connection
    const cmd = {oper:"end", streamId:this.state.streamId};
    if (this.state.ws) {
      this.state.ws.send(JSON.stringify(cmd));
    }
    // Set Speaking to false, and increment streamId
    this.setState(state => ({isSpeaking: false}));

  }

  // https://github.com/muaz-khan/WebRTC-Experiment/blob/master/hark/hark.js
  // https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js#L128-L205
  // https://www.twilio.com/blog/audio-visualisation-web-audio-api--react

  // Recording to analyser node
  startRec3() {
    this.audioCtx = new AudioContext({sampleRate: 16000});
    this.skippedBuffers = [];
    this.chunkIndex = 0;

    this.scriptProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);

    console.log("selectedDevice", this.state.selectedDevice);
    navigator.mediaDevices.getUserMedia({ audio:{ deviceId:this.state.selectedDevice} })
    .then(stream => {
      this.stream = stream;
      //console.log("Number of tracks", stream.getTracks().length);
      // create a source from the selected microphone
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
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

      this.harker = new Harker(this.audioCtx, this.source, this.stream, {});
      this.harker.on("speaking", () => this.startSpeech());
      this.harker.on("stopped_speaking", () => this.stopSpeech());

      this.setState({
        audioCtx: this.audioCtx,
        stream : this.stream,
        harker:this.harker,
        isRecording:true});

      // If focus shifts away from the window, then stop recording
      window.onblur = (e) => this.stopRec3();
    }); 
  }

  stopRec3() {
    // tell the backend to stop speech recognition
    this.stopSpeech();

    // Stop the harker
    this.state.harker.stop();

    // Disconnect scriptProcessor
    this.source.disconnect(this.scriptProcessor);
    this.scriptProcessor.disconnect(this.audioCtx.destination);

    this.audioCtx.close();

    // tell the microphone device to stop
    this.state.stream.getTracks().forEach(track => track.stop());

    this.setState({isRecording:false});

    // remove the global onblur handler
    window.onblur = undefined;
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
    console.log("Signed in", user);
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

  onSignInFailure(error) {
    console.err("Sign in failure");
    console.err(error);
  }

  componentDidMount() {
    console.log("rendering button here ");
    
    window.gapi.load('auth2', () => {
      window.gapi.auth2.init({
        client_id: '480181438061-hs781145qtaelkqmpvopfl68ovfuinsc.apps.googleusercontent.com',
        cookiepolicy: 'single_host_origin',
      })
      .then((auth2) => {
        console.log("Finished initializing auth2. SignedIn=", auth2.isSignedIn.get());

        auth2.isSignedIn.listen((st) => {
            console.log("Listener called with ", st);
        });
        window.gapi.signin2.render('my-signin2', {
          'scope': 'profile email',
          'width': 200,
          'height': 50,
          'theme': 'dark',
          'onsuccess': this.onSignIn.bind(this),
          'onfailure': this.onSignInFailure.bind(this),
        });
    
      }, (error) => {
        console.log("Error in initializing auth2", error)
      })
    })
    
    navigator.mediaDevices.enumerateDevices().then(allDevices =>
      this.setState({devices: allDevices.filter(d => d.kind === "audioinput")})
    );

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
   
  }

  render() {
    if (!this.state.idToken) {
      console.log("idToken not found, rendering signin button");
      return <div id="my-signin2"/>;
    }
    const deviceOptions = this.state.devices
      .map(device => <option value={device.id}>{device.label} </option>);
    return (
    <Router>
      <Navbar bg="dark" variant="dark">
        <Nav className="mr-auto">
          <NavLink exact className="nav-link" to="/">Conversation</NavLink>
       </Nav>
        
        <Form inline>
         <Form.Control as="select" value={this.state.provider} 
            onChange={e => this.setState({provider: e.target.value})}>
            <option>gcloud</option>
            <option>aws</option>
          </Form.Control>
          <Form.Control className="ml-3" as="select" value={this.state.selectedDevice} 
            onChange={e => this.setState({selectedDevice: e.target.value})}>
            {deviceOptions}
          </Form.Control>
          <Button className="ml-3"
            variant={this.state.isRecording ? "danger" : "success"}
            onClick={this.state.isRecording ? this.stopRec3.bind(this) : this.startRec3.bind(this)}
          >
            <span className={this.state.isSpeaking ? "spinner-grow spinner-grow-sm" : ""} role="status" aria-hidden="true"/>

            {this.state.isRecording ? "Stop" : "Start"}

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
