import React from 'react';

class Conversation extends React.Component {
  constructor(props) {
    super(props);
    this.lastSpanRef = React.createRef();
    this.scrollToBottom = this.scrollToBottom.bind(this);
  }

  componentDidMount() {
    this.scrollToBottom();
  }

  componentDidUpdate() {
    this.scrollToBottom();
  }

  scrollToBottom() {
    const spanRef = this.lastSpanRef.current;
    if (spanRef) {
      spanRef.scrollIntoView({ behavior: 'smooth' });
    }
  }

  render() {
    console.log("Conversation clients", this.props.clients);
    if (this.props.results.length === 0) {
      return (
        <div>
          {!this.props.isRecording ? "Press Start recording and speak ..." : ""}
        </div>);
    }
    return (
      <div>
        {// all messages except the last one
          this.props.results.map((r,i) => (
            <div key={i} ref={this.lastSpanRef} className={!r.result.isFinal ? "msg-interim" : "msg-final"}>
              <b>{this.props.clients.get(r.clientId).name} : </b> {r.result.alternatives[0].transcript}
          </div>))
        }
      </div>
    );
  }
}

export default Conversation;

