// Imports the Google Cloud client library
const speech = require('@google-cloud/speech');
const fs = require('fs');

// Creates a client
const client = new speech.SpeechClient();

// The name of the audio file to transcribe
const fileName = '/tmp/audio';
//const fileName = '/tmp/output.wav';
//const fileName = '/tmp/output.opus';

// Reads a local audio file and converts it to base64
const file = fs.readFileSync(fileName);
const audioBytes = file.toString('base64');

// The audio file's encoding, sample rate in hertz, and BCP-47 language code
const audio = {
  content: audioBytes,
};
const config = {
  encoding: 'OGG_OPUS',
  sampleRateHertz: 16000,
  languageCode: 'en-US',
};
const request = {
  audio: audio,
  config: config,
};


client.recognize(request)
.then(responses => {
  const transcription = responses[0].results
    .map(result => result.alternatives[0].transcript)
    .join('\n');
  console.log(`Transcription: ${transcription}`);

});