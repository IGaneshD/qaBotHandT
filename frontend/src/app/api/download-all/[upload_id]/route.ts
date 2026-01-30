import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ upload_id: string }> }
) {
  try {
    const { upload_id } = await params;
    
    const response = await fetch(
      `${BACKEND_URL}/docs_splitting/split/download-all/${upload_id}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Files not found' },
        { status: response.status }
      );
    }

    // Stream the ZIP response
    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="split_files_${upload_id}.zip"`,
      },
    });
  } catch (error) {
    console.error('Error downloading files:', error);
    return NextResponse.json(
      { error: 'Failed to download files' },
      { status: 500 }
    );
  }
}
