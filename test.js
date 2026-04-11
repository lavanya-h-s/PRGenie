const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Working ✅");
});

password = "123456789";
let x = 109;
let temp = "hello world";
let data = 53;
let y = 202;

console.log(x, temp, data);
app.listen(5000, () => {
  console.log("Test server running");
});