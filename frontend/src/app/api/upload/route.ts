import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const collectionId = formData.get('collection_id');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer for Node.js fetch
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a proper Blob from the buffer
    const blob = new Blob([buffer], { type: file.type });

    // Forward the file to the FastAPI backend (just upload, no processing)
    const backendFormData = new FormData();
    backendFormData.append('file', blob, file.name);

    if (collectionId && typeof collectionId === 'string') {
      backendFormData.append('collection_id', collectionId);
    }

    const response = await fetch(`${BACKEND_URL}/docs_splitting/upload`, {
      method: 'POST',
      body: backendFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.detail || 'Failed to upload file' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      message: data.message || 'File uploaded successfully!',
      collection_id: data.collection_id,
      filename: data.filename,
      chunks_indexed: data.chunks_indexed,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error during file upload' },
      { status: 500 }
    );
  }
}
