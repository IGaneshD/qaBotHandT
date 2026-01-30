'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, FileText, ArrowLeft, Plus } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  collectionId: string;
  onBack?: () => void;
  onAddDocument?: () => void;
  onSplitDocuments?: () => void;
}

export default function ChatInterface({ collectionId, onBack, onAddDocument, onSplitDocuments }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [filename, setFilename] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('azure_openai');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [isProcessing, setIsProcessing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Model options based on provider
  const modelOptions: Record<string, { value: string; label: string }[]> = {
    gemini: [
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)' },
    ],
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    azure_openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo' },
    ],
    groq: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
  };

  // Update model when provider changes
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setSelectedModel(modelOptions[provider][0].value);
  };

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
      try {
        // Load filename from localStorage immediately
        const storedFilename = localStorage.getItem(`filename_${collectionId}`);
        if (storedFilename) {
          setFilename(storedFilename);
        }
        
        // First try to load from localStorage
        const storedMessages = localStorage.getItem(`chat_${collectionId}`);
        if (storedMessages) {
          const parsed = JSON.parse(storedMessages);
          setMessages(parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })));
        }

        // Then fetch from backend
        const response = await fetch(`/api/chat/history/${collectionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.filename) {
            setFilename(data.filename);
            localStorage.setItem(`filename_${collectionId}`, data.filename);
          }
          if (data.messages && data.messages.length > 0) {
            const backendMessages: Message[] = data.messages.map((msg: any, index: number) => ({
              id: `${Date.now()}-${index}`,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(),
            }));
            setMessages(backendMessages);
            // Update localStorage
            localStorage.setItem(`chat_${collectionId}`, JSON.stringify(backendMessages));
          } else if (!storedMessages) {
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
        if (messages.length === 0) {
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
    if (!input.trim() || isLoading) return;

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
      formData.append('provider', selectedProvider);
      formData.append('model', selectedModel);

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
    } catch (error) {
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Document Q&A</h1>
            <p className="text-xs text-gray-500">
              {filename ? (
                <span className="font-medium">{filename}</span>
              ) : (
                <span className="font-mono">Collection: {collectionId.slice(0, 8)}...</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer bg-white"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="azure_openai">Azure OpenAI</option>
            <option value="groq">Groq</option>
          </select>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer bg-white"
          >
            {modelOptions[selectedProvider].map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
          {onSplitDocuments && (
            <button
              onClick={onSplitDocuments}
              className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-50 transition cursor-pointer"
              title="Split Documents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
              Split Doc
            </button>
          )}
          {onAddDocument && (
            <button
              onClick={onAddDocument}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 transition cursor-pointer"
              title="Add more documents"
            >
              <Plus className="w-5 h-5" />
              Add Document
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              New Document
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
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    ) : (
                      <MarkdownRenderer content={message.content} />
                    )}
                    <p
                      className={`text-xs mt-2 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
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
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        {/* Processing Status */}
        {isProcessing && (
          <div className="max-w-3xl mx-auto mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm text-blue-700">Processing document in background...</span>
          </div>
        )}
        
        {/* Document Names */}
        {filename && (
          <div className="max-w-3xl mx-auto mb-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-700 truncate">{filename}</span>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? "Processing document..." : "Ask a question about your document..."}
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-sm text-gray-900 placeholder-gray-500 resize-none focus:outline-none max-h-32"
                style={{
                  minHeight: '44px',
                  maxHeight: '128px',
                }}
                disabled={isLoading || isProcessing}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isProcessing}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
