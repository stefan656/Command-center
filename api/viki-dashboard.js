// /api/viki-dashboard.js
// Vercel serverless function: read-only data feed for the V.I.K.I. dashboard.
//
// Reads the "Morning Brief Reports" Notion database (one row per run of the
// morning brief agent) and returns the latest run plus recent history. The
// dashboard displays these numbers as-is — nothing is recalculated here.
//
// Env var:
//   NOTION_API_KEY - Notion internal integration token (ntn_...). The
//                    integration must be connected to Morning Brief Reports
//                    in Notion (... -> Connections) — a token alone grants no
//                    access.
//
// A missing token or failed lookup returns available:false with a short
// error code rather than failing the request, so the page can say why.

const REQUEST_TIMEOUT_MS = 20000;
const NOTION_VERSION = '2025-09-03';
const MORNING_BRIEF_DATA_SOURCE_ID = '171cf501-39d5-4809-a129-7243c93bc45e';

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
// dashboard.
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
  'Texts failed yesterday': 'textsFailedYesterday',
  'Texts sent 7d': 'textsSent7d',
  'Texts failed 7d': 'textsFailed7d',
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
// per run. Returns the newest run plus recent history for the trend charts.
// No rows / any failure degrades to available:false rather than failing the
// whole request, so the dashboard shows placeholders instead of breaking.
async function fetchMorningBrief() {
  if (!process.env.NOTION_API_KEY) return { ok: false, available: false, error: 'server_not_configured', latest: null, history: [] };

  try {
    const rows = await notionQuery(MORNING_BRIEF_DATA_SOURCE_ID, {
      page_size: 14,
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
  const brief = await fetchMorningBrief();
  return res.status(200).json({ generatedAt: new Date().toISOString(), brief });
};
