const dateformat = require("dateformat");

function log(...args) {
  const now = new Date();
  console.log(dateformat(now, "isoDateTime"), ...args);
}

function logErr(...args) {
  const now = new Date();
  console.error(dateformat(now, "isoDateTime"),  ...args);

}

module.exports = {
  log:log,
  logErr:logErr,
};  