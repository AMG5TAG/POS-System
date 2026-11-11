import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Cpu, Zap, Shield, Star, ThumbsUp, Settings2,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const buildTypes = [
  {
    image: "/images/custom-gaming-pc.webp",
    badge: "Most Popular",
    badgeColour: "bg-[#007b7d]",
    title: "Custom Gaming PCs",
    tagline: "Dominate every game at maximum settings.",
    description:
      "Built for performance, our custom gaming rigs are specced to handle the latest AAA titles at 1080p, 1440p or 4K — whatever your display demands. We match the right CPU, GPU, RAM and cooling solution to your budget and game library so you get the absolute best performance for every dollar spent.",
    features: [
      "Latest AMD Ryzen & Intel Core processors",
      "NVIDIA RTX & AMD RX graphics cards",
      "High-speed DDR5 RAM & NVMe SSD storage",
      "Optimised airflow & premium RGB cooling",
      "Game-ready Windows installation included",
      "Benchmarked & stress-tested before delivery",
    ],
    startingFrom: "Starting from $899",
  },
  {
    image: "/images/custom-business-pc.webp",
    badge: "Reliable & Fast",
    badgeColour: "bg-[#005f61]",
    title: "Business Workstations",
    tagline: "Power through your workload without compromise.",
    description:
      "A slow computer costs your business time and money. Our custom business workstations are built for reliability, multitasking and longevity — perfect for accounting software, design applications, video conferencing and large file handling. We configure each machine for your specific software environment so it's ready to work the moment it arrives.",
    features: [
      "Workstation-grade CPUs with high core counts",
      "ECC or high-capacity DDR5 RAM options",
      "Dual-drive setup: fast OS SSD + bulk storage",
      "Quiet, cool operation for all-day productivity",
      "Windows 11 Pro with your software pre-installed",
      "24-month parts warranty on all components",
    ],
    startingFrom: "Starting from $699",
  },
  {
    image: "/images/custom-home-pc.webp",
    badge: "Great Value",
    badgeColour: "bg-[#7bb8bd] text-gray-900",
    title: "Home Computers",
    tagline: "Everything your family needs, nothing you don't.",
    description:
      "A custom home PC gives you far better value than any off-the-shelf box from a department store. We build compact, quiet and energy-efficient systems tailored to how your household actually uses a computer — web browsing, streaming, schoolwork, light photo editing and video calls. No bloatware, no unnecessary extras, just a clean fast machine.",
    features: [
      "Energy-efficient processors for everyday tasks",
      "Plenty of RAM for smooth multitasking",
      "Fast SSD — boots in seconds, not minutes",
      "Compact mid-tower or small-form-factor builds",
      "Windows 11 Home, clean install, no bloatware",
      "Kid-friendly setup & parental control options",
    ],
    startingFrom: "Starting from $499",
  },
];

const whyChoose = [
  {
    icon: Cpu,
    title: "Hand-Picked Components",
    body: "We only use quality, reputable parts from brands like ASUS, MSI, Corsair, Samsung and Seagate. Every component is selected for reliability, not just price.",
  },
  {
    icon: Zap,
    title: "Optimised From Day One",
    body: "Your PC arrives with Windows properly configured, drivers updated, temperatures verified and performance benchmarked — ready to use straight out of the box.",
  },
  {
    icon: Shield,
    title: "Built-In Warranty",
    body: "All builds carry a minimum 24-month labour warranty plus the manufacturer warranty on each component. Business builds come with extended 24-month parts cover.",
  },
  {
    icon: Star,
    title: "Local Expert Advice",
    body: "Not sure what you need? Our technicians will sit down with you, understand how you use your computer and spec a build that fits your workflow and budget — no upselling.",
  },
  {
    icon: ThumbsUp,
    title: "No-Fix No-Fee Guarantee",
    body: "If for any reason we can't deliver the build you're happy with, you don't pay. We stand behind every machine we make with our honest service guarantee.",
  },
  {
    icon: Settings2,
    title: "Upgradeable by Design",
    body: "Unlike pre-built PCs, our custom builds use motherboards and cases with room to grow. Upgrading RAM, storage or GPU later is fast, easy and affordable.",
  },
];

