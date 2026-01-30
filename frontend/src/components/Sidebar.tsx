'use client';

import { useEffect, useState } from 'react';
import { Plus, MessageSquare, Trash2, Menu, X, FileText } from 'lucide-react';

interface Conversation {
  id: string;
  collectionId: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  filename?: string;
}

interface SidebarProps {
  currentCollectionId: string | null;
  onSelectConversation: (collectionId: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ currentCollectionId, onSelectConversation, onNewChat }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  // Reload conversations periodically to reflect new messages
  useEffect(() => {
    const interval = setInterval(loadConversations, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadConversations = async () => {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('chat_'));
      const convosPromises = keys.map(async (key) => {
        const collectionId = key.replace('chat_', '');
        const data = localStorage.getItem(key);
        if (data) {
          const messages = JSON.parse(data);
          const lastMsg = messages[messages.length - 1];
          const firstUserMsg = messages.find((m: any) => m.role === 'user');
          
          // Fetch filename from backend
          let filename: string | undefined = undefined;
          try {
            const response = await fetch(`/api/chat/history/${collectionId}`);
            if (response.ok) {
              const historyData = await response.json();
              filename = historyData.filename;
            }
          } catch (error) {
            console.error(`Failed to fetch filename for ${collectionId}:`, error);
          }
          
          return {
            id: collectionId,
            collectionId,
            title: filename || (firstUserMsg ? firstUserMsg.content.slice(0, 50) + '...' : 'New Chat'),
            lastMessage: lastMsg?.content.slice(0, 60) || '',
            timestamp: new Date(lastMsg?.timestamp || Date.now()),
            filename
          } as Conversation;
        }
        return null;
      });

      const convos = await Promise.all(convosPromises);
      const validConvos = convos.filter((c): c is Conversation => c !== null);
      
      // Sort by timestamp, newest first
      validConvos.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setConversations(validConvos);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const deleteConversation = (collectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      localStorage.removeItem(`chat_${collectionId}`);
      loadConversations();
      if (currentCollectionId === collectionId) {
        onNewChat();
      }
    }
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={onNewChat}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {conversations.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                <p>No conversations yet</p>
                <p className="text-xs mt-2 text-gray-400">Upload a document to start</p>
              </div>
            ) : (
              conversations.map((convo) => (
                <div
                  key={convo.id}
                  onClick={() => onSelectConversation(convo.collectionId)}
                  className={`group relative p-3 rounded-lg cursor-pointer transition border ${
                    currentCollectionId === convo.collectionId
                      ? 'bg-blue-50 border-blue-200'
                      : 'hover:bg-gray-50 border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        currentCollectionId === convo.collectionId ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate mb-1 text-gray-900">
                          {convo.title}
                        </h3>
                        <p className="text-xs text-gray-500 truncate">
                          {convo.lastMessage}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {convo.timestamp.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(convo.collectionId, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded transition flex-shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <FileText className="w-4 h-4" />
              <div className="space-y-1">
                <p className="font-medium">Document Q&A Bot</p>
                <p className="text-gray-500">
                  {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
