// 🔥 Catch errors (TOP)
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED PROMISE:", err);
});

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Server is working ✅");
});

// 🔹 Get PR files
async function getPRFiles(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("GitHub API Error:", error.message);
    return [];
  }
}

// 🔹 Parse diff
function parseDiff(file) {
  const patch = file.patch;
  if (!patch) return [];

  const lines = patch.split("\n");
  let lineNumber = 0;
  let changes = [];

  lines.forEach((line) => {
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) lineNumber = parseInt(match[1]);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      changes.push({
        type: "added",
        line: lineNumber,
        content: line.substring(1),
      });
      lineNumber++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      changes.push({
        type: "removed",
        line: lineNumber,
        content: line.substring(1),
      });
    } else {
      lineNumber++;
    }
  });

  return changes;
}

// 🔥 Rule-based analysis
async function analyzeCodeWithGemini(data) {
  let issues = [];

  data.forEach((file) => {
    file.changes.forEach((change) => {
      const code = change.content;
      const content = code.toLowerCase();

      if (content.includes("password") || content.includes("123")) {
        issues.push({
          type: "security",
          file: file.file,
          line: change.line,
          message: "Hardcoded password detected",
          suggestion: "Use environment variables",
        });
      }

      if (code.includes("==") && !code.includes("===")) {
        issues.push({
          type: "bug",
          file: file.file,
          line: change.line,
          message: "Loose equality used",
          suggestion: "Use ===",
        });
      }

      if (/^[A-Z_]+$/.test(code.trim())) {
        issues.push({
          type: "style",
          file: file.file,
          line: change.line,
          message: "Bad naming convention",
          suggestion: "Use camelCase",
        });
      }

      if (content.includes("console.log")) {
        issues.push({
          type: "style",
          file: file.file,
          line: change.line,
          message: "Console log found",
          suggestion: "Remove logs",
        });
      }
    });
  });

  return JSON.stringify(issues);
}

// 🔹 Risk score
function calculateRisk(issues) {
  if (!Array.isArray(issues)) return 0;

  let score = 0;

  issues.forEach((issue) => {
    if (issue.type === "security") score += 30;
    else if (issue.type === "bug") score += 20;
    else score += 10;
  });

  return Math.min(score, 100);
}

let lastResult = {
  riskScore: 0,
  issues: [],
};

// 🔹 Webhook
app.post("/webhook", async (req, res) => {
  console.log("Webhook triggered");

  const event = req.headers["x-github-event"];
  const action = req.body.action;

  if (
    event === "pull_request" &&
    (action === "opened" || action === "synchronize")
  ) {
    try {
      const pr = req.body.pull_request;

      const owner = req.body.repository.owner.login;
      const repo = req.body.repository.name;
      const prNumber = pr.number;

      const files = await getPRFiles(owner, repo, prNumber);

      const structuredData = files
      .filter(file =>
      !file.filename.includes("package-lock.json") &&
      !file.filename.includes("node_modules")
      )
      .map(file => ({
      file: file.filename,
      changes: parseDiff(file),
  }));

      const aiResponse = await analyzeCodeWithGemini(structuredData);

      let issues = [];

      if (aiResponse) {
        try {
          issues = JSON.parse(aiResponse);
        } catch {
          issues = [];
        }
      }

      const riskScore = calculateRisk(issues);

      lastResult = { riskScore, issues };

      console.log("Issues:", issues);
      console.log("Risk Score:", riskScore);

    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  res.sendStatus(200);
});

// 🔥 NEW: FRONTEND API
app.get("/analyze", (req, res) => {
  res.json(lastResult);
});

// 🔹 Start server
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});