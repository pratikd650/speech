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
    return <div className="main-content flex-grow-1 bg-dark text-white">
      {this.props.results.length === 0
        ? (!this.props.isRecording ? "Press Start recording and speak ..." : "")
        : (// all messages except the last one
        Array.from(this.props.results.entries()).map(([key, rMap]) => (
          <div key={key} ref={this.lastSpanRef} >
            <b>{this.props.clients.get(rMap.values().next().value.clientId).given_name} : </b>
            {Array.from(rMap.entries()).map(([key2, r]) => 
              <span key={key2} className={!r.isFinal ? "msg-interim conversation" : "msg-final conversation"}>
                {r.result.alternatives[0].transcript}
              </span>
            )}
          </div>))
        )}
    </div>
  }
}

export default Conversation;

