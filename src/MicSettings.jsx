import React from 'react';
import { Card, Form} from 'react-bootstrap';

class MicSettings extends React.Component {
  constructor(props) {
    console.log("MicSettings constructor");
    super(props);
    this.state = {
      devices: [],
    };
    this.canvasRef = React.createRef();

  }

  canvasDraw() {
    const bufferLengthAlt = this.props.analyser.frequencyBinCount;
    const dataArrayAlt = new Uint8Array(bufferLengthAlt);
    this.canvasCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    this.props.analyser.getByteFrequencyData(dataArrayAlt);
    this.canvasCtx.fillStyle = 'rgb(0, 80, 80)';
    this.canvasCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    const barWidth = (this.canvasWidth / bufferLengthAlt);
    let x = 0;

    for(let i = 0; i < bufferLengthAlt; i++) {
      const barHeight = dataArrayAlt[i] * this.canvasHeight / 256;

      // For the color of the bar use r=100 to 100+128, g=50, b=50
      this.canvasCtx.fillStyle = 'rgb(' + (dataArrayAlt[i]/2+100) + ',50,50)';
      // For the height of the bar
      this.canvasCtx.fillRect(x,this.canvasHeight-barHeight,barWidth,barHeight);

      x += barWidth;
    }

    this.animReq = window.requestAnimationFrame(this.canvasDraw.bind(this));
  }

  componentDidMount() {
    console.log("MicSettings componentDidMount");
    navigator.mediaDevices.enumerateDevices()
      .then(devices =>
        this.setState({devices:devices})
      );
    this.canvas = this.canvasRef.current;
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.canvasCtx = this.canvas.getContext('2d');
    this.canvasCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    if (this.props.analyser && this.props.isRecording) {
      this.animReq = window.requestAnimationFrame(this.canvasDraw.bind(this));
    }
  }

  componentWillUnmount() {
    console.log("MicSettings componentWillUnmount");
    if (this.animReq) {
      window.cancelAnimationFrame(this.animReq);
      this.animReq = null;
    }
  }

  render() {
    return (
      <div>
        <select value={this.props.selectedDevice}
                onChange={(e) => this.props.setProp("selectedDevice", e.target.value)}>
          {this.state.devices.filter(device => device.kind === "audioinput").map(device =>
            <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
          )}
        </select>
        <div>
          <canvas width="900" height="300" ref={this.canvasRef}>
          </canvas>
        </div>
        <Card className="mr-2 ml-2">
          <Card.Header>Advanced</Card.Header>
          <Card.Body>
            <Form inline>
              <Form.Label className="col-form-label-sm">fftSize</Form.Label>
              <Form.Control type="text" value={this.props.fftSize} className="mr-2" size="sm"
                            onChange={e => this.props.setProp("fftSize", e.target.value)}/>

              <Form.Label className="col-form-label-sm">minDecibels</Form.Label>
              <Form.Control type="text" value={this.props.minDecibels} className="mr-2" size="sm"
                            onChange={e => this.props.setProp("minDecibels", e.target.value)}/>

              <Form.Label className="col-form-label-sm">maxDecibels</Form.Label>
              <Form.Control type="text" value={this.props.maxDecibels} className="mr-2" size="sm"
                            onChange={e => this.props.setProp("maxDecibels", e.target.value)}/>

              <Form.Label className="col-form-label-sm">smoothing</Form.Label>
              <Form.Control type="text" value={this.props.smoothingTimeConstant} className="mr-2" size="sm"
                            onChange={e => this.props.setProp("smoothingTimeConstant", e.target.value)}/>
            </Form>
          </Card.Body>
        </Card>
      </div>
    );
  }
}

export default MicSettings;


