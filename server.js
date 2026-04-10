require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

lines.forEach(line => {
    if (line.startsWith("@@")) {
        const match = line.match(/\+(\d+)/);
        if (match) lineNumber = parseInt(match[1]);
    } 
    else if (line.startsWith("+") && !line.startsWith("+++")) {
        changes.push({
            type: "added",
            line: lineNumber,
            content: line.substring(1)
        });
        lineNumber++;
    } 
    else if (line.startsWith("-") && !line.startsWith("---")) {
        changes.push({
            type: "removed",
            line: lineNumber,
            content: line.substring(1)
        });
    } 
    else {
        lineNumber++;
    }
});

return changes;


}

async function analyzeCodeWithGemini(data) {
try {
const model = genAI.getGenerativeModel({ model: "gemini-pro" });


    const prompt = `


You are a senior code reviewer.

IMPORTANT:

* Return ONLY valid JSON
* No explanations
* No markdown

Format:
[
{
"type": "bug/security/style",
"file": "filename",
"line": number,
"message": "issue",
"suggestion": "fix"
}
]

Code:
${JSON.stringify(data)}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text();

} catch (error) {
    console.error("Gemini Error:", error.message);
    return null;
}


}

function calculateRisk(issues) {
if (!Array.isArray(issues)) return 0;

let score = 0;

issues.forEach(issue => {
    if (issue.type === "security") score += 30;
    else if (issue.type === "bug") score += 20;
    else score += 10;
});

return Math.min(score, 100);


}

app.post("/webhook", async (req, res) => {
const event = req.headers["x-github-event"];


if (event === "pull_request" && req.body.action === "opened") {
    const pr = req.body.pull_request;

    const owner = req.body.repository.owner.login;
    const repo = req.body.repository.name;
    const prNumber = pr.number;

    const files = await getPRFiles(owner, repo, prNumber);

    const structuredData = files.map(file => ({
        file: file.filename,
        changes: parseDiff(file)
    }));

    const aiResponse = await analyzeCodeWithGemini(structuredData);

    if (!aiResponse) {
        console.log("AI response is null");
    }

    let issues = [];

    if (aiResponse) {
        try {
            issues = JSON.parse(aiResponse);
        } catch (e) {
            console.log("JSON parse error");
            issues = [];
        }
    }

    const riskScore = calculateRisk(issues);

    console.log("Structured Data:");
    console.log(JSON.stringify(structuredData, null, 2));

    console.log("\nIssues:");
    console.log(issues);

    console.log("\nRisk Score:", riskScore);
}

res.sendStatus(200);


});

app.listen(5000, () => {
console.log("Server running on port 5000");
});
