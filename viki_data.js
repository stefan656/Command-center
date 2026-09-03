// viki_data.js
// Single source of truth for the V.I.K.I. command center dashboard.
// dashboard.html reads everything it renders from window.VIKI_DATA.
//
// Any entry below may carry `celebrate: true`. That flag is the only thing
// that triggers the dashboard's warm-yellow accent — reserved for closed
// deals, wins, and milestones — so it should stay rare.

window.VIKI_DATA = {
  greeting: "Good evening, Stefan.",
  generatedLabel: "Brief generated",
  generated: "Aug 31, 2026 · 07:45 AM",

  connectors: [
    { name: "Follow Up Boss",     status: "online"  },
    { name: "Retell AI",          status: "online"  },
    { name: "Zapier",             status: "online"  },
    { name: "Notion",             status: "online"  },
    { name: "Google Calendar",    status: "online"  },
    { name: "Gmail",              status: "offline" },
    { name: "iBuyer Portal",      status: "offline" }
  ],

  content: {
    funnel: [
      { stage: "WhatsApp Leads In",     value: 340, pct: 100  },
      { stage: "Skip Traced",           value: 96,  pct: 28   },
      { stage: "Contacted",             value: 22,  pct: 6.5  },
      { stage: "Qualified · Retell",    value: 11,  pct: 3.2  },
      { stage: "Offer Submitted",       value: 5,   pct: 1.5  },
      { stage: "Accepted",              value: 1,   pct: 0.3  }
    ],
    // The five business-metric tiles that used to live here (Pipeline
    // Commission, Offer Accept Rate, Active Deals, Club Partners, Tasks
    // Open) were replaced by the live "FUB Daily Stats" tiles — see
    // dailyStatTiles in index.html. Deal Closed This Week is the only
    // hand-curated tile left in the row.
    metrics: [
      { value: "1", label: "Deal Closed This Week", celebrate: true }
    ],
    log: [
      { text: "Skip trace batch complete — 96 owners resolved" },
      { text: "Retell AI closed 14 outbound calls, 3 qualified" },
      { text: "New WhatsApp lead: 4457 NW 185th St, Miami Gardens" },
      { text: "Owner disbursement drafted — 3715 NW 194th St" },
      { text: "FUB stage updated: Zeisel → Needs Follow Up" },
      { text: "Deal closed — 1606 SW 3rd Ct funded, commission secured", celebrate: true },
      { text: "Broward County vendor registration still pending" },
      { text: "PaymentWorks invite requested — Pembroke Pines" },
      { text: "SEO content queued for Jessie — DOW draft ready" },
      { text: "iBuyer offer window opens in 2 days — Henderson" },
      { text: "Sentiment analysis flagged 3 warm leads overnight" },
      { text: "Skip trace contact rate holding at 6% this week" },
      { text: "Calendar hold created — Miramar grant meeting" }
    ]
  },

  sponsors: [
    { name: "Florida Fire Academy",         status: "Verbal Deal", detail: "NFDA Official Technical Training Partner · 10% referral", celebrate: true },
    { name: "Pembroke Pines Parks & Rec",   status: "Pending",     detail: "Awaiting PaymentWorks vendor invite" },
    { name: "Miramar Parks & Rec",          status: "Waiting",     detail: "Grant meeting · VM Colburn TBD" },
    { name: "Broward County",               status: "Pending",     detail: "Vendor registration under review" }
  ],

  priorities: [
    { label: "Follow up — 4457 NW 185th St (Zeisel)",        tag: "Real Estate", urgency: "High" },
    { label: "Follow up — 3055 Newell Blvd (Henderson)",     tag: "Real Estate", urgency: "High" },
    { label: "Owner disbursement — 3715 NW 194th St",        tag: "Real Estate", urgency: "High" },
    { label: "Broward County vendor registration",           tag: "Soccer",      urgency: "High" },
    { label: "PaymentWorks invite — Pembroke Pines",         tag: "Soccer",      urgency: "High" }
  ],

  headline: "SYSTEMS NOMINAL — TWO PROPERTIES AWAITING FOLLOW-UP",
  closer: "That's the full picture, Stefan. Standing by whenever you need me.",

  paymentDue: { label: "BBB Accreditation due", amount: "$510–660", date: "Sep 15" }
};
