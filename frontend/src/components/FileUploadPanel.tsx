"use client";

import { useRef, useState } from "react";
import { uploadFile } from "@/lib/uploadClient";

const ACCEPTED_TYPES = ".pdf,.doc,.docx";
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const isAllowedFile = (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
};

export default function FileUploadPanel() {
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
      const result = await uploadFile(selectedFile);
      setApiMessage(result.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while sending the file.";
      setApiMessage(message);
    } finally {
      setIsSubmitting(false);
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
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ready to process</p>
            <p>
              <span className="font-semibold text-slate-900">{selectedFile.name}</span>
              <span className="ml-2 text-xs text-slate-400">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-400 hover:text-rose-500"
            >
              Replace file
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={isSubmitting}
              className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {isSubmitting ? "Sending..." : "Continue"}
            </button>
          </div>
          {apiMessage && <p className="text-xs font-semibold text-slate-500">{apiMessage}</p>}
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
          <p className="text-sm font-medium text-slate-600">Drop files here</p>
          <p className="mt-1 text-xs text-slate-400">or</p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-gradient-to-r cursor-pointer bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
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
