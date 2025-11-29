
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT; // Railway uses this (8080)
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, "0.0.0.0", (err) => {
    if (err) throw err;
    console.log(`🚀 Server running on port ${port}`);
  });
});






// const { createServer } = require("http");
// const next = require("next");

// // Detect production correctly (cPanel sets NODE_ENV=production)
// const dev = process.env.NODE_ENV !== "production";
// const port = process.env.PORT || 3000;

// const app = next({ dev });
// const handle = app.getRequestHandler();

// app.prepare().then(() => {
//   createServer((req, res) => {
//     handle(req, res);
//   }).listen(port, "0.0.0.0", (err) => {
//     if (err) throw err;
//     console.log(`Server is ready on port ${port}`);
//   });
// });
