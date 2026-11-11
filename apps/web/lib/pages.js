/**
 * Content for the Outcomes, About and Careers pages.
 *
 * Nothing here asserts a founding year, headcount, number of students
 * trained, college or industry partnership, certification,
 * accreditation, award, salary, or any employment or placement
 * guarantee. None of that is established, so none of it is stated.
 */

/* ── Outcomes ─────────────────────────────────────────────── */

export const outcomesPage = {
  kicker: "Outcomes",
  title: "What the programmes are built to achieve.",
  body:
    "These are learning outcomes: what a participant should be able to do by the end. " +
    "They describe capability developed through the programme, not hiring results.",

  sections: [
    {
      id: "practical-skill",
      heading: "Practical skill development",
      body:
        "Security is a practical discipline. Reading about an investigation is not the same as running one, and the gap between the two is where most candidates come unstuck.",
      points: [
        { title: "Labs over lectures", body: "Each topic is paired with an exercise that produces something: a query, a timeline, a finding, a report." },
        { title: "Realistic scenarios", body: "Exercises are built on the sort of messy, partial evidence real work provides, rather than clean textbook cases." },
        { title: "Graded on the work", body: "Assessment is based on what the exercise produced and the reasoning behind it, not on recall." },
      ],
    },
    {
      id: "industry-readiness",
      heading: "Industry readiness",
      body:
        "Programmes are structured around the knowledge a security role actually asks for, so participants can approach interviews and early work with the right technical vocabulary and habits.",
      points: [
        { title: "Role-shaped content", body: "Modules map to the work described in real job specifications rather than to a syllabus in isolation." },
        { title: "Current tooling", body: "Participants work in platforms used in industry, so the environment is familiar rather than novel." },
        { title: "Explaining your reasoning", body: "Being able to justify a decision matters as much as reaching it, in an interview and on the job." },
      ],
    },
    {
      id: "hands-on",
      heading: "Hands-on experience",
      body: "The kinds of exercise a participant can expect across the two programmes.",
      examples: [
        "Reconstructing an intrusion from logs alone",
        "Writing and tuning a detection rule against noisy traffic",
        "Investigating a suspicious authentication pattern end to end",
        "Extracting a system prompt from a deployed AI application",
        "Poisoning a retrieval corpus and measuring the effect",
        "Producing a written incident report from a full investigation",
      ],
    },
    {
      id: "career-preparation",
      heading: "Career preparation",
      body:
        "Technical capability is necessary but not sufficient. These elements prepare participants to present that capability.",
      points: [
        { title: "Technical interview preparation", body: "Practice with the kinds of question security interviews actually ask, and how to reason aloud." },
        { title: "Practical assessments", body: "Timed exercises that mirror the take-home and live tasks used in hiring." },
        { title: "Portfolio development", body: "Work produced during the programme is kept as evidence that can be shown to an interviewer." },
        { title: "Project demonstrations", body: "Practice presenting and defending a piece of work to an audience." },
        { title: "Problem-solving exercises", body: "Open-ended problems with no single correct answer, worked through methodically." },
      ],
    },
  ],

  pathways: {
    heading: "Career pathways",
    body:
      "Roles these programmes are designed to prepare participants for. These are directions of travel, not offers or guarantees of employment.",
    groups: [
      { programme: "SOC Analyst", slug: "soc-analyst", roles: ["SOC Analyst", "Security Operations Associate", "Junior Security Analyst", "Threat Monitoring Analyst"] },
      { programme: "AI Security Engineer", slug: "ai-security-engineer", roles: ["AI Security Analyst", "AI Red Teaming Associate", "LLM Security Engineer", "AI Application Security Associate"] },
    ],
    note:
      "PolarSight does not guarantee employment or placement. Completing a programme develops capability; hiring decisions rest entirely with employers.",
  },
};

/* ── About ────────────────────────────────────────────────── */

