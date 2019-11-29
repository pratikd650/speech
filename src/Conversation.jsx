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
        <div className="main-content flex-grow-1">
          {!this.props.isRecording ? "Press Start recording and speak ..." : ""}
        </div>);
    }
    return (
      <>
        <div className="main-content flex-grow-1 pb-5">
          {// all messages except the last one
            this.props.results.map((r,i) => (
              <div key={i} ref={this.lastSpanRef} className={!r.result.isFinal ? "msg-interim" : "msg-final"}>
                <b>{this.props.clients.get(r.clientId).given_name} : </b> {r.result.alternatives[0].transcript}
            </div>))
          }

        </div>
        <div style={{height:"4em"}}/>
      </>
    );
  }
}

export default Conversation;

