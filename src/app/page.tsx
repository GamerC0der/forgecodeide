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

const API_BASE_URL = '/api/proxy';

export default function Home() {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [outputType, setOutputType] = useState<'python' | null>(null);
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeView, setActiveView] = useState<'explorer' | 'plugins'>('explorer');
  const [pluginSearch, setPluginSearch] = useState('');

  const createVM = useCallback(async () => {
    if (isCreatingVM) {
      return null;
    }

    try {
      setIsCreatingVM(true);

      const response = await fetch(`${API_BASE_URL}/vm`, {
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
    if (!vmUuid) {
      const storedVmUuid = localStorage.getItem('forgecode_vm_uuid');
      if (storedVmUuid) {
        setVmUuid(storedVmUuid);
        setVmWasLoaded(true);
      }
    }
  }, [vmUuid]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMoreMenu && !(event.target as Element).closest('.more-menu-container')) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const executePythonCode = async (code: string): Promise<void> => {
    setOutput([]);
    setShowOutput(true);
    setOutputType('python');

    try {
      const response = await fetch(`${API_BASE_URL}/vm/default/python`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code
        }),
      });

      if (!response.ok) {
        setOutput([`Error: ${response.status} ${response.statusText}`]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setOutput(['Error: Unable to read response']);
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
              setOutput([...outputLines]);
            }
          }
        }
      }
    } catch (error: any) {
      setOutput([`Error: ${error.message}`]);
    }
  };


  const executePythonCommand = useCallback(async (command: string): Promise<void> => {
    const args = command.trim().split(/\s+/);

    if (args.length === 1) {
      setOutput(['python: missing filename or -c option']);
      setShowOutput(true);
      setOutputType('python');
      return;
    } else if (args.length === 2) {
      const fileName = args[1];
      if (fileName.endsWith('.py')) {
        if (files.includes(fileName)) {
          const fileContent = fileContents[fileName] || '';
          setOutput([]);
          setShowOutput(true);
          setOutputType('python');

          try {
            const response = await fetch(`${API_BASE_URL}/vm/default/python`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code: fileContent
              }),
            });

            if (!response.ok) {
              setOutput([`Error: ${response.status} ${response.statusText}`]);
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              setOutput(['Error: Unable to read response']);
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
                    setOutput([...outputLines]);
                  }
                }
              }
            }
          } catch (error: any) {
            setOutput([`Error: ${error.message}`]);
          }
        } else {
          setOutput([`python: can't open file '${fileName}': No such file or directory`]);
          setShowOutput(true);
          setOutputType('python');
        }
      } else {
        setOutput([`python: can't open file '${fileName}': No such file or directory`]);
        setShowOutput(true);
        setOutputType('python');
      }
    } else if (args[1] === '-c' && args.length > 2) {
      const code = args.slice(2).join(' ');
      await executePythonCode(code);
    } else {
      setOutput(['python: invalid syntax or command']);
      setShowOutput(true);
      setOutputType('python');
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

  const handleClearAllFiles = () => {
    setFiles([]);
    setFileContents({});
    setSelectedFile('');
    setShowMoreMenu(false);
  };


  return (
    <div className="h-screen w-screen flex flex-row relative">
      {isCreatingVM && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="text-white text-xl font-semibold">Loading...</div>
        </div>
      )}
      <div className="w-12 bg-gray-900 border-r border-gray-600 flex flex-col items-center py-2">
        <div
          className={`w-8 h-8 rounded hover:bg-gray-700 flex items-center justify-center cursor-pointer mb-2 group ${activeView === 'explorer' ? 'bg-gray-700' : ''}`}
          onClick={() => {
            setActiveView('explorer');
            setShowSidebar(true);
          }}
          title="Explorer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-white">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
          </svg>
        </div>

        <div
          className={`w-8 h-8 rounded hover:bg-gray-700 flex items-center justify-center cursor-pointer mb-2 group ${activeView === 'plugins' ? 'bg-gray-700' : ''}`}
          onClick={() => {
            setActiveView('plugins');
            setShowSidebar(true);
          }}
          title="Plugins"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-white">
            <rect width="7" height="7" x="3" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="14" rx="1"/>
            <rect width="7" height="7" x="3" y="14" rx="1"/>
          </svg>
        </div>
      </div>

      {showSidebar && (
        <div className="w-64 bg-gray-800 border-r border-gray-600 flex flex-col">
          {activeView === 'explorer' ? (
            <>
              <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-xs font-medium uppercase tracking-wide">Explorer</span>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-6 h-6 rounded hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                      onClick={() => setShowNewFileModal(true)}
                      title="New File"
                    >
                      <span className="text-sm">+</span>
                    </button>
                    <div className="relative more-menu-container">
                      <button
                        className="w-6 h-6 rounded hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        title="More Actions"
                      >
                        <span className="text-xs">⋯</span>
                      </button>

                      {showMoreMenu && (
                        <div className="absolute top-8 right-0 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-32">
                          <button
                            onClick={handleClearAllFiles}
                            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="px-2 py-1">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className={`text-sm py-1 px-2 hover:bg-gray-700 rounded cursor-pointer relative group transition-colors ${
                        selectedFile === file ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
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
                          <span className="truncate">{file}</span>
                          <div className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 flex">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameFile(index);
                              }}
                              className="w-6 h-6 rounded hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white"
                              title="Rename"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(index);
                              }}
                              className="w-6 h-6 rounded hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-red-400"
                              title="Delete"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-2 border-t border-gray-700 bg-gray-800">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{files.length} files</span>
                  <span>UTF-8</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-xs font-medium uppercase tracking-wide">Plugins</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-4">
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search plugins..."
                      value={pluginSearch}
                      onChange={(e) => setPluginSearch(e.target.value)}
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="text-center py-8">
                    <div className="text-gray-500 text-sm">No plugins installed</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-600">
          <span className="text-white text-sm font-medium">{selectedFile}</span>
          {selectedFile && !selectedFile.endsWith('.md') && !selectedFile.endsWith('.txt') && (
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
          )}
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

          {showOutput && (
            <div className="absolute bottom-0 left-0 right-0 bg-black border-t border-gray-600 font-mono text-sm max-h-64 overflow-y-auto z-40">
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-green-400">Python Output</span>
                  <button
                    onClick={() => setShowOutput(false)}
                    className="text-gray-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
                {output.map((line, index) => (
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
