import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Wifi, Router, Globe, Monitor, Smartphone,
  Signal, Network, Shield, Zap, HelpCircle,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const problems = [
  {
    icon: Wifi,
    title: "Slow Internet & NBN Speed Issues",
    body: "If your NBN connection feels slower than advertised, the problem could be your router, Wi-Fi congestion, outdated cabling, or an ISP issue. We run professional speed tests, check your actual speeds against your plan, identify bottlenecks, and optimise your entire network setup. Often the fix is simpler than switching providers.",
  },
  {
    icon: Router,
    title: "Wi-Fi Dead Zones & Poor Coverage",
    body: "Struggling with Wi-Fi that drops out in certain rooms? Thick walls, distance from the router, and interference from neighbouring networks all cause dead zones. We install mesh Wi-Fi systems, wireless access points, and Wi-Fi extenders that provide seamless whole-home coverage — so every room gets strong, reliable signal.",
  },
  {
    icon: Monitor,
    title: "NBN Setup & Connection Troubles",
    body: "Just moved house and need NBN configured? Connection keeps dropping? Can't get online at all? We handle NBN setup from start to finish — connecting your NBN box, configuring your router, setting up Wi-Fi, and testing every device. We also troubleshoot FTTP, FTTN, FTTC and HFC connection issues.",
  },
  {
    icon: Signal,
    title: "Devices Won't Connect to Wi-Fi",
    body: "Phones, tablets, smart TVs and laptops that refuse to connect — or connect but have no internet — are frustratingly common. We diagnose whether the issue is the device, the router, the network settings or ISP-related, and fix it properly. We also help with forgotten Wi-Fi passwords and network security configuration.",
  },
  {
    icon: Network,
    title: "Home & Office Network Setup",
    body: "Need a reliable network for your home office, gaming setup, or small business? We design and install wired and wireless networks with proper security, guest access, parental controls and device prioritisation. For businesses, we configure VLANs, secure guest networks, and managed access points.",
  },
  {
    icon: Shield,
    title: "Router Security & Wi-Fi Password Issues",
    body: "An unsecured Wi-Fi network is an open door for neighbours, hackers and scammers. We secure your router with strong passwords, WPA3 encryption, disable WPS, hide your SSID if desired, and set up guest networks so visitors can't access your main devices or files.",
  },
  {
    icon: Globe,
    title: "Ethernet Cabling & Wired Connections",
    body: "Wi-Fi is convenient, but ethernet is faster, more stable and more secure. We run ethernet cables through walls, ceilings and under floors to connect desktops, smart TVs, gaming consoles and security systems with reliable wired connections. Perfect for gamers, streamers and anyone who needs consistent speed.",
  },
  {
    icon: Zap,
    title: "Smart Home & IoT Device Setup",
    body: "Smart lights, security cameras, doorbells, thermostats and voice assistants all need a solid network foundation. We configure your network to handle multiple IoT devices reliably, set up VLANs to isolate smart devices from your main network, and ensure everything works together seamlessly.",
  },
];

const nbnTypes = [
  "FTTP (Fibre to the Premises)",
  "FTTN (Fibre to the Node)",
  "FTTC (Fibre to the Curb)",
  "HFC (Hybrid Fibre-Coaxial)",
  "Fixed Wireless",
  "Sky Muster Satellite",
];

