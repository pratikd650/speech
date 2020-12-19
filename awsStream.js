const dateformat = require("dateformat");
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const CRC32 = require('crc-32');
const log = require('./util.js').log;
const logErr = require('./util.js').logErr;

const keys = fs.readFileSync(path.resolve(__dirname, 'speech_accessKeys.csv'), {encoding: 'utf8'});
const [accessKeyId , accessKey] = keys.trim().split(",");

const msgHeaders = {
  ':content-type': 'application/octet-stream',
  ':event-type': 'AudioEvent',
  ':message-type': 'event'
};

function sha256(str) {
  const hasher = crypto.createHash('sha256');  
  hasher.update(str); // treat str as utf8
  return hasher.digest('hex'); // return a hex string 
}

function hmacsha256(data, key) {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data); // return a buffer
  return hmac.digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmacsha256(dateStamp, "AWS4" + key);
  const kRegion = hmacsha256(regionName, kDate);
  const kService = hmacsha256(serviceName, kRegion);
  const kSigning = hmacsha256("aws4_request", kService);
  return kSigning;
}


class AWSTranscribeStream {

  constructor(speechCallback, clientId, streamId) {
    this.aws_ws = null; // the websocket to communicate with aws
    this.clientId = clientId;
    this.streamId = streamId;

    this.isOpen = false;
    this.pendingBuf = [];

    log("aws: Starting recognize stream", streamId);
    const now = new Date();

    const amz_date = dateformat(now, "UTC:yyyymmdd'T'HHMMss'Z'");
    const algorithm = "AWS4-HMAC-SHA256";
    const datestamp = dateformat(now, "UTC:yyyymmdd");
    const method = "GET";
    const service = "transcribe";
    const region = "us-east-2";
    const credential_scope = datestamp + "/" + region + "/" + service + "/" + "aws4_request"
    const host = "transcribestreaming.us-east-2.amazonaws.com:8443";
    const endpoint = "wss://transcribestreaming.us-east-2.amazonaws.com:8443";

    const canonical_uri = "/stream-transcription-websocket";
    const canonical_headers = "host:" + host + "\n";
    const signed_headers = "host" ;

    // canonical_querystring needs to be sorted by parameter name
    const canonical_querystring 
      = "X-Amz-Algorithm=" +      encodeURIComponent(algorithm)
      + "&X-Amz-Credential="+     encodeURIComponent(accessKeyId + "/" + credential_scope)
      + "&X-Amz-Date=" +          encodeURIComponent(amz_date)
      + "&X-Amz-Expires=" +       encodeURIComponent('300')
      + "&X-Amz-SignedHeaders=" + encodeURIComponent(signed_headers)
      + "&language-code=" +       encodeURIComponent('en-US')
      + "&media-encoding=" +      encodeURIComponent('pcm') 
      + "&sample-rate=" +         encodeURIComponent('16000');
      
    // For a GET request, the payload is an empty string.
    const payload_hash = sha256("");

    const canonical_request = method + '\n' 
      + canonical_uri + '\n' 
      + canonical_querystring + '\n' 
      + canonical_headers + '\n' 
      + signed_headers + '\n' 
      + payload_hash;
  
    log("aws canonical_request", streamId, canonical_request);  
    const string_to_sign=algorithm + "\n"
      + amz_date + "\n"
      + credential_scope + "\n"
      + sha256(canonical_request);

    log('aws string_to_sign', streamId, string_to_sign);

    //Create the signing key
    const signing_key = getSignatureKey(accessKey, datestamp, region, service);
                    
    //Sign the string_to_sign using the signing key
    const hmac = crypto.createHmac('sha256', signing_key);
    hmac.update(string_to_sign); // return a buffer
    const signature = hmac.digest('hex');
    
    const queryString = canonical_querystring
      + "&X-Amz-Signature=" + signature;
    const request_url = endpoint   
      + canonical_uri + "?" + queryString;
   
    log("aws request_url", streamId, request_url);
    this.aws_ws = new WebSocket(request_url);

    this.aws_ws.on('open', () => {
      log("aws web socket opened", streamId);
      // If there any pending buffers send them
      if (this.pendingBuf.length > 0) {
        const buf = Buffer.concat(this.pendingBuf);
        // need to break up the pendingBuf to max allowed size
        const maxBuf = 16384;
        for(let i = 0; i < buf.length/maxBuf; i++) {
          const message =  buf.slice(i*maxBuf, (i+1)*maxBuf);
          if (message.length > 0) {
            log("sending pending buffer size ", streamId, message.length);
            this.aws_ws.send(this.encode(msgHeaders, message));
          }
        }
        this.pendingBuf.length = 0; // clear it out
      }
      this.isOpen = true;
    }); 

    this.aws_ws.on('close', () => {
      log("aws web socket closed", streamId);
    }); 

    this.aws_ws.on('error', data => {
      log("aws web socket error", streamId, data);
    }); 

    this.aws_ws.on('message', data => {
      const res = this.decode(data);
      if (res.headers[':event-type'] === 'TranscriptEvent') {
        const t = res.payload.Transcript;
        if (t.Results.length > 0) {
          const r = t.Results[0];
          log("aws Transcript", streamId, 'IsPartial='+r.IsPartial, r.Alternatives[0].Transcript);
          speechCallback(t.Results[0]);
        }
        
      }
      else {
        log("aws web socket got message", streamId, res);
      }
    });

  }

