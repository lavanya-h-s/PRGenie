require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios"); // ✅ add here

const app = express();

app.use(cors());
app.use(express.json());

console.log("Testing Pull Request2");

// 🔥 ADD FUNCTION HERE (outside webhook)
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
        console.error("Error fetching PR files:", error.message);
        return [];
    }
}


// ✅ Webhook route (below function)
app.post("/webhook", async (req, res) => {
    console.log("Webhook received!");

    const event = req.headers["x-github-event"];

    if (event === "pull_request") {
        const action = req.body.action;

        if (action === "opened") {
            console.log("New PR created!");

            const pr = req.body.pull_request;
            const repo = req.body.repository.name;
            const owner = req.body.repository.owner.login;
            const prNumber = pr.number;

            console.log("Title:", pr.title);

            // 🔥 CALL FUNCTION HERE
            const files = await getPRFiles(owner, repo, prNumber);

            console.log("\nChanged Files:");
            files.forEach(file => {
                console.log("File:", file.filename);
            });
        }
    }

    res.sendStatus(200);
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});

