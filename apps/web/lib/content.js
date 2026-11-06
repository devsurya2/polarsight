// ─────────────────────────────────────────────────────────────
// All site copy lives here. Edit this file to change the site.
// Anything marked PLACEHOLDER is invented and must be replaced
// with real information before this goes live.
// ─────────────────────────────────────────────────────────────

export const brand = {
  name: "Polarsight",
  email: "hello@polarsight.in",      // PLACEHOLDER
  phone: "+91 90000 00000",          // PLACEHOLDER
  phoneHref: "+919000000000",        // PLACEHOLDER
  city: "Chennai",
  state: "Tamil Nadu",
};

export const nav = [
  { label: "Home", href: "#main" },
  { label: "Programmes", href: "#programmes" },
  { label: "Outcomes", href: "#outcomes" },
  { label: "About us", href: "#about" },
];

export const hero = {
  kicker: "Cybersecurity Training · Campus Placement · India",
  lines: ["Building the next", "generation of"],
  accent: "cybersecurity professionals.",
  body: "Structured cybersecurity training, practical security environments and career-focused development designed to build industry-ready professionals.",
  primary: { label: "Talk to us", href: "#contact" },
  secondary: { label: "See our tracks", href: "#programmes" },
  chips: ["100% hands-on labs", "Running across Tamil Nadu & beyond"],
};

export const about = {
  kicker: "Who we are",
  lead: "Still teaching security from slides while your students interview on live incidents? We run the labs, the mentoring and the placement prep as one programme your department owns.",
  cta: { label: "More about Polarsight", href: "#about" },
};

// NOTE: no longer rendered. The 'Who we serve' section was removed
// from the page; this block is kept so the content is not lost.
export const serve = {
  kicker: "Who we serve",
  title: "See where you fit.",
  body: "Four groups we build for, and what changes once security training runs as a real programme. Pick one, or let them play.",
  linkLabel: "Full story for every group",
  tabs: [
    {
      id: "students",
      name: "Students",
      heading: "From first lab to first offer, every step is evidenced.",
      blurb:
        "You finish with graded work you can show an interviewer, not just a certificate you can name.",
      outcome: "Graduates who can prove what they can do",
      mock: "student",
      flow: ["Enrolled", "Labs graded", "Mock interview", "Placed"],
    },
    {
      id: "colleges",
      name: "Colleges",
      heading: "A credible security track without hiring a specialist.",
      blurb:
        "Curriculum, lab infrastructure, mentors and reporting arrive as one package your faculty can run.",
      outcome: "Placement numbers you can publish",
      mock: "college",
      flow: ["Scoped", "Deployed", "Running", "Reported"],
    },
    {
      id: "cells",
      name: "Placement cells",
      heading: "Shortlists backed by evidence, not self-reported skills.",
      blurb:
        "See exactly which students are interview-ready, in which specialisation, and where the gaps still are.",
      outcome: "Fewer rejections at the technical round",
      mock: "cell",
      flow: ["Cohort", "Scored", "Shortlist", "Introduced"],
    },
    {
      id: "employers",
      name: "Hiring partners",
      heading: "Candidates who have already worked an alert queue.",
      blurb:
        "Set the scenarios students are tested on, then hire from a cohort whose work you can inspect.",
      outcome: "Shorter screening, better first-year retention",
      mock: "employer",
      flow: ["Scenario", "Cohort", "Review", "Hire"],
    },
  ],
};

export const programmes = {
  kicker: "Our programmes",
  title: "Four tracks we build for you.",
  body: "From the first command line session to a graduate ready for a technical interview. Every track is graded, mentored and mapped to a real job role.",
  items: [
    {
      code: "TRK-01",
      name: "SOC Analyst",
      tag: "Security Operations",
      duration: "14 weeks",
      level: "Entry",
      summary: "Built for the most common first job in security.",
      points: [
        "Live alert queues with real log data",
        "SIEM queries, triage and escalation",
        "Incident reports reviewed by practitioners",
        "Mapped to NIST NICE analyst roles",
      ],
      mock: "soc",
    },
    {
      code: "TRK-02",
      name: "Offensive Security",
      tag: "Penetration Testing",
      duration: "16 weeks",
      level: "Intermediate",
      summary: "For students who want to break things properly.",
      points: [
        "Web and network exploitation labs",
        "Active Directory attack paths",
        "Findings written the way clients read them",
        "Capstone engagement with a full report",
      ],
      mock: "offsec",
    },
    {
      code: "TRK-03",
      name: "Cloud Security",
      tag: "Cloud & Containers",
      duration: "12 weeks",
      level: "Intermediate",
      summary: "Where most new misconfigurations actually live.",
      points: [
        "Identity and access policy review",
        "Container and Kubernetes hardening",
        "Cloud-native detection and logging",
        "Hands-on across AWS and Azure",
      ],
      mock: "cloud",
    },
    {
      code: "TRK-04",
      name: "GRC & Compliance",
      tag: "Risk & Audit",
      duration: "10 weeks",
      level: "Entry",
      summary: "For students who prefer policy to packet captures.",
      points: [
        "Risk registers and control mapping",
        "Audit evidence and gap assessment",
        "ISO 27001 and DPDP Act fundamentals",
        "Report writing for non-technical readers",
      ],
      mock: "grc",
    },
  ],
};

export const outcomes = {
  kicker: "Programme reference",
  title: "Cohorts already running.",
  body: "An engineering college that replaced an optional elective with a graded track. A placement cell that now screens on lab scores. A managed services firm hiring straight from a cohort.",
  // PLACEHOLDER — replace with real partner programmes once you can name them.
  note: "Illustrative examples. Replace with named partners and audited figures before publishing.",
  linkLabel: "All programmes",
  items: [
    {
      tag: "Campus Track",
      name: "Engineering college, Chennai",
      detail: "SOC Analyst track, two batches",
      metric: "120 students",
    },
    {
      tag: "Placement Cell",
      name: "Private university, Coimbatore",
      detail: "Screening by graded lab performance",
      metric: "3 specialisations",
    },
    {
      tag: "Bootcamp",
      name: "Semester-break intensive",
      detail: "Offensive security, condensed format",
      metric: "6 weeks",
    },
    {
      tag: "Hiring Partner",
      name: "Managed security provider",
      detail: "Direct hiring from graduating cohorts",
      metric: "Rolling intake",
    },
  ],
};

export const why = {
  kicker: "Why us",
  title: "Built around your department, then kept running.",
  body: "We are not a video library with a login. We build the track around your syllabus and calendar, then stay through the placement season.",
  items: [
    {
      n: "01",
      title: "Graded on work, not attendance",
      body: "Every lab produces an artefact that is scored automatically. Students leave with a portfolio, and faculty get evidence rather than impressions.",
    },
    {
      n: "02",
      title: "Taught by people doing the job",
      body: "Mentor sessions are run by working analysts and testers. They review submitted reports the same way they review a junior colleague's.",
    },
    {
      n: "03",
      title: "With you through placement season",
      body: "The programme does not end at the last lab. Mock interviews, portfolio review and employer introductions run until the cohort is placed.",
    },
  ],
};

export const shift = {
  kicker: "What changes",
  title: "Wherever security is still taught from slides.",
  items: [
    {
      area: "Core curriculum",
      before: "Theory papers and optional labs",
      after: "Graded, hands-on track with a capstone",
    },
    {
      area: "Assessment",
      before: "Multiple-choice internals",
      after: "Scored lab work and written incident reports",
    },
    {
      area: "Lab infrastructure",
      before: "Shared VMs that break mid-session",
      after: "Browser-based range, nothing to maintain",
    },
    {
      area: "Placement prep",
      before: "A week of mock aptitude tests",
      after: "Technical mocks with working practitioners",
    },
    {
      area: "Student evidence",
      before: "A line on a resume",
      after: "A verifiable portfolio of graded work",
    },
    {
      area: "Faculty visibility",
      before: "Attendance registers",
      after: "Live skill gaps per student, exportable",
    },
  ],
};