  uint16Buf(value) {
    const buf = Buffer.allocUnsafe(2);
    buf.writeInt16BE(value);
    return buf;
  }
  
  uint32Buf(value) {
    const buf = Buffer.allocUnsafe(4);
    buf.writeInt32BE(value);
    return buf;
  }

  encode(headers, payload) {
    const headerBufs = Object.entries(headers)
      .map(hd => [Buffer.from(hd[0]), Buffer.from(hd[1])])
      .map(bufs => Buffer.concat([
        new Uint8Array([bufs[0].length]), // Header Name Byte Length
        bufs[0],                          // Header Name (String)
        new Uint8Array([7]),              // Header Value Type
        this.uint16Buf(bufs[1].length),        // Value String Byte Length (2 bytes big-endian)
        bufs[1]                           // Value String (UTF-8)
      ]));
    const header = Buffer.concat(headerBufs);

    const totalBytes =   this.uint32Buf(16 + header.length + payload.length);
    const headerLength = this.uint32Buf(header.length);
    const prelude =      Buffer.concat([totalBytes, headerLength]);
    const preludeCrc =   this.uint32Buf(CRC32.buf(prelude));
    const preludeAndData = Buffer.concat([prelude,preludeCrc, header, payload]);
    const messageCrc =   this.uint32Buf(CRC32.buf(preludeAndData));
    const message =      Buffer.concat([preludeAndData, messageCrc]);
    return message;
  }

  decode(message) {
    const totalBytes = message.readUInt32BE(0);
    const headerLength = message.readUInt32BE(4);
    const preludeCrc = message.readUInt32BE(8);
    const headerBuf = message.slice(12, 12 + headerLength);
    const payload = message.toString('utf8', 12 + headerLength, totalBytes-4);

    const headers = {};
    let i = 0;
    while (i < headerBuf.length) {
      const name = headerBuf.toString('utf8', i+1, i+1 + headerBuf[i]);
      const i1 = i+1+headerBuf[i];
      const valueType = headerBuf[i1];
      const valueLength = headerBuf.readUInt16BE(i1+1)
      const value = headerBuf.toString('utf8', i1+3, i1+3 + headerBuf.readUInt16BE(i1+1));
      i = i1 + 3 + valueLength;
      headers[name] =value;
    }
    return {
      totalBytes,
      headerLength,
      headers,
      payload: JSON.parse(payload)
    };
  }

  write(message) {
    if (!this.isOpen) {
      log("aws add to pending buffer size ", this.streamId, message.length);
      this.pendingBuf.push(message);
    } else {
      log("aws sending buffer size ", this.streamId, message.length);
      this.aws_ws.send(this.encode(msgHeaders, message));
    }
  }
  endStream() {
    if (!this.isOpen) {
      logErr("aws closing websocket that is not open", this.streamId);
    } else {
      log("aws closing websocket ", this.streamId);
      // send empty message to terminate stream
      this.aws_ws.send(this.encode(msgHeaders, Buffer.allocUnsafe(0)));
    }
    // Don't send anything more to this.aws_ws
    this.isOpen = false; 
  }
}

module.exports = {
  Stream:AWSTranscribeStream
};