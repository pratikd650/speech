// https://dev.to/loujaybee/using-create-react-app-with-express

require('@google-cloud/debug-agent').start();

const express = require('express');
const bodyParser = require('body-parser')
const path = require('path');
const app = express();
const http = require('http')
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });
const url = require('url');
const speech = require('./speechStream.js');
const process = require('process');
const {OAuth2Client} = require('google-auth-library');

const CLIENT_ID = "480181438061-hthmagt8t2cn56l8d08ek4e33njo9h5k.apps.googleusercontent.com";
const oauthClient = new OAuth2Client(CLIENT_ID);

//process.env.GOOGLE_APPLICATION_CREDENTIALS = "Speech-8dd6e8fb8a6d.json";

const server = http.createServer(app);

server.on('upgrade', function upgrade(request, socket, head) {

  const pathname = url.parse(request.url).pathname;
  const token = url.parse(request.url, true).query['id_token'];

  if (!token) {
    socket.destroy();
    return;
  }

  oauthClient.verifyIdToken({
    idToken: token,
    audience: CLIENT_ID,
  })
  .then(ticket => {
    const payload = ticket.getPayload();
    const userid = payload['sub'];
    console.log("userid", userid, "name", payload['name'], "email", payload["email"]);

    if (pathname === '/audioBlob') {
      wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }

  });

});


wss.on('connection', (ws,req) => {
  // Create a speech stream for this client
  ws.speechStream = new speech.Stream(ws);

  ws.on('message', message => {
    if (typeof(message) === 'string') {
      const cmd  = JSON.parse(message);
      console.log('recieved cmd', cmd);
      // start 
      if (cmd.oper === "start") {
        ws.speechStream.startStream()
      }
      else if (cmd.oper === "end") {
        // end the stream, wait for 3s
        ws.speechStream.endStream();
      }
    }
    else {
      // fs.writeFileSync("/tmp/message.webm", message);
      //console.log('received', message, typeof(message),'length=',  message.length);
      //ws.send("received message length=" + message.length );
      // pass on the the data buffer to the speech recognizer
      ws.speechStream.write(message);
    }
  });
});

app.use(express.static(path.join(__dirname, 'build')));

app.get('/ping', function (req, res) {
 return res.send('pong');
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

server.listen(process.env.PORT || 8080);
