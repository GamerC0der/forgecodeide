import asyncio
import logging
import subprocess
import os
import uuid
import tempfile
import sys
from datetime import datetime, timedelta

def install_dependencies():
    required_packages = ['fastapi', 'uvicorn']
    missing_packages = []

    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)

    if missing_packages:
        print(f"Installing missing dependencies: {', '.join(missing_packages)}")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user'] + missing_packages)
            print("Dependencies installed successfully!")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install dependencies: {e}")
            sys.exit(1)

install_dependencies()

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse, HTMLResponse

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = FastAPI()

def validate_command(command: str):
    if '..' in command or command.startswith('/') or '../' in command:
        raise HTTPException(status_code=403, detail="Access denied: cannot access files outside files directory")

    dangerous_commands = ['rm', 'del', 'format', 'fdisk', 'mkfs', 'dd', 'wget', 'curl', 'nc', 'netcat', 'ssh', 'scp', 'chmod', 'chown', 'sudo', 'su']
    for cmd in dangerous_commands:
        if cmd in command.lower():
            raise HTTPException(status_code=403, detail=f"Dangerous command not allowed: {cmd}")

    allowed_commands = ['python3', 'node', 'npm', 'pip', 'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'echo', 'whoami']
    command_parts = command.split()
    if command_parts and command_parts[0] not in allowed_commands:
        if not (command_parts[0].startswith('python3') or command_parts[0] in ['node', 'npm']):
            raise HTTPException(status_code=403, detail=f"Command not allowed: {command_parts[0]}")

files = []
ip_timestamps = {}

async def check_stale_ips():
    while True:
        current_time = datetime.now()
        stale_ips = []
        for ip, timestamp in ip_timestamps.items():
            time_diff = current_time - timestamp
            if time_diff > timedelta(seconds=15):
                stale_ips.append(ip)

        if stale_ips:
            logging.info(f"Resetting files array due to stale IPs: {stale_ips}")
            files.clear()
            for ip in stale_ips:
                del ip_timestamps[ip]

        await asyncio.sleep(5)  

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_stale_ips())

HTML_CONTENT = """<!DOCTYPE html>
<html>
<head>
    <title>Forge Code</title>
</head>
<body style="margin:20px;font-family:monospace;">
    <h1>Forge Code</h1>

    <div style="margin:20px 0;">
        <h3>app.py</h3>
        <div style="margin:10px 0;">
            <button onclick="loadTimeTemplate()">Time Printer</button>
            <button onclick="loadServerTemplate()">Web Server</button>
        </div>
        <textarea id="filecontent" placeholder="Write your Python code here..." style="width:100%;height:300px;margin:5px;"></textarea><br>
        <button onclick="saveFile()">Save</button>
        <button onclick="runApp()">Run App</button>
    </div>

    <div style="margin:20px 0;">
        <h3>Terminal Output</h3>
        <button onclick="clearTerminal()">Clear</button><br>
        <pre id="terminal" style="background:#000;color:#0f0;padding:10px;height:300px;overflow:auto;margin:5px 0;"></pre>
    </div>

    <script>
        function loadFile() {
            const stored = localStorage.getItem('app_py');
            if (stored) {
                document.getElementById('filecontent').value = stored;
            }
        }

        function saveFile() {
            const content = document.getElementById('filecontent').value;
            localStorage.setItem('app_py', content);
            log('Saved app.py');
        }

        function loadTimeTemplate() {
            const template = [
                'import time',
                'import datetime',
                '',
                'while True:',
                '    now = datetime.datetime.now()',
                '    print(f"Current time: {now.strftime(\\'%Y-%m-%d %H:%M:%S\\')}")',
                '    time.sleep(1)'
            ].join('\\n');
            document.getElementById('filecontent').value = template;
            log('Loaded Time Printer template');
        }

        function loadServerTemplate() {
            const template = [
                'from flask import Flask',
                'import time',
                '',
                'app = Flask(__name__)',
                '',
                '@app.route(\\'/\\')',
                'def home():',
                '    return f"Hello from Forge Code! Time: {time.strftime(\\'%H:%M:%S\\')}"',
                '',
                'if __name__ == \\'__main__\\':',
                '    print("Starting server on port 5000...")',
                '    print("Visit: http://localhost:5000")',
                '    app.run(host=\\'0.0.0.0\\', port=5000, debug=True)'
            ].join('\\n');
            document.getElementById('filecontent').value = template;
            log('Loaded Web Server template');
        }

        function runApp() {
            const content = document.getElementById('filecontent').value;
            if (!content.trim()) return alert('Write some code first!');

            document.getElementById('terminal').textContent = '';

            const formData = new FormData();
            formData.append('command', 'python3 app.py');
            formData.append('files', new Blob([content]), 'app.py');

            fetch('/execute', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                function readStream() {
                    reader.read().then(({done, value}) => {
                        if (done) {
                            return;
                        }
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\\n');
                        lines.forEach(line => {
                            if (line.startsWith('data: ')) {
                                log(line.replace('data: ', ''));
                            }
                        });
                        readStream();
                    });
                }
                readStream();
            })
            .catch(e => log('Error: ' + e.message));
        }

        function log(msg) {
            const terminal = document.getElementById('terminal');
            terminal.textContent += msg + '\\n';
            terminal.scrollTop = terminal.scrollHeight;
        }

        function clearTerminal() {
            document.getElementById('terminal').textContent = '';
        }

        window.onload = loadFile;
    </script>
</body>
</html>"""

