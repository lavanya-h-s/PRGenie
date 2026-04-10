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
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Server is working ✅");
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 🔹 Get PR files
async function getPRFiles(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
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

// ✅ 🔥 FIXED GEMINI FUNCTION (ONLY THIS WAS WRONG)
async function analyzeCodeWithGemini(data) {
  let issues = [];

  data.forEach((file) => {
    file.changes.forEach((change) => {
      const content = change.content.toLowerCase();

      // 🔐 Detect hardcoded passwords
      if (content.includes("password") || content.includes("123")) {
        issues.push({
          type: "security",
          file: file.file,
          line: change.line,
          message: "Hardcoded password detected",
          suggestion: "Use environment variables",
        });
      }

      // 🐞 Detect console logs
      if (content.includes("console.log")) {
        issues.push({
          type: "style",
          file: file.file,
          line: change.line,
          message: "Console log found",
          suggestion: "Remove console.log in production",
        });
      }

      // ⚠️ Detect TODOs
      if (content.includes("todo")) {
        issues.push({
          type: "style",
          file: file.file,
          line: change.line,
          message: "TODO found",
          suggestion: "Complete or remove TODO",
        });
      }
    });
  });

  return JSON.stringify(issues);
}
// 🔹 Risk score
function calculateRisk(issues) {
  let score = 0;

  issues.forEach((issue) => {
    if (issue.type === "security") score += 30;
    else if (issue.type === "bug") score += 20;
    else score += 10;
  });

  return Math.min(score, 100);
}

// 🔹 Webhook
app.post("/webhook", async (req, res) => {
  console.log("Webhook triggered");

  const event = req.headers["x-github-event"];
  if (
  event === "pull_request" &&
  (req.body.action === "opened" || req.body.action === "synchronize")
) {
    try {
      const pr = req.body.pull_request;

      const owner = req.body.repository.owner.login;
      const repo = req.body.repository.name;
      const prNumber = pr.number;

      const files = await getPRFiles(owner, repo, prNumber);

      const structuredData = files.map((file) => ({
        file: file.filename,
        changes: parseDiff(file),
      }));

      console.log("Structured Data:");
      console.log(JSON.stringify(structuredData, null, 2));

      const aiResponse = await analyzeCodeWithGemini(structuredData);

      let issues = [];

      if (aiResponse) {
        try {
          issues = JSON.parse(aiResponse);
        } catch {
          console.log("❌ JSON parse error");
          issues = [];
        }
      }

      const riskScore = calculateRisk(issues);

      console.log("Issues:", issues);
      console.log("Risk Score:", riskScore);

    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  res.sendStatus(200);
});

// 🔹 Start server
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});