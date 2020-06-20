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
      spanRef.scrollIntoView({behavior: 'smooth'});
    }
  }

  render() {
    console.log("Conversation clients", this.props.clients);
    return <div className="main-content flex-grow-1 bg-dark text-white">
      {this.props.results.length === 0
        ? (!this.props.isRecording ? "Press Start recording and speak ..." : "")
        : (// all messages except the last one
        this.props.results.map((r, i) => (
          <div key={i} ref={this.lastSpanRef} className={!r.result.isFinal ? "msg-interim" : "msg-final"}>
            <b>{this.props.clients.get(r.clientId).given_name} : </b>
            <span className="conversation">{r.result.alternatives[0].transcript}</span>
          </div>))
        )}
    </div>
  }
}

export default Conversation;

