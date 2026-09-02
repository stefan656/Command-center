// /api/viki-respond.js
// Vercel serverless function: voice Q&A backend for the V.I.K.I. dashboard.
//
// Accepts a transcribed spoken question, asks Claude to answer it using
// READ-ONLY Follow Up Boss lookups via the Zapier MCP connector, and
// returns the answer as JSON for the browser to speak aloud.
//
// Required env vars (set in the Vercel project, never in frontend code):
//   ANTHROPIC_API_KEY        - Claude API key
// Optional env vars (enable live Follow Up Boss lookups when set):
//   ZAPIER_MCP_URL           - the Zapier MCP server URL for this account
//   ZAPIER_MCP_TOKEN         - bearer token for that MCP server, if it requires one
//   ZAPIER_MCP_ALLOWED_TOOLS - comma-separated allowlist of MCP tool names to
//                              expose to Claude, overriding the read-only default below
//
// Without ZAPIER_MCP_URL configured, VIKI still answers questions, just
// without live CRM data.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5';
const REQUEST_TIMEOUT_MS = 28000;
const MAX_QUESTION_LENGTH = 2000;

// Only read/search-type Follow Up Boss actions belong here. Never add a
// create/update/delete/tag/apply-action-plan tool name to this list.
const DEFAULT_ALLOWED_TOOLS = [
  'follow_up_boss_find_a_contact',
  'follow_up_boss_make_api_get_request'
];

function getAllowedTools() {
  const raw = process.env.ZAPIER_MCP_ALLOWED_TOOLS;
  if (!raw) return DEFAULT_ALLOWED_TOOLS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const SYSTEM_PROMPT = [
  "You are V.I.K.I., a calm, precise voice assistant embedded in Stefan McHardy's business command-center dashboard.",
  'Stefan runs a real-estate wholesaling operation (leads tracked in Follow Up Boss) alongside youth soccer club sponsorship work.',
  'You may look up information in Follow Up Boss using only the read-only tools made available to you (finding/searching contacts, reading records).',
  'You have NO write access in this phase — you cannot create, update, tag, or delete anything in Follow Up Boss, log calls, create tasks, or change deal stages, even if asked. If asked to make a change, briefly explain that write actions are disabled for now and offer to look up related information instead.',
  'Answer in short, spoken-friendly sentences — this response will be read aloud by text-to-speech. Avoid bullet points, markdown, or long lists; speak in plain prose.',
  "If a lookup returns nothing useful, say so plainly rather than guessing."
].join(' ');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ error: 'Missing "question" string in request body.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('viki-respond: ANTHROPIC_API_KEY is not configured');
    return res.status(200).json({
      answer: "I can't reach my reasoning engine right now — the server isn't configured yet. Try again shortly.",
      error: 'server_not_configured'
    });
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  const zapierUrl = process.env.ZAPIER_MCP_URL;
  const zapierToken = process.env.ZAPIER_MCP_TOKEN;

  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: question.slice(0, MAX_QUESTION_LENGTH) }]
  };

  const betas = [];

  if (zapierUrl) {
    const serverEntry = { type: 'url', url: zapierUrl, name: 'follow-up-boss' };
    if (zapierToken) serverEntry.authorization_token = zapierToken;

    params.mcp_servers = [serverEntry];
    params.tools = [
      {
        type: 'mcp_toolset',
        mcp_server_name: 'follow-up-boss',
        // Allowlist mode: every tool starts disabled, only the read-only
        // tools named below are turned on. This is the enforcement point
        // for "read-only for now" — do not flip this to enabled-by-default.
        default_config: { enabled: false },
        configs: getAllowedTools().map((name) => ({ name, enabled: true }))
      }
    ];
    betas.push('mcp-client-2025-11-20');
  }
  if (betas.length) params.betas = betas;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const message = await client.beta.messages.create(params, { signal: controller.signal });
    clearTimeout(timeout);

    const answer = (message.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return res.status(200).json({
      answer: answer || "I looked into that but didn't come back with a clear answer. Could you try rephrasing?"
    });
  } catch (err) {
    clearTimeout(timeout);

    if (err?.name === 'AbortError') {
      console.error('viki-respond: request timed out');
      return res.status(200).json({
        answer: 'That took longer than expected and I had to stop. Please try asking again.',
        error: 'timeout'
      });
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error('viki-respond: bad request', err.message);
    } else if (err instanceof Anthropic.AuthenticationError) {
      console.error('viki-respond: invalid Anthropic API key');
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error('viki-respond: rate limited', err.message);
    } else if (err instanceof Anthropic.APIError) {
      console.error('viki-respond: API error', err.status, err.message);
    } else {
      console.error('viki-respond: unexpected error', err);
    }

    return res.status(200).json({
      answer: 'I ran into a problem reaching my systems just now. Please try again in a moment.',
      error: 'upstream_failure'
    });
  }
};
