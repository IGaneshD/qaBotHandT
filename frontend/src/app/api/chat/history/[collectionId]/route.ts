import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ collectionId: string }> }
) {
  try {
    const params = await context.params;
    const collectionId = params.collectionId;

    if (!collectionId) {
      return NextResponse.json(
        { error: 'Collection ID is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/agent/history/${collectionId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      return NextResponse.json(
        { messages: [], collection_id: collectionId },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat history error:', error);
    const params = await context.params;
    return NextResponse.json(
      { messages: [], collection_id: params.collectionId },
      { status: 200 }
    );
  }
}
