const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Working ✅");
});

password = "123456";
let x = 1;
let temp = "hel";
let data = 5;
let y = 20;

console.log(x, temp, data);
app.listen(5000, () => {
  console.log("Test server running");
});