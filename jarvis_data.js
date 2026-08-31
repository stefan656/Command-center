// jarvis_data.js
// Single source of truth for the J.A.R.V.I.S. command center dashboard.
// dashboard.html reads everything it renders from window.JARVIS_DATA.

window.JARVIS_DATA = {
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
    metrics: [
      { value: "$12.4K", label: "Pipeline Commission" },
      { value: "18%",    label: "Offer Accept Rate"   },
      { value: "7",      label: "Active Deals"        },
      { value: "3",      label: "Club Partners"       },
      { value: "29",     label: "Tasks Open"          }
    ],
    log: [
      "Skip trace batch complete — 96 owners resolved",
      "Retell AI closed 14 outbound calls, 3 qualified",
      "New WhatsApp lead: 4457 NW 185th St, Miami Gardens",
      "Owner disbursement drafted — 3715 NW 194th St",
      "FUB stage updated: Zeisel → Needs Follow Up",
      "Broward County vendor registration still pending",
      "PaymentWorks invite requested — Pembroke Pines",
      "SEO content queued for Jessie — DOW draft ready",
      "iBuyer offer window opens in 2 days — Henderson",
      "Sentiment analysis flagged 3 warm leads overnight",
      "Skip trace contact rate holding at 6% this week",
      "Calendar hold created — Miramar grant meeting"
    ]
  },

  sponsors: [
    { name: "Florida Fire Academy",         status: "Verbal Deal", detail: "NFDA Official Technical Training Partner · 10% referral" },
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