const faqs = [
  {
    q: "How long does it take to build a custom PC?",
    a: "Most builds are completed within 3–5 business days from the time we confirm your component selection. Faster turnarounds are available for urgent builds — just ask.",
  },
  {
    q: "Can I supply my own parts?",
    a: "Absolutely. If you've already purchased components you're happy with, bring them in and we'll assemble, cable-manage and configure the system for you.",
  },
  {
    q: "Do you transfer data from my old computer?",
    a: "Yes. We can migrate your files, documents, photos and even some installed software from your old machine to the new one as part of your build package.",
  },
  {
    q: "What if something goes wrong after I take it home?",
    a: "Bring it back to us. All our builds carry a 24-month labour warranty and we'll diagnose and fix any issues at no charge within the warranty period.",
  },
  {
    q: "Can you build a PC within a specific budget?",
    a: "Yes — just tell us your maximum budget and what you'll be using the computer for and we'll find the best possible combination of parts to hit that target.",
  },
  {
    q: "Do you offer payment plans?",
    a: "Yes — we accept Afterpay, Zip and Klarna so you can spread the cost of your build over time with no interest. Contact us to discuss which option suits you best.",
  },
];

const guarantees = [
  "Free Diagnostics",
  "No-Fix No-Fee Guarantee",
  "Zero Call-Out Fees",
  "10% Pension Discount",
];

