'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, FileText, Plus, ChevronDown } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

const ACCEPTED_TYPES = '.pdf,.doc,.docx';
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);

const isAllowedFile = (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  variant?: 'status';
}

interface ChatInterfaceProps {
  collectionId: string;
  onSplitDocuments?: () => void;
}

export default function ChatInterface({ collectionId, onSplitDocuments }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [filename, setFilename] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [areDocumentsExpanded, setAreDocumentsExpanded] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check processing status
  useEffect(() => {
    const checkProcessing = () => {
      const status = localStorage.getItem(`processing_${collectionId}`);
      if (status === 'complete') {
        setIsProcessing(false);
      }
    };

    checkProcessing();

    // Listen for processing completion
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `processing_${collectionId}` && e.newValue === 'complete') {
        setIsProcessing(false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [collectionId]);

  // Load chat history when component mounts
  useEffect(() => {
    const loadHistory = async () => {
      let hadStoredMessages = false;

      try {
        // Load filename(s) from localStorage immediately
        const storedFilename = localStorage.getItem(`filename_${collectionId}`);
        if (storedFilename) {
          setFilename(storedFilename);
        }

        const storedFilenames = localStorage.getItem(`filenames_${collectionId}`);
        if (storedFilenames) {
          try {
            const parsedNames = JSON.parse(storedFilenames) as string[];
            if (parsedNames.length) {
              setDocumentNames(parsedNames);
              if (!storedFilename) {
                setFilename(parsedNames[0]);
              }
            }
          } catch {
            localStorage.removeItem(`filenames_${collectionId}`);
          }
        } else if (storedFilename) {
          setDocumentNames([storedFilename]);
        }
        
        // First try to load from localStorage
        const storedMessages = localStorage.getItem(`chat_${collectionId}`);
        if (storedMessages) {
          hadStoredMessages = true;
          const parsed = JSON.parse(storedMessages) as Array<{
            id: string;
            role: 'user' | 'assistant';
            content: string;
            timestamp: string;
            variant?: 'status';
          }>;

          setMessages(
            parsed.map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          );
        }

        // Then fetch from backend
        const response = await fetch(`/api/chat/history/${collectionId}`);
        if (response.ok) {
          const data = await response.json();

          let filenamesFromResponse: string[] = [];
          if (Array.isArray(data.filenames) && data.filenames.length) {
            filenamesFromResponse = data.filenames;
          } else if (data.filename) {
            filenamesFromResponse = [data.filename];
          }

          if (filenamesFromResponse.length) {
            setDocumentNames(filenamesFromResponse);
            localStorage.setItem(`filenames_${collectionId}`, JSON.stringify(filenamesFromResponse));
          }

          const resolvedFilename = data.filename || filenamesFromResponse[0];
          if (resolvedFilename) {
            setFilename(resolvedFilename);
            localStorage.setItem(`filename_${collectionId}`, resolvedFilename);
          }

          if (data.messages && data.messages.length > 0) {
            const backendMessages: Message[] = (data.messages as Array<{ role: 'user' | 'assistant'; content: string }>).map((msg, index: number) => ({
              id: `${Date.now()}-${index}`,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(),
            }));
            setMessages(backendMessages);
            // Update localStorage
            localStorage.setItem(`chat_${collectionId}`, JSON.stringify(backendMessages));
          } else if (!hadStoredMessages) {
            // No history, show welcome message
            setMessages([
              {
                id: '1',
                role: 'assistant',
                content: 'Hello! I\'m ready to answer questions about your uploaded document. What would you like to know?',
                timestamp: new Date(),
              },
            ]);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // If no stored messages, show welcome message
        if (!hadStoredMessages) {
          setMessages([
            {
              id: '1',
              role: 'assistant',
              content: 'Hello! I\'m ready to answer questions about your uploaded document. What would you like to know?',
              timestamp: new Date(),
            },
          ]);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [collectionId]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0 && !isLoadingHistory) {
      localStorage.setItem(`chat_${collectionId}`, JSON.stringify(messages));
    }
  }, [messages, collectionId, isLoadingHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isProcessing || isUploadingDoc) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('question', input);
      formData.append('collection_id', collectionId);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (_error) {
      console.error('Chat submit error:', _error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const primaryDocumentLabel = documentNames.length
    ? documentNames.length === 1
      ? documentNames[0]
      : `${documentNames[0]} + ${documentNames.length - 1} more`
    : filename;

  const handleFileButtonClick = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }
    event.target.value = '';

    if (!isAllowedFile(selectedFile)) {
      setUploadError('Unsupported file type. Please upload PDF or Word documents only.');
      return;
    }

    await uploadAdditionalDocument(selectedFile);
  };

  const uploadAdditionalDocument = async (file: File) => {
    const processingKey = `processing_${collectionId}`;
    try {
      setIsUploadingDoc(true);
      setUploadError(null);
      setIsProcessing(true);
      localStorage.setItem(processingKey, 'in-progress');
      window.dispatchEvent(new StorageEvent('storage', { key: processingKey, newValue: 'in-progress' }));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('collection_id', collectionId);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.detail || 'Failed to upload document.');
      }

      const appendedName = data.filename || file.name;
      setDocumentNames((prev) => {
        const next = prev.includes(appendedName) ? prev : [...prev, appendedName];
        localStorage.setItem(`filenames_${collectionId}`, JSON.stringify(next));
        return next;
      });

      setFilename((prev) => {
        const resolved = prev || appendedName;
        localStorage.setItem(`filename_${collectionId}`, resolved);
        return resolved;
      });

      localStorage.setItem(processingKey, 'complete');
      window.dispatchEvent(new StorageEvent('storage', { key: processingKey, newValue: 'complete' }));
      setIsProcessing(false);

      // const chunkInfo = typeof data.chunks_indexed === 'number'
      //   ? ` (${data.chunks_indexed} chunks indexed)`
      //   : '';

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-upload-status`,
          role: 'assistant',
          content: `✅ Added ${appendedName} to this chat. You can ask about it right away.`,
          timestamp: new Date(),
          variant: 'status',
        },
      ]);
    } catch (error) {
      console.error('Additional upload error:', error);
      localStorage.setItem(processingKey, 'complete');
      window.dispatchEvent(new StorageEvent('storage', { key: processingKey, newValue: 'complete' }));
      setIsProcessing(false);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload document.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDocumentClick = (name: string) => {
    const encoded = encodeURIComponent(name);
    window.open(`/api/download-uploaded/${collectionId}/${encoded}`, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-100 p-1.5 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Document Q&A</h1>
            <p className="text-[11px] text-gray-500">
              {primaryDocumentLabel ? (
                <span className="font-medium">{primaryDocumentLabel}</span>
              ) : (
                <span className="font-mono">Collection: {collectionId.slice(0, 8)}...</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onSplitDocuments && (
            <button
              onClick={onSplitDocuments}
              className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition cursor-pointer"
              title="Split Documents"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
              Split Doc
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {isLoadingHistory ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-gray-600">Loading chat history...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {(() => {
                    const isStatus = message.variant === 'status';
                    const containerClasses = message.role === 'user'
                      ? 'max-w-[80%] rounded-2xl px-4 py-3'
                      : 'max-w-[90%] py-1';
                    const bubbleClasses = message.role === 'user'
                      ? 'bg-gray-200 text-black'
                      : isStatus
                        ? 'bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-gray-800'
                        : 'bg-transparent text-gray-900';
                    const timeClasses = message.role === 'user'
                      ? 'text-black-100'
                      : isStatus
                        ? 'text-green-600'
                        : 'text-gray-400';

                    return (
                      <div className={`${containerClasses} ${bubbleClasses}`}>
                        {message.role === 'user' ? (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-justify">{message.content}</p>
                        ) : (
                          <MarkdownRenderer
                            content={message.content}
                            className={isStatus ? 'text-sm text-gray-800 text-justify' : 'text-justify'}
                          />
                        )}
                        <p className={`text-xs mt-2 ${timeClasses}`}>
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-900 rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <p className="text-sm text-gray-600">Thinking...</p>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        {/* Processing Status */}
        {isProcessing && (
          <div className="max-w-3xl mx-auto mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-xs text-blue-700">Processing document in background...</span>
          </div>
        )}

        {isUploadingDoc && (
          <div className="max-w-3xl mx-auto mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-md flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span className="text-xs text-indigo-700">Uploading and indexing document...</span>
          </div>
        )}

        {uploadError && (
          <div className="max-w-3xl mx-auto mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
            {uploadError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <div className="flex items-end gap-2">
                <div className="flex-1 bg-gray-100 rounded-xl border border-gray-200 focus-within:border-blue-500 focus-within:ring focus-within:ring-blue-100 transition flex items-center relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isProcessing ? "Processing document..." : "Ask a question about your document..."}
                    rows={1}
                    className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder-gray-500 resize-none focus:outline-none max-h-28"
                    style={{
                      minHeight: '38px',
                      maxHeight: '112px',
                    }}
                    disabled={isLoading || isProcessing || isUploadingDoc}
                  />
                  <button
                    type="button"
                    onClick={() => setAreDocumentsExpanded((prev) => !prev)}
                    disabled={isProcessing || isUploadingDoc}
                    className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:text-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    title="Show documents"
                    aria-expanded={areDocumentsExpanded}
                  >
                    {isUploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    <span className="hidden sm:inline">Docs</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${areDocumentsExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={handleFileButtonClick}
                    disabled={isProcessing || isUploadingDoc}
                    className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:text-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    title="Add document to this chat"
                  >
                    {isUploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span className="hidden sm:inline">Add</span>
                  </button>

                  {documentNames.length > 0 && areDocumentsExpanded && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-30">
                      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 max-h-64 overflow-y-auto">
                        <div className="text-[10px] font-semibold text-gray-600 tracking-wide uppercase mb-2 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Documents ({documentNames.length})
                        </div>
                        <div className="flex flex-col gap-1">
                          {documentNames.map((name) => (
                            <button
                              type="button"
                              key={name}
                              onClick={() => handleDocumentClick(name)}
                              className="inline-flex items-center bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-700 hover:border-blue-300 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer"
                            >
                              <span className="truncate" title={name}>{name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || isProcessing || isUploadingDoc}
                    className="bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex-shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>


          </div>

          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileInputChange}
          />
        </form>
      </div>
    </div>
  );
}
