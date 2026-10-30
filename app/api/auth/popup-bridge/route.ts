import { NextRequest, NextResponse } from 'next/server';
import { consumePopupCompletion } from '@/lib/auth/popup-bridge';

export async function GET(request: NextRequest) {
  const popupId = request.nextUrl.searchParams.get('popup_id')?.trim() || '';
  if (!popupId) {
    return NextResponse.json({ ready: false }, { status: 400 });
  }

  const payload = consumePopupCompletion(popupId);
  if (!payload) {
    return NextResponse.json(
      { ready: false },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }

  return NextResponse.json(
    {
      ready: true,
      payload,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
