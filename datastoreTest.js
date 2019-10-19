const {Datastore} = require('@google-cloud/datastore');

// Instantiate a datastore client
const datastore = new Datastore();

const key = datastore.key(["Phrase", "Home"]);
datastore.get(key, (err, entity) => {
  if (err) {
    // Error handling omitted.
    console.error(err);
    return
  }

  console.log(entity.Value);
});


datastore.update({key: key, data: {Value:["Sachi", "Shrey"]}} ,(err, entity)=> {
  if (err) {
    console.error(err);
    return
  }
  console.log(entity.Value);
});