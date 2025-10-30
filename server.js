import express from "express";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/run", async (req, res) => {
    try {
        const { code, testCases, action } = req.body;

        const tempDir = path.join(os.tmpdir(), "docker-code-run");
        const filePath = path.join(tempDir, "user.py");

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let pythonCode = code;

        if (action === "test" && Array.isArray(testCases) && testCases.length > 0) {
            pythonCode = generateTestCode(code, testCases);
        }

        fs.writeFileSync(filePath, pythonCode);

        exec(`python3 ${filePath}`, { timeout: 10000 }, (err, stdout, stderr) => {
            let output = (stdout || "") + (stderr || "");
            if (err) output += "\n[ERROR] Execution timeout or crash.";

            if (action === "test" && testCases?.length > 0) {
                try {
                    const results = parseTestResults(output);
                    const passedCount = results.filter(r => r.passed).length;
                    return res.json({
                        success: true,
                        output: output.trim(),
                        results,
                        summary: `✅ Passed ${passedCount}/${results.length} tests`
                    });
                } catch (e) {
                    console.log("Test parse failed:", e);
                }
            }

            return res.json({ success: true, output: output.trim() });
        });

    } catch (err) {
        res.json({ success: false, output: "Server Error: " + err.message });
    }
});

// ----------------- Helper Functions -----------------

function generateTestCode(userCode, testCases) {
    const testCode = `
import sys, json
from io import StringIO

${userCode}

results = []

def run_user_code(code):
    try:
        old_stdout = sys.stdout
        sys.stdout = buffer = StringIO()
        exec(code, {})
        sys.stdout = old_stdout
        return buffer.getvalue().strip(), None
    except Exception as e:
        sys.stdout = old_stdout
        return None, str(e)

def safe_eval(expr):
    try:
        return str(eval(expr, {})), None
    except Exception as e:
        return None, str(e)

${testCases.map(tc => {
        if (tc.input === "print_output") {
            return `
out, err = run_user_code("""${userCode.replace(/"/g, '\\"').replace(/\n/g, "\\n")}""")
results.append({
  "input": "print_output",
  "expected": "${tc.expected}",
  "actual": out,
  "passed": out == "${tc.expected}",
  "description": "${tc.description}"
})
`;
        }
        return `
out, err = safe_eval("${tc.input}")
results.append({
  "input": "${tc.input}",
  "expected": "${tc.expected}",
  "actual": out,
  "passed": out == "${tc.expected}",
  "description": "${tc.description}"
})
`;
    }).join("\n")}

print("TEST_RESULTS_START")
print(json.dumps(results))
print("TEST_RESULTS_END")
`;
    return testCode;
}

function parseTestResults(output) {
    const start = output.indexOf("TEST_RESULTS_START");
    const end = output.indexOf("TEST_RESULTS_END");
    if (start >= 0 && end > start) {
        const jsonText = output.substring(start + 19, end).trim();
        return JSON.parse(jsonText);
    }
    return [];
}

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 5333;
app.listen(PORT, () => console.log(`✅ Runner API Live on :${PORT}`));
