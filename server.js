// https://dev.to/loujaybee/using-create-react-app-with-express

const express = require('express');
const bodyParser = require('body-parser')
const path = require('path');
const app = express();
const http = require('http')
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true , clientTracking:true});
const url = require('url');
const process = require('process');
const log = require('./util.js').log;
const logErr = require('./util.js').logErr;

const {OAuth2Client} = require('google-auth-library');



//const CLIENT_ID = "480181438061-hthmagt8t2cn56l8d08ek4e33njo9h5k.apps.googleusercontent.com";
const CLIENT_ID = "480181438061-hs781145qtaelkqmpvopfl68ovfuinsc.apps.googleusercontent.com";
const oauthClient = new OAuth2Client(CLIENT_ID);

const providers = {
  'gcloud' : require('./speechStream.js'),
  'aws' : require('./awsStream.js'),
}
//process.env.GOOGLE_APPLICATION_CREDENTIALS = "Speech-8dd6e8fb8a6d.json";

const server = http.createServer(app);



server.on('upgrade', function upgrade(request, socket, head) {

  const pathname = url.parse(request.url).pathname;

  if (pathname === '/audioBlob') {
    const token = url.parse(request.url, true).query['id_token'];

    if (!token) {
      log("Incoming websocket connection without id_token", request.headers);
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
      log("userid", userid, "name", payload['name'], "email", payload["email"]);

      wss.handleUpgrade(request, socket, head, function done(ws) {
        ws.my_openIdToken = payload;
        ws.my_userName = payload['name'].split(" ")[0];
        wss.emit('connection', ws, request);
      });

    });

  } else {
    logErr("Incoming websocket connection with unknown pathName", request.url);
    socket.destroy();
  }


});


// broadcast list of active clients
function sendConnectedClients() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const cmd = {
        oper:"clients",
        clientId: client.my_clientId,
        clients: Array.from(wss.clients)
          .filter(client1 => client1.readyState === WebSocket.OPEN)
          .map(client1 => ({
            clientId: client1.my_clientId,
            openIdToken: client1.my_openIdToken
          })),
      };
      client.send(JSON.stringify(cmd));
    }
  });
}

function sendTranscript(cmd) {
  // Send trasncription data to all clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(cmd));
    }
  });
}

let currClientId = 1;

wss.on('connection', (ws,req) => {
  // Create a speech stream for this client
  // Store this as a vriable inside the websocket object
  ws.my_clientId  = currClientId++;
  ws.my_log = (level, ...args) => log(ws.my_userName, ws.my_clientId, ...args);

  ws.my_log("Connection created");
  // since there is a new client, broadcast the list of clients to all clients
  sendConnectedClients();
  
  ws.on("open", () => {
    ws.my_log("Connection open");
    // New client connected
    // broadcast the current list of clients to all clients
  });
  ws.on("close", () => {
    ws.my_log("Connection closed");
    // Client Disconnected
    // broadcast the current list of clients to all clients
    sendConnectedClients();
  });
  ws.on('message', message => {
    if (typeof(message) === 'string') {
      const cmd  = JSON.parse(message);
      ws.my_log('recieved cmd', cmd);
      // start 
      if (cmd.oper === "start") {
        // Get the provider  gcloud or aws
        const provider = providers[cmd.provider];
        // create the callback function, which will be used to send transcription back
        speechCallback = function(data)  {
          const ret = { oper:"result", clientId: ws.my_clientId, 
            streamId: cmd.streamId, result: data, provider: cmd.provider
          };
          sendTranscript(ret);
        };
        ws.my_speechStream =  new provider.Stream(speechCallback, ws.my_clientId, cmd.streamId);
      }
      else if (cmd.oper === "end") {
        // end the stream, will not immediately end but wait for some time
        ws.my_speechStream.endStream(cmd.streamId);
      }
      else if (cmd.oper === "ping") {
        // periodic ping message from server
        ws.send(JSON.stringify({oper: "pong"}));
      }
    }
    else {
      // fs.writeFileSync("/tmp/message.webm", message);
      //console.log('received', message, typeof(message),'length=',  message.length);
      //ws.send("received message length=" + message.length );
      // pass on the the data buffer to the speech recognizer
      ws.my_speechStream.write(message);
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

