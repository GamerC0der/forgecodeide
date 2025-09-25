'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';


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
  const editorViewRef = useRef<EditorView | null>(null);
  const [pythonOutput, setPythonOutput] = useState<string[]>([]);
  const [showPythonOutput, setShowPythonOutput] = useState(false);
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
  const [vmUuid, setVmUuid] = useState<string | null>(null);
  const [isCreatingVM, setIsCreatingVM] = useState(false);
  const [vmWasLoaded, setVmWasLoaded] = useState(false);

  const createVM = useCallback(async () => {
    if (isCreatingVM) {
      return null;
    }

    try {
      setIsCreatingVM(true);

      const response = await fetch('http://localhost:5000/vm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vcpu: 0.25,
          memory: '512m'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create VM: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const uuid = data.vm_id;

      localStorage.setItem('forgecode_vm_uuid', uuid);
      setVmUuid(uuid);
      setVmWasLoaded(false);
      setIsCreatingVM(false);

      return uuid;
    } catch (error) {
      console.error('Failed to create VM:', error);
      setIsCreatingVM(false);
      return null;
    }
  }, [isCreatingVM]);





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

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:5000/poll');
        const data = await response.json();

        if (vmUuid && !data.vms.includes(vmUuid)) {
          setVmUuid(null);
          localStorage.removeItem('forgecode_vm_uuid');
          setVmWasLoaded(false);
        }
      } catch (error) {
        console.error('Failed to poll VMs:', error);
      }
    }, 500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [vmUuid]);

  useEffect(() => {
    if (!vmUuid) {
      const storedVmUuid = localStorage.getItem('forgecode_vm_uuid');
      if (storedVmUuid) {
        setVmUuid(storedVmUuid);
        setVmWasLoaded(true);
      }
    }
  }, [vmUuid]);

  const executePythonCode = async (code: string): Promise<void> => {
    setPythonOutput([]);
    setShowPythonOutput(true);

    try {
      const response = await fetch(`http://localhost:5000/vm/default/python`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code
        }),
      });

      if (!response.ok) {
        setPythonOutput([`Error: ${response.status} ${response.statusText}`]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setPythonOutput(['Error: Unable to read response']);
        return;
      }

      const decoder = new TextDecoder();
      const outputLines: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '');
            if (data.trim()) {
              outputLines.push(data);
              setPythonOutput([...outputLines]);
            }
          }
        }
      }
    } catch (error: any) {
      setPythonOutput([`Error: ${error.message}`]);
    }
  };


  const executePythonCommand = useCallback(async (command: string): Promise<void> => {
    const args = command.trim().split(/\s+/);

    if (args.length === 1) {
      setPythonOutput(['python: missing filename or -c option']);
      setShowPythonOutput(true);
      return;
    } else if (args.length === 2) {
      const fileName = args[1];
      if (fileName.endsWith('.py')) {
        if (files.includes(fileName)) {
          const fileContent = fileContents[fileName] || '';
          setPythonOutput([]);
          setShowPythonOutput(true);

          try {
            const response = await fetch(`http://localhost:5000/vm/default/python`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code: fileContent
              }),
            });

            if (!response.ok) {
              setPythonOutput([`Error: ${response.status} ${response.statusText}`]);
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              setPythonOutput(['Error: Unable to read response']);
              return;
            }

            const decoder = new TextDecoder();
            const outputLines: string[] = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.replace('data: ', '');
                  if (data.trim()) {
                    outputLines.push(data);
                    setPythonOutput([...outputLines]);
                  }
                }
              }
            }
          } catch (error: any) {
            setPythonOutput([`Error: ${error.message}`]);
          }
        } else {
          setPythonOutput([`python: can't open file '${fileName}': No such file or directory`]);
          setShowPythonOutput(true);
        }
      } else {
        setPythonOutput([`python: can't open file '${fileName}': No such file or directory`]);
        setShowPythonOutput(true);
      }
    } else if (args[1] === '-c' && args.length > 2) {
      const code = args.slice(2).join(' ');
      await executePythonCode(code);
    } else {
      setPythonOutput(['python: invalid syntax or command']);
      setShowPythonOutput(true);
    }
  }, [files, fileContents]);

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


  return (
    <div className="h-screen w-screen flex flex-row relative">
      {isCreatingVM && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="text-white text-xl font-semibold">Loading...</div>
        </div>
      )}
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
          <button
            onClick={async () => {
              if (selectedFile && selectedFile.endsWith('.py')) {
                const code = fileContents[selectedFile] || '';
                await executePythonCode(code);
              }
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-2"
            disabled={!selectedFile || !selectedFile.endsWith('.py')}
          >
            ▶️ Run Python
          </button>
        </div>
        <div className="flex-1 flex flex-col">
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

          {showPythonOutput && (
            <div className="absolute bottom-0 left-0 right-0 bg-black border-t border-gray-600 font-mono text-sm max-h-64 overflow-y-auto z-40">
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400 text-xs">Python Output</span>
                  <button
                    onClick={() => setShowPythonOutput(false)}
                    className="text-gray-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
                {pythonOutput.map((line, index) => (
                  <div key={index} className="text-green-400">{line}</div>
                ))}
              </div>
            </div>
          )}
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
