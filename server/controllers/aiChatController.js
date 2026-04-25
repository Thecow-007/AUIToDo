const { openStream } = require('../utils/sse');
const aiPipeline = require('../services/aiPipeline');

exports.chat = async (req, res) => {
  const sse = openStream(req, res);
  const { message, history, currentView } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    sse.send('error', { message: 'message_required' });
    sse.close();
    return;
  }
  await aiPipeline.runPipeline({
    userId: req.user._id,
    message: message.trim(),
    history: Array.isArray(history) ? history : [],
    currentView: currentView || null,
    sse,
  });
};
