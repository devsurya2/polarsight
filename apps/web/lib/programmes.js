/**
 * Programme content for the public Programmes pages.
 *
 * Held here rather than in the database because the detail fields
 * below (curriculum, labs, projects, pathways) have no columns in the
 * current Programme model. See docs for the API work this needs.
 *
 * Deliberately absent, because none of it is established: duration,
 * fees, certification, accreditation, placement or hiring guarantees.
 * Curriculum is presented as proposed content, not as a claim about
 * delivery infrastructure that exists today.
 */

export const programmesIntro = {
  kicker: "Programmes",
  title: "Two programmes, built around practical security work.",
  body:
    "Each programme starts from fundamentals and moves into applied work. " +
    "The curriculum below is proposed programme content and is subject to " +
    "actual delivery capability.",
};

export const programmes = [
  {
    slug: "soc-analyst",
    code: "TRK-01",
    name: "SOC Analyst",
    tag: "Security Operations",
    summary:
      "A practical cybersecurity training programme designed to develop skills in security monitoring, threat detection, security incident investigation and incident response.",

    overview: [
      "Security operations is where most people enter the industry, and it is the clearest route from a technical foundation into a working security role.",
      "This programme builds from networking and operating system fundamentals through to working an alert queue: reading logs, deciding what matters, investigating what does, and writing it up so somebody else can act on it.",
      "The emphasis is on the reasoning behind each step rather than on tool menus. Tools change; the method of forming a hypothesis, testing it against evidence and recording the result does not.",
    ],

    skills: [
      "Read and correlate logs from hosts, networks and cloud services",
      "Build and tune detection queries in a SIEM",
      "Triage an alert queue and judge what deserves escalation",
      "Investigate an incident from first indicator to root cause",
      "Map observed behaviour to MITRE ATT&CK techniques",
      "Apply threat intelligence to active investigations",
      "Write an incident report a non-specialist can act on",
    ],

    curriculum: [
      { title: "Networking Fundamentals", body: "Protocols, addressing, routing and the traffic patterns that matter when reading network evidence." },
      { title: "Linux and Windows Fundamentals", body: "Processes, file systems, permissions, services and the native logging each platform produces." },
      { title: "Cybersecurity Fundamentals", body: "Threats, controls, the attack lifecycle and where defensive work sits within it." },
      { title: "Security Operations Centre Architecture", body: "How a SOC is organised, the tiers within it, escalation paths and handover." },
      { title: "SIEM Fundamentals", body: "Collection, parsing, normalisation, correlation and why detection depends on data quality." },
      { title: "Splunk and Microsoft Sentinel", body: "Working in two widely used platforms: searching, dashboards and detection rules." },
      { title: "Log Analysis", body: "Reading authentication, endpoint, network and cloud logs, and correlating across sources." },
      { title: "Threat Detection", body: "Writing detection logic, reducing false positives and tuning against real traffic." },
      { title: "Incident Investigation", body: "Scoping an incident, building a timeline and separating evidence from assumption." },
      { title: "Incident Response", body: "Containment, eradication and recovery, and the decisions each stage requires." },
      { title: "Threat Intelligence", body: "Indicators, actor behaviour and how intelligence is applied to live investigations." },
      { title: "MITRE ATT&CK Framework", body: "Mapping observed behaviour to techniques, and using coverage to find detection gaps." },
      { title: "Practical SOC Simulation", body: "A sustained exercise working a live alert queue end to end." },
    ],

    tools: [
      "Splunk", "Microsoft Sentinel", "Wireshark", "Linux command line",
      "Windows Event Logs", "Sysmon", "MITRE ATT&CK Navigator", "Open-source threat intelligence",
    ],

    labs: [
      "Reconstruct an intrusion from host and network logs alone",
      "Build a SIEM detection rule, then tune it against noisy traffic",
      "Investigate a suspicious authentication pattern across several systems",
      "Trace a phishing message from delivery through to endpoint activity",
      "Map a recorded attack chain to ATT&CK and identify the detection gaps",
    ],

    projects: [
      "Produce a written incident report from a full investigation, including timeline, impact and recommendations",
      "Build a small detection ruleset for a defined environment and justify each rule",
      "Run a shift on a simulated alert queue and document every triage decision",
    ],

    outcomes: [
      "Work a realistic alert queue and justify what you escalated and why",
      "Investigate an incident and present a defensible timeline",
      "Write detection logic and explain the trade-off you chose",
      "Communicate technical findings to a non-technical reader",
    ],

    pathways: ["SOC Analyst", "Security Operations Associate", "Junior Security Analyst", "Threat Monitoring Analyst"],

    prerequisites: [
      "Comfort with a command line on either Linux or Windows",
      "Basic networking knowledge, or willingness to cover it in the opening modules",
      "No prior security experience assumed",
    ],

    audience: [
      "Students approaching the end of a technical degree",
      "IT and support staff moving toward a security role",
      "Anyone who wants defensive security experience rather than theory alone",
    ],
  },

  {
    slug: "ai-security-engineer",
    code: "TRK-02",
    name: "AI Security Engineer",
    tag: "AI Security",
    summary:
      "A specialized programme focusing on securing AI-powered applications, understanding vulnerabilities in modern AI systems and developing practical AI security skills.",

    overview: [
      "Applications built on large language models fail in ways traditional security testing does not look for. The input is language, the boundary between instruction and data is blurred, and the model is not deterministic.",
      "This programme covers how these systems are put together, where they break, and how to test them properly: prompt injection, jailbreaks, retrieval poisoning, insecure tool use and the API surface around a model.",
      "The work is applied. The aim is to leave able to assess a real AI application and write up what you found.",
    ],

    skills: [
      "Explain how an LLM application is assembled and where trust boundaries sit",
      "Construct and test prompt injection, both direct and indirect",
      "Assess retrieval pipelines for poisoning and leakage",
      "Review the API and tool-calling surface around a model",
      "Run a structured red team exercise against an AI application",
      "Apply the OWASP Top 10 for LLM Applications to a real system",
      "Threat model an AI feature before it ships",
    ],

    curriculum: [
      { title: "AI and Machine Learning Fundamentals", body: "Enough of how models are trained and served to reason about their failure modes." },
      { title: "LLM Architecture and Fundamentals", body: "Tokens, context windows, system prompts, embeddings and why they matter to security." },
      { title: "Prompt Injection", body: "Direct and indirect injection, where untrusted input enters, and what mitigations actually hold." },
      { title: "Jailbreak Attacks", body: "How guardrails are bypassed, and why filtering alone is a weak control." },
      { title: "LLM Application Security", body: "The surrounding application: tool calling, agent loops, output handling and privilege." },
      { title: "RAG Security", body: "Retrieval pipelines, poisoning of the knowledge source, and cross-tenant leakage." },
      { title: "AI API Security", body: "Authentication, rate limiting, key handling, cost abuse and the usual API weaknesses in an AI context." },
      { title: "AI Red Teaming", body: "Running a structured adversarial assessment and recording findings reproducibly." },
      { title: "Model Security", body: "Model and weight handling, supply chain, and risks introduced by third-party models." },
      { title: "OWASP Top 10 for LLM Applications", body: "Working through the published categories against real applications." },
      { title: "AI Threat Modelling", body: "Identifying assets, entry points and abuse cases for an AI feature before it is built." },
      { title: "Practical AI Security Assessments", body: "A full assessment of a deliberately vulnerable AI application, written up as a report." },
    ],

    tools: [
      "Python", "LLM provider APIs", "Vector databases", "RAG frameworks",
      "Burp Suite", "OWASP LLM Top 10", "Open-source red teaming tooling",
    ],

    labs: [
      "Extract a system prompt from a deployed chat application",
      "Plant an indirect injection in a document a RAG pipeline will retrieve",
      "Abuse a tool-calling agent into an action outside its intended scope",
      "Find and exploit a weak authorisation boundary on an AI API",
      "Poison a retrieval corpus and measure the effect on answers",
    ],

    projects: [
      "Run a full red team assessment of a vulnerable AI application and report the findings",
      "Threat model an AI feature and propose proportionate controls",
      "Build a small test harness that checks an LLM endpoint against a set of known attack patterns",
    ],

    outcomes: [
      "Assess an AI application and explain how it fails, not just that it does",
      "Produce a reproducible red team write-up",
      "Judge which mitigations are real controls and which only look like one",
      "Threat model an AI feature at design time",
    ],

    pathways: ["AI Security Analyst", "AI Red Teaming Associate", "LLM Security Engineer", "AI Application Security Associate"],

    prerequisites: [
      "Working Python, enough to read and modify a script",
      "Basic web and API understanding, including HTTP and authentication",
      "No machine learning background assumed",
    ],

    audience: [
      "Security practitioners moving into AI security",
      "Developers building on language models who need to secure what they ship",
      "Students with a programming foundation seeking a specialised route",
    ],
  },
];

export const getProgramme = (slug) => programmes.find((p) => p.slug === slug);