const faqs = [
  {
    q: "Why is my NBN so slow even though I pay for a fast plan?",
    a: "Advertised NBN speeds are 'up to' figures — your actual speed depends on your technology type, router quality, Wi-Fi signal strength, number of connected devices and what everyone is doing online. We diagnose the real bottleneck: it might be an old router that can't handle the speed, Wi-Fi interference, too many devices, or even an ISP issue. Most slow NBN problems are fixable without changing providers.",
  },
  {
    q: "Can you set up mesh Wi-Fi for my whole house?",
    a: "Absolutely. Mesh Wi-Fi systems are one of our most popular services. We assess your home's layout, recommend the right system (TP-Link Deco, ASUS AiMesh, Netgear Orbi, Eero or Google Nest), install the nodes in optimal positions, and configure everything including guest networks, parental controls and device prioritisation. You'll get seamless coverage from the garage to the back deck.",
  },
  {
    q: "Do you help with NBN connection issues for new homes?",
    a: "Yes. If you've just moved into a new home or apartment and the NBN isn't working, we can help. We check the NBN connection box, configure your router with the correct settings, test all outlets, and liaise with your ISP if the issue is on their end. We make sure everything is working before we leave.",
  },
  {
    q: "How do I know if my Wi-Fi is secure?",
    a: "Many people use default router passwords, weak encryption, or have WPS enabled — all security risks. We perform a full Wi-Fi security audit: checking encryption type, password strength, firmware version, connected devices, and open ports. We then secure everything properly and show you how to monitor your network going forward.",
  },
  {
    q: "Can you run ethernet cables through my walls?",
    a: "Yes, we offer professional ethernet cabling installation for homes and offices. We run Cat6 or Cat6a cables through walls, ceilings, under floors and along skirting boards to give you wired connections where you need them. This is ideal for home offices, gaming setups, smart TVs, security systems and anywhere Wi-Fi isn't reliable enough.",
  },
  {
    q: "What's the difference between a Wi-Fi extender and mesh Wi-Fi?",
    a: "A Wi-Fi extender rebroadcasts your existing signal, which halves the bandwidth and creates a separate network name. Mesh Wi-Fi uses multiple nodes that work together as one seamless network with a single name, automatically handing your device to the strongest node as you move around. Mesh is faster, more reliable and much better for modern homes with many devices.",
  },
];

