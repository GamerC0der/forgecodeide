'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

declare global {
  interface Window {
    loadPyodide: (config?: any) => Promise<any>;
  }
}

const renderMarkdown = (text: string) => {
  const formatInline = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-gray-300">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-800 text-green-400 px-1 py-0.5 rounded text-sm">$1</code>');
  };

  return text
    .split('\n')
    .map((line, index) => {
      if (line.startsWith('# ')) {
        return <h1 key={index} className="text-2xl font-bold mb-3 text-blue-400" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />;
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-bold mb-2 text-blue-300" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(3)) }} />;
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-semibold mb-2 text-blue-200" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(4)) }} />;
      }
      if (line.startsWith('- ')) {
        return <li key={index} className="ml-4 mb-1 text-gray-300" dangerouslySetInnerHTML={{ __html: '• ' + formatInline(line.slice(2)) }} />;
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return <p key={index} className="mb-2 text-gray-100 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />;
    });
};

export default function Home() {
  const editorRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalHeight, setTerminalHeight] = useState(128);
  const [isDragging, setIsDragging] = useState(false);
  const [isPythonRepl, setIsPythonRepl] = useState(false);
  const [pythonReplLines, setPythonReplLines] = useState<string[]>([]);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideInstance, setPyodideInstance] = useState<any>(null);
  const [files, setFiles] = useState<string[]>(['app.py']);
  const [selectedFile, setSelectedFile] = useState<string>('app.py');
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    'app.py': `print("Hello, World!")

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")
`
  });
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [fileTypeSearch, setFileTypeSearch] = useState('');

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = containerRect.height - e.clientY;
    const clampedHeight = Math.max(80, Math.min(containerRect.height - 200, newHeight));
    setTerminalHeight(clampedHeight);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const loadPyodide = async () => {
      try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
        script.onload = async () => {
          const pyodide = await (window as any).loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
          });
          setPyodideInstance(pyodide);
          setPyodideReady(true);
        };
        document.head.appendChild(script);
      } catch (error) {
        console.error('Failed to load Pyodide:', error);
      }
    };

    loadPyodide();
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      const isPythonFile = selectedFile.endsWith('.py');
      const extensions = [
        basicSetup,
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            setFileContents(prev => ({
              ...prev,
              [selectedFile]: newContent
            }));
          }
        }),
        EditorView.theme({
          "&": { height: "100%", width: "100%" },
          ".cm-scroller": { height: "100%" },
        }),
      ];

      if (isPythonFile) {
        extensions.splice(1, 0, python());
      }

      const startState = EditorState.create({
        doc: fileContents[selectedFile] || '',
        extensions,
      });

      const view = new EditorView({
        state: startState,
        parent: editorRef.current,
      });

      editorViewRef.current = view;

      return () => {
        view.destroy();
        editorViewRef.current = null;
      };
    }
  }, [selectedFile]);

  useEffect(() => {
    if (editorViewRef.current && selectedFile) {
      const currentContent = editorViewRef.current.state.doc.toString();
      const fileContent = fileContents[selectedFile] || '';
      if (currentContent !== fileContent) {
        editorViewRef.current.dispatch({
          changes: { from: 0, to: currentContent.length, insert: fileContent }
        });
      }
    }
  }, [selectedFile, fileContents]);

  const executePythonCode = async (code: string): Promise<string> => {
    if (!pyodideReady || !pyodideInstance) {
      return 'Python not ready yet...';
    }

    const trimmedCode = code.trim();

    if (trimmedCode === 'help') {
      return `Type help() for interactive help, or help(object) for help about object.`;
    }

    if (trimmedCode === 'help()') {
      return `Welcome to Python 3.12's help utility! If this is your first time using
Python, you should definitely check out the tutorial at
https://docs.python.org/3.12/tutorial/.

Enter the name of any module, keyword, or topic to get help on writing
Python programs and using Python modules.  To get a list of available
modules, keywords, symbols, or topics, enter "modules", "keywords",
"symbols", or "topics".

Each module also comes with a one-line summary of what it does; to list
the modules whose name or summary contain a given string such as "spam",
enter "modules spam".

To quit this help utility and return to the interpreter,
enter "q" or "quit".`;
    }

    if (trimmedCode === 'copyright') {
      return `Copyright (c) 2001-2023 Python Software Foundation.
All Rights Reserved.

Copyright (c) 2000 BeOpen.com.
All Rights Reserved.

Copyright (c) 1995-2001 Corporation for National Research Initiatives.
All Rights Reserved.

Copyright (c) 1991-1995 Stichting Mathematisch Centrum, Amsterdam.
All Rights Reserved.`;
    }

    if (trimmedCode === 'credits') {
      return `Thanks to CWI, CNRI, BeOpen.com, Zope Corporation and a cast of thousands
for supporting Python development.  See www.python.org for more information.`;
    }

    if (trimmedCode === 'license') {
      return `Type license() to see the full license text`;
    }

    if (trimmedCode === 'license()') {
      return `1. This LICENSE AGREEMENT is between the Python Software Foundation ("PSF"), and
   the Individual or Organization ("Licensee") accessing and otherwise using this
   software ("Python") in source or binary form and its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
   grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
   analyze, test, perform and/or display publicly, prepare derivative works,
   distribute, and otherwise use Python alone or in any derivative
   version, provided, however, that PSF's License Agreement and PSF's notice of
   copyright, i.e., "Copyright © 2001-2024 Python Software Foundation; All Rights
   Reserved" are retained in Python alone or in any derivative version
   prepared by Licensee.

3. In the event Licensee prepares a derivative work that is based on or
   incorporates Python or any part thereof, and wants to make the
   derivative work available to others as provided herein, then Licensee hereby
   agrees to include in any such work a brief summary of the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS" basis.
   PSF MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED.  BY WAY OF
   EXAMPLE, BUT NOT LIMITATION, PSF MAKES NO AND DISCLAIMS ANY REPRESENTATION OR
   WARRANTY OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE
   USE OF PYTHON WILL NOT INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON
   FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF
   MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON, OR ANY DERIVATIVE
   THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material breach of
   its terms and conditions.

7. Nothing in this License Agreement shall be deemed to create any relationship
   of agency, partnership, or joint venture between PSF and Licensee.  This License
   Agreement does not grant permission to use PSF trademarks or trade name in a
   trademark sense to endorse or promote products or services of Licensee, or any
   third party.

8. By copying, installing or otherwise using Python, Licensee agrees
   to be bound by the terms and conditions of this License Agreement.`;
    }

    try {
      let output = '';
      pyodideInstance.runPython(`
import sys
from io import StringIO

def mock_input(prompt=""):
    return "input() not supported in browser - use a default value instead"

old_stdout = sys.stdout
sys.stdout = captured_output = StringIO()
sys.modules['builtins'].input = mock_input
      `);

      pyodideInstance.runPython(code);

      output = pyodideInstance.runPython('captured_output.getvalue()');

      pyodideInstance.runPython('sys.stdout = old_stdout');

      return output.trim();
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  };

  const executePythonCommand = async (command: string): Promise<string[]> => {
    const args = command.trim().split(/\s+/);

    if (args.length === 1) {
      setIsPythonRepl(true);
      setPythonReplLines([]);
      return ['Python 3.11.3 (main, Apr  5 2023, 12:00:00) [GCC 11.4.0] on linux', 'Type "help", "copyright", "credits" or "license" for more information.'];
    } else if (args.length === 2) {
      const fileName = args[1];
      if (fileName.endsWith('.py')) {
        if (files.includes(fileName)) {
          const fileContent = fileContents[fileName] || '';
          const result = await executePythonCode(fileContent);
          return result.split('\n').filter(line => line.trim());
        } else {
          return [`python: can't open file '${fileName}': No such file or directory`];
        }
      } else {
        return [`python: can't open file '${fileName}': No such file or directory`];
      }
    } else if (args[1] === '-c' && args.length > 2) {
      const code = args.slice(2).join(' ');
      const result = await executePythonCode(code);
      return result ? [result] : [];
    }

    return ['python: invalid syntax or command'];
  };

  const handleRenameFile = (index: number) => {
    setRenamingIndex(index);
    setRenameInput(files[index]);
  };

  const handleConfirmRename = () => {
    if (renamingIndex !== null && renameInput.trim()) {
      const oldFileName = files[renamingIndex];
      const newFileName = renameInput.trim();

      const newFiles = [...files];
      newFiles[renamingIndex] = newFileName;
      setFiles(newFiles);

      const newFileContents = { ...fileContents };
      newFileContents[newFileName] = newFileContents[oldFileName];
      delete newFileContents[oldFileName];
      setFileContents(newFileContents);

      if (selectedFile === oldFileName) {
        setSelectedFile(newFileName);
      }
    }
    setRenamingIndex(null);
    setRenameInput('');
  };

  const handleCancelRename = () => {
    setRenamingIndex(null);
    setRenameInput('');
  };

  const handleDeleteFile = (index: number) => {
    const fileToDelete = files[index];
    setFiles(prev => prev.filter((_, i) => i !== index));

    const newFileContents = { ...fileContents };
    delete newFileContents[fileToDelete];
    setFileContents(newFileContents);

    if (selectedFile === fileToDelete) {
      const remainingFiles = files.filter((_, i) => i !== index);
      setSelectedFile(remainingFiles.length > 0 ? remainingFiles[0] : '');
    }
  };

  const handleTerminalKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const input = terminalInput.trim();
      const output: string[] = [];

      if (isPythonRepl) {
        if (input === 'exit()' || input === 'quit()') {
          setIsPythonRepl(false);
          setPythonReplLines([]);
          output.push('>>> exit()');
          output.push('$ ');
        } else {
          output.push(`>>> ${input}`);
          const result = await executePythonCode(input);
          if (result) {
            output.push(result);
          }
        }
      } else {
        if (input) {
          output.push(`$ ${input}`);

          if (input.startsWith('python ') || input.startsWith('python3 ')) {
            const pythonOutput = await executePythonCommand(input);
            output.push(...pythonOutput);
          } else if (input === 'python' || input === 'python3') {
            const pythonOutput = await executePythonCommand(input);
            output.push(...pythonOutput);
          } else if (input === 'clear') {
            setTerminalHistory([]);
            setTerminalInput('');
            return;
          } else if (input === 'ls') {
            files.forEach(file => output.push(file));
          } else if (input === 'whoami') {
            output.push('forge');
          } else if (input === 'help') {
            output.push('Available commands:');
            output.push('  python [file.py]    - Run any Python file');
            output.push('  python -c "code"    - Execute Python code directly');
            output.push('  python              - Start Python REPL');
            output.push('  ls                  - List files');
            output.push('  whoami              - Show current user');
            output.push('  clear               - Clear terminal');
            output.push('  help                - Show this help');
          } else {
            output.push(`Command not found: ${input}`);
          }
        } else {
          if (!isPythonRepl) {
            output.push('$ ');
          }
        }
      }

      if (output.length > 0) {
        setTerminalHistory(prev => [...prev, ...output]);
      }
      setTerminalInput('');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-row">
      <div className="w-64 bg-gray-800 border-r border-gray-600 flex flex-col">
        <div className="p-4 border-b border-gray-600">
          <h2 className="text-white text-lg font-semibold mb-2">Files</h2>
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded"
            onClick={() => setShowNewFileModal(true)}
          >
            + New File
          </button>
        </div>
        <div className="flex-1 p-2">
          {files.map((file, index) => (
            <div
              key={index}
              className={`text-sm py-1 px-2 hover:bg-gray-700 rounded cursor-pointer relative group ${
                selectedFile === file ? 'bg-gray-700 text-white' : 'text-gray-300'
              }`}
              onClick={() => setSelectedFile(file)}
              onContextMenu={(e) => {
                e.preventDefault();
              }}
            >
              {renamingIndex === index ? (
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                  onBlur={handleConfirmRename}
                  className="bg-gray-600 text-white text-sm px-2 py-1 rounded w-full outline-none"
                  autoFocus
                />
              ) : (
                <>
                  <span>{file}</span>
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 flex space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameFile(index);
                      }}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(index);
                      }}
                      className="text-xs text-gray-400 hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-600">
          <span className="text-white text-sm font-medium">{selectedFile}</span>
        </div>
        <div ref={containerRef} className="flex-1 flex flex-col">
          {selectedFile.endsWith('.md') ? (
            <div className="flex flex-1">
              <div ref={editorRef} className="flex-1 border-r border-gray-600" style={{ background: '#1e1e1e' }} />
              <div className="flex-1 p-4 bg-gray-900 text-gray-100 overflow-y-auto">
                {renderMarkdown(fileContents[selectedFile] || '')}
              </div>
            </div>
          ) : (
            <div ref={editorRef} className="flex-1" />
          )}
          <div
            className="bg-gray-700 hover:bg-gray-600 cursor-row-resize select-none flex items-center justify-center text-gray-400 text-xs"
            style={{ height: '4px' }}
            onMouseDown={handleMouseDown}
          >
            ⋯
          </div>
          <div
            className="bg-black border-t border-gray-600 font-mono text-sm overflow-y-auto"
            style={{ height: `${terminalHeight}px` }}
          >
            <div className="p-2 space-y-1">
              {terminalHistory.map((line, index) => (
                <div key={index} className="text-green-400">{line}</div>
              ))}
              <div className="flex items-center">
                <span className="text-green-400 mr-2">{isPythonRepl ? '>>>' : '$'}</span>
                <input
                  ref={terminalRef}
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyPress={handleTerminalKeyPress}
                  className="flex-1 bg-transparent text-green-400 outline-none"
                  placeholder=""
                  autoFocus
                />
                <span className="text-green-400 animate-pulse">█</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNewFileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-white text-lg font-semibold mb-4">Create New File</h3>

            <input
              type="text"
              placeholder="Search file types..."
              value={fileTypeSearch}
              onChange={(e) => setFileTypeSearch(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="space-y-2 mb-4">
              {['.py', '.md', '.txt'].filter(type =>
                fileTypeSearch === '' ||
                type.toLowerCase().includes(fileTypeSearch.toLowerCase()) ||
                (type === '.py' && 'python'.includes(fileTypeSearch.toLowerCase())) ||
                (type === '.md' && 'markdown'.includes(fileTypeSearch.toLowerCase())) ||
                (type === '.txt' && 'text'.includes(fileTypeSearch.toLowerCase()))
              ).map((fileType) => (
                <button
                  key={fileType}
                  onClick={() => {
                    const baseName = fileType === '.py' ? 'script' : fileType === '.md' ? 'note' : 'document';
                    let counter = 1;
                    let newFileName = `${baseName}${counter}${fileType}`;
                    while (files.includes(newFileName)) {
                      counter++;
                      newFileName = `${baseName}${counter}${fileType}`;
                    }

                    setFiles(prev => [...prev, newFileName]);
                    setFileContents(prev => ({
                      ...prev,
                      [newFileName]: ''
                    }));
                    setSelectedFile(newFileName);
                    setShowNewFileModal(false);
                    setFileTypeSearch('');
                  }}
                  className="w-full text-left bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {fileType === '.py' ? 'Python File' : fileType === '.md' ? 'Markdown File' : 'Text File'}
                    </span>
                    <span className="text-gray-400 text-sm">{fileType}</span>
                  </div>
                  <div className="text-gray-400 text-sm">
                    {fileType === '.py' ? 'Python script with syntax highlighting' : fileType === '.md' ? 'Markdown with live preview' : 'Plain text document'}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowNewFileModal(false);
                  setFileTypeSearch('');
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
