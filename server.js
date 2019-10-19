// https://dev.to/loujaybee/using-create-react-app-with-express

const express = require('express');
const bodyParser = require('body-parser')
const path = require('path');
const app = express();
const http = require('http')
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true , clientTracking:true});
const url = require('url');
const speech = require('./speechStream.js');
const process = require('process');
const moment = require("moment");

const {OAuth2Client} = require('google-auth-library');
const {Datastore} = require('@google-cloud/datastore');

// Instantiate a datastore client
const datastore = new Datastore();

const phraseKey = datastore.key(["Phrase", "Home"]);
let phrases;

// Get the phrases from the data store
datastore.get(phraseKey, (err, entity) => {
  if (err) {
    // Error handling omitted.
    console.error(err);
  }
  phrases = entity.Value;
});

const CLIENT_ID = "480181438061-hthmagt8t2cn56l8d08ek4e33njo9h5k.apps.googleusercontent.com";
const oauthClient = new OAuth2Client(CLIENT_ID);

//process.env.GOOGLE_APPLICATION_CREDENTIALS = "Speech-8dd6e8fb8a6d.json";

const server = http.createServer(app);

function log(level, ...args) {
  if (level === "INFO") {
    console.log(moment().format("DD/MM/YY hh:mm:ss:SSS a"), ...args);
  } else {
    console.error(moment().format("DD/MM/YY hh:mm:ss:SSS a"),  ...args);
  }
}



server.on('upgrade', function upgrade(request, socket, head) {

  const pathname = url.parse(request.url).pathname;

  if (pathname === '/audioBlob') {
    const token = url.parse(request.url, true).query['id_token'];

    if (!token) {
      log("ERROR", "Incoming websocket connection without id_token", request.headers);
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
      log("INFO", "userid", userid, "name", payload['name'], "email", payload["email"]);

      wss.handleUpgrade(request, socket, head, function done(ws) {
        ws.my_openIdToken = payload;
        ws.my_userName = payload['name'].split(" ")[0];
        wss.emit('connection', ws, request);
      });

    });

  } else {
    log("ERROR", "Incoming websocket connection with unknown pathName", request.url);
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

let currClientId = 1;

wss.on('connection', (ws,req) => {
  // Create a speech stream for this client
  // Store this as a vriable inside the websocket object
  ws.my_clientId  = currClientId++;
  ws.my_speechStream = new speech.Stream(ws, wss);
  ws.my_log = (level, ...args) => log(level, ws.my_userName, ws.my_clientId, ...args);

  ws.my_log("INFO", "Connection created");
  // since there is a new client, broadcast the list of clients to all clients
  sendConnectedClients();
  // send the list of phrases
  ws.send(JSON.stringify({oper: "phrases", phrases: phrases}));

  ws.on("open", () => {
    ws.my_log("INFO", "Connection open");
    // New client connected
    // broadcast the current list of clients to all clients
  });
  ws.on("close", () => {
    ws.my_log("INFO", "Connection closed");
    // Client Disconnected
    // broadcast the current list of clients to all clients
    sendConnectedClients();
  });
  ws.on('message', message => {
    if (typeof(message) === 'string') {
      const cmd  = JSON.parse(message);
      ws.my_log("INFO", 'recieved cmd', cmd);
      // start 
      if (cmd.oper === "start") {
        ws.my_speechStream.startStream(false, phrases, ws)
      }
      else if (cmd.oper === "end") {
        // end the stream, will not immediately end but wait for some time
        ws.my_speechStream.endStream();
      }
      else if (cmd.oper === "updatePhrases") {
        phrases = cmd.phrases;
        datastore.update({key: phraseKey, data: {Value :phrases}}, (err, entity) => {
          if (err) {
            console.error(err);
            return;
          }
          // broadcast updated phrases to everyone except this client
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({oper: "phrases", phrases: phrases}))
            }
          });
        });
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

module.exports = {
  log:log
};