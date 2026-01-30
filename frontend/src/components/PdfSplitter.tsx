'use client';

import { useState } from 'react';

interface SectionInfo {
  title: string;
  page: number;
}

interface OutputFileInfo {
  title: string;
  filename: string;
  start_page: number;
  end_page: number;
  path: string;
}

interface SplitResponse {
  status: string;
  upload_id: string;
  sections: SectionInfo[];
  output_files: OutputFileInfo[];
  total_sections: number;
  output_directory: string;
}

export default function PdfSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SplitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_name', 'gpt-4o');
    formData.append('max_toc_pages', '20');

    try {
      const response = await fetch('/api/split-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to split PDF');
      }

      const data: SplitResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSingle = (uploadId: string, filename: string) => {
    window.open(`/api/download/${uploadId}/${filename}`, '_blank');
  };

  const handleDownloadAll = (uploadId: string) => {
    window.open(`/api/download-all/${uploadId}`, '_blank');
  };

  const handleDelete = async (uploadId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/docs_splitting/split/files/${uploadId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete files');
      }

      setResult(null);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete files');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Split PDF</h2>
        
        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* Split Button */}
        <button
          onClick={handleSplit}
          disabled={!file || loading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md
            hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
            font-medium transition-colors"
        >
          {loading ? 'Splitting...' : 'Split'}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Summary */}
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="font-semibold text-green-800 mb-2">
                ✅ Successfully split into {result.total_sections} sections
              </h3>
              <button
                onClick={() => handleDownloadAll(result.upload_id)}
                className="mt-2 bg-green-600 text-white py-2 px-4 rounded-md
                  hover:bg-green-700 font-medium text-sm"
              >
                Download All as ZIP
              </button>
            </div>

            {/* Sections List */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Detected Sections:</h3>
              <div className="space-y-2">
                {result.sections.map((section, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{section.title}</p>
                      <p className="text-sm text-gray-600">Starts at page {section.page}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Output Files */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Split Files:</h3>
              <div className="space-y-2">
                {result.output_files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-md"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{file.title}</p>
                      <p className="text-sm text-gray-600">
                        {file.filename} • Pages {file.start_page}-{file.end_page}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadSingle(result.upload_id, file.filename)}
                      className="ml-4 bg-blue-600 text-white py-2 px-4 rounded-md
                        hover:bg-blue-700 font-medium text-sm"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => handleDelete(result.upload_id)}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md
                hover:bg-red-700 font-medium text-sm"
            >
              Delete All Files
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>
    </div>
  );
}
