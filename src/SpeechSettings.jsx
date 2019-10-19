import React from 'react';
import { Button, Form} from 'react-bootstrap';

class SpeechSettings extends React.Component {

  render() {
    return (
      <Form>
        <Form.Group controlId="phrases">
          <Form.Label>Phrases</Form.Label>
          <Form.Control as="textarea" rows="5" value={this.props.phrases.join("\n")}
            onChange={(ev) => this.props.updatePhrases(ev.target.value.split("\n"))}/>
        </Form.Group>
        <Button variant="secondary" disabled={!this.props.phrasesChanged}
                onClick={() => this.props.savePhrases()}>
          Update
        </Button>
      </Form>
    );
  }
}

export default SpeechSettings;
