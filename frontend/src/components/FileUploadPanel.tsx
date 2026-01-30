"use client";

import { useRef, useState } from "react";
import { Upload, File, X, Loader2 } from "lucide-react";
import { uploadFile } from "@/lib/uploadClient";

const ACCEPTED_TYPES = ".pdf,.doc,.docx";
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const isAllowedFile = (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
};

interface FileUploadPanelProps {
  onUploadSuccess?: (collectionId: string) => void;
}

export default function FileUploadPanel({ onUploadSuccess }: FileUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);

  const openPicker = () => inputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setErrorMessage(null);
      return;
    }

    if (!isAllowedFile(file)) {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setSelectedFile(null);
      setErrorMessage("Unsupported file type. Please upload PDF or Word documents only.");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setApiMessage(null);
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
      return;
    }
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (!event.dataTransfer.files?.length) {
      return;
    }

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    if (!isAllowedFile(file)) {
      setErrorMessage("Unsupported file type. Please upload PDF or Word documents only.");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setApiMessage(null);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setErrorMessage(null);
    setApiMessage(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleContinue = async () => {
    if (!selectedFile) {
      return;
    }

    try {
      setIsSubmitting(true);
      setApiMessage(null);
      
      // Upload the file
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload-only', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      const data = await response.json();
      const cid = data.collection_id;
      
      // Store filename in localStorage for immediate display
      if (data.filename) {
        localStorage.setItem(`filename_${cid}`, data.filename);
      }
      
      // Navigate to chat immediately
      if (onUploadSuccess) {
        onUploadSuccess(cid);
      }
      
      // Start background processing
      processInBackground(cid);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while uploading the file.";
      setApiMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const processInBackground = async (cid: string) => {
    try {
      const formData = new FormData();
      formData.append('collection_id', cid);

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Background processing failed');
        return;
      }

      // Notify via localStorage that processing is complete
      localStorage.setItem(`processing_${cid}`, 'complete');
      // Trigger storage event for real-time update
      window.dispatchEvent(new StorageEvent('storage', {
        key: `processing_${cid}`,
        newValue: 'complete'
      }));
    } catch (error) {
      console.error('Background processing error:', error);
    }
  };

  return (
    <section className="w-[min(520px,92vw)] rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Upload Center</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Bring your files in</h1>
      <p className="mt-2 text-sm text-slate-500">
        Drag a document here or use the button below. We support PDF and Word documents.
      </p>

      {selectedFile ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 p-2 rounded-lg flex-shrink-0">
              <File className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
                Ready to Upload
              </p>
              <p className="font-semibold text-slate-900 break-all">{selectedFile.name}</p>
              <p className="text-xs text-slate-400 mt-1">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-400 hover:text-rose-500 inline-flex items-center gap-2 cursor-pointer"
            >
              <X className="w-3 h-3" />
              Replace file
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={isSubmitting}
              className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600 inline-flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload & Chat
                </>
              )}
            </button>
          </div>
          {apiMessage && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">{apiMessage}</p>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`mt-6 rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
          }`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
          />
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Drop files here</p>
          <p className="mt-1 text-xs text-slate-400">or</p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 cursor-pointer"
          >
            <File className="w-4 h-4" />
            Choose a file
          </button>
          {errorMessage && <p className="mt-4 text-xs font-semibold text-rose-500">{errorMessage}</p>}
        </div>
      )}
      <p className="mt-6 text-[13px] text-slate-400">
        By uploading, you confirm you have the right to share this content and agree to our secure storage policy.
      </p>
    </section>
  );
}