@app.get("/", response_class=HTMLResponse)
async def root():
    return HTMLResponse(content=HTML_CONTENT)

@app.get("/execute")
async def execute_get(command: str, files=None):
    if not command or not command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    if command.startswith('python '):
        command = 'python3 ' + command[7:]
    validate_command(command)

    container_id = str(uuid.uuid4())[:8]
    logging.info(f"Creating container {container_id} for command: {command}")

    if files is None:
        files = []

    async def generate():
        try:
            import asyncio
            import time
            import shutil

            start_time = time.time()
            timeout_seconds = 30.0

            with tempfile.TemporaryDirectory() as temp_dir:
                workspace_dir = os.path.join(temp_dir, 'workspace')
                os.makedirs(workspace_dir)

                if files:
                    for file in files:
                        content = await file.read()
                        file_path = os.path.join(workspace_dir, file.filename)
                        with open(file_path, 'wb') as f:
                            f.write(content)

                with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False, dir=temp_dir) as script_file:
                    script_content = f"""#!/bin/bash
cd /workspace
{command}
"""
                    script_file.write(script_content)
                    script_path = script_file.name

                os.chmod(script_path, 0o755)

                docker_cmd = [
                    'docker', 'run',
                    '--rm',
                    '--name', f'forge-exec-{container_id}',
                    '--cpus', '0.25',
                    '--memory', '1g',
                    '--memory-swap', '1g',
                    '--network', 'none',
                    '--read-only',
                    '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',
                    '--env', 'PYTHONUNBUFFERED=1',
                    '--volume', f'{workspace_dir}:/workspace:rw',
                    '--volume', f'{script_path}:/script.sh:ro',
                    '--workdir', '/workspace',
                    'python:3.11-slim',
                    'bash', '/script.sh'
                ]

                process = subprocess.Popen(
                    docker_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )

                while True:
                    if time.time() - start_time > timeout_seconds:
                        try:
                            subprocess.run(['docker', 'kill', f'forge-exec-{container_id}'], timeout=5)
                        except:
                            pass
                        yield f"data: Command timed out after 30 seconds\n\n"
                        break

                    try:
                        line = await asyncio.wait_for(
                            asyncio.get_event_loop().run_in_executor(None, process.stdout.readline),
                            timeout=1.0
                        )
                        if line:
                            yield f"data: {line.rstrip()}\n\n"
                        else:
                            break
                    except asyncio.TimeoutError:
                        continue

                process.wait()

                if process.returncode != 0:
                    yield f"data: Command failed with exit code {process.returncode}\n\n"

        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
        finally:
            try:
                subprocess.run(['docker', 'rm', '-f', f'forge-exec-{container_id}'], timeout=5, capture_output=True)
            except:
                pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

@app.post("/execute")
async def execute_post(request: Request):
    form = await request.form()
    command = form.get("command")
    files = []

    for field_name, field_value in form.items():
        if field_name == "command":
            command = field_value
        elif hasattr(field_value, 'filename'):
            files.append(field_value)

    if not command:
        raise HTTPException(status_code=400, detail="Command is required")

    return await execute_get(command, files)

@app.get("/ping")
async def ping(request: Request):
    client_ip = request.client.host
    current_time = datetime.now()

    ip_timestamps[client_ip] = current_time

    return {"message": "pong", "files_count": len(files)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
