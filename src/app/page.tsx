'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';



const WebSpacePreview = ({ selectedFile, fileContents, lightMode, editorRef }: {
  selectedFile: string;
  fileContents: Record<string, string>;
  lightMode: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const spaceName = selectedFile.split('/')[0];

  const htmlFile = `${spaceName}/index.html`;
  const cssFile = `${spaceName}/styles.css`;
  const jsFile = `${spaceName}/script.js`;

  const previewHTML = React.useMemo(() => {
    const html = fileContents[htmlFile] || '';
    let css = fileContents[cssFile] || '';

    if (!css.trim()) {
      css = lightMode ? `body {
    font-family: Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f5f5f5;
    color: #333;
}

h1 {
    color: #333;
    text-align: center;
}

p {
    color: #666;
    line-height: 1.6;
}` : `body {
    font-family: Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background-color: #1a1a1a;
    color: #ffffff;
}

h1 {
    color: #ffffff;
    text-align: center;
}

p {
    color: #cccccc;
    line-height: 1.6;
}`;
    }

    const js = fileContents[jsFile] || '';

    let resultHTML = html;

    if (css && !resultHTML.includes('<style>')) {
      resultHTML = resultHTML.replace('</head>', `<style>${css}</style></head>`);
    }

    if (js && !resultHTML.includes('<script>') && !resultHTML.includes('src="script.js"')) {
      resultHTML = resultHTML.replace('</body>', `<script>${js}</script></body>`);
    }

    return resultHTML;
  }, [fileContents[htmlFile], fileContents[cssFile], fileContents[jsFile], lightMode]);

  return (
    <div className="flex flex-1">
      {/* Code Editor */}
      <div ref={editorRef} className="flex-1 border-r border-gray-600" />

      {/* Preview */}
      <div className={`flex-1 ${lightMode ? 'bg-white' : 'bg-gray-800'}`}>
        <div className="h-full p-2">
          <div className={`text-xs mb-2 transition-colors ${lightMode ? 'text-gray-600' : 'text-gray-300'}`}>Live Preview</div>
          <iframe
            srcDoc={previewHTML}
            className={`w-full h-full border rounded transition-colors ${lightMode ? 'border-gray-300' : 'border-gray-600'}`}
            title="Web Space Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
};

const renderMarkdown = (text: string, lightMode: boolean) => {
  const formatInline = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, `<strong class="font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}">$1</strong>`)
      .replace(/\*(.*?)\*/g, `<em class="${lightMode ? 'text-gray-700' : 'text-gray-300'}">$1</em>`)
      .replace(/`(.*?)`/g, `<code class="px-1 py-0.5 rounded text-sm ${lightMode ? 'bg-gray-200 text-green-600' : 'bg-gray-800 text-green-400'}">$1</code>`);
  };

  return text
    .split('\n')
    .map((line, index) => {
      if (line.startsWith('# ')) {
        return <h1 key={index} className={`text-2xl font-bold mb-3 ${lightMode ? 'text-blue-600' : 'text-blue-400'}`} dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />;
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className={`text-xl font-bold mb-2 ${lightMode ? 'text-blue-500' : 'text-blue-300'}`} dangerouslySetInnerHTML={{ __html: formatInline(line.slice(3)) }} />;
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className={`text-lg font-semibold mb-2 ${lightMode ? 'text-blue-400' : 'text-blue-200'}`} dangerouslySetInnerHTML={{ __html: formatInline(line.slice(4)) }} />;
      }
      if (line.startsWith('- ')) {
        return <li key={index} className={`ml-4 mb-1 ${lightMode ? 'text-gray-700' : 'text-gray-300'}`} dangerouslySetInnerHTML={{ __html: '• ' + formatInline(line.slice(2)) }} />;
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return <p key={index} className={`mb-2 leading-relaxed ${lightMode ? 'text-gray-900' : 'text-gray-100'}`} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />;
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
  const [lightMode, setLightMode] = useState(false);

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





  const lightTheme = EditorView.theme({
    "&": {
      height: "100%",
      width: "100%",
      backgroundColor: "#f9f9f9",
      color: "#24292e"
    },
    ".cm-scroller": {
      height: "100%"
    },
    ".cm-focused": {
      outline: "none"
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(0, 123, 255, 0.2) !important"
    },
    ".cm-line": {
      color: "#24292e"
    },
    ".cm-cursor": {
      borderLeftColor: "#24292e"
    },
    ".cm-gutter": {
      backgroundColor: "#f9f9f9",
      color: "#6c757d",
      border: "none"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#e9ecef"
    }
  });

  useEffect(() => {
    if (editorRef.current) {
      const extensions = [
        basicSetup,
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

      if (lightMode) {
        extensions.splice(1, 0, lightTheme);
      } else {
        extensions.splice(1, 0, oneDark);
      }
      if (selectedFile.endsWith('.py')) {
        extensions.splice(1, 0, python());
      } else if (selectedFile.endsWith('.js')) {
        extensions.splice(1, 0, javascript());
      } else if (selectedFile.endsWith('.html')) {
        extensions.splice(1, 0, html());
      } else if (selectedFile.endsWith('.css')) {
        extensions.splice(1, 0, css());
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
  }, [selectedFile, lightMode]);

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
          if (line.trim()) {
            const cleanLine = line.replace(/^data:\s*/g, '').trim();
            if (cleanLine) {
              outputLines.push(cleanLine);
              setOutput([...outputLines]);
            }
          }
        }
      }
    } catch (error: unknown) {
      setOutput([`Error: ${error instanceof Error ? error.message : String(error)}`]);
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
                if (line.trim()) {
                  const cleanLine = line.replace(/^data:\s*/g, '').trim();
                  if (cleanLine) {
                    outputLines.push(cleanLine);
                    setOutput([...outputLines]);
                  }
                }
              }
            }
          } catch (error: unknown) {
            setOutput([`Error: ${error instanceof Error ? error.message : String(error)}`]);
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
    <div className={`h-screen w-screen flex flex-row relative transition-colors ${lightMode ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white'}`}>
      {isCreatingVM && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className={`text-xl font-semibold transition-colors ${lightMode ? 'text-gray-900' : 'text-white'}`}>Loading...</div>
        </div>
      )}
      <div className={`w-12 border-r flex flex-col items-center py-2 transition-colors ${lightMode ? 'bg-gray-200 border-gray-300' : 'bg-gray-900 border-gray-600'}`}>
        <div
          className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer mb-2 group transition-colors ${lightMode
            ? `hover:bg-gray-300 ${activeView === 'explorer' ? 'bg-gray-300' : ''}`
            : `hover:bg-gray-700 ${activeView === 'explorer' ? 'bg-gray-700' : ''}`
          }`}
          onClick={() => {
            setActiveView('explorer');
            setShowSidebar(true);
          }}
          title="Explorer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-colors ${lightMode ? 'text-gray-600 group-hover:text-gray-900' : 'text-gray-400 group-hover:text-white'}`}>
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
          </svg>
        </div>

        <div
          className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer mb-2 group transition-colors ${lightMode
            ? `hover:bg-gray-300 ${activeView === 'plugins' ? 'bg-gray-300' : ''}`
            : `hover:bg-gray-700 ${activeView === 'plugins' ? 'bg-gray-700' : ''}`
          }`}
          onClick={() => {
            setActiveView('plugins');
            setShowSidebar(true);
          }}
          title="Plugins"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-colors ${lightMode ? 'text-gray-600 group-hover:text-gray-900' : 'text-gray-400 group-hover:text-white'}`}>
            <rect width="7" height="7" x="3" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="14" rx="1"/>
            <rect width="7" height="7" x="3" y="14" rx="1"/>
          </svg>
        </div>
      </div>

      {showSidebar && (
        <div className={`w-64 border-r flex flex-col transition-colors ${lightMode ? 'bg-gray-50 border-gray-300' : 'bg-gray-800 border-gray-600'}`}>
          {activeView === 'explorer' ? (
            <>
              <div className={`px-4 py-2 border-b transition-colors ${lightMode ? 'border-gray-300 bg-gray-100' : 'border-gray-700 bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium uppercase tracking-wide transition-colors ${lightMode ? 'text-gray-700' : 'text-gray-300'}`}>Explorer</span>
                  <div className="flex items-center gap-1">
                    <button
                      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${lightMode ? 'hover:bg-gray-300 text-gray-600 hover:text-gray-900' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                      onClick={() => setShowNewFileModal(true)}
                      title="New File"
                    >
                      <span className="text-sm">+</span>
                    </button>
                    <div className="relative more-menu-container">
                      <button
                        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${lightMode ? 'hover:bg-gray-300 text-gray-600 hover:text-gray-900' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        title="More Actions"
                      >
                        <span className="text-xs">⋯</span>
                      </button>

                      {showMoreMenu && (
                        <div className={`absolute top-8 right-0 border rounded shadow-lg z-50 min-w-32 transition-colors ${lightMode ? 'bg-white border-gray-300' : 'bg-gray-800 border-gray-600'}`}>
                          <button
                            onClick={handleClearAllFiles}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${lightMode ? 'text-gray-700 hover:bg-gray-200 hover:text-gray-900' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
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
                  {files.map((file, index) => {
                    const isWebSpaceFile = file.includes('/');
                    const indentLevel = isWebSpaceFile ? 1 : 0;

                    return (
                      <div
                        key={index}
                        className={`text-sm py-1 px-2 hover:bg-gray-700 rounded cursor-pointer relative group transition-colors ${
                          selectedFile === file
                            ? 'bg-blue-600 text-white'
                            : lightMode
                              ? 'text-gray-700 hover:bg-gray-300 hover:text-gray-900'
                              : 'text-gray-300 hover:text-white'
                        }`}
                        style={{ paddingLeft: `${8 + indentLevel * 16}px` }}
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
                          className={`text-sm px-2 py-1 rounded w-full outline-none transition-colors ${lightMode ? 'bg-gray-200 text-gray-900' : 'bg-gray-600 text-white'}`}
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
                              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${lightMode ? 'hover:bg-gray-400 text-gray-600 hover:text-gray-900' : 'hover:bg-gray-600 text-gray-400 hover:text-white'}`}
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
                              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${lightMode ? 'hover:bg-gray-400 text-gray-600 hover:text-red-600' : 'hover:bg-gray-600 text-gray-400 hover:text-red-400'}`}
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
                    );
                  })}
                </div>
              </div>

              <div className={`px-4 py-2 border-t transition-colors ${lightMode ? 'border-gray-300 bg-gray-100' : 'border-gray-700 bg-gray-800'}`}>
                <div className={`flex items-center justify-between text-xs transition-colors ${lightMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  <span>{files.filter(f => !f.includes('/')).length} files, {files.filter(f => f.includes('/')).length} web files</span>
                  <span>UTF-8</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`px-4 py-2 border-b transition-colors ${lightMode ? 'border-gray-300 bg-gray-100' : 'border-gray-700 bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium uppercase tracking-wide transition-colors ${lightMode ? 'text-gray-700' : 'text-gray-300'}`}>Plugins</span>
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
                      className={`w-full rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${lightMode ? 'bg-gray-200 text-gray-900 placeholder-gray-500' : 'bg-gray-700 text-white'}`}
                    />
                  </div>

                  <div className="space-y-2">
                    {(['Light Mode'].filter(plugin =>
                      pluginSearch === '' || plugin.toLowerCase().includes(pluginSearch.toLowerCase())
                    ).map((plugin) => (
                      <div
                        key={plugin}
                        className={`rounded p-3 cursor-pointer transition-colors ${lightMode ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600'}`}
                        onClick={() => {
                          if (plugin === 'Light Mode') {
                            setLightMode(!lightMode);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center text-white font-bold text-sm">
                            ☀️
                          </div>
                          <div>
                            <div className={`font-medium transition-colors ${lightMode ? 'text-gray-900' : 'text-white'}`}>{plugin}</div>
                            <div className={`text-sm transition-colors ${lightMode ? 'text-gray-600' : 'text-gray-400'}`}>Toggle light/dark theme</div>
                          </div>
                        </div>
                      </div>
                    )))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className={`flex items-center justify-between px-4 py-2 border-b transition-colors ${lightMode ? 'bg-gray-100 border-gray-300' : 'bg-gray-800 border-gray-600'}`}>
          <span className={`text-sm font-medium transition-colors ${lightMode ? 'text-gray-900' : 'text-white'}`}>{selectedFile}</span>
          {selectedFile && selectedFile.endsWith('.py') && (
            <button
              onClick={async () => {
                const code = fileContents[selectedFile] || '';
                await executePythonCode(code);
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-2"
            >
              ▶️ Run Python
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col">
          {selectedFile.endsWith('.md') ? (
            <div className="flex flex-1">
              <div ref={editorRef} className="flex-1 border-r border-gray-600" />
              <div className={`flex-1 p-4 overflow-y-auto transition-colors ${lightMode ? 'bg-gray-50 text-gray-900' : 'bg-gray-900 text-gray-100'}`}>
                {renderMarkdown(fileContents[selectedFile] || '', lightMode)}
              </div>
            </div>
          ) : selectedFile.includes('/') && (selectedFile.endsWith('.html') || selectedFile.endsWith('.css') || selectedFile.endsWith('.js')) ? (
            <WebSpacePreview
              selectedFile={selectedFile}
              fileContents={fileContents}
              lightMode={lightMode}
              editorRef={editorRef}
            />
          ) : (
            <div ref={editorRef} className="flex-1" />
          )}

          {showOutput && (
            <div className={`absolute bottom-0 left-0 right-0 border-t font-mono text-sm max-h-64 overflow-y-auto z-40 transition-colors ${lightMode ? 'bg-gray-50 border-gray-300' : 'bg-black border-gray-600'}`}>
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs transition-colors ${lightMode ? 'text-green-600' : 'text-green-400'}`}>Python Output</span>
                  <button
                    onClick={() => setShowOutput(false)}
                    className={`text-xs transition-colors ${lightMode ? 'text-gray-600 hover:text-gray-900' : 'text-gray-400 hover:text-white'}`}
                  >
                    ✕
                  </button>
                </div>
                {output.map((line, index) => (
                  <div key={index} className={`transition-colors ${lightMode ? 'text-green-600' : 'text-green-400'}`}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewFileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 w-96 max-w-full mx-4 transition-colors ${lightMode ? 'bg-white' : 'bg-gray-800'}`}>
            <h3 className={`text-lg font-semibold mb-4 transition-colors ${lightMode ? 'text-gray-900' : 'text-white'}`}>Create New File</h3>

            <input
              type="text"
              placeholder="Search file types..."
              value={fileTypeSearch}
              onChange={(e) => setFileTypeSearch(e.target.value)}
              className={`w-full rounded px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${lightMode ? 'bg-gray-200 text-gray-900 placeholder-gray-500' : 'bg-gray-700 text-white'}`}
            />

            <div className="space-y-2 mb-4">
              {['.py', '.md', '.txt', 'Web Space'].filter(type =>
                fileTypeSearch === '' ||
                type.toLowerCase().includes(fileTypeSearch.toLowerCase()) ||
                (type === '.py' && 'python'.includes(fileTypeSearch.toLowerCase())) ||
                (type === '.md' && 'markdown'.includes(fileTypeSearch.toLowerCase())) ||
                (type === '.txt' && 'text'.includes(fileTypeSearch.toLowerCase())) ||
                (type === 'Web Space' && 'web html css javascript'.includes(fileTypeSearch.toLowerCase()))
              ).map((fileType) => (
                <button
                  key={fileType}
                  onClick={() => {
                    if (fileType === 'Web Space') {
                      const baseName = 'webspace';
                      let counter = 1;
                      let spaceName = `${baseName}${counter}`;
                      while (files.some(f => f.startsWith(`${spaceName}/`))) {
                        counter++;
                        spaceName = `${baseName}${counter}`;
                      }

                      const htmlFile = `${spaceName}/index.html`;
                      const cssFile = `${spaceName}/styles.css`;
                      const jsFile = `${spaceName}/script.js`;

                      setFiles(prev => [...prev, htmlFile, cssFile, jsFile]);
                      setFileContents(prev => ({
                        ...prev,
                        [htmlFile]: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Web Space</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <h1>Hello, Web Space!</h1>
    <p>This is a simple web page.</p>

    <script src="script.js"></script>
</body>
</html>`,
                        [cssFile]: `body {
    font-family: Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f9f9f9;
    color: #333;
    line-height: 1.6;
}

h1 {
    color: #333;
    text-align: center;
    margin-bottom: 1rem;
}

p {
    color: #666;
    margin-bottom: 1rem;
}`,
                        [jsFile]: `console.log('Web Space loaded!');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
});`
                      }));
                      setSelectedFile(htmlFile);
                    } else {
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
                    }
                    setShowNewFileModal(false);
                    setFileTypeSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 rounded transition-colors ${lightMode ? 'bg-gray-200 hover:bg-gray-300 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {fileType === '.py' ? 'Python File' : fileType === '.md' ? 'Markdown File' : fileType === 'Web Space' ? 'Web Space' : 'Text File'}
                    </span>
                    <span className={`text-sm transition-colors ${lightMode ? 'text-gray-500' : 'text-gray-400'}`}>{fileType}</span>
                  </div>
                  <div className={`text-sm transition-colors ${lightMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    {fileType === '.py' ? 'Python script with syntax highlighting' : fileType === '.md' ? 'Markdown with live preview' : fileType === 'Web Space' ? 'HTML, CSS & JS workspace with live preview' : 'Plain text document'}
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
                className={`flex-1 py-2 px-4 rounded transition-colors ${lightMode ? 'bg-gray-300 hover:bg-gray-400 text-gray-900' : 'bg-gray-600 hover:bg-gray-500 text-white'}`}
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
