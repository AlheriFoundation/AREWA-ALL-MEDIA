export async function onRequestPost() {
  return new Response(JSON.stringify({ error: 'No authorized download provider is configured.' }), { status: 501, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
