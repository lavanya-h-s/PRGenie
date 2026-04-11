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

app.get("/", (req, res) => {
  res.send("Server is working");
});

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

async function analyzeCode(data) {
  let issues = [];

  const keywords = [
    "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue",
    "function", "return", "const", "let", "var",
    "true", "false", "null", "undefined"
  ];

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

      if (content.includes("console.log")) {
        issues.push({
          type: "style",
          file: file.file,
          line: change.line,
          message: "Console log found",
          suggestion: "Remove logs",
        });
      }

      const words = code.split(/[\s,;(){}=]+/);

      words.forEach((word) => {
        if (!word) return;

        const clean = word.trim();

        if (keywords.includes(clean)) return;

        if (
          /^[a-zA-Z]+$/.test(clean) &&
          (
            clean.length <= 2 ||
            ["temp", "data", "val", "num"].includes(clean.toLowerCase())
          )
        ) {
          if (!issues.some(i => i.message.includes(clean) && i.line === change.line)) {
            issues.push({
              type: "naming",
              file: file.file,
              line: change.line,
              message: `Poor variable naming: "${clean}"`,
              suggestion: "Use descriptive camelCase naming",
            });
          }
        }
      });

    });
  });

  return JSON.stringify(issues);
}

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

app.post("/webhook", async (req, res) => {
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

      const aiResponse = await analyzeCode(structuredData);

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

app.get("/analyze", (req, res) => {
  res.json(lastResult);
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});