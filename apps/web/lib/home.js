/**
 * Homepage content, for every section AFTER the hero.
 *
 * The hero's copy stays in content.js and is not touched from here.
 *
 * Nothing in this file asserts a statistic, a testimonial, an existing
 * college or industry partnership, a placement rate or an employment
 * guarantee, because none of those are established.
 */

export const intro = {
  kicker: "Introduction",
  title: "Beyond Learning. Towards Real-World Cybersecurity.",
  body:
    "PolarSight is a cybersecurity-focused training and workforce-readiness initiative dedicated to developing practical security capabilities for the evolving digital world.",
  support:
    "We bridge the gap between academic knowledge and the work security roles actually involve: investigating what happened, judging what matters and being able to explain both.",
  cta: { label: "Discover PolarSight", href: "/about", newTab: true },
  image: {
    src: "/illustrations/operations-workspace.svg",
    alt: "A security operations workspace: a wall of monitoring displays above a row of analyst workstations.",
    width: 1200,
    height: 900,
  },
};

export const programmes = {
  kicker: "Our programmes",
  title: "Specialized Training for an Evolving Threat Landscape.",
  body:
    "Explore specialized cybersecurity programmes designed to build technical knowledge, practical capabilities and industry-relevant skills.",
  items: [
    {
      code: "TRK-01",
      name: "SOC Analyst",
      tag: "Security Operations",
      href: "/programmes/soc-analyst",
      body:
        "Develop the skills required to monitor security environments, investigate threats and respond to cybersecurity incidents.",
      areas: [
        "Security Monitoring",
        "SIEM Operations",
        "Threat Detection",
        "Incident Response",
        "Threat Intelligence",
      ],
      image: {
        src: "/illustrations/soc-operations.svg",
        alt: "A security operations centre dashboard showing an alert queue, detection volume over time and a severity breakdown.",
        width: 1200,
        height: 750,
      },
    },
    {
      code: "TRK-02",
      name: "AI Security Engineer",
      tag: "AI Security",
      href: "/programmes/ai-security-engineer",
      body:
        "Understand the security challenges of modern AI systems and learn to identify, assess and mitigate vulnerabilities in AI-powered applications.",
      areas: [
        "LLM Security",
        "Prompt Injection",
        "AI Red Teaming",
        "RAG Security",
        "AI Application Security",
      ],
      image: {
        src: "/illustrations/ai-security.svg",
        alt: "A layered neural network behind a trust boundary, with an injected prompt reaching the model.",
        width: 1200,
        height: 750,
      },
    },
  ],
};

export const approach = {
  kicker: "Our approach",
  title: "Knowledge Is the Beginning. Practical Skills Make the Difference.",
  body:
    "We believe effective cybersecurity education requires more than theoretical understanding. It requires experimentation, investigation, problem-solving and practical application.",
  image: {
    src: "/illustrations/practical-training.svg",
    alt: "A hands-on security lab: a terminal session alongside a network topology under investigation.",
    width: 1200,
    height: 900,
  },
  items: [
    {
      n: "01",
      title: "Fundamentals First",
      body:
        "Develop a strong understanding of networking, operating systems, security concepts and modern technologies.",
    },
    {
      n: "02",
      title: "Hands-on Learning",
      body:
        "Apply concepts through practical exercises, technical labs and security scenarios.",
    },
    {
      n: "03",
      title: "Industry Relevance",
      body:
        "Build capabilities aligned with evolving cybersecurity challenges and professional requirements.",
    },
  ],
};

export const outcomes = {
  kicker: "Learning outcomes",
  title: "Turn Technical Knowledge Into Practical Capabilities.",
  body:
    "These are the capabilities each programme is built to develop. They describe what a participant should be able to do by the end, not a hiring result.",
  cta: { label: "Explore Learning Outcomes", href: "/outcomes" },
  items: [
    {
      n: "01",
      title: "Technical Proficiency",
      body: "Understand security tools, systems and technologies.",
    },
    {
      n: "02",
      title: "Analytical Thinking",
      body: "Investigate security events and identify potential threats.",
    },
    {
      n: "03",
      title: "Practical Experience",
      body: "Apply knowledge through technical exercises and projects.",
    },
    {
      n: "04",
      title: "Career Readiness",
      body:
        "Develop the confidence to demonstrate technical skills in professional environments.",
    },
  ],
};

export const institutions = {
  kicker: "Institutional partnerships",
  title: "Bringing Industry-Oriented Cybersecurity Education to Campuses.",
  body:
    "PolarSight aims to collaborate with engineering colleges and educational institutions to deliver specialized cybersecurity training through practical, campus-based and online learning experiences.",
  points: [
    "Specialized cybersecurity programmes",
    "Practical technical training",
    "Campus-based delivery",
    "Online learning opportunities",
    "Industry-oriented skill development",
  ],
  cta: { label: "Discuss Institutional Partnerships", href: "/contact" },
  image: {
    src: "/illustrations/campus-lab.svg",
    alt: "A university technical laboratory: rows of workstations facing a large teaching display.",
    width: 1200,
    height: 900,
  },
};

export const team = {
  kicker: "Join our team",
  title: "Your Expertise Can Shape the Next Generation.",
  body:
    "We welcome cybersecurity professionals, technical trainers and industry experts who are passionate about sharing knowledge and developing future security talent.",
  roles: [
    "SOC Analyst Trainers",
    "AI Security Trainers",
    "Cloud Security Experts",
    "Cybersecurity Mentors",
    "Technical Content Developers",
  ],
  cta: { label: "Explore Career Opportunities", href: "/careers", newTab: true },
  image: {
    src: "/illustrations/mentoring.svg",
    alt: "A review session: an annotated report on a shared screen, with two participants joined.",
    width: 1200,
    height: 900,
  },
};

export const closing = {
  title: "Let's Build a More Secure Digital Future.",
  body:
    "Connect with PolarSight to explore cybersecurity training, institutional partnerships and professional collaboration opportunities.",
  primary: { label: "Contact PolarSight", href: "/contact" },
  secondary: { label: "Explore Programmes", href: "/programmes" },
};
