import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Building2, Wifi, Cloud, Shield, Server,
  Monitor, MailCheck, Database, Printer, Headphones,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const services = [
  {
    icon: Server,
    title: "Server Maintenance & Monitoring",
    body: "Your business server is the backbone of your operations. We perform regular health checks, firmware updates, disk monitoring, backup verification and performance optimisation. We monitor for early warning signs of failure and address issues before they cause downtime. Whether you run a physical server, a NAS, or a cloud-hosted VM, we keep it running smoothly.",
  },
  {
    icon: Wifi,
    title: "Office Network Design & Installation",
    body: "A reliable office network is essential for productivity. We design and install wired and wireless networks tailored to your workspace — including VLANs for department separation, secure guest Wi-Fi, managed switches, access points and ethernet cabling. We document everything so future changes are straightforward.",
  },
  {
    icon: Cloud,
    title: "Cloud Migration & Microsoft 365 Setup",
    body: "Moving your business to the cloud improves flexibility, security and collaboration. We migrate email to Microsoft 365 or Google Workspace, set up SharePoint and OneDrive for file sharing, configure Teams for communication, and ensure everything syncs across all devices. We also train your staff on the new tools.",
  },
  {
    icon: Shield,
    title: "Cyber Security & Compliance Audits",
    body: "Small businesses are increasingly targeted by cyber attacks. We perform comprehensive security audits covering firewalls, endpoint protection, password policies, two-factor authentication, email security and staff training. We also help with compliance requirements for industries with data protection obligations.",
  },
  {
    icon: Monitor,
    title: "Workstation Setup & Standardisation",
    body: "We configure new computers, laptops and monitors for your team with consistent settings, required software, security policies and network access. We also decommission old devices securely, wiping data and recycling hardware responsibly. Standardised setups reduce support calls and improve productivity.",
  },
  {
    icon: MailCheck,
    title: "Business Email & Communication Systems",
    body: "Email is critical to every business. We set up professional email with your domain, configure shared mailboxes and distribution lists, migrate existing emails, resolve sync issues, and integrate with calendar and contact systems. We also configure spam filtering and email archiving for compliance.",
  },
  {
    icon: Database,
    title: "Data Backup & Disaster Recovery Planning",
    body: "We design backup strategies that actually work — local NAS backups, cloud replication, off-site storage and automated testing. We document recovery procedures and perform test restores to verify everything works. When disaster strikes, you'll have a plan that gets you back online quickly.",
  },
  {
    icon: Printer,
    title: "Printer, Scanner & Peripheral Management",
    body: "Printers are often the most frustrating office technology. We install and configure network printers, set up scan-to-email and scan-to-folder, resolve driver conflicts, manage consumables ordering, and configure mobile printing. We also maintain your other peripherals: scanners, label printers, drawing tablets and displays.",
  },
];

const industries = [
  "Retail & Hospitality",
  "Medical & Dental Practices",
  "Trades & Construction",
  "Professional Services",
  "Real Estate & Property",
  "Education & Training",
  "Non-Profit Organisations",
  "Home-Based Businesses",
];

const faqs = [
  {
    q: "Do you offer ongoing IT support contracts?",
    a: "Yes. We offer flexible support arrangements to suit your business size and needs. Options include pay-as-you-go callouts, scheduled monthly maintenance visits, and ongoing retainer agreements with priority response. We'll recommend the best structure based on your team size, technology complexity and risk tolerance.",
  },
  {
    q: "How quickly can you respond to urgent IT issues?",
    a: "For businesses on a retainer or priority agreement, we offer same-day response for critical issues. For pay-as-you-go clients, we aim to respond within 24 hours for standard issues and same-day for genuine emergencies. We understand that when your systems are down, every minute costs money.",
  },
  {
    q: "Can you help with compliance and data protection?",
    a: "Yes. We help businesses understand and meet their data protection obligations under the Privacy Act and industry-specific regulations. This includes secure data storage, access controls, encryption, backup procedures, staff training and documentation. We don't provide legal advice but we implement the technical controls that compliance frameworks require.",
  },
  {
    q: "What's the difference between you and a big IT company?",
    a: "We're local, personal and accountable. You deal directly with the technicians working on your systems — not a call centre or account manager. We know your setup because we built it. We respond faster, charge fairly, and genuinely care about your business succeeding. Many of our business clients have been with us for years because the relationship works.",
  },
  {
    q: "Do you support remote and hybrid work setups?",
    a: "Absolutely. We configure VPNs, remote desktop access, cloud file sharing, Teams/Zoom setups and secure home office networks. We ensure your team can work from anywhere with the same security and productivity as being in the office. We also help with bring-your-own-device (BYOD) policies and mobile device management.",
  },
  {
    q: "Can you help us choose and buy new equipment?",
    a: "Yes. We provide impartial hardware recommendations based on your actual needs — not what's most profitable to sell. We help you avoid over-spec'd systems for simple tasks and under-powered machines for demanding work. We can source equipment at trade pricing and handle delivery, setup and warranty claims.",
  },
];

