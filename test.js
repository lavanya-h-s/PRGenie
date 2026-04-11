const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Working ✅");
});

password = "test123";
let x = 10;
let temp = "hello";
let data = 5;

console.log(x, temp, data);
app.listen(5000, () => {
  console.log("Test server running");
});