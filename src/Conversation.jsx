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
    if (this.props.results.length === 0) {
      return (
        <div>
          {!this.props.isRecording ? "Press Start recording and speak ..." : ""}
        </div>);
    }
    return (
      <div>
        {// all messages except the last one
          this.props.results.map(result => (
            <span key={result.seq} ref={this.lastSpanRef} className={!result.isFinal ? "msg-interim" : "msg-final"}>
            {result.alternatives[0].transcript}
          </span>
        ))}
      </div>
    );
  }
}

export default Conversation;

