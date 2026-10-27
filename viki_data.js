// viki_data.js
// Hand-curated, non-numeric content for the V.I.K.I. command center: the
// connector list (live dots for Follow Up Boss/Notion are overridden by
// /api/viki-dashboard), partner status, the payment reminder and the spoken
// closer. Every number on the page comes from /api/viki-dashboard — nothing
// here is dummy data.
//
// Any entry below may carry `celebrate: true`. That flag is the only thing
// that triggers the dashboard's warm-yellow accent — reserved for closed
// deals, wins, and milestones — so it should stay rare.

window.VIKI_DATA = {
  connectors: [
    { name: "Follow Up Boss",     status: "online"  },
    { name: "Retell AI",          status: "online"  },
    { name: "Zapier",             status: "online"  },
    { name: "Notion",             status: "online"  },
    { name: "Google Calendar",    status: "online"  },
    { name: "Gmail",              status: "offline" },
    { name: "iBuyer Portal",      status: "offline" }
  ],

  sponsors: [
    { name: "Florida Fire Academy",         status: "Verbal Deal", detail: "NFDA Official Technical Training Partner · 10% referral", celebrate: true },
    { name: "Pembroke Pines Parks & Rec",   status: "Pending",     detail: "Awaiting PaymentWorks vendor invite" },
    { name: "Miramar Parks & Rec",          status: "Waiting",     detail: "Grant meeting · VM Colburn TBD" },
    { name: "Broward County",               status: "Pending",     detail: "Vendor registration under review" }
  ],

  closer: "That's the full picture, Stefan. Standing by whenever you need me.",

  paymentDue: { label: "BBB Accreditation due", amount: "$510–660", date: "Sep 15" }
};