export const aboutPage = {
  kicker: "About us",
  title: "A cybersecurity training and workforce-readiness initiative.",

  whoWeAre: {
    heading: "Who we are",
    paragraphs: [
      "PolarSight is a cybersecurity-focused training and workforce-readiness initiative dedicated to helping individuals develop practical security skills relevant to the evolving technology landscape.",
      "We believe cybersecurity education should extend beyond theoretical knowledge. Understanding how systems work, identifying vulnerabilities, investigating threats and securing modern technologies require practical experience and continuous learning.",
      "Through specialized training programmes, practical learning experiences and industry-oriented approaches, PolarSight aims to bridge the gap between academic learning and real-world cybersecurity requirements.",
    ],
  },

  mission: {
    heading: "Our mission",
    body:
      "To make practical cybersecurity education accessible and help develop technically capable professionals who can contribute to the security of modern digital infrastructure.",
  },

  vision: {
    heading: "Our vision",
    body:
      "To become a trusted cybersecurity education and workforce development organization that contributes to building a skilled cybersecurity ecosystem.",
  },

  approach: {
    heading: "Our approach",
    items: [
      { n: "01", title: "Fundamentals first", body: "Establish strong technical foundations before moving to specialised work." },
      { n: "02", title: "Practical learning", body: "Emphasize hands-on exercises and real-world scenarios over theory alone." },
      { n: "03", title: "Industry relevance", body: "Align learning with evolving cybersecurity requirements." },
      { n: "04", title: "Continuous development", body: "Encourage continuous learning and specialization beyond the programme." },
    ],
  },

  focus: {
    heading: "Our focus areas",
    items: [
      { title: "Security Operations", body: "Monitoring, detection, investigation and response." },
      { title: "Artificial Intelligence Security", body: "Securing AI-powered applications and the systems around them." },
      { title: "Cloud Security", body: "Identity, configuration and workload security in cloud environments." },
      { title: "Cybersecurity Research and Practical Training", body: "Developing exercises and material grounded in current practice." },
    ],
  },
};

/* ── Careers ──────────────────────────────────────────────── */

export const careersPage = {
  hero: {
    kicker: "Join PolarSight",
    title: "Build the Next Generation of Cybersecurity Professionals.",
    body:
      "Join PolarSight as a cybersecurity trainer, industry expert or technical mentor. " +
      "Share your knowledge, contribute to practical cybersecurity education and help " +
      "develop the next generation of security professionals.",
    cta: { label: "Explore opportunities", href: "#positions" },
  },

  why: {
    heading: "Why join PolarSight?",
    body: "What this involves, stated plainly.",
    items: [
      { title: "Share industry knowledge", body: "Turn what you have learned in practice into material other people can learn from." },
      { title: "Mentor aspiring professionals", body: "Work directly with people entering the field and shape how they think about the work." },
      { title: "Contribute to practical education", body: "Help build exercises and labs grounded in how security is actually done." },
      { title: "Work with technical peers", body: "Join a growing network of practitioners building this material together." },
      { title: "Campus and online delivery", body: "Participate in campus-based sessions, online delivery, or both." },
    ],
  },

  positions: {
    heading: "Open positions",
    body: "Roles we are currently accepting applications for.",
    items: [
      {
        title: "SOC Analyst Trainer",
        area: "Security Operations",
        expertise: ["SIEM platforms", "Splunk / Microsoft Sentinel", "Security monitoring", "Threat detection", "Incident response", "Log analysis", "MITRE ATT&CK"],
      },
      {
        title: "AI Security Trainer",
        area: "AI Security",
        expertise: ["Python", "AI/ML fundamentals", "LLM security", "Prompt injection", "AI red teaming", "RAG security", "AI application security"],
      },
      {
        title: "Cloud Security Trainer",
        area: "Cloud Security",
        expertise: ["AWS / Azure", "IAM", "Cloud architecture", "Cloud network security", "Container security", "Kubernetes security"],
      },
      {
        title: "Cybersecurity Technical Mentor",
        area: "Mentoring",
        expertise: ["Strong cybersecurity fundamentals", "Practical technical knowledge", "Mentoring and problem-solving", "Guiding practical projects"],
      },
      {
        title: "Technical Content Developer",
        area: "Content",
        expertise: ["Cybersecurity documentation", "Technical research", "Curriculum development", "Lab creation", "Technical writing"],
      },
    ],
  },

  employmentTypes: {
    heading: "Opportunity types",
    body: "Arrangements we are accepting applications for. Specifics are discussed during the process rather than assumed here.",
    items: ["Full-time", "Part-time", "Contract-based", "Industry Expert / Guest Trainer"],
  },

  eligibility: {
    heading: "Trainer eligibility",
    body:
      "Candidates are assessed on demonstrated expertise against the requirements of the position. A degree is not required for every role.",
    items: [
      "Relevant technical knowledge and practical experience",
      "Relevant certifications where applicable to the role",
      "Ability to explain complex technical concepts clearly",
      "Strong communication skills",
      "Ability to demonstrate practical work",
      "Industry experience preferred for senior trainer positions",
    ],
  },

  process: {
    heading: "Recruitment process",
    steps: [
      { n: "01", title: "Explore open positions", body: "Find the role that matches your expertise." },
      { n: "02", title: "Submit application", body: "Send your details, experience and resume." },
      { n: "03", title: "Resume screening", body: "We review your background against the role." },
      { n: "04", title: "Technical interview", body: "A conversation about your practical experience." },
      { n: "05", title: "Demo training session", body: "Teach a short session so we can see how you explain things." },
      { n: "06", title: "Selection and onboarding", body: "Agree the arrangement and get set up." },
    ],
  },

  apply: {
    heading: "Apply now",
    body: "Tell us about your experience and the role you are interested in.",
  },
};
