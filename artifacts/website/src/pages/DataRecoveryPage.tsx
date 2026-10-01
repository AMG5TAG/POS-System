import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, HardDrive, Usb, MemoryStick, FileSearch, Shield,
  FolderOpen, ArrowUpCircle, AlertTriangle,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const scenarios = [
  {
    icon: HardDrive,
    title: "Hard Drive Failure & Clicking Noises",
    body: "A hard drive making clicking, grinding or beeping noises is in physical distress. This usually indicates a mechanical failure of the read/write heads or motor. Continuing to power it on can destroy the platters and make recovery impossible. We immediately assess the drive in a clean environment and determine whether the data is recoverable through component repair, platter imaging or specialist lab referral. The sooner you bring it in, the better your chances.",
  },
  {
    icon: MemoryStick,
    title: "SSD Failure & Solid State Drive Recovery",
    body: "SSDs don't make noise when they fail — they simply stop working. Whether your MacBook SSD is no longer detected, your Windows laptop SSD has disappeared from the BIOS, or your external SSD won't mount, we have specialised tools to extract data from NAND chips, reseat controllers, and recover from firmware corruption. SSD recovery is technically complex but often successful with the right equipment.",
  },
  {
    icon: Usb,
    title: "USB Flash Drive & Memory Card Recovery",
    body: "USB sticks and SD cards are convenient but fragile. Bent connectors, snapped circuit boards, water damage and controller failure are all common. We repair broken connectors, replace damaged components, and read NAND memory directly when the controller has failed. Whether it's family photos on a broken USB or important documents on a corrupted SD card, we treat every recovery with the urgency and care it deserves.",
  },
  {
    icon: FileSearch,
    title: "Accidentally Deleted Files & Formatted Drives",
    body: "Deleted a folder by mistake? Emptied the recycle bin? Formatted the wrong drive? In most cases, the data is still there — just marked as free space. We use professional-grade recovery software to scan the raw sectors and reconstruct deleted files, photos, documents and entire folder structures. The key is to stop using the drive immediately; every new file written reduces the chance of recovery.",
  },
  {
    icon: Shield,
    title: "Ransomware & Encrypted Data Recovery",
    body: "Ransomware locks your files with encryption and demands payment for the key. Paying is never guaranteed to work. We assess the type of ransomware, check for known decryption tools, recover from backups if available, and in some cases can reconstruct data from shadow copies, previous versions or unencrypted remnants. We also help secure your system so it never happens again.",
  },
  {
    icon: ArrowUpCircle,
    title: "Data Transfer to New Devices",
    body: "Upgrading to a new computer? We transfer all your files, photos, documents, bookmarks, emails, contacts and software settings from your old machine to the new one — making the transition seamless. We handle Windows-to-Windows, Mac-to-Mac, and even cross-platform transfers (Windows to Mac or vice versa). Nothing gets lost, and your new computer feels instantly familiar.",
  },
];

const mediaTypes = [
  "Hard Disk Drives (HDD)",
  "Solid State Drives (SSD)",
  "USB Flash Drives",
  "SD Cards & MicroSD",
  "CF Cards & Memory Sticks",
  "External Hard Drives",
  "NAS & RAID Arrays",
  "MacBook Internal SSD",
  "Windows Laptop Drives",
  "Desktop PC Drives",
  "iPhone & iPad Backups",
  "Damaged or Broken Drives",
];

