// https://dev.to/loujaybee/using-create-react-app-with-express

const express = require('express');
const bodyParser = require('body-parser')
const path = require('path');
const app = express();
const http = require('http')
const server = http.createServer();
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });
const url = require('url');
const fs = require('fs');


server.on('upgrade', function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  if (pathname === '/audioBlob') {
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    fs.writeFileSync("/tmp/message.webm", message);
    console.log('received', message.length);
    ws.send("received message length=" + message.length );
  });

  ws.send('connected');
});

app.use(express.static(path.join(__dirname, 'build')));

app.get('/ping', function (req, res) {
 return res.send('pong');
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

server.listen(process.env.PORT || 8080);
