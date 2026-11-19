import { fetchRecordingMp3 } from '$lib/server/twilio';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const upstream = await fetchRecordingMp3(params.sid);
  if (!upstream.ok) return new Response('Recording not found', { status: upstream.status });
  return new Response(upstream.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' },
  });
};