const faqs = [
  {
    q: "How much does data recovery cost?",
    a: "Data recovery pricing depends on the type of failure. Software-level recovery (deleted files, formatted drives, minor corruption) typically ranges from $150 to $400. Hardware-level recovery (clicking drives, broken connectors, controller failure) ranges from $300 to $800. Severe physical damage requiring clean-room work is quoted individually after assessment. We always provide a fixed quote before proceeding — and if we can't recover your data, you don't pay.",
  },
  {
    q: "Can you recover data from a completely dead hard drive?",
    a: "Often, yes. A 'dead' hard drive can mean many things — a failed PCB, damaged read/write heads, stuck spindle motor, or corrupted firmware. Many of these are repairable. Only if the platters themselves are physically scratched or the drive has been exposed to extreme heat or water for a prolonged period is recovery truly impossible. We assess every drive honestly and will tell you straight if the data is unrecoverable.",
  },
  {
    q: "How long does data recovery take?",
    a: "Software-level recoveries are often completed within 24 hours. Hardware repairs and component-level work typically take 2–5 business days. Complex cases or clean-room recoveries may take 1–2 weeks. We keep you informed at every stage and prioritise urgent cases. If time is critical, let us know when you drop it in.",
  },
  {
    q: "Is my data kept confidential?",
    a: "Absolutely. Data confidentiality is central to everything we do. We never browse, copy or access your recovered files beyond what's necessary to verify successful recovery. All recovered data is stored on encrypted internal drives during the process and securely wiped after delivery. We're happy to sign NDAs for business clients and handle sensitive medical, legal and financial data regularly.",
  },
  {
    q: "What should I do if my drive has failed?",
    a: "Stop using it immediately. Every attempt to power on a failing drive, run chkdsk, or install recovery software yourself can make things worse. Don't shake it, freeze it, or open it — these internet 'fixes' almost always destroy recoverable data. Bring it to us as soon as possible. The less it's been tampered with, the higher the recovery success rate.",
  },
  {
    q: "Do you offer data backup solutions?",
    a: "Yes — and we strongly recommend them. After recovery, we can set up automated local and cloud backups so you never face this situation again. We configure external drive backups, NAS systems, and cloud sync with Google Drive, OneDrive, Dropbox and iCloud. For businesses, we design comprehensive backup strategies with off-site replication. Prevention is always cheaper than recovery.",
  },
];

