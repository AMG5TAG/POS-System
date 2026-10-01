import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Trash2, Zap, Shield, Search, BarChart2, RefreshCw, Lock,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";

const advantages = [
  {
    icon: Trash2,
    title: "Deep System Junk Removal",
    body: "CleanMyMac X scans your Mac for gigabytes of hidden junk — cache files, language packs, log files, mail attachments, and leftover application data. A single scan routinely frees up 10–50 GB of storage on most Macs, making it the fastest way to reclaim disk space without touching important files.",
  },
  {
    icon: Zap,
    title: "Speed Up a Slow Mac",
    body: "The Performance module identifies apps that drain your CPU and RAM, manages login items and launch agents, and lets you flush memory with one click. Whether your MacBook is sluggish after an update or just feels slow over time, CleanMyMac X gets it running like new again.",
  },
  {
    icon: Shield,
    title: "Malware & Threat Removal",
    body: "CleanMyMac X includes a real-time malware monitor that scans for adware, spyware, miners, ransomware, and other Mac-specific threats. It uses an up-to-date database maintained by MacPaw and alerts you instantly if anything suspicious is detected on your system.",
  },
  {
    icon: Search,
    title: "Complete App Uninstaller",
    body: "The built-in Uninstaller finds and removes every trace of apps you no longer use — including hidden support files, preferences, and cached data that the standard Trash misses. You can also reset apps to factory state without reinstalling, great for troubleshooting.",
  },
  {
    icon: BarChart2,
    title: "Space Lens & Large Files",
    body: "The interactive Space Lens lets you visualise exactly what is eating your disk space in a colour-coded map. Large File Finder surfaces files over a set size that you may have forgotten about — perfect for locating old videos, disk images, and downloads taking up valuable space.",
  },
  {
    icon: RefreshCw,
    title: "Updater & Privacy Cleanup",
    body: "CleanMyMac X scans all your installed apps and flags those with available updates, keeping your software current with one click. The Privacy module clears browsing history, cookies, recent documents, and Wi-Fi networks to keep your personal data private.",
  },
  {
    icon: Lock,
    title: "Shredder & Secure Deletion",
    body: "Need to permanently destroy sensitive documents before selling your Mac? CleanMyMac X's Shredder overwrites files so they cannot be recovered by any data-recovery tool. Essential before trading in, gifting, or disposing of any Mac.",
  },
  {
    icon: ExternalLink,
    title: "Menu Bar Health Monitor",
    body: "The CleanMyMac X menu bar widget gives you a real-time readout of CPU load, RAM usage, disk space, battery health, and network speed at a glance — without needing to open Activity Monitor. You always know what's happening with your Mac.",
  },
];

const comparisonRows = [
  { feature: "System Junk Removal", cleanMyMac: true, ccleaner: true, macCleaner: false },
  { feature: "Real-Time Malware Monitor", cleanMyMac: true, ccleaner: false, macCleaner: false },
  { feature: "Complete App Uninstaller", cleanMyMac: true, ccleaner: false, macCleaner: true },
  { feature: "Space Lens Visualiser", cleanMyMac: true, ccleaner: false, macCleaner: false },
  { feature: "App Updater", cleanMyMac: true, ccleaner: false, macCleaner: false },
  { feature: "Privacy Cleanup", cleanMyMac: true, ccleaner: true, macCleaner: true },
  { feature: "Secure File Shredder", cleanMyMac: true, ccleaner: false, macCleaner: false },
  { feature: "Menu Bar Health Monitor", cleanMyMac: true, ccleaner: false, macCleaner: false },
  { feature: "One-Click Performance Boost", cleanMyMac: true, ccleaner: true, macCleaner: false },
  { feature: "Central Coast Local Support", cleanMyMac: true, ccleaner: false, macCleaner: false },
];

const whyKoastal = [
  "Authorised MacPaw reseller — genuine CleanMyMac X licences, no pirated keys",
  "We set it up on your Mac and run the first full clean while you wait",
  "Competitive local pricing — often comparable to direct from MacPaw's website",
  "Expert advice on which plan suits you — individual, family, or business",
  "Ongoing support if you have questions about settings, updates, or renewals",
  "Bundle with MacBook repair or servicing for extra convenience",
  "Available for home users, creative professionals, and small business Mac fleets",
];

