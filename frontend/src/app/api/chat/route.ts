import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const question = formData.get('question');
    const collectionId = formData.get('collection_id');

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    if (!collectionId || typeof collectionId !== 'string') {
      return NextResponse.json(
        { error: 'Collection ID is required' },
        { status: 400 }
      );
    }

    // Forward the request to the FastAPI backend
    const backendFormData = new FormData();
    backendFormData.append('question', question);
    backendFormData.append('collection_id', collectionId);

    const response = await fetch(`${BACKEND_URL}/agent/ask`, {
      method: 'POST',
      body: backendFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || 'Failed to get answer' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      answer: data.answer,
      thread_id: data.thread_id,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
