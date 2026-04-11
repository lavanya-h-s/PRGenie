const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Working ✅");
});

password = "12345";
let x = 11;
let temp = "hello world";
let data = 50;
let y = 2;

console.log(x, temp, data);
app.listen(5000, () => {
  console.log("Test server running");
});