/** The six people on Team Hanos, as shown on the landing page. */
export interface TeamMember {
  first: string;
  last: string;
  role: string;
  bio: string;
  linkedin: string;
  email: string;
  /** file name in /public/landing/team */
  photo: string;
  width: number;
  height: number;
  /** height of the cut-out as a share of its circle, sized so the corners stay inside the circle */
  fit: number;
}

export const TEAM: readonly TeamMember[] = [
  {
    first: "Afomiya",
    last: "G. Mulu",
    role: "Astronomy Researcher",
    bio: "Coordinates cross-disciplinary mission research and ensures every observation remains scientifically accurate and rigorously aligned with astronomical standards.",
    linkedin: "https://www.linkedin.com/in/afomiya-gashu-b823a428a",
    email: "afomiya.g.mulu@gmail.com",
    photo: "afomiya.webp",
    width: 938,
    height: 1100,
    fit: 73,
  },
  {
    first: "Biniam",
    last: "B. Bittala",
    role: "Story telling and Scientific Analysis",
    bio: "Translates complex SPHEREx infrared observations into compelling scientific narratives, combining rigorous multi-epoch data analysis with clear, accessible storytelling.",
    linkedin: "https://www.linkedin.com/in/biniam-birhanu-bittala-3a45b1377",
    email: "biniam.b.bittala@gmail.com",
    photo: "biniam.webp",
    width: 907,
    height: 1100,
    fit: 74,
  },
  {
    first: "Melat",
    last: "G. Daniel",
    role: "Visual Design & UI/UX",
    bio: "Architects the visual and interaction design system, implementing the intuitive interface to visualize and navigate all 102 SPHEREx spectral bands.",
    linkedin: "https://www.linkedin.com/in/melat-gebrehiwot-daniel-27a129343",
    email: "melatghdan@gmail.com",
    photo: "melat.webp",
    width: 853,
    height: 1100,
    fit: 76,
  },
  {
    first: "Barok",
    last: "M. Lakew",
    role: "UI/UX & Frontend Engineer",
    bio: "Crafts the interactive client experience and engineers the responsive PWA interface for fluid sky navigation across every screen size.",
    linkedin: "https://www.linkedin.com/in/barokm",
    email: "barok.m.lakew@gmail.com",
    photo: "barok.webp",
    width: 882,
    height: 1100,
    fit: 75,
  },
  {
    first: "Biruk",
    last: "D. Tegene",
    role: "Sonification & Audio Dev",
    bio: "Pioneers astronomical data sonification, translating complex celestial light curves and spectra into rich, accessible soundscapes.",
    linkedin: "https://www.linkedin.com/in/biruk-daniel-tegene/",
    email: "biruk.d.tegene@gmail.com",
    photo: "biruk.webp",
    width: 1100,
    height: 996,
    fit: 64,
  },
  {
    first: "Leul",
    last: "A. Kassahun",
    role: "Full Stack Dev & AI Engineer",
    bio: "Bridges full-stack system architecture with intelligent machine learning workflows, connecting all application components into an intelligent unified platform.",
    linkedin: "https://www.linkedin.com/in/leul-a-kassahun-bb432b427",
    email: "leul.a.kassahun@gmail.com",
    photo: "leul.webp",
    width: 970,
    height: 1100,
    fit: 72,
  },
];
