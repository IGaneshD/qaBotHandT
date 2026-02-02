import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const question = formData.get('question');
  const collectionId = formData.get('collection_id');

  if (!question || !collectionId) {
    return new Response('Missing required fields', { status: 400 });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  
  // Forward the request to the backend SSE endpoint
  const backendFormData = new FormData();
  backendFormData.append('question', question as string);
  backendFormData.append('collection_id', collectionId as string);

  const response = await fetch(`${backendUrl}/agent/ask-stream`, {
    method: 'POST',
    body: backendFormData,
  });

  if (!response.ok) {
    return new Response('Failed to get response from backend', { status: response.status });
  }

  // Stream the response directly to the client
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
