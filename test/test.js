const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

// Start the server as a subprocess so the app code doesn't need to be modified
const serverProcess = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

let started = false;
const startTimeout = setTimeout(() => {
  cleanup(new Error('Server did not start within 5s'));
}, 5000);

serverProcess.stdout.on('data', (data) => {
  const out = data.toString();
  // server.js prints: Server running at http://127.0.0.1:3000/
  if (/Server running at/.test(out) && !started) {
    started = true;
    clearTimeout(startTimeout);
    runRequestTest();
  }
});

serverProcess.stderr.on('data', (data) => {
  // If the server prints errors, surface them for diagnostics
  process.stderr.write(data);
});

serverProcess.on('error', (err) => cleanup(err));

function runRequestTest() {
  http.get({ hostname: '127.0.0.1', port: 3000, path: '/', timeout: 3000 }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      try {
        assert.strictEqual(res.statusCode, 200, 'Expected statusCode 200');
        assert.strictEqual(body, 'Hello World!\n', 'Unexpected response body');
        cleanup();
      } catch (err) {
        cleanup(err);
      }
    });
  }).on('error', (err) => cleanup(err));
}

function cleanup(err) {
  try {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  } catch (e) {
    // ignore
  }

  if (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exit(1);
  } else {
    console.log('Test passed');
    process.exit(0);
  }
}

// Fallback: if server writes nothing but exits, fail
serverProcess.on('exit', (code, signal) => {
  if (!started) {
    cleanup(new Error(`Server exited prematurely (code=${code} signal=${signal})`));
  }
});
