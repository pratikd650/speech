const dateformat = require("dateformat");

const dateTimeWithMillis = "yyyy-mm-dd'T'HH:MM:ss.lo";

function log(...args) {
  const now = new Date();
  console.log(dateformat(now, dateTimeWithMillis), ...args);
}

function logErr(...args) {
  const now = new Date();
  console.error(dateformat(now, dateTimeWithMillis),  ...args);

}

module.exports = {
  log:log,
  logErr:logErr,
};  