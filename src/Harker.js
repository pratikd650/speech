// Taken from https://github.com/muaz-khan/WebRTC-Experiment/blob/master/hark/hark.js
// original source code is taken from:
// https://github.com/SimpleWebRTC/hark
// copyright goes to &yet team
// edited by Muaz Khan for RTCMultiConnection.js
class Harker {
    constructor(audioCtx, sourceNode, stream, options) {

        this.events = {};

        options = options || {};

        // Config
        const smoothing = (options.smoothing || 0.1),
          history = options.history || 30;
        this.interval = (options.interval || 50);
        this.threshold = (options.threshold || -50);
        this.running = true;

        const gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
        // don't play for self
        gainNode.gain.value = 0;


        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = smoothing;
        this.fftBins = new Float32Array(this.analyser.fftSize);

        sourceNode.connect(this.analyser);

        this.speaking = false;

        this.speakingHistory = [];
        for (let i = 0; i < history; i++) {
            this.speakingHistory.push(0);
        }

        setTimeout(this.looper.bind(this), this.interval);
    }

    on(event, callback) {
        this.events[event] = callback;
    }

    emit(event, ...args) {
        if (event && this.events[event]) {
            this.events[event](...args);
        }
    }

    setThreshold(t) {
        this.threshold = t;
    }

    setInterval(i) {
        this.interval = i;
    }

    stop() {
        this.running = false;
        this.emit('volume_change', -100, this.threshold);
        if (this.speaking) {
            this.speaking = false;
            this.emit('stopped_speaking');
        }
    };

    // Poll the analyser node to determine if speaking
    // and emit events if changed
    looper() {
        //check if stop has been called
        if (!this.running) {
            return;
        }

        const currentVolume = this.getMaxVolume();

        this.emit('volume_change', currentVolume, this.threshold);

        let history = 0;
        if (currentVolume > this.threshold && !this.speaking) {
            // trigger quickly, short history
            for (let i = this.speakingHistory.length - 3; i < this.speakingHistory.length; i++) {
                history += this.speakingHistory[i];
            }
            if (history >= 2) {
                this.speaking = true;
                this.emit('speaking');
            }
        } else if (currentVolume < this.threshold && this.speaking) {
            for (let j = 0; j < this.speakingHistory.length; j++) {
                history += this.speakingHistory[j];
            }
            if (history === 0) {
                this.speaking = false;
                this.emit('stopped_speaking');
            }
        }
        this.speakingHistory.shift();
        this.speakingHistory.push(0 + (currentVolume > this.threshold));

        setTimeout(this.looper.bind(this), this.interval);

    };

    getMaxVolume() {
        let maxVolume = -Infinity;
        this.analyser.getFloatFrequencyData(this.fftBins);

        for (let i = 4, ii = this.fftBins.length; i < ii; i++) {
            if (this.fftBins[i] > maxVolume && this.fftBins[i] < 0) {
                maxVolume = this.fftBins[i];
            }
        }

        return maxVolume;
    }


}

export default Harker;