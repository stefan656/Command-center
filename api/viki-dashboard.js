// /api/viki-dashboard.js
// Vercel serverless function: read-only live-data feed for the V.I.K.I. dashboard.
//
// Returns a JSON object the frontend overlays onto the static content already
// loaded from viki_data.js (connectors, sponsors, payment reminder stay
// hand-curated there — this endpoint only covers the fields below, which are
// genuinely computable from live sources).
//
// Required env vars (already set for /api/viki-respond.js, reused here):
//   ANTHROPIC_API_KEY        - Claude API key
//   ZAPIER_MCP_URL           - Zapier MCP server URL (Follow Up Boss connection)
// Optional env vars:
//   ANTHROPIC_WORKSPACE_ID   - only if the Anthropic key is identity-linked
//   ZAPIER_MCP_TOKEN         - bearer token for the Zapier MCP server, if required
// New env var for this endpoint:
//   NOTION_API_KEY           - Notion internal integration token (ntn_...). The
//                              integration must be explicitly shared with the
//                              RE Ops Micro Tracker, BD Tracker, and Morning
//                              Brief Reports pages in Notion itself — a token
//                              alone grants no access to any of them.
//
// Every section is independent and best-effort: if Follow Up Boss, Notion ops
// trackers, or the Notion daily-stats database fail or are unavailable, that
// section reports ok:false / available:false rather than failing the whole
// request. The frontend reflects this per-source, not as one blanket error.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5';
const REQUEST_TIMEOUT_MS = 50000;
const NOTION_VERSION = '2025-09-03';

const RE_OPS_DATA_SOURCE_ID = '9b37c9e1-339a-48e6-9844-4ccc186c3213';
const BD_TRACKER_DATA_SOURCE_ID = '544a2381-5586-42ca-b446-7c83ea838e1d';
const MORNING_BRIEF_DATA_SOURCE_ID = '171cf501-39d5-4809-a129-7243c93bc45e';

// Every FUB stage name in this account, bucketed into the six tiers the
// dashboard shows. Matched by exact name against live GET /v1/stages output
// (see fetchFubData) — any stage name not listed here is ignored, not
// silently dumped into a catch-all, so a renamed/new stage shows up as a
// visible gap rather than a wrong bucket.
const STAGE_TIER_MAP = {
  'A - Cash Offer Requested': 'Hot',
  'A - Cash Offer- Sent to Underwriting': 'Hot',
  'A - Cash Offer- Final Received': 'Hot',
  'A - Hot 0-3 Months': 'Hot',
  'A - Seller Property Pending (0-1mos)': 'Hot',
  'Needs Followup': 'Hot',
  'B - Seller Property Off-Market (3-6mos)': 'Warm',
  'B - Seller Property Listed (3-6mos)': 'Warm',
  'B - Buyer Lead Has Agent (3-6mos)': 'Warm',
  'B - Warm 3-6 Months': 'Warm',
  'Appt. Set - Pre-Seller': 'Warm',
  'Appt. Set - Pre-Buyer': 'Warm',
  'C - Cold 6+ Months': 'Cold',
  'Unengaged Contacts': 'Cold',
  'Appt. No Show': 'Cold',
  'Referral Out - Language': 'Cold',
  'Active Listing/Agreement': 'Active',
  'Active Investor (Buyer)': 'Active',
  'Active Buyer': 'Active',
  'Active Renter': 'Active',
  'Post Appt. - OFS': 'Active',
  'Post Appt. - Buyer Sent to Lender': 'Active',
  'Post Appt. - Buyer Not Qualified': 'Active',
  'Appt. Won - New Listing/Rental 0⃣': 'Active',
  'Appt. Won - New Buyer/Renter 0⃣': 'Active',
  'Pending Listing/Agreement': 'Pending',
  'Pending Buyer/Investor': 'Pending',
  'Pending Renter': 'Pending',
  'Expired Listing': 'Pending',
  'Cancelled Listing 0⃣': 'Pending',
  'Closed': 'Closed',
  'Past Client': 'Closed',
  'Already Bought/Sold': 'Closed',
  'No Deal Made': 'Closed',
  'Archived': 'Closed',
  'Trash': 'Closed'
  // Lead, Admin-IGNORE deliberately excluded — not yet worked / not a real tier.
};
const TIER_ORDER = ['Hot', 'Warm', 'Cold', 'Active', 'Pending', 'Closed'];

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Follow Up Boss, via the same Zapier MCP connector /api/viki-respond.js
// uses. Claude is used purely as the MCP transport here: the system prompt
// forces a fixed sequence of raw GET calls and Claude's own text response is
// discarded — every number below comes from the mcp_tool_result content
// blocks themselves, parsed directly, never from Claude's summarization.
// ---------------------------------------------------------------------------
async function fetchFubData() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const zapierUrl = process.env.ZAPIER_MCP_URL;
  if (!anthropicKey || !zapierUrl) {
    return { ok: false, error: 'server_not_configured' };
  }

  const clientOptions = { apiKey: anthropicKey };
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  if (workspaceId) clientOptions.defaultHeaders = { 'anthropic-workspace-id': workspaceId };
  const client = new Anthropic(clientOptions);

  const zapierToken = process.env.ZAPIER_MCP_TOKEN;
  const serverEntry = { type: 'url', url: zapierUrl, name: 'follow-up-boss' };
  if (zapierToken) serverEntry.authorization_token = zapierToken;

  const today = todayUtcDateString();
  const calls = [
    { url: 'https://api.followupboss.com/v1/stages', querystring: { limit: '100' } },
    { url: 'https://api.followupboss.com/v1/tasks', querystring: { isCompleted: '0', limit: '200' } },
    { url: 'https://api.followupboss.com/v1/tasks', querystring: { isCompleted: '1', limit: '150' } },
    { url: 'https://api.followupboss.com/v1/people', querystring: { createdAfter: today + 'T00:00:00Z', limit: '100' } }
  ];

  const instructions = calls
    .map((c, i) => `${i + 1}. url="${c.url}" querystring=${JSON.stringify(c.querystring)}`)
    .join('\n');

  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: 'You are a data-fetching agent, not a conversational assistant.',
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content:
        'Call the follow_up_boss_make_api_get_request tool exactly 4 times, once for each of the ' +
        'following requests, in order, using the exact url and querystring given for each — do not ' +
        'alter, combine, or skip any of them:\n' + instructions +
        '\n\nAfter all 4 calls complete, respond with only the single word DONE. Do not summarize, ' +
        'analyze, or describe the data in any way.'
    }],
    mcp_servers: [serverEntry],
    tools: [{
      type: 'mcp_toolset',
      mcp_server_name: 'follow-up-boss',
      default_config: { enabled: false },
      configs: { follow_up_boss_make_api_get_request: { enabled: true } }
    }],
    betas: ['mcp-client-2025-11-20']
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let message;
  try {
    message = await client.beta.messages.create(params, { signal: controller.signal });
  } catch (err) {
    console.error('viki-dashboard: FUB fetch failed', err?.status, err?.message || err);
    if (controller.signal.aborted) return { ok: false, error: 'timeout' };
    return { ok: false, error: err?.status ? 'anthropic_http_' + err.status : 'upstream_failure' };
  } finally {
    clearTimeout(timeout);
  }

  const resultBlocks = (message.content || []).filter((b) => b.type === 'mcp_tool_result');
  console.log('viki-dashboard: FUB mcp_tool_result blocks:', resultBlocks.length, 'of', calls.length, 'expected');

  const parsedResults = resultBlocks.map((block) => {
    try {
      // Anthropic tool_result-style blocks carry their payload in `content`,
      // an array of parts (usually {type:'text', text: '<json>'}). Handle
      // that shape, a bare string, and an already-parsed object defensively
      // since this is a beta block type not pinned down by prior testing.
      let raw = block.content;
      if (Array.isArray(raw)) {
        raw = raw.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
      }
      if (typeof raw === 'string') return JSON.parse(raw);
      if (raw && typeof raw === 'object') return raw;
    } catch (err) {
      console.error('viki-dashboard: failed to parse mcp_tool_result block', err.message, JSON.stringify(block).slice(0, 500));
    }
    return null;
  });

  // Each Zapier raw-GET result wraps the real FUB response as
  // { results: [ { status, body: {...} } ] } — unwrap to the FUB body.
  function unwrapBody(parsed) {
    const body = parsed?.results?.[0]?.body;
    return body && typeof body === 'object' ? body : null;
  }

  const stagesBody = unwrapBody(parsedResults[0]);
  const openTasksBody = unwrapBody(parsedResults[1]);
  const doneTasksBody = unwrapBody(parsedResults[2]);
  const newLeadsBody = unwrapBody(parsedResults[3]);

  if (!stagesBody || !openTasksBody || !doneTasksBody || !newLeadsBody) {
    console.error('viki-dashboard: one or more FUB calls did not return a parseable body',
      { stages: !!stagesBody, openTasks: !!openTasksBody, doneTasks: !!doneTasksBody, newLeads: !!newLeadsBody });
    return { ok: false, error: 'incomplete_data (' + resultBlocks.length + ' of ' + calls.length + ' calls returned, stop=' + message.stop_reason + ')' };
  }

  // Lead tiers, from /v1/stages' live peopleCount per stage.
  const tierCounts = { Hot: 0, Warm: 0, Cold: 0, Active: 0, Pending: 0, Closed: 0 };
  (stagesBody.stages || []).forEach((s) => {
    const tier = STAGE_TIER_MAP[s.name];
    if (tier) tierCounts[tier] += s.peopleCount || 0;
  });
  const leadTiers = TIER_ORDER.map((tier) => ({ tier, count: tierCounts[tier] }));

  // Open task buckets, from /v1/tasks?isCompleted=0.
  let overdue = 0, dueToday = 0, upNext = 0;
  (openTasksBody.tasks || []).forEach((t) => {
    if (!t.dueDate) { upNext++; return; }
    if (t.dueDate < today) overdue++;
    else if (t.dueDate === today) dueToday++;
    else upNext++;
  });

  // "Finished" is an approximation: it scans the most recently-touched 150
  // completed tasks (not the full ~74k historical total, which isn't
  // feasible to pull) and counts those completed today. Same-day automation
  // completions land here reliably; a task a human closes out today that was
  // originally created on an earlier day may be missed if it's fallen out of
  // that recent-150 window. No server-side "completed today" filter exists
  // on this endpoint (verified empirically — dueDate is not a real filter here).
  const finished = (doneTasksBody.tasks || []).filter((t) => (t.completed || '').slice(0, 10) === today).length;

  const newLeadsToday = typeof newLeadsBody._metadata?.total === 'number'
    ? newLeadsBody._metadata.total
    : (newLeadsBody.people || []).length;

  return {
    ok: true,
    error: null,
    taskCounts: { overdue, dueToday, upNext, finished },
    leadTiers,
    newLeadsToday
  };
}

// ---------------------------------------------------------------------------
// Notion, direct REST (no MCP/LLM hop needed — Notion has a plain
// server-to-server API with a bearer token).
// ---------------------------------------------------------------------------
async function notionQuery(dataSourceId, body) {
  const notionKey = process.env.NOTION_API_KEY;
  if (!notionKey) throw new Error('notion_not_configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`notion_http_${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Short, user-readable reason for a failed Notion call, shown in the
// dashboard's Activity Stream.
function notionErrorCode(err) {
  const msg = err?.message || '';
  if (msg === 'notion_not_configured') return 'server_not_configured';
  if (err?.name === 'AbortError') return 'timeout';
  if (msg.startsWith('notion_http_404')) return 'not_shared_with_integration';
  if (msg.startsWith('notion_http_401')) return 'bad_token';
  const m = msg.match(/^notion_http_(\d+)/);
  return m ? 'notion_http_' + m[1] : 'upstream_failure';
}

function notionPlainText(richTextArray) {
  return (richTextArray || []).map((t) => t.plain_text || '').join('').trim();
}

// Buckets one tracker's rows into the same Overdue/Due Today/Up Next/Finished
// shape as FUB tasks, tagging each item so the frontend can badge it
// consistently with the existing Priority Queue's Real Estate / Soccer tags.
function bucketTrackerRows(results, { titleProp, tag }) {
  const today = todayUtcDateString();
  const items = [];
  (results || []).forEach((page) => {
    const props = page.properties || {};
    const status = props.Status?.select?.name || '';
    const dueDate = props['Due Date']?.date?.start || null;
    const label = notionPlainText(props[titleProp]?.title);
    if (!label) return;

    let bucket;
    if (status === 'Done') bucket = 'Finished';
    else if (!dueDate) bucket = 'Up Next';
    else if (dueDate.slice(0, 10) < today) bucket = 'Overdue';
    else if (dueDate.slice(0, 10) === today) bucket = 'Due Today';
    else bucket = 'Up Next';

    items.push({
      label,
      tag,
      urgency: bucket === 'Overdue' ? 'High' : bucket === 'Due Today' ? 'Medium' : 'Low',
      bucket
    });
  });
  return items;
}

async function fetchOpsPanel() {
  try {
    const [reOps, bdTracker] = await Promise.all([
      notionQuery(RE_OPS_DATA_SOURCE_ID, { page_size: 100 }),
      notionQuery(BD_TRACKER_DATA_SOURCE_ID, { page_size: 100 })
    ]);
    const items = [
      ...bucketTrackerRows(reOps.results, { titleProp: 'Task', tag: 'Real Estate' }),
      ...bucketTrackerRows(bdTracker.results, { titleProp: 'Item', tag: 'Soccer' })
    ];
    const bucketRank = { Overdue: 0, 'Due Today': 1, 'Up Next': 2, Finished: 3 };
    items.sort((a, b) => bucketRank[a.bucket] - bucketRank[b.bucket]);
    return { ok: true, error: null, items };
  } catch (err) {
    console.error('viki-dashboard: Notion ops trackers failed', err.message);
    return { ok: false, error: notionErrorCode(err), items: [] };
  }
}

// Notion number property name -> key in the API response. Every field the
// Morning Brief skill writes per run.
const BRIEF_NUMBER_FIELDS = {
  'Tasks due today': 'tasksDueToday',
  'Tasks overdue': 'tasksOverdue',
  'Appointments today': 'appointmentsToday',
  'New leads 24h': 'newLeads24h',
  'New leads 7d': 'newLeads7d',
  'New leads 30d': 'newLeads30d',
  'Calls yesterday': 'callsYesterday',
  'Outbound calls 7d avg': 'outboundCalls7dAvg',
  'Texts sent yesterday': 'textsSentYesterday',
  'Texts received yesterday': 'textsReceivedYesterday',
  'Emails delivered': 'emailsDelivered',
  'Emails failed': 'emailsFailed',
  'Open deals': 'openDeals',
  'Expected commission': 'expectedCommission',
  'Closed deals 30d': 'closedDeals30d',
  'Commission closed 30d': 'commissionClosed30d',
  'AI calls 7d': 'aiCalls7d',
  'AI calls reached': 'aiCallsReached',
  'Sellers interested 7d': 'sellersInterested7d',
  'Opt-outs 7d': 'optOuts7d',
  'Zero-list total': 'zeroListTotal',
  'Cash-offer list total': 'cashOfferListTotal',
  'Active drip plans': 'activeDripPlans',
  'People in drips': 'peopleInDrips',
  'Sections failed': 'sectionsFailed',
  'Sections partial': 'sectionsPartial'
};

function briefRowToJson(row) {
  const props = row.properties || {};
  const out = {
    runTime: props['Run time']?.date?.start || row.created_time || null,
    mode: props.Mode?.select?.name || null,
    focusToday: notionPlainText(props['Focus today']?.rich_text) || null,
    notes: notionPlainText(props.Notes?.rich_text) || null
  };
  for (const [prop, key] of Object.entries(BRIEF_NUMBER_FIELDS)) {
    out[key] = typeof props[prop]?.number === 'number' ? props[prop].number : null;
  }
  return out;
}

// "Morning Brief Reports" is written by the SMRE Morning Brief skill, one row
// per run. Returns the newest run plus a short history for the trend table.
// No rows / any failure degrades to available:false rather than failing the
// whole request, so the dashboard shows placeholders instead of breaking.
async function fetchMorningBrief() {
  if (!process.env.NOTION_API_KEY) return { ok: false, available: false, error: 'server_not_configured', latest: null, history: [] };

  try {
    const rows = await notionQuery(MORNING_BRIEF_DATA_SOURCE_ID, {
      page_size: 7,
      sorts: [{ property: 'Run time', direction: 'descending' }]
    });
    const history = (rows.results || []).map(briefRowToJson);
    if (!history.length) return { ok: true, available: false, error: null, latest: null, history: [] };
    return { ok: true, available: true, error: null, latest: history[0], history };
  } catch (err) {
    console.error('viki-dashboard: Morning Brief lookup failed', err.message);
    return { ok: false, available: false, error: notionErrorCode(err), latest: null, history: [] };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const [fub, ops, brief] = await Promise.all([
    fetchFubData().catch((err) => { console.error('viki-dashboard: fub threw', err); return { ok: false, error: 'unexpected_error' }; }),
    fetchOpsPanel(),
    fetchMorningBrief()
  ]);

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    fub,
    ops,
    brief
  });
};