export const marquee = [
  "Hands-on first",
  "Graded, not watched",
  "Mentored by practitioners",
  "Built for placement",
];

export const coverage = {
  kicker: "Serving campuses across India",
  title: "Based in Chennai. Running programmes anywhere.",
  body: "Our team is in Chennai, but the range runs in the browser, so the programme works the same whether your campus is down the road or three states away.",
  cities: [
    "Chennai",
    "Coimbatore",
    "Madurai",
    "Bengaluru",
    "Hyderabad",
    "Pune",
    "Kochi",
    "Vellore",
    "Trichy",
    "Vijayawada",
  ],
  hq: "Polarsight HQ, Chennai",
  legend: ["Campuses we serve", "Polarsight HQ", "Remote or on-site"],
  steps: [
    {
      title: "On-site or online scoping",
      body: "We meet the department and placement cell, review the current syllabus and agree the track and calendar.",
    },
    {
      title: "Range goes live",
      body: "Student and faculty accounts are provisioned. Labs run in the browser, so campus IT installs nothing.",
    },
    {
      title: "Weekly guided sessions",
      body: "Mentored labs run alongside regular classes, with everything graded automatically as students submit.",
    },
    {
      title: "Placement support",
      body: "Technical mocks, portfolio review and employer introductions, followed by an outcomes report.",
    },
  ],
};

export const faq = {
  kicker: "Questions colleges ask us",
  title: "Straight answers before you commit.",
  body: "Still unsure how this would fit your semester? Send us a note describing your batch and we will map it out.",
  linkLabel: "See all questions",
  items: [
    {
      q: "What does Polarsight do?",
      a: "We run hands-on cybersecurity training inside colleges. That means a graded lab curriculum, a browser-based attack and defend range, mentoring from working practitioners, and placement preparation, delivered as one programme that your department runs with us.",
    },
    {
      q: "Do students need prior security experience?",
      a: "No. Entry tracks assume only basic networking and some comfort with a command line. For batches coming in cold we run a two-week foundation module before the main track begins.",
    },
    {
      q: "What does the college need to provide?",
      a: "A room, a browser and a stable internet connection. Every lab runs on our hosted range, so there is nothing for campus IT to install, licence or maintain, and no dependency on lab machine specifications.",
    },
    {
      q: "How does this fit into an existing timetable?",
      a: "Most campuses run it as a weekly three-hour slot across one semester. Where the calendar is tight we run condensed bootcamps during semester breaks instead, covering the same graded content.",
    },
    {
      q: "How are students assessed?",
      a: "On lab outcomes rather than multiple-choice tests. Submissions are scored automatically, and faculty see completion, time taken and skill gaps per student, exportable for internal and accreditation reporting.",
    },
    {
      q: "What does it cost?",
      a: "It depends on cohort size and track length, and we run pilot, revenue-share and grant-funded models with different institutions. Tell us your batch size and we will put a quote together.",
    },
  ],
};

export const cta = {
  kicker: "Let's talk",
  title: "Have a batch that needs a real security track?",
  body: "Tell us about your institution, your semester calendar and how many students you are thinking about. We reply within two working days.",
  primary: { label: "Book a campus call" },
  secondary: { label: "Email us" },
};

export const footer = {
  blurb:
    "Polarsight runs hands-on cybersecurity training inside colleges, and connects the students who finish it to the teams hiring them.",
  columns: [
    {
      title: "Programmes",
      links: [
        { label: "SOC Analyst", href: "#programmes" },
        { label: "Offensive Security", href: "#programmes" },
        { label: "Cloud Security", href: "#programmes" },
        { label: "GRC & Compliance", href: "#programmes" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About us", href: "#about" },
        { label: "Outcomes", href: "#outcomes" },
        { label: "Questions", href: "#faq" },
      ],
    },
  ],
};