export default function CustomBuiltComputersPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Custom Built PCs Central Coast | Gaming & Home",
    description: "Custom gaming, workstation and home PCs built locally on the Central Coast. Hand-picked parts, full warranty, proper Windows setup included.",
  });
  useStructuredData(
    serviceGraph({
      path: "/custom-built-computers",
      serviceType: "Custom Computer Building",
      name: "Custom Built Computers Central Coast",
      description: "Custom gaming, workstation and home PCs assembled locally. Hand-picked parts, full warranty and proper Windows setup before you take it home.",
      breadcrumbName: "Custom Built Computers",
      offers: ["Custom Gaming PC Builds", "Workstation PC Builds", "Home & Office PC Builds", "PC Upgrades", "Build Consultation"],
    }),
    "custom-built-computers",
  );

  useEffect(() => {
    const container = reviewsRef.current;
    if (!container) return;
    const existingScript = container.querySelector('script[src*="cdn.trustindex.io"]');
    if (existingScript) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.defer = true;
    script.async = true;
    container.appendChild(script);
  }, []);

  return (
    <div className="bg-white text-gray-900">

      {/* ─── Hero ─── */}
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective Custom Built Computers"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Custom Built Computers · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Your Perfect Computer,<br />
                <em className="text-[#007b7d] not-italic">Built Just for You.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Stop settling for off-the-shelf. Koastal Kollective builds custom gaming PCs, business workstations and home computers tailored to exactly how you use them — for a price that beats anything in a department store.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="#builds"
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  See Our Builds
                </a>
                <a
                  href="#contact"
                  className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  Get a Free Quote
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social proof strip ─── */}
      <section className="bg-[#e8f4f5] py-5 border-b border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-8 text-center">
            {[
              { value: `${yearsExperience}`, label: "Years Experience" },
              { value: "500+", label: "Happy Customers" },
              { value: "1000+", label: "Computers Built & Repaired" },
              { value: "5★", label: "Google Reviews" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl md:text-3xl font-bold text-[#007b7d]">{value}</p>
                <p className="text-xs text-gray-600 font-semibold mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Intro Copy ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-8 text-base md:text-lg text-gray-700 leading-relaxed text-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Why Buy Custom When You Can Just Buy a Box?
            </h2>
            <p>
              Most retail computers are packed with compromises — underpowered CPUs paired with too little RAM, slow mechanical hard drives passed off as "storage", and operating systems riddled with bloatware. A custom build from Koastal Kollective gives you every dollar of your budget working for you. No wasted spend, no weak links, no junk software eating your resources.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Built by Locals, for Locals
            </h2>
            <p>
              Aaron G. and Larissa G. have been building, repairing and upgrading computers on the Central Coast since 2011. Every machine we build is assembled by hand right here in Mannering Park, stress-tested before it leaves the shop, and backed by our no-fix no-fee guarantee. When you need support after the sale, you're calling a local — not a call centre.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              A Build for Every Budget and Every User
            </h2>
            <p>
              Whether you're a hardcore gamer chasing triple-digit frame rates, a small business owner who needs a rock-solid workstation, or a parent wanting a reliable family computer for the kids — we have a build for you. Tell us what you need it for and your budget and we'll handle the rest. Call{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a>{" "}
              or drop into our Mannering Park store for a free, no-pressure consultation.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Build Types ─── */}
      <section id="builds" className="bg-gray-50 py-14 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Our Custom Builds</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Choose Your Build Type</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">Every machine is configured to your exact needs. Prices shown are starting guides — contact us for a tailored quote.</p>
          </div>

          <div className="space-y-16">
            {buildTypes.map((build, i) => (
              <div
                key={build.title}
                className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} gap-8 items-center bg-white rounded-2xl shadow-md overflow-hidden`}
              >
                {/* Image */}
                <div className="md:w-1/2 w-full flex-shrink-0">
                  <img
                    src={build.image}
                    alt={build.title}
                    className="w-full h-72 md:h-96 object-cover"
                  />
                </div>
                {/* Content */}
                <div className="md:w-1/2 px-6 pb-8 md:py-8 md:px-8 space-y-4">
                  <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full text-white ${build.badgeColour}`}>
                    {build.badge}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{build.title}</h3>
                  <p className="text-[#007b7d] font-semibold text-base">{build.tagline}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{build.description}</p>
                  <ul className="space-y-1.5">
                    {build.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-[#007b7d] flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-lg font-bold text-[#007b7d]">{build.startingFrom}</p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href="#contact"
                      className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Get a Quote
                    </a>
                    <a
                      href="tel:+61493145179"
                      className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Call Us
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Choose Us ─── */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Koastal Kollective</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">The Koastal Kollective Difference</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              We're not a faceless online retailer. We're your local computer experts — and we stand behind every build we make.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyChoose.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Guarantees ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Our Promise to You</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {guarantees.map((g) => (
              <div key={g} className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 text-[#7bb8bd] flex-shrink-0" />
                <span className="font-bold text-white text-sm">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-2 text-base">{q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#e8f4f5] py-12 border-b border-[#c8e0e2]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Ready to Build Your Dream Computer?
          </h2>
          <p className="text-gray-600 mb-6 text-base">
            Call us, send a WhatsApp message or drop into our Mannering Park store. We'll spec the perfect build for your needs and budget — no obligation, no pressure.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="tel:+61493145179"
              className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors"
            >
              Call 0493 145 179
            </a>
            <a
              href="https://wa.me/61493145179"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors"
            >
              WhatsApp Us
            </a>
            <a
              href="#contact"
              className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-8 py-3 rounded-full text-sm transition-colors"
            >
              See Contact Info
            </a>
          </div>
        </div>
      </section>

            <MediaPromo />

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

      {/* ─── About Us ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#006a6c] overflow-hidden relative">
        <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rotate-45 -translate-x-12 -translate-y-12" />
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rotate-45 translate-x-8 -translate-y-8" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rotate-45 translate-x-12 translate-y-12" />
        <div className="max-w-5xl mx-auto px-4 relative">
          <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3">About Us</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 max-w-xl leading-tight">
            Our many years of <em className="text-[#7bb8bd] not-italic">experience</em> are the
            foundation of our success.
          </h2>
          <div className="flex flex-wrap gap-10">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                    <path d="M8 14h2M12 14h2M8 17h2M12 17h2"/>
                  </svg>
                ),
                value: `${yearsExperience}`,
                label: "Years Experience",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    <path d="M18 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "500+",
                label: "Customers Helped",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="2" y="4" width="20" height="14" rx="2"/>
                    <path d="M8 20h8M12 18v2"/>
                    <path d="M9 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "1000+",
                label: "Computers Repaired",
              },
            ].map(({ icon, value, label }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="text-[#7bb8bd]">{icon}</div>
                <div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-sm text-white/70">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Koastal Kollective Team ─── */}
      <section id="team" className="bg-[#e8f4f5] py-14 border-b border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">Koastal Kollective Team</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
            Introducing <em className="text-[#007b7d] not-italic">Your Expert</em> IT Technicians
          </h2>
          <div className="flex flex-wrap justify-center gap-16">
            {[
              { name: "Aaron G.", image: "/images/aaron-gregory.webp" },
              { name: "Larissa G.", image: "/images/larissa-gregory.webp" },
            ].map(({ name, image }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="w-40 h-40 rounded-full overflow-hidden ring-4 ring-[#007b7d] ring-offset-2">
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-base">{name}</p>
                  <p className="text-sm text-gray-500">IT Technician</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3">Testimonials</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our real reviews from clients</h2>
          <blockquote className="text-lg md:text-xl italic text-gray-700 max-w-3xl mx-auto leading-relaxed">
            <p>
              &ldquo;We are committed to delivering the highest level of{" "}
              <a href="/computer-services" className="text-[#007b7d] hover:underline font-semibold not-italic">service</a>{" "}
              for our clients on the{" "}
              <a href="/computer-repairs/central-coast" className="text-[#007b7d] hover:underline font-semibold not-italic">Central Coast</a>{" "}
              and{" "}
              <a href="/computer-repairs/lake-macquarie" className="text-[#007b7d] hover:underline font-semibold not-italic">Lake Macquarie</a>.&rdquo;
            </p>
            <footer className="mt-2 text-base font-bold not-italic text-gray-900">
              – Aaron and the Koastal Kollective Team
            </footer>
          </blockquote>
        </div>
        <div className="mt-6 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="bg-[#007b7d] py-8 border-b border-[#006a6c]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <p className="text-[#7bb8bd] font-bold tracking-[0.18em] text-xs uppercase mb-2">Contact Us</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white">Koastal Kollective</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Visit:</p>
                  <a href="https://maps.app.goo.gl/V6MedKW2n1fCybob7" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    Shop 1/64 Vales Road, Mannering Park, NSW, 2259
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Email:</p>
                  <a href="mailto:sales@koastal.com.au" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    sales@koastal.com.au
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Call:</p>
                  <a href="tel:+61493145179" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    0493 145 179
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">WhatsApp Message:</p>
                  <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    Start a Conversation
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  <ExternalLink className="h-4 w-4 text-[#7bb8bd]" />
                </div>
                <div>
                  <p className="font-bold text-white/80 mb-1.5">Scan to &lsquo;Add To Contacts&rsquo;:</p>
                  <a href="https://hover.cards/0b70cf8e" target="_blank" rel="noopener noreferrer">
                    <img src="/images/vcard-aaron.webp" alt="vcard-aaron QR Code" className="w-28 h-28 rounded" />
                  </a>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-start gap-3 mb-4">
                <Clock className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <h3 className="font-bold text-white text-lg">Operating Hours</h3>
              </div>
              <div className="space-y-2 text-sm ml-8">
                {[
                  { day: "Monday", hours: "10am to 5pm" },
                  { day: "Tuesday", hours: "10am to 5pm" },
                  { day: "Wednesday", hours: "10am to 5pm" },
                  { day: "Thursday", hours: "10am to 5pm" },
                  { day: "Friday", hours: "10am to 5pm" },
                  { day: "Saturday", hours: "Closed" },
                  { day: "Sunday", hours: "Closed" },
                  { day: "Public Holidays", hours: "Closed" },
                ].map(({ day, hours }) => (
                  <div key={day} className="flex justify-between max-w-xs">
                    <span className="text-white/70">{day}:</span>
                    <span className={`font-bold ${hours === "Closed" ? "text-white/50" : "text-white"}`}>{hours}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Visit Us / Fully Stocked ─── */}
      <section className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Visit Us</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Fully Stocked Retail Store and Repair Centre</h2>
        </div>
      </section>

      {/* ─── Map ─── */}
      <section className="border-b border-gray-100">
        <iframe
          title="Koastal Kollective Location"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3315.2!2d151.5!3d-33.15!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b7344c8e5cfffff%3A0x6fba3a4a44f14b7b!2s1%2F64%20Vales%20Rd%2C%20Mannering%20Park%20NSW%202259!5e0!3m2!1sen!2sau!4v1700000000000!5m2!1sen!2sau"
          width="100%"
          height="400"
          style={{ border: 0, display: "block" }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </section>

      {/* ─── Service Areas ─── */}
      <section id="service-areas" className="bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
              Introducing Your Expert IT Technicians
            </h2>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">
              on The Central Coast and Lake Macquarie
            </h3>
            <p className="text-[#007b7d] text-sm mt-2 font-semibold">CLICK A SUBURB TO LEARN MORE</p>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-6">
            {Object.entries(suburbs).map(([letter, names]) => (
              <div key={letter} className="break-inside-avoid mb-4">
                <h4 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1 mb-1.5">{letter}</h4>
                <ul className="space-y-0.5">
                  {names.map((name) => (
                    <li key={name}>
                      <Link href={suburbPath(name)} className="text-sm text-[#007b7d] hover:text-[#005f61] hover:underline font-semibold transition-colors">
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <SiteFooter />

      {/* ─── WhatsApp Float Button ─── */}
      <a
        href="https://wa.me/61493145179"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 whatsapp-float flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-2.5 rounded-full shadow-lg transition-colors"
        aria-label="WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span className="text-sm font-bold">Need Help?</span>
      </a>
    </div>
  );
}