export default function DataRecoveryPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Data Recovery Central Coast | Hard Drive & SSD",
    description: "Hard drive, SSD, USB and RAID data recovery on the Central Coast. Workshop recovery on a no-recovery-no-fee basis. Clean-room quotes available.",
  });
  useStructuredData(
    serviceGraph({
      path: "/data-recovery",
      serviceType: "Data Recovery",
      name: "Data Recovery Central Coast & Lake Macquarie",
      description: "Hard drive, SSD, USB and RAID data recovery. Workshop recovery on a no-recovery-no-fee basis with clean-room quotes for physically damaged drives.",
      breadcrumbName: "Data Recovery",
      offers: ["Hard Drive Data Recovery", "SSD Data Recovery", "USB & Memory Card Recovery", "RAID & NAS Recovery", "Clean-Room Recovery Quotes"],
    }),
    "data-recovery",
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
              alt="Koastal Kollective Data Recovery Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Data Recovery · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Your Lost Data.<br />
                <em className="text-[#007b7d] not-italic">Our Mission.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Hard Drive Recovery · SSD Recovery · USB &amp; SD Card Recovery · Deleted File Rescue · Ransomware Recovery · Photo &amp; Document Recovery
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Professional data recovery services on the Central Coast and Lake Macquarie. We rescue files from failed hard drives, broken SSDs, corrupted USB sticks, accidentally deleted folders and ransomware-locked systems. If your data matters, we'll do everything possible to get it back.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#scenarios" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Recovery Scenarios We Handle
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
          src="/images/data-recovery-lab.webp"
          alt="Professional data recovery laboratory"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── SEO intro ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            Losing data is one of the most stressful experiences in modern life. Whether it's <strong>years of family photographs</strong>, <strong>critical business documents</strong>, <strong>financial records</strong> or <strong>irreplaceable personal files</strong>, the panic of a failed drive or accidental deletion is overwhelming. At Koastal Kollective in Mannering Park, we specialise in <strong>professional data recovery</strong> for the Central Coast and Lake Macquarie region — rescuing files from hard drives, SSDs, USB sticks, SD cards, phones and virtually every storage device you use.
          </p>
          <p>
            We recover data from <strong>failed hard drives with clicking noises</strong>, <strong>SSDs that won't mount</strong>, <strong>USB sticks with broken connectors</strong>, <strong>accidentally deleted folders</strong>, <strong>formatted drives</strong>, <strong>ransomware-encrypted files</strong>, and <strong>water-damaged devices</strong>. Every recovery starts with a free assessment — we diagnose the exact failure, estimate the chance of recovery, and provide a fixed quote before any work begins. If we can't recover your data, you don't pay.
          </p>
          <p>
            Our data recovery process is <strong>confidential, secure and professional</strong>. We never browse your files, we store recovered data on encrypted drives during the process, and we securely wipe everything after delivery. Whether you're a home user who lost holiday photos or a business that lost an entire customer database, we handle every case with the same urgency and discretion. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> or bring your drive to our workshop.
          </p>
        </div>
      </section>

      {/* ─── Media types banner ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            Every Storage Device. Every Failure Type.
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {mediaTypes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white font-medium text-sm px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7bb8bd]" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Recovered files image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/recovered-files.webp"
              alt="Recovered family photographs and documents on screen"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            Thousands of irreplaceable memories rescued every year.
          </p>
        </div>
      </section>

      {/* ─── Scenarios ─── */}
      <section id="scenarios" className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Recovery Scenarios</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Data Loss Situations We Recover From</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              These are the most common data loss scenarios we encounter — and in most cases, the data is recoverable.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {scenarios.map(({ icon: Icon, title, body }) => (
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

      {/* ─── Warning CTA ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <AlertTriangle className="h-12 w-12 text-[#7bb8bd] mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Stop Using the Drive. Every Second Counts.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            If your drive has failed, turned off immediately and don't attempt DIY fixes. Every power-on, scan or software run risks permanent data loss. Bring it to us while recovery is still possible.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Professional Data Recovery You Can Trust</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "No Recovery, No Fee", body: "If we can't recover your data, you don't pay. We're confident in our abilities and stand behind them with a genuine no-fix, no-fee guarantee." },
              { title: "Free Assessment", body: "We diagnose your drive's condition at no charge and provide an honest assessment of recovery probability before you commit to anything." },
              { title: "Complete Confidentiality", body: "Your data is your business. We never browse files, maintain strict confidentiality, encrypt all recovered data during processing, and securely wipe it after delivery." },
              { title: "All Storage Media", body: "HDDs, SSDs, USB drives, SD cards, NAS arrays, RAID configurations, phones, tablets — if it stores data, we can recover from it." },
              { title: "Local & Accountable", body: "We're Aaron and Larissa Gregory in Mannering Park — not a remote service or anonymous mail-in centre. You meet the person handling your data." },
              { title: "Backup Solutions", body: "After recovery, we set up automated backup systems so this never happens again. Prevention is always cheaper than recovery." },
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Data Recovery Questions</h2>
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
              Hard Drive Recovery on the Central Coast &amp; Lake Macquarie
            </h2>
            <p>
              Hard disk drives remain the most common storage medium — and the most prone to failure. A <strong>clicking hard drive</strong>, <strong>grinding noises</strong>, <strong>beeping sounds</strong> or a <strong>drive that isn't detected</strong> are all signs of mechanical failure. The read/write heads may have crashed into the platters, the motor may have seized, or the circuit board may have burned out. At Koastal Kollective, we perform initial assessment and component-level repair. For drives requiring clean-room work, we partner with specialist data recovery labs and coordinate the entire process for you. We handle <strong>Seagate, Western Digital, Toshiba, Samsung, HGST and every hard drive brand</strong>.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Photo &amp; Document Recovery for Home Users
            </h2>
            <p>
              The most emotionally valuable data we recover isn't business records — it's <strong>family photographs</strong>. Holiday albums, baby photos, wedding pictures, scans of old family portraits, and videos of moments that can never be recreated. When a hard drive fails or a USB stick breaks, these memories feel lost forever. We understand how precious they are and treat every photo recovery with the care it deserves. We recover photos from <strong>hard drives, SSDs, USB sticks, SD cards, phones, cameras and cloud storage accounts</strong>. If your photos are on a failing device, bring it to us immediately — we'll do everything possible to bring them back.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Business Data Recovery &amp; Disaster Recovery
            </h2>
            <p>
              For businesses, data loss isn't just inconvenient — it can be catastrophic. Lost customer databases, financial records, invoices, project files and email archives can cripple operations. We provide <strong>urgent business data recovery</strong> with priority turnaround, strict confidentiality agreements, and post-recovery backup strategy design. We also help businesses set up <strong>RAID arrays, NAS devices and cloud backup systems</strong> to prevent future disasters. If your business depends on its data, you need a recovery partner who understands the stakes.
            </p>
          </div>
        </div>
      </section>

            <MediaPromo />

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
