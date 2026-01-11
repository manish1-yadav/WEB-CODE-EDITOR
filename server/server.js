import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

console.log("GITHUB_TOKEN =", process.env.GITHUB_TOKEN);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/github/save", async (req, res) => {
    const { repo, file, content } = req.body;
    const token = process.env.GITHUB_TOKEN;   // ← from .env

    if (!token || !repo || !file || content === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const url = `https://api.github.com/repos/${repo}/contents/${file}`;
    const headers = { Authorization: `Bearer ${token}` };

  try {
    // Try to get existing file
    const { data } = await axios.get(url, { headers });

    // Update existing file
    await axios.put(url, {
      message: "Update from Web IDE",
      content: Buffer.from(content).toString("base64"),
      sha: data.sha
    }, { headers });

    res.json({ message: "Saved" });
  } catch (error) {
    // If file doesn't exist (404), create it
    if (error.response && error.response.status === 404) {
      try {
        await axios.put(url, {
          message: "Create from Web IDE",
          content: Buffer.from(content).toString("base64")
        }, { headers });

        res.json({ message: "Created" });
      } catch (createError) {
        res.status(500).json({ error: "Failed to create file", details: createError.message });
      }
    } else {
      res.status(error.response?.status || 500).json({
        error: "Failed to save file",
        details: error.message
      });
    }
  }
});

// Helper function to get runtime version
async function getRuntimeVersion(language) {
  try {
    const runtimeResponse = await axios.get("https://emkc.org/api/v2/piston/runtimes", {
      timeout: 5000
    });
    if (runtimeResponse.data && Array.isArray(runtimeResponse.data)) {
      const runtime = runtimeResponse.data.find(r => 
        r.language === language || r.language === language.toLowerCase()
      );
      if (runtime && runtime.version) {
        return runtime.version;
      }
    }
  } catch (error) {
    console.log(`Could not fetch runtimes for ${language}, using default`);
  }
  return "*"; // Default to latest version
}

// Java compilation endpoint using Piston API (free, no auth required)
app.post("/compile/java", async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  try {
    // Try using Piston API (free, no authentication required)
    // Piston is a free code execution engine
    try {
      // Ensure the Java code has a proper class structure
      let javaCode = code.trim();
      
      // If code doesn't start with 'public class', wrap it properly
      if (!javaCode.includes("public class")) {
        // Try to extract class name from existing class declaration
        const classMatch = javaCode.match(/class\s+(\w+)/);
        if (classMatch) {
          // Replace 'class' with 'public class'
          javaCode = javaCode.replace(/class\s+(\w+)/, "public class $1");
        } else {
          // Wrap in Main class
          javaCode = `public class Main {\n    public static void main(String[] args) {\n${javaCode.split('\n').map(line => '        ' + line).join('\n')}\n    }\n}`;
        }
      }
      
      const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
        language: "java",
        version: "15",
        files: [{
          name: "Main.java",
          content: javaCode
        }],
        stdin: "",
        args: []
      }, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000 // 30 second timeout
      });

      if (response.data && response.data.run) {
        const output = response.data.run.output || "";
        const stderr = response.data.run.stderr || "";
        const compileOutput = response.data.compile?.output || "";
        
        // Combine compile and run output/errors
        let finalOutput = "";
        if (compileOutput) {
          finalOutput += "Compilation:\n" + compileOutput + "\n\n";
        }
        if (stderr) {
          finalOutput += "Error:\n" + stderr + "\n\n";
        }
        if (output) {
          finalOutput += "Output:\n" + output;
        }
        
        return res.json({
          output: finalOutput.trim() || "Code executed successfully (no output)",
          error: stderr || compileOutput || "",
          statusCode: response.data.run.code || 0
        });
      }
    } catch (pistonError) {
      console.error("Piston API error:", pistonError.message);
      // Fall through to try JDoodle if configured
    }

    // Fallback: Try JDoodle API if credentials are configured
    const clientId = process.env.JDOODLE_CLIENT_ID;
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET;
    
    if (clientId && clientSecret && clientId !== "YOUR_CLIENT_ID" && clientSecret !== "YOUR_CLIENT_SECRET") {
      try {
        const response = await axios.post("https://api.jdoodle.com/v1/execute", {
          script: code,
          language: "java",
          versionIndex: "3", // Java 11
          clientId: clientId,
          clientSecret: clientSecret
        }, {
          headers: { "Content-Type": "application/json" },
          timeout: 15000
        });

        return res.json({
          output: response.data.output || "",
          error: response.data.error || "",
          statusCode: response.data.statusCode || 200
        });
      } catch (jdoodleError) {
        console.error("JDoodle API error:", jdoodleError.message);
      }
    }

    // If all APIs fail, return helpful error message
    res.status(503).json({
      error: "Java compilation service is temporarily unavailable",
      message: "Tried to use free Piston API but it's currently down.",
      solutions: [
        "1. Wait a few moments and try again (Piston API may be temporarily down)",
        "2. Set up JDoodle API for more reliable service:",
        "   - Sign up at https://www.jdoodle.com/compiler-api",
        "   - Get your Client ID and Client Secret",
        "   - Set environment variables: JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET",
        "   - Restart the server"
      ],
      note: "Piston API is free and doesn't require registration, but may have occasional downtime."
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to compile Java code",
      details: error.message,
      note: "Please check your network connection and try again."
    });
  }
});

