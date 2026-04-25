// Tiny Server-Sent Events helper. Returns a `send(event, data)` and `close()`.
// Each event is written as a single SSE frame: `event: <name>\ndata: <json>\n\n`.

function openStream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let closed = false;
  const onClose = () => { closed = true; };
  req.on('close', onClose);

  // Periodic comment keeps the connection alive across proxies.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 20000);

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      clearInterval(heartbeat);
      closed = true;
      res.end();
    },
    isClosed() { return closed; },
  };
}

module.exports = { openStream };