export default function NbnWifiPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "NBN & Wi-Fi Setup Central Coast | Koastal Kollective",
    description: "NBN, Wi-Fi and home network setup across the Central Coast & Lake Macquarie. Mesh installs, dead-spot fixes and ISP troubleshooting, done locally.",
  });
  useStructuredData(
    serviceGraph({
      path: "/nbn-wifi-setup",
      serviceType: "NBN, Wi-Fi & Network Setup",
      name: "NBN, Wi-Fi & Network Setup Central Coast & Lake Macquarie",
      description: "On-site NBN, Wi-Fi and home network setup. Mesh installs, dead-spot fixes, router configuration and ISP troubleshooting from a local team.",
      breadcrumbName: "NBN & Wi-Fi Setup",
      offers: ["NBN Connection Setup", "Mesh Wi-Fi Installation", "Wi-Fi Dead-Spot Fixes", "Router Configuration", "ISP Troubleshooting"],
    }),
    "nbn-wifi-setup",
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
              alt="Koastal Kollective NBN Wi-Fi Setup Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                NBN, Wi-Fi &amp; Internet Setup · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Fast, Reliable Internet<br />
                <em className="text-[#007b7d] not-italic">In Every Room.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                NBN Setup · Wi-Fi Troubleshooting · Mesh Networks · Dead Zone Fixes · Ethernet Cabling · Router Security · Smart Home Networks
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Professional NBN setup, Wi-Fi troubleshooting and network configuration for homes and businesses across the Central Coast and Lake Macquarie. We fix slow speeds, dead zones, connection drops and security issues — so your internet works properly everywhere.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#problems" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Common Internet Problems
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
          src="/images/wifi-setup.webp"
          alt="Modern mesh Wi-Fi router system in home"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── SEO intro ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            If your <strong>NBN connection is slow</strong>, your <strong>Wi-Fi keeps dropping out</strong>, you have <strong>dead zones</strong> where the internet doesn't reach, or you're moving into a new home and need everything set up from scratch — Koastal Kollective is your local network expert on the Central Coast and Lake Macquarie. We provide <strong>professional NBN setup, Wi-Fi troubleshooting, mesh network installation, ethernet cabling and router security configuration</strong> for homes, apartments and small businesses.
          </p>
          <p>
            We fix the real problems behind poor internet — not just the symptoms. A slow connection is rarely about your ISP plan; more often it's an <strong>outdated router, poor Wi-Fi placement, interference from neighbours, too many devices, or incorrect NBN configuration</strong>. We diagnose the actual cause, fix it properly, and leave you with a network that works reliably in every room of your home.
          </p>
          <p>
            We also install <strong>mesh Wi-Fi systems</strong> for whole-home coverage, run <strong>ethernet cabling</strong> for gamers and home offices, secure your <strong>router against hacking</strong>, and configure <strong>smart home networks</strong> that handle dozens of IoT devices without slowing down. Whether you live in a small unit in Gosford or a large home in Lake Macquarie, we design a network that matches your space, your devices and your usage. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> or book an on-site visit.
          </p>
        </div>
      </section>

      {/* ─── NBN types banner ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            All NBN Connection Types. All Fixed.
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {nbnTypes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white font-medium text-sm px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7bb8bd]" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NBN install image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/nbn-install.webp"
              alt="Technician installing NBN connection at home"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            On-site NBN setup and Wi-Fi configuration across the Central Coast and Lake Macquarie.
          </p>
        </div>
      </section>

      {/* ─── Problems ─── */}
      <section id="problems" className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Fix</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Internet &amp; Network Problems We Solve</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              These are the most common connectivity issues we encounter — and every one of them has a fix.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {problems.map(({ icon: Icon, title, body }) => (
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
          <Signal className="h-12 w-12 text-[#7bb8bd] mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Your Internet Should Work in Every Room.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            Dead zones, slow speeds and constant dropouts aren't normal — they're fixable. We diagnose, optimise and upgrade your network so your internet works properly everywhere you need it.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Your Local Network &amp; Internet Experts</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "No Call-Out Fee for Local Suburbs", body: "We visit your home or office across the Central Coast and Lake Macquarie with no call-out charge for local areas. You only pay for the work we do." },
              { title: "We Fix the Real Problem", body: "We don't just reboot your router and leave. We diagnose the root cause — whether it's your router, cabling, ISP settings, or interference — and fix it properly." },
              { title: "Mesh Wi-Fi Specialists", body: "We design and install mesh networks that actually work. Proper placement, correct configuration, and optimised channels — not just plugging in nodes randomly." },
              { title: "On-Site & In-Store", body: "We can troubleshoot at your premises for connection-specific issues, or you can bring your router and devices to our workshop for configuration and testing." },
              { title: "Router Security Included", body: "Every network setup includes proper security configuration. Strong passwords, WPA3 encryption, guest networks and firmware updates — all included." },
              { title: "All NBN Types Supported", body: "FTTP, FTTN, FTTC, HFC, Fixed Wireless or Satellite — we understand every NBN technology and how to get the best performance from each." },
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Internet &amp; Network Questions</h2>
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
              Mesh Wi-Fi Installation on the Central Coast &amp; Lake Macquarie
            </h2>
            <p>
              A single router in one corner of your house simply can't deliver strong Wi-Fi to every room — especially in modern Australian homes with thick walls, multiple levels and open-plan living areas. <strong>Mesh Wi-Fi systems</strong> solve this by using multiple nodes that work together as one seamless network. We install and configure mesh systems from <strong>TP-Link Deco, ASUS AiMesh, Netgear Orbi, Eero and Google Nest</strong> — assessing your home's layout, identifying dead zones, placing nodes for optimal coverage, and configuring everything including guest networks, parental controls and device prioritisation. The result is fast, reliable Wi-Fi in every room, on every device, without ever having to manually switch networks.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              NBN Setup &amp; Troubleshooting for New Homes
            </h2>
            <p>
              Moving into a new property and need the NBN connected? We handle the entire process: checking your NBN connection box, configuring your router with the correct settings for your ISP, testing all available outlets, connecting every device, and verifying speeds match your plan. We also troubleshoot common NBN problems including <strong>connection dropouts, slow speeds on FTTN/FTTC, HFC signal issues and Fixed Wireless reception problems</strong>. If the issue is with your ISP or NBN Co infrastructure, we'll identify it clearly and guide you through the escalation process. For new homes and apartment buildings, we ensure your internal cabling and network setup is ready for reliable internet from day one.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Ethernet Cabling for Home Offices &amp; Gamers
            </h2>
            <p>
              Wi-Fi has improved enormously, but ethernet is still faster, more stable, lower latency and more secure. For <strong>home offices</strong> where video calls can't drop out, <strong>gamers</strong> who need consistent low ping, and <strong>smart home systems</strong> that stream 4K video reliably, wired connections are essential. We run professional <strong>Cat6 and Cat6a ethernet cabling</strong> through walls, ceilings and under floors to connect your most important devices directly to your router. We also install network switches, patch panels and structured cabling for larger homes and small offices. Whether you need one extra port in the study or a full home network overhaul, we'll design and install a solution that works.
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