// C compilation endpoint using Piston API
app.post("/compile/c", async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  try {
    const version = await getRuntimeVersion("c");
    
    const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
      language: "c",
      version: version,
      files: [{
        name: "main.c",
        content: code
      }],
      stdin: "",
      args: []
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    if (!response.data) {
      return res.status(500).json({
        error: "Invalid response from compilation service",
        note: "The compilation service returned an unexpected response."
      });
    }

    const compileData = response.data.compile || {};
    const runData = response.data.run || {};
    
    const compileOutput = compileData.output || "";
    const compileStderr = compileData.stderr || "";
    const runOutput = runData.output || "";
    const runStderr = runData.stderr || "";
    const exitCode = runData.code || 0;
    
    // Check for compilation errors first
    if (compileStderr || exitCode !== 0) {
      let errorOutput = "";
      if (compileStderr) {
        errorOutput += "Compilation Error:\n" + compileStderr + "\n\n";
      }
      if (compileOutput) {
        errorOutput += "Compilation Output:\n" + compileOutput + "\n\n";
      }
      if (runStderr) {
        errorOutput += "Runtime Error:\n" + runStderr + "\n";
      }
      if (runOutput) {
        errorOutput += "Output:\n" + runOutput;
      }
      
      return res.json({
        output: errorOutput.trim() || "Compilation failed with no error message",
        error: compileStderr || runStderr || "Compilation failed",
        statusCode: exitCode
      });
    }
    
    // Success case
    let finalOutput = "";
    if (compileOutput) {
      finalOutput += "Compilation:\n" + compileOutput + "\n\n";
    }
    if (runStderr) {
      finalOutput += "Warning:\n" + runStderr + "\n\n";
    }
    if (runOutput) {
      finalOutput += "Output:\n" + runOutput;
    }
    
    return res.json({
      output: finalOutput.trim() || "Code executed successfully (no output)",
      error: runStderr || "",
      statusCode: exitCode
    });
  } catch (error) {
    console.error("C compilation error:", error.message);
    if (error.response?.data) {
      return res.status(503).json({
        error: "C compilation service error",
        message: error.response.data.message || error.message,
        details: JSON.stringify(error.response.data)
      });
    }
    res.status(503).json({
      error: "C compilation service is temporarily unavailable",
      message: error.message || "Tried to use free Piston API but it's currently down.",
      solutions: [
        "1. Wait a few moments and try again (Piston API may be temporarily down)",
        "2. Check your network connection",
        "3. Verify the code syntax is correct"
      ],
      note: "Piston API is free and doesn't require registration, but may have occasional downtime."
    });
  }
});

// C++ compilation endpoint using Piston API
app.post("/compile/cpp", async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  try {
    const version = await getRuntimeVersion("cpp");
    
    const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
      language: "cpp",
      version: version,
      files: [{
        name: "main.cpp",
        content: code
      }],
      stdin: "",
      args: []
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    if (!response.data) {
      return res.status(500).json({
        error: "Invalid response from compilation service",
        note: "The compilation service returned an unexpected response."
      });
    }

    const compileData = response.data.compile || {};
    const runData = response.data.run || {};
    
    const compileOutput = compileData.output || "";
    const compileStderr = compileData.stderr || "";
    const runOutput = runData.output || "";
    const runStderr = runData.stderr || "";
    const exitCode = runData.code || 0;
    
    // Check for compilation errors first
    if (compileStderr || exitCode !== 0) {
      let errorOutput = "";
      if (compileStderr) {
        errorOutput += "Compilation Error:\n" + compileStderr + "\n\n";
      }
      if (compileOutput) {
        errorOutput += "Compilation Output:\n" + compileOutput + "\n\n";
      }
      if (runStderr) {
        errorOutput += "Runtime Error:\n" + runStderr + "\n";
      }
      if (runOutput) {
        errorOutput += "Output:\n" + runOutput;
      }
      
      return res.json({
        output: errorOutput.trim() || "Compilation failed with no error message",
        error: compileStderr || runStderr || "Compilation failed",
        statusCode: exitCode
      });
    }
    
    // Success case
    let finalOutput = "";
    if (compileOutput) {
      finalOutput += "Compilation:\n" + compileOutput + "\n\n";
    }
    if (runStderr) {
      finalOutput += "Warning:\n" + runStderr + "\n\n";
    }
    if (runOutput) {
      finalOutput += "Output:\n" + runOutput;
    }
    
    return res.json({
      output: finalOutput.trim() || "Code executed successfully (no output)",
      error: runStderr || "",
      statusCode: exitCode
    });
  } catch (error) {
    console.error("C++ compilation error:", error.message);
    if (error.response?.data) {
      return res.status(503).json({
        error: "C++ compilation service error",
        message: error.response.data.message || error.message,
        details: JSON.stringify(error.response.data)
      });
    }
    res.status(503).json({
      error: "C++ compilation service is temporarily unavailable",
      message: error.message || "Tried to use free Piston API but it's currently down.",
      solutions: [
        "1. Wait a few moments and try again (Piston API may be temporarily down)",
        "2. Check your network connection",
        "3. Verify the code syntax is correct"
      ],
      note: "Piston API is free and doesn't require registration, but may have occasional downtime."
    });
  }
});
// Get logged-in GitHub user
app.get("/github/user", async (req, res) => {
  try {
    const r = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    });
    res.json(r.data);
  } catch (err) {
    res.status(401).json({ error: "GitHub auth failed" });
  }
});

// Get user's repositories
app.get("/github/repos", async (req, res) => {
  try {
    const r = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    });
    res.json(r.data);
  } catch (err) {
    res.status(401).json({ error: "Cannot load repos" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