export default function BusinessItSupportPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Business IT Support Central Coast & Lake Macquarie",
    description: "Small-business IT support on the Central Coast & Lake Macquarie. On-site help, networks, backup, Office 365 and managed support — no contracts.",
  });
  useStructuredData(
    serviceGraph({
      path: "/business-it-support",
      serviceType: "Business IT Support",
      name: "Small Business IT Support Central Coast & Lake Macquarie",
      description: "On-site small-business IT support including server and network maintenance, backup, Office 365 and ongoing managed support — no lock-in contracts.",
      breadcrumbName: "Business IT Support",
      offers: ["On-Site Business IT Support", "Server & Network Maintenance", "Office 365 Setup & Support", "Backup & Disaster Recovery", "Managed IT Services"],
    }),
    "business-it-support",
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
              alt="Koastal Kollective Business IT Support Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Business IT Support · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Your Business's<br />
                <em className="text-[#007b7d] not-italic">Technology Partner.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Server Maintenance · Office Networks · Cloud Migration · Cyber Security · Workstation Setup · Business Email · Data Backup
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Reliable, affordable IT support for small and medium businesses across the Central Coast and Lake Macquarie. We keep your technology running so you can focus on running your business.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#services" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Business Services
                </a>
                <a href="tel:+61493145179" className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Call 0493 145 179
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Hero image ─── */}
      <section>
        <img
          src="/images/business-it.webp"
          alt="Business IT support professional in office"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── SEO intro ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            Small and medium businesses on the Central Coast and Lake Macquarie need reliable technology to compete — but hiring a full-time IT professional is expensive and often unnecessary. Koastal Kollective provides <strong>flexible, affordable business IT support</strong> that gives you expert-level technology management without the overhead of an in-house department. We become your outsourced IT team, handling everything from <strong>server maintenance and network security</strong> to <strong>cloud migration and staff training</strong>.
          </p>
          <p>
            We work with businesses across every industry — retail shops in Gosford, medical practices in Wyong, trades businesses in Lake Macquarie, professional services in Terrigal, real estate offices in Erina, and home-based businesses everywhere in between. Our services scale with your needs: whether you have five computers or fifty, one office or multiple locations, we design an IT support plan that fits your budget and grows with your business.
          </p>
          <p>
            Every business engagement starts with a <strong>free technology assessment</strong>. We review your current setup, identify risks and inefficiencies, and recommend practical improvements. There's no obligation, no sales pressure — just honest advice from technicians who understand what small businesses actually need. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> to arrange your assessment.
          </p>
        </div>
      </section>

      {/* ─── Industries banner ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            Trusted by Businesses Across Every Industry
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {industries.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white font-medium text-sm px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7bb8bd]" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Office network image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/office-network.webp"
              alt="Professional office network setup with server rack"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            Professional network infrastructure designed for reliability and growth.
          </p>
        </div>
      </section>

      {/* ─── Services ─── */}
      <section id="services" className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Business Services</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">IT Services for Small &amp; Medium Businesses</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              Everything your business needs to stay productive, secure and competitive — without the cost of a full-time IT department.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {services.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Building2 className="h-12 w-12 text-[#7bb8bd] mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Technology Should Help Your Business Grow. Not Hold It Back.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            Outdated systems, security risks and constant IT problems drain time, money and energy. We fix the root causes and build technology infrastructure that supports your business goals.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="tel:+61493145179" className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-8 py-3 rounded-full text-sm transition-colors">
              Call 0493 145 179
            </a>
            <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ─── Why us ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Choose Us</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Business IT Support Without the Enterprise Price</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Local & Responsive", body: "We're based in Mannering Park, not a call centre in another city. We visit your office, understand your business, and respond quickly when you need us." },
              { title: "Flexible Arrangements", body: "Pay-as-you-go, scheduled maintenance, or ongoing retainer — we structure support around your budget and needs, not a one-size-fits-all contract." },
              { title: "No Jargon", body: "We explain technology in plain English. You'll understand what we're doing, why it matters, and how to avoid problems in the future." },
              { title: "Proactive Not Reactive", body: "We don't just wait for things to break. We monitor, maintain and optimise your systems to prevent problems before they impact your business." },
              { title: "Genuine Partnership", body: "We succeed when your business succeeds. We're not looking to sell you equipment you don't need — we're looking to build a long-term relationship." },
              { title: "Full Range Coverage", body: "From workstations to servers, networks to cloud, printers to security — one team handles everything. No more juggling multiple vendors." },
            ].map(({ title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Business IT Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-2 text-base">{q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SEO long-form ─── */}
      <section className="py-14">
        <div className="max-w-5xl mx-auto px-4 space-y-10 text-gray-700 leading-relaxed text-base md:text-lg">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Microsoft 365 &amp; Google Workspace for Central Coast Businesses
            </h2>
            <p>
              Moving your business email, files and collaboration tools to the cloud is one of the smartest investments a small business can make. <strong>Microsoft 365</strong> and <strong>Google Workspace</strong> give your team professional email with your domain, shared calendars, cloud storage, video conferencing, document collaboration and mobile access — all for a predictable monthly cost per user. We handle the entire migration: setting up your tenant, migrating existing emails and files, configuring security policies, setting up shared resources, and training your staff. We also integrate these platforms with your existing software and workflows so the transition is seamless, not disruptive.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Cyber Security for Small Businesses on the Central Coast
            </h2>
            <p>
              Many small business owners believe cyber attacks only target large corporations. The reality is the opposite — <strong>small businesses are the primary target</strong> because they often lack the security measures of larger organisations. A single ransomware attack, phishing scam or data breach can destroy a small business. We implement practical, affordable security measures that fit your risk profile: firewalls with intrusion detection, endpoint protection on every device, email filtering to catch phishing attempts, two-factor authentication on critical accounts, regular security audits, and staff training on recognising threats. We don't sell fear — we sell sensible protection that keeps your business safe without getting in the way of your work.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Data Backup &amp; Disaster Recovery for Lake Macquarie Businesses
            </h2>
            <p>
              Every business needs a backup strategy that actually works — not just a USB drive plugged into one computer. We design <strong>comprehensive backup and disaster recovery plans</strong> that protect your data against every threat: hardware failure, cyber attack, accidental deletion, fire, flood and theft. This typically involves a local NAS for fast recovery, cloud replication for off-site protection, and automated testing to verify everything works. We document recovery procedures so anyone on your team can restore critical systems. And we perform test restores regularly — because a backup you can't restore isn't a backup at all.
            </p>
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
            Our many years of <em className="text-[#7bb8bd] not-italic">experience</em> are the foundation of our success.
          </h2>
          <div className="flex flex-wrap gap-10">
            {[
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M12 14h2M8 17h2M12 17h2"/></svg>),
                value: `${yearsExperience}`, label: "Years Experience",
              },
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>),
                value: "500+", label: "Customers Helped",
              },
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/></svg>),
                value: "1000+", label: "Computers Repaired",
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

      {/* ─── Team ─── */}
      <section id="team" className="bg-[#e8f4f5] py-14 border-b border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">Koastal Kollective Team</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
            Introducing <em className="text-[#007b7d] not-italic">Your Expert</em> IT Technicians
          </h2>
          <div className="flex flex-wrap justify-center gap-16">
            {[
              { name: "Aaron Gregory", image: "/images/aaron-gregory.webp" },
              { name: "Larissa Gregory", image: "/images/larissa-gregory.webp" },
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
                    1/64 Vales Road, Mannering Park, NSW, 2259
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
                  { day: "Monday", hours: "10am to 2:00pm" },
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

      {/* ─── Visit Us ─── */}
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
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Introducing Your Expert IT Technicians</h2>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">on The Central Coast and Lake Macquarie</h3>
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
