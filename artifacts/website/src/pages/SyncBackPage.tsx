import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, RefreshCw, HardDrive, Cloud, Clock3, Shield, Settings, FolderSync, BarChart2,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";

const advantages = [
  {
    icon: RefreshCw,
    title: "Backup, Sync & Mirror — All in One",
    body: "SyncBack handles every type of data protection task: scheduled backups to external drives, real-time folder synchronisation between devices, and exact mirror copies for disaster recovery. One application replaces a patchwork of separate tools, keeping your workflow simple and consistent.",
  },
  {
    icon: HardDrive,
    title: "Back Up to Any Destination",
    body: "SyncBack can back up to USB drives, external hard drives, NAS devices, network shares, FTP/SFTP servers, Amazon S3, Backblaze B2, Microsoft Azure, and more. Whether you prefer local backups, cloud storage, or both, SyncBack connects to it — giving you true flexibility over where your data is stored.",
  },
  {
    icon: Cloud,
    title: "Cloud Backup & Sync Support",
    body: "SyncBackPro and SyncBackSE support direct cloud integration with services including Amazon S3, Backblaze B2, Microsoft Azure Blob Storage, and any OpenS3-compatible provider. You get the reliability of cloud backup without being locked into a single cloud subscription service.",
  },
  {
    icon: Clock3,
    title: "Flexible Scheduling & Automation",
    body: "Set SyncBack to run automatically on any schedule — hourly, daily, weekly, at login, on USB insertion, or when a specific network becomes available. You can also chain profiles together so a full system backup kicks off automatically after your daily sync completes.",
  },
  {
    icon: Shield,
    title: "Versioned Backups & Ransomware Recovery",
    body: "SyncBack keeps multiple versions of your backed-up files, so you can roll back to a specific point in time if a file gets corrupted, accidentally deleted, or encrypted by ransomware. Version control turns your backup into a proper time-machine for your data.",
  },
  {
    icon: FolderSync,
    title: "Intelligent File Comparison",
    body: "SyncBack compares files using size, date, CRC checksums, or byte-for-byte content — ensuring only genuinely changed files are copied. This makes incremental backups fast and efficient, and eliminates wasted transfers of unchanged files regardless of their modification date.",
  },
  {
    icon: Settings,
    title: "Advanced Filtering & Profile Control",
    body: "Exclude file types, folders, files above a certain size, or temporary files with granular filter rules. Create separate profiles for different backup tasks — one for documents, one for photos, one for a work drive — each with its own schedule, destination, and retention policy.",
  },
  {
    icon: BarChart2,
    title: "Email & Log Reporting",
    body: "SyncBack sends you an email report after every backup run so you always know whether it succeeded or encountered any issues. Detailed log files record every file copied, skipped, or failed — giving you a complete audit trail of your backup history.",
  },
];

const comparisonRows = [
  { feature: "Backup to External Drive & NAS", syncback: true, robocopy: true, acronis: true },
  { feature: "Cloud Backup (S3, Azure, B2)", syncback: true, robocopy: false, acronis: true },
  { feature: "True Folder Synchronisation", syncback: true, robocopy: true, acronis: false },
  { feature: "Versioned File History", syncback: true, robocopy: false, acronis: true },
  { feature: "Flexible Scheduling & Triggers", syncback: true, robocopy: false, acronis: true },
  { feature: "Granular File Filtering", syncback: true, robocopy: true, acronis: false },
  { feature: "Email Reporting & Logs", syncback: true, robocopy: false, acronis: true },
  { feature: "No Ongoing Subscription Required", syncback: true, robocopy: true, acronis: false },
  { feature: "Simple GUI — No Command Line", syncback: true, robocopy: false, acronis: true },
  { feature: "Central Coast Local Support", syncback: true, robocopy: false, acronis: false },
];

const whyKoastal = [
  "Authorised SyncBack reseller — genuine licences for SyncBackFree, SE, and Pro",
  "We install and configure your first backup profile in-store so it runs automatically from day one",
  "Expert advice on the right SyncBack edition and destination for your specific needs",
  "We can set up local, network, and cloud backup destinations for comprehensive 3-2-1 protection",
  "Competitive local pricing — same or better than buying online, with hands-on setup included",
  "Bundle with data recovery, computer repair, or NAS setup services for a complete solution",
  "Ongoing local support if you have questions about scheduling, errors, or expanding your backup strategy",
];

