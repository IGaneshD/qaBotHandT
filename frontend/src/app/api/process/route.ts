import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const collectionId = formData.get('collection_id');

    if (!collectionId || typeof collectionId !== 'string') {
      return NextResponse.json(
        { message: 'Collection ID is required' },
        { status: 400 }
      );
    }

    // Forward to the FastAPI backend for processing
    const backendFormData = new FormData();
    backendFormData.append('collection_id', collectionId);

    const response = await fetch(`${BACKEND_URL}/docs_splitting/process`, {
      method: 'POST',
      body: backendFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.detail || 'Failed to process file' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      message: data.message || `Document processed! ${data.chunks_indexed} chunks indexed.`,
      collection_id: data.collection_id,
      chunks_indexed: data.chunks_indexed,
      filename: data.filename,
    });
  } catch (error) {
    console.error('Process error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error during processing' },
      { status: 500 }
    );
  }
}
