const sockets = new Map();
function add(id, ws) { sockets.set(id, ws); }
function remove(id, ws) { if (sockets.get(id) === ws) sockets.delete(id); }
function send(id, data) {
  const ws = sockets.get(id);
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(data)); return true;
}
module.exports = { add, remove, send };
