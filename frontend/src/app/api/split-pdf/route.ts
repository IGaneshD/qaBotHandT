import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const modelName = formData.get('model_name') as string || 'gpt-4o';
    const maxTocPages = formData.get('max_toc_pages') as string || '20';
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Create FormData for backend request
    const backendFormData = new FormData();
    backendFormData.append('file', file);
    backendFormData.append('model_name', modelName);
    backendFormData.append('max_toc_pages', maxTocPages);
    
    // Forward the request to the backend
    const response = await fetch(`${BACKEND_URL}/docs_splitting/split/pdf`, {
      method: 'POST',
      body: backendFormData,
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in split-pdf API route:', error);
    return NextResponse.json(
      { error: 'Failed to split PDF' },
      { status: 500 }
    );
  }
}