const faqs = [
  {
    q: "What is CleanMyMac X and do I really need it?",
    a: "CleanMyMac X is the leading Mac cleaning and optimisation app made by MacPaw. If your Mac is running slowly, your storage is nearly full, or you want to keep it healthy long-term, CleanMyMac X is worth its weight in gold. It automates tasks that would otherwise take hours to do manually.",
  },
  {
    q: "Is CleanMyMac X safe to use?",
    a: "Yes. CleanMyMac X is notarised by Apple, available on the Mac App Store, and trusted by over 29 million users worldwide. It only removes files that are safe to delete and always shows you exactly what it's about to remove before acting. You're always in control.",
  },
  {
    q: "How much space can CleanMyMac X free up?",
    a: "Results vary depending on how long since the Mac was last cleaned, but most users recover between 5 GB and 60 GB on a first scan. Macs used for video editing, photography, or software development often have even more to reclaim.",
  },
  {
    q: "Does CleanMyMac X work on the latest macOS?",
    a: "Yes. MacPaw updates CleanMyMac X to support every new macOS release, including Sonoma and Sequoia. We always supply the latest version and can confirm compatibility with your specific Mac model and macOS version.",
  },
  {
    q: "Can I use one licence on multiple Macs?",
    a: "CleanMyMac X licences are available for 1, 2, or 5 Macs. There is also a family plan. If you have multiple Macs at home or in your business, we can help you choose the most cost-effective option.",
  },
  {
    q: "Will you install and run the first clean for me?",
    a: "Absolutely. When you purchase CleanMyMac X from Koastal Kollective, we install it, activate your licence, and run the first complete system scan together with you — so you immediately see the results and understand how to use it going forward.",
  },
];

export default function MacPawPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "MacPaw CleanMyMac & Setapp | Koastal Kollective",
    description: "MacPaw CleanMyMac and Setapp through Koastal Kollective. Genuine licences, installation help and local Mac support on the Central Coast.",
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
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">MacPaw · CleanMyMac X</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Give Your Mac a <span className="text-[#007b7d]">Fresh Start.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
            CleanMyMac X cleans, speeds up, and protects your Mac — all in one beautifully simple app. Buy it from Koastal Kollective on the Central Coast for genuine licences, expert setup, and ongoing local support.
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

      {/* ─── Hero banner image ─── */}
      <section className="bg-gradient-to-br from-[#e8f4f5] to-[#c8e0e2] py-10 flex items-center justify-center border-b border-[#c8e0e2]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-lg mb-6 ring-4 ring-[#007b7d]/20">
            <svg viewBox="0 0 60 60" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="60" height="60" rx="14" fill="#007b7d"/>
              <path d="M30 12C20.06 12 12 20.06 12 30C12 39.94 20.06 48 30 48C39.94 48 48 39.94 48 30C48 20.06 39.94 12 30 12Z" fill="white" fillOpacity="0.15"/>
              <path d="M22 30.5L27.5 36L38 25" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="macpaw-banner-text text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            The world's favourite Mac cleaning app
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-xl mx-auto">
            Over 29 million people trust CleanMyMac X to keep their Macs running fast, clean, and safe. Notarised by Apple. Updated for every macOS release.
          </p>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why CleanMyMac X</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5 text-center">
            One App. A Faster, Cleaner, Safer <span className="text-[#007b7d]">Mac.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            Over time, every Mac accumulates gigabytes of invisible junk — old caches, duplicate files, leftovers from deleted apps, log files, and language packs you'll never use. This hidden clutter slows your Mac down, fills your storage, and can even mask security threats.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto">
            CleanMyMac X by MacPaw solves all of this in one beautifully designed app. It is the only tool Apple-notarised Mac cleaning software that combines a deep junk cleaner, real-time malware scanner, complete app uninstaller, performance booster, and privacy cleaner — all in a single subscription.
          </p>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            Everything Your Mac Needs, <span className="text-[#007b7d]">Built In</span>
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
            Why Buy CleanMyMac X from <span className="text-[#007b7d]">Koastal Kollective?</span>
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
            CleanMyMac X vs CCleaner vs Mac Cleaner Pro
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            CleanMyMac X is the most complete Mac optimisation suite available — with features competitors simply don't offer.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 text-sm font-bold">Feature</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">CleanMyMac X</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">CCleaner</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Mac Cleaner Pro</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, cleanMyMac, ccleaner, macCleaner }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 text-sm text-gray-700 border-b border-gray-100">{feature}</td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {cleanMyMac ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {ccleaner ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {macCleaner ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
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
