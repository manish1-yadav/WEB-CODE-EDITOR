import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

export default function App() {
  
  // ---------------- GitHub Integration ----------------
const [githubUser, setGithubUser] = useState(null);
const [repos, setRepos] = useState([]);
const [selectedRepo, setSelectedRepo] = useState("");

const loadGithubUser = async () => {
  try {
    const res = await axios.get("http://localhost:5000/github/user");
    setGithubUser(res.data);
    loadRepos();
  } catch (err) {
    alert("GitHub backend not connected or token invalid");
  }
};

const loadRepos = async () => {
  const res = await axios.get("http://localhost:5000/github/repos");
  setRepos(res.data);
};

const saveToGithub = async () => {
  if (!githubUser || !selectedRepo) {
    alert("Login and select repository");
    return;
  }

  const content = activeTab === "html" ? srcDoc : getCurrentCode();

  await axios.post("http://localhost:5000/github/save", {
    repo: `${githubUser.login}/${selectedRepo}`,
    file: "project.txt",
    content
  });

  alert("Saved to GitHub successfully");
};
// ----------------------------------------------------

  // Language tabs state
  const [activeTab, setActiveTab] = useState("html"); // html, python, java, javascript, c, cpp
  
  // Code editors state
  const [html, setHtml] = useState("<!DOCTYPE html>\n<html>\n<head>\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n <h2>Welcome To Web Code Editor</h2>\n</body>\n</html>");
  const [css, setCss] = useState("body {\n    font-family: Arial, sans-serif;\n    padding: 20px;\n    background-color: #f0f0f0;\n}\n\nh1 {\n    color: #333;}\nh2 {\n    color: #16cfd5ff;\n}");
  const [js, setJs] = useState("// JavaScript code\nconsole.log('Hello, World!');\n\ndocument.addEventListener('DOMContentLoaded', () => {\n    console.log('Page loaded!');\n});");
  const [python, setPython] = useState("# Python code\nprint('Hello, World!')\n\n# Example:\nname = 'World'\nprint(f'Hello, {name}!')\n\n# Calculate sum\nnumbers = [1, 2, 3, 4, 5]\nsum_numbers = sum(numbers)\nprint(f'Sum: {sum_numbers}')");
  const [java, setJava] = useState("// Java code\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}");
  const [javascript, setJavascript] = useState("// JavaScript code (standalone)\nconsole.log('Hello, World!');\n\n// Example function\nfunction greet(name) {\n    return `Hello, ${name}!`;\n}\n\nconsole.log(greet('World'));");
  const [c, setC] = useState("// C code\n#include <stdio.h>\n\nint main() {\n    printf(\"Hello, World!\\n\");\n    return 0;\n}");
  const [cpp, setCpp] = useState("// C++ code\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}");
  
  // Output state
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  // Python/Pyodide state
  const [pyodideReady, setPyodideReady] = useState(false);
  const pyodideRef = useRef(null);
  
  const containerRef = useRef(null);
  const [editorHeight, setEditorHeight] = useState(400);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // Calculate height: full height minus tabs (header is separate)
        // Tabs take about 40px, so subtract that
        const height = containerRef.current.clientHeight - 40;
        setEditorHeight(Math.max(400, height));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [activeTab]);

  useEffect(() => {
    // Initialize Pyodide once
    const initPyodide = async () => {
      if (window.loadPyodide) {
        try {
          setOutput("Loading Pyodide...");
          pyodideRef.current = await window.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
          });
          setPyodideReady(true);
          setOutput("Pyodide ready! You can now run Python code.");
        } catch (error) {
          setOutput(`Error loading Pyodide: ${error.message}`);
        }
      } else {
        // Wait for script to load
        setTimeout(initPyodide, 100);
      }
    };
    initPyodide();
  }, []);

  // Run HTML/CSS/JS - Already has live preview
  function runWeb() {
    setOutput("Web preview is shown on the right side automatically!");
  }

  // Run Python code
  async function runPython() {
    if (!python.trim()) {
      setOutput("No Python code to run");
      return;
    }

    if (!pyodideReady || !pyodideRef.current) {
      setOutput("Error: Pyodide is not ready yet. Please wait...");
      return;
    }

    setIsRunning(true);
    setOutput("Running Python code...\n");

    try {
      // Create a fresh Python environment for each run
      const pyodide = pyodideRef.current;
      
      // Setup stdout/stderr capture with a unique name for each run
      const captureId = `_capture_${Date.now()}`;
      pyodide.runPython(`
import sys
from io import StringIO
${captureId} = StringIO()
sys.stdout = ${captureId}
sys.stderr = ${captureId}
`);

      try {
        // Run the user's Python code
        let result;
        try {
          result = pyodide.runPython(python);
        } catch (execError) {
          // Get the captured output first (might contain error info)
          let errorOutput = "";
          try {
            errorOutput = pyodide.runPython(`${captureId}.getvalue()`);
          } catch {}
          
          // Restore stdout/stderr
          try {
            pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
del ${captureId}
`);
          } catch {}
          
          // Get traceback from Pyodide error
          let traceback = "";
          if (execError.traceback) {
            traceback = execError.traceback;
          } else if (execError.toString) {
            traceback = execError.toString();
          }
          
          // Combine error output with traceback
          const errorMsg = errorOutput.trim() || execError.message || "Unknown error";
          const fullError = traceback ? `${errorMsg}\n\nTraceback:\n${traceback}` : errorMsg;
          setOutput(fullError);
          return; // Exit early on error
        }
        
        // Get captured output (success case)
        const stdout = pyodide.runPython(`${captureId}.getvalue()`);
        
        // Restore stdout/stderr
        pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
del ${captureId}
`);
        
        // Display output or result
        const outputText = stdout.trim() || (result !== undefined ? String(result) : "");
        setOutput(outputText || "Code executed successfully (no output)");
      } catch (execError) {
        // Fallback error handling if the above fails
        try {
          pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
        } catch {}
        
        const errorMsg = execError.message || "Unknown error occurred";
        const traceback = execError.traceback || execError.stack || "";
        setOutput(`Error: ${errorMsg}\n${traceback ? '\n' + traceback : ''}`);
      }
    } catch (error) {
      // Fallback error handling for outer try-catch
      let errorMsg = error.message || "Unknown error occurred";
      if (error.traceback) {
        errorMsg = `${error.message}\n\nTraceback:\n${error.traceback}`;
      } else if (error.stack) {
        errorMsg = `${error.message}\n\n${error.stack}`;
      }
      setOutput(`Error: ${errorMsg}`);
      
      // Try to restore stdout/stderr
      try {
        if (pyodideRef.current) {
          pyodideRef.current.runPython(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
        }
      } catch {}
    } finally {
      setIsRunning(false);
    }
  }

  // Run JavaScript code (standalone)
  async function runJavaScript() {
    if (!javascript.trim()) {
      setOutput("No JavaScript code to run");
      return;
    }

    setIsRunning(true);
    setOutput("Running JavaScript code...\n");

    try {
      // Create a new Function to execute the code
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        originalLog(...args);
      };

      // Wrap code in try-catch
      const wrappedCode = `
try {
  ${javascript}
} catch (error) {
  throw error;
}
`;
      
      const result = new Function(wrappedCode)();
      console.log = originalLog;
      
      const outputText = logs.length > 0 ? logs.join('\n') : (result !== undefined ? String(result) : "Code executed successfully (no output)");
      setOutput(outputText);
    } catch (error) {
      setOutput(`Error: ${error.message}\n${error.stack || ''}`);
    } finally {
      setIsRunning(false);
    }
  }

  // Compile and run Java code
  async function runJava() {
    if (!java.trim()) {
      setOutput("No Java code to run");
      return;
    }

    setIsRunning(true);
    setOutput("Compiling and running Java code...\n");

    try {
      const response = await axios.post("http://localhost:5000/compile/java", {
        code: java
      }, {
        timeout: 30000 // 30 second timeout
      });

      if (response.data.error && response.status === 503) {
        // Service not configured or unavailable
        let errorMsg = `Error: ${response.data.error}\n\n`;
        if (response.data.message) {
          errorMsg += `${response.data.message}\n\n`;
        }
        if (response.data.solutions && Array.isArray(response.data.solutions)) {
          errorMsg += "Solutions:\n" + response.data.solutions.join("\n") + "\n\n";
        }
        if (response.data.note) {
          errorMsg += `Note: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else if (response.data.error) {
        // Other errors
        let errorMsg = `Error: ${response.data.error}`;
        if (response.data.details) {
          errorMsg += `\n${response.data.details}`;
        }
        if (response.data.note) {
          errorMsg += `\n\nNote: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else {
        // Success
        const outputText = response.data.output || response.data.error || "Code executed successfully (no output)";
        setOutput(outputText.trim());
      }
    } catch (error) {
      if (error.response?.data) {
        const data = error.response.data;
        let errorMsg = `Error: ${data.error || 'Request failed'}`;
        if (data.details) {
          errorMsg += `\n${data.details}`;
        }
        if (data.solutions && Array.isArray(data.solutions)) {
          errorMsg += "\n\nSolutions:\n" + data.solutions.join("\n");
        }
        if (data.note) {
          errorMsg += `\n\nNote: ${data.note}`;
        }
        setOutput(errorMsg);
      } else if (error.code === 'ECONNREFUSED') {
        setOutput(`Error: Cannot connect to backend server.\n\nPlease make sure the server is running on port 5000.\n\nTo start the server, run:\n  cd server\n  node server.js`);
      } else {
        setOutput(`Error: ${error.message}\n\nMake sure the backend server is running on port 5000.`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  // Compile and run C code
  async function runC() {
    if (!c.trim()) {
      setOutput("No C code to run");
      return;
    }

    setIsRunning(true);
    setOutput("Compiling and running C code...\n");

    try {
      const response = await axios.post("http://localhost:5000/compile/c", {
        code: c
      }, {
        timeout: 30000
      });

      if (response.data.error && response.status === 503) {
        let errorMsg = `Error: ${response.data.error}\n\n`;
        if (response.data.message) {
          errorMsg += `${response.data.message}\n\n`;
        }
        if (response.data.solutions && Array.isArray(response.data.solutions)) {
          errorMsg += "Solutions:\n" + response.data.solutions.join("\n") + "\n\n";
        }
        if (response.data.note) {
          errorMsg += `Note: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else if (response.data.error) {
        let errorMsg = `Error: ${response.data.error}`;
        if (response.data.details) {
          errorMsg += `\n${response.data.details}`;
        }
        if (response.data.note) {
          errorMsg += `\n\nNote: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else {
        const outputText = response.data.output || response.data.error || "Code executed successfully (no output)";
        setOutput(outputText.trim());
      }
    } catch (error) {
      if (error.response?.data) {
        const data = error.response.data;
        let errorMsg = `Error: ${data.error || 'Request failed'}`;
        if (data.details) {
          errorMsg += `\n${data.details}`;
        }
        if (data.solutions && Array.isArray(data.solutions)) {
          errorMsg += "\n\nSolutions:\n" + data.solutions.join("\n");
        }
        if (data.note) {
          errorMsg += `\n\nNote: ${data.note}`;
        }
        setOutput(errorMsg);
      } else if (error.code === 'ECONNREFUSED') {
        setOutput(`Error: Cannot connect to backend server.\n\nPlease make sure the server is running on port 5000.\n\nTo start the server, run:\n  cd server\n  node server.js`);
      } else {
        setOutput(`Error: ${error.message}\n\nMake sure the backend server is running on port 5000.`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  // Compile and run C++ code
  async function runCpp() {
    if (!cpp.trim()) {
      setOutput("No C++ code to run");
      return;
    }

    setIsRunning(true);
    setOutput("Compiling and running C++ code...\n");

    try {
      const response = await axios.post("http://localhost:5000/compile/cpp", {
        code: cpp
      }, {
        timeout: 30000
      });

      if (response.data.error && response.status === 503) {
        let errorMsg = `Error: ${response.data.error}\n\n`;
        if (response.data.message) {
          errorMsg += `${response.data.message}\n\n`;
        }
        if (response.data.solutions && Array.isArray(response.data.solutions)) {
          errorMsg += "Solutions:\n" + response.data.solutions.join("\n") + "\n\n";
        }
        if (response.data.note) {
          errorMsg += `Note: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else if (response.data.error) {
        let errorMsg = `Error: ${response.data.error}`;
        if (response.data.details) {
          errorMsg += `\n${response.data.details}`;
        }
        if (response.data.note) {
          errorMsg += `\n\nNote: ${response.data.note}`;
        }
        setOutput(errorMsg);
      } else {
        const outputText = response.data.output || response.data.error || "Code executed successfully (no output)";
        setOutput(outputText.trim());
      }
    } catch (error) {
      if (error.response?.data) {
        const data = error.response.data;
        let errorMsg = `Error: ${data.error || 'Request failed'}`;
        if (data.details) {
          errorMsg += `\n${data.details}`;
        }
        if (data.solutions && Array.isArray(data.solutions)) {
          errorMsg += "\n\nSolutions:\n" + data.solutions.join("\n");
        }
        if (data.note) {
          errorMsg += `\n\nNote: ${data.note}`;
        }
        setOutput(errorMsg);
      } else if (error.code === 'ECONNREFUSED') {
        setOutput(`Error: Cannot connect to backend server.\n\nPlease make sure the server is running on port 5000.\n\nTo start the server, run:\n  cd server\n  node server.js`);
      } else {
        setOutput(`Error: ${error.message}\n\nMake sure the backend server is running on port 5000.`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  // Main run function based on active tab
  async function handleRun() {
    switch (activeTab) {
      case "html":
        runWeb();
        break;
      case "python":
        await runPython();
        break;
      case "java":
        await runJava();
        break;
      case "javascript":
        await runJavaScript();
        break;
      case "c":
        await runC();
        break;
      case "cpp":
        await runCpp();
        break;
      default:
        setOutput("Unknown language");
    }
  }

  const srcDoc = `
    <html>
      <head>
        <style>${css}</style>
      </head>
      <body>${html}</body>
      <script>${js}<\/script>
    </html>
  `;

  const tabs = [
    { id: "html", name: "HTML/CSS/JS", icon: "🌐" },
    { id: "python", name: "Python", icon: "🐍" },
    { id: "java", name: "Java", icon: "☕" },
    { id: "javascript", name: "JavaScript", icon: "📜" },
    { id: "c", name: "C", icon: "🔷" },
    { id: "cpp", name: "C++", icon: "⚡" }
  ];

  const getCurrentCode = () => {
    switch (activeTab) {
      case "html": return html;
      case "python": return python;
      case "java": return java;
      case "javascript": return javascript;
      case "c": return c;
      case "cpp": return cpp;
      default: return "";
    }
  };

  const setCurrentCode = (value) => {
    switch (activeTab) {
      case "html": setHtml(value); break;
      case "python": setPython(value); break;
      case "java": setJava(value); break;
      case "javascript": setJavascript(value); break;
      case "c": setC(value); break;
      case "cpp": setCpp(value); break;
    }
  };

  const getLanguage = () => {
    switch (activeTab) {
      case "html": return "html";
      case "python": return "python";
      case "java": return "java";
      case "javascript": return "javascript";
      case "c": return "c";
      case "cpp": return "cpp";
      default: return "plaintext";
    }
  };

  const canRun = () => {
    if (activeTab === "python") return pyodideReady && !isRunning;
    return !isRunning;
  };

  return (
    <div style={{display:"flex", height:"100vh", margin: 0, padding: 0, overflow: "hidden", backgroundColor: "#1e1e1e", flexDirection: "column"}}>
      {/* Header */}
      <div style={{padding: "10px 20px", backgroundColor: "#252526", borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div style={{fontSize: "18px", fontWeight: "bold", color: "#fff"}}>
          💻 Web Code Editor - Compile HTML, Python, Java, JavaScript, C, C++ & CSS
        </div>
        {/* Run button for HTML tab only - shown in header */}
        <div style={{display:"flex", gap:"10px", alignItems:"center"}}>

  {/* GitHub Login */}
  <button
    onClick={loadGithubUser}
    style={{
      padding:"6px 14px",
      background:"#333",
      color:"#fff",
      border:"1px solid #555",
      borderRadius:"4px"
    }}
  >
    GitHub Login
  </button>

  {/* Repo dropdown */}
  {githubUser && (
    <select
      onChange={(e)=>setSelectedRepo(e.target.value)}
      style={{background:"#111", color:"#fff", padding:"6px"}}
    >
      <option>Select Repo</option>
      {repos.map(r=>(
        <option key={r.id} value={r.name}>{r.name}</option>
      ))}
    </select>
  )}

  {/* Save button */}
  {githubUser && (
    <button
      onClick={saveToGithub}
      style={{
        padding:"6px 14px",
        background:"#28a745",
        color:"#fff",
        border:"none",
        borderRadius:"4px"
      }}
    >
      Save to GitHub
    </button>
  )}

  {/* Keep Run button */}
  {activeTab === "html" && (
    <button onClick={handleRun} style={{padding:"6px 14px", background:"#007acc", color:"#fff"}}>
      ▶ Run
    </button>
  )}
</div>
      </div>

      <div style={{display:"flex", flex: 1, overflow: "hidden"}}>
        {/* Left Panel - Code Editor */}
        <div ref={containerRef} style={{width: "50%", display:"flex", flexDirection:"column", borderRight: "1px solid #444", height: "100%", overflow: "hidden", transition: "width 0.3s"}}>
          {/* Tabs */}
          <div style={{display: "flex", backgroundColor: "#2d2d30", borderBottom: "1px solid #444"}}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setOutput("");
                }}
                style={{
                  padding: "10px 20px",
                  backgroundColor: activeTab === tab.id ? "#1e1e1e" : "transparent",
                  color: activeTab === tab.id ? "#fff" : "#ccc",
                  border: "none",
                  borderRight: "1px solid #444",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: activeTab === tab.id ? "bold" : "normal",
                  transition: "all 0.2s"
                }}
              >
                {tab.icon} {tab.name}
              </button>
            ))}
          </div>

          {/* Multi-editor for HTML/CSS/JS */}
          {activeTab === "html" ? (
            <div style={{display: "flex", flexDirection: "column", flex: 1, overflow: "hidden"}}>
              <div style={{flex: 1, borderBottom: "1px solid #444", display: "flex", flexDirection: "column", minHeight: 0}}>
                <div style={{padding: "5px 10px", backgroundColor: "#252526", color: "#fff", fontSize: "12px", borderBottom: "1px solid #444", flexShrink: 0}}>HTML</div>
                <div style={{flex: 1, minHeight: 0}}>
                  <Editor 
                    height="100%"
                    language="html" 
                    value={html} 
                    onChange={setHtml}
                    theme="vs-dark"
                    options={{ 
                      minimap: { enabled: false },
                      fontSize: 14,
                      automaticLayout: true
                    }}
                  />
                </div>
              </div>
              <div style={{flex: 1, borderBottom: "1px solid #444", display: "flex", flexDirection: "column", minHeight: 0}}>
                <div style={{padding: "5px 10px", backgroundColor: "#252526", color: "#fff", fontSize: "12px", borderBottom: "1px solid #444", flexShrink: 0}}>CSS</div>
                <div style={{flex: 1, minHeight: 0}}>
                  <Editor 
                    height="100%"
                    language="css" 
                    value={css} 
                    onChange={setCss}
                    theme="vs-dark"
                    options={{ 
                      minimap: { enabled: false },
                      fontSize: 14,
                      automaticLayout: true
                    }}
                  />
                </div>
              </div>
              <div style={{flex: 1, display: "flex", flexDirection: "column", minHeight: 0}}>
                <div style={{padding: "5px 10px", backgroundColor: "#252526", color: "#fff", fontSize: "12px", borderBottom: "1px solid #444", flexShrink: 0}}>JavaScript</div>
                <div style={{flex: 1, minHeight: 0}}>
                  <Editor 
                    height="100%"
                    language="javascript" 
                    value={js} 
                    onChange={setJs}
                    theme="vs-dark"
                    options={{ 
                      minimap: { enabled: false },
                      fontSize: 14,
                      automaticLayout: true
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{flex: 1, position: "relative", minHeight: 0}}>
              <Editor 
                height="100%"
                language={getLanguage()}
                value={getCurrentCode()}
                onChange={setCurrentCode}
                theme="vs-dark"
                options={{ 
                  minimap: { enabled: false },
                  fontSize: 14,
                  automaticLayout: true,
                  wordWrap: "on"
                }}
              />
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div style={{width:"50%", height:"100%", display: "flex", flexDirection: "column", transition: "width 0.3s"}}>
          {/* Right Panel Header */}
          <div style={{padding: "10px 15px", backgroundColor: "#252526", color: "#fff", fontSize: "14px", borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <span style={{fontWeight: "bold"}}>
              {activeTab === "html" ? "Live Preview" : "Output"}
            </span>
            {/* Run button for Python/Java/JavaScript/C/C++ - shown in right panel */}
            {(activeTab === "python" || activeTab === "java" || activeTab === "javascript" || activeTab === "c" || activeTab === "cpp") && (
              <button 
                onClick={handleRun}
                disabled={!canRun()}
                style={{
                  padding: "6px 16px",
                  backgroundColor: canRun() ? "#007acc" : "#555",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: canRun() ? "pointer" : "not-allowed",
                  fontSize: "13px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isRunning ? "⏳ Running..." : "▶ Run"}
              </button>
            )}
          </div>

          {/* Content Area */}
          {activeTab === "html" ? (
            // HTML Preview - iframe
            <iframe 
              srcDoc={srcDoc} 
              style={{
                width:"100%", 
                height:"100%", 
                border: "none",
                backgroundColor: "white",
                flex: 1
              }} 
              title="Preview"
            />
          ) : (
            // Output Panel for Python/Java/JavaScript/C/C++
            <div style={{flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#1e1e1e"}}>
              <pre style={{
                padding: "20px", 
                backgroundColor: "#0a0a0a", 
                overflow: "auto", 
                flex: 1,
                fontSize: "14px", 
                color: "#0f0",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                fontFamily: "Consolas, 'Courier New', monospace",
                lineHeight: "1.6"
              }}>
                {output || "Output will appear here when you run your code..."}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
