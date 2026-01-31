'use client';

import { useState } from 'react';
import FileUploadPanel from '@/components/FileUploadPanel';
import ChatInterface from '@/components/ChatInterface';
import Sidebar from '@/components/Sidebar';
import PdfSplitter from '@/components/PdfSplitter';

export default function Home() {
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  const handleUploadSuccess = (id: string) => {
    console.log('Upload success, collection ID:', id);
    setCollectionId(id);
    setShowUploadModal(false);
  };

  const handleNewChat = () => {
    setCollectionId(null);
    setShowUploadModal(false);
  };

  const handleSelectConversation = (id: string) => {
    setCollectionId(id);
    setShowUploadModal(false);
  };

  const handleBackFromChat = () => {
    setCollectionId(null);
    setShowUploadModal(false);
  };

  const handleAddDocument = () => {
    setShowUploadModal(true);
  };

  const handleSplitDocuments = () => {
    setShowSplitModal(true);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        currentCollectionId={collectionId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {!collectionId ? (
          <div className="flex items-center justify-center h-full">
            <FileUploadPanel onUploadSuccess={handleUploadSuccess} />
          </div>
        ) : (
          <ChatInterface 
            collectionId={collectionId} 
            onBack={handleBackFromChat}
            onAddDocument={handleAddDocument}
            onSplitDocuments={handleSplitDocuments}
          />
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && collectionId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute -top-4 -right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition cursor-pointer z-10"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <FileUploadPanel onUploadSuccess={handleUploadSuccess} />
          </div>
        </div>
      )}

      {/* Split Documents Modal */}
      {showSplitModal && collectionId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col">
            <button
              onClick={() => setShowSplitModal(false)}
              className="absolute top-4 right-4 bg-gray-100 rounded-full p-2 hover:bg-gray-200 transition cursor-pointer z-10"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex-1 overflow-y-auto p-8">
              <PdfSplitter />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