const faqs = [
  {
    q: "What is SyncBack and which edition do I need?",
    a: "SyncBack by 2BrightSparks is a professional backup and synchronisation application for Windows. SyncBackFree is ideal for simple local backups. SyncBackSE adds FTP, email reporting, versioned backups, and more. SyncBackPro adds cloud storage support, open files backup, and advanced scripting. We'll help you pick the right version during your visit.",
  },
  {
    q: "Can SyncBack back up files that are open and in use?",
    a: "Yes — SyncBackPro and SyncBackSE use Microsoft's Volume Shadow Copy Service (VSS) to back up open and locked files, including Outlook PST files, databases, and QuickBooks files. This is critical for businesses that need to back up while staff are actively working.",
  },
  {
    q: "How is SyncBack different from Windows Backup?",
    a: "Windows Backup is basic and limited in destination, scheduling, and control. SyncBack offers vastly more flexibility — any destination, any schedule, version history, cloud support, email alerts, and granular filtering. It's used by IT professionals and businesses who need reliable, configurable backups that they can actually verify.",
  },
  {
    q: "What is the 3-2-1 backup strategy and can SyncBack help?",
    a: "The 3-2-1 strategy means keeping 3 copies of your data, on 2 different media types, with 1 copy off-site. SyncBack supports this perfectly: back up to a local external drive (copy 1), sync to a NAS on your network (copy 2), and send an additional backup to cloud storage like Backblaze B2 (copy 3, off-site). We can set this entire workflow up for you.",
  },
  {
    q: "Does SyncBack work on Windows 11?",
    a: "Yes. SyncBack is fully compatible with Windows 10 and Windows 11. It is updated regularly by 2BrightSparks and we always supply the latest version to ensure compatibility with the current operating system and security patches.",
  },
  {
    q: "Will you set it up for me in-store?",
    a: "Absolutely. When you purchase SyncBack from Koastal Kollective, we install it, create your backup profiles, configure the schedule, verify the first backup run completes successfully, and show you how to check the logs. You leave the store knowing your data is protected.",
  },
];

export default function SyncBackPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "SyncBack Backup Software | Koastal Kollective",
    description: "SyncBack backup software through Koastal Kollective. Licences, setup and local Central Coast support — never lose your files or photos again.",
  });

  useEffect(() => {
    if (!reviewsRef.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.async = true;
    script.defer = true;
    reviewsRef.current.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ─── Hero ─── */}
      <section className="bg-white pt-10 pb-6 text-center border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center mb-6">
            <img src="/images/logo.png" alt="Koastal Kollective" className="h-44 w-auto" />
          </div>
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">SyncBack · Backup &amp; Synchronisation</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Never Lose Your Data <span className="text-[#007b7d]">Again.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
            SyncBack is the professional Windows backup and sync tool trusted by millions. Buy it from Koastal Kollective on the Central Coast for genuine licences, expert configuration, and ongoing local support.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="tel:+61493145179"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call 0493 145 179
            </a>
            <a
              href="https://wa.me/61493145179"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ─── Hero banner ─── */}
      <section className="bg-gradient-to-br from-[#e8f4f5] to-[#c8e0e2] py-10 flex items-center justify-center border-b border-[#c8e0e2]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-lg mb-6 ring-4 ring-[#007b7d]/20">
            <svg viewBox="0 0 60 60" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="60" height="60" rx="14" fill="#007b7d"/>
              <path d="M20 22H40M20 30H36M20 38H32" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="44" cy="38" r="8" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="2"/>
              <path d="M41 38L43.5 40.5L47 37" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="syncback-banner-text text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Professional backup trusted by millions worldwide
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-xl mx-auto">
            Developed by 2BrightSparks and continuously refined since 2003, SyncBack is the gold-standard Windows backup tool for homes, small businesses, and IT professionals.
          </p>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why SyncBack</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5 text-center">
            Your Data Is Irreplaceable. <span className="text-[#007b7d]">Protect It.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            Hard drives fail without warning. Ransomware encrypts your files in minutes. Accidental deletions happen every day. If your photos, documents, business files, or personal records aren't backed up — automatically, reliably, and verifiably — they are one bad day away from being gone forever.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto">
            SyncBack by 2BrightSparks gives you complete control over your backup strategy. It's the most flexible and configurable backup solution available for Windows — whether you need simple daily backups to a USB drive, real-time folder sync between computers, or a full 3-2-1 cloud and local backup strategy for your business.
          </p>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            Every Backup Feature You <span className="text-[#007b7d]">Actually Need</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {advantages.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d]/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-[#007b7d]" />
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why buy from Koastal Kollective ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why Buy Local</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Why Buy SyncBack from <span className="text-[#007b7d]">Koastal Kollective?</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {whyKoastal.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <p className="text-gray-700 text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Comparison table ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Head-to-Head Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            SyncBack vs Robocopy vs Acronis True Image
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            SyncBack combines the power of enterprise backup tools with a straightforward interface — no command line required, no bloated subscription fees.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 text-sm font-bold">Feature</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">SyncBack</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Robocopy</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Acronis</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, syncback, robocopy, acronis }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 text-sm text-gray-700 border-b border-gray-100">{feature}</td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {syncback ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {robocopy ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {acronis ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-100 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

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
    </div>
  );
}
