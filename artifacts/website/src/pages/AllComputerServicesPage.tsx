import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Monitor, Wifi, Printer, HardDrive, Shield, Zap,
  Cpu, Database, Cloud, Settings, Wrench, Package, Headphones,
  FileSearch, ArrowUpCircle, Globe, Tv, FolderOpen, Unlock,
} from "lucide-react";
import { suburbs, suburbPath, isSuburbPage } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { pageGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const inStoreServices = [
  {
    icon: Monitor,
    title: "Computer Repairs & Diagnostics",
    body: "From power-on failures and blue screens to system crashes and random freezes, we diagnose and repair all computer problems. We work on desktops, all-in-ones, towers, and every major laptop brand. Every repair starts with a free diagnostic so you know exactly what's wrong before anything is fixed. Our Mannering Park workshop is fully equipped to handle both simple fixes and complex motherboard-level repairs. Whether your PC won't boot, keeps crashing, or simply runs too slow to use, bring it in — we'll get to the bottom of it.",
  },
  {
    icon: Shield,
    title: "Virus, Malware & Spyware Removal",
    body: "If your computer is running slow, showing pop-ups, redirecting your browser, or behaving strangely, it may be infected. We thoroughly scan, identify and remove all viruses, malware, spyware, ransomware, trojans and rootkits — then install proper protection so it doesn't happen again. We don't just run a quick scan; we manually inspect running processes, browser extensions, startup items and registry entries to ensure every trace is gone. We also advise on safe browsing habits and install a trusted antivirus at no extra charge.",
  },
  {
    icon: Cpu,
    title: "Laptop Screen Repairs & Replacements",
    body: "A cracked, black, flickering or unresponsive laptop screen doesn't mean you need a new laptop. We replace screens for all major brands — HP, Dell, Lenovo, Acer, ASUS, Toshiba, MacBook, Microsoft Surface and more. We stock common screen sizes and resolutions, and can order rare panels with fast turnaround. Every screen replacement comes with a 24-month warranty on parts and labour. We also offer mail-in repairs Australia wide for customers outside the Central Coast. No-fix, no-fee applies to all screen work.",
  },
  {
    icon: HardDrive,
    title: "Data Recovery & Backup Solutions",
    body: "Accidentally deleted important files? Hard drive making clicking noises? USB stick no longer recognised? We recover data from failed hard drives, SSDs, USB flash drives, memory cards and external storage devices. If the drive is physically damaged, we have partnerships with specialist data recovery labs for advanced platter-level recovery. We also set up automated backup systems — local NAS drives, cloud backups to Google Drive, OneDrive or Dropbox — so you never have to face this stress again. Data recovery is handled with the utmost confidentiality.",
  },
  {
    icon: ArrowUpCircle,
    title: "Hardware Upgrades & Performance Tuning",
    body: "Before you buy a new computer, consider upgrading what you have. A RAM upgrade, SSD swap or graphics card replacement can transform an ageing machine into something that feels brand new — often for less than a quarter of the price of replacement. We also offer full performance tuning services: removing bloatware, disabling unnecessary startup programs, cleaning the Windows registry, optimising disk space and updating all drivers. If your computer is slow but otherwise healthy, a tune-up is almost always the smartest investment.",
  },
  {
    icon: Settings,
    title: "Windows, macOS & Linux Installation",
    body: "We install, repair, upgrade and reinstall all major operating systems. Whether you need a clean Windows 11 installation without manufacturer bloatware, a macOS reinstall on an unbootable MacBook, or a Linux setup for tech enthusiasts, we handle it all. We also repair corrupted boot partitions, fix failed Windows updates, resolve driver conflicts and perform factory restores when needed. Every fresh OS installation is fully updated, secured with antivirus, and configured with your preferred settings before you take it home.",
  },
  {
    icon: Unlock,
    title: "Password Recovery & Account Access",
    body: "Locked out of your computer, email or online accounts? We help recover access to Windows local and Microsoft accounts, Apple IDs, email accounts and more. We never bypass security illegally — all password recovery is done with proof of ownership and legitimate methods. We also help set up password managers like Bitwarden or 1Password so you never have to worry about forgetting a password again. If you've been hacked and lost control of an account, we can guide you through the recovery process with the provider.",
  },
  {
    icon: Printer,
    title: "Printer, Scanner & Peripheral Setup",
    body: "Struggling to get your printer working over Wi-Fi? Scanner not talking to your computer? We configure and troubleshoot all printer brands — HP, Canon, Epson, Brother, Lexmark and more. We set up wireless printing from multiple devices, configure scan-to-email and scan-to-folder, resolve driver conflicts, fix paper jams and error codes, and ensure your printer works reliably with both Windows and Mac. We also set up other peripherals: webcams, microphones, drawing tablets, external monitors and docking stations.",
  },
  {
    icon: Database,
    title: "Email, Calendar & Microsoft 365 Setup",
    body: "Email problems are frustrating and costly. We set up new email accounts, migrate old emails between providers, configure Outlook, Thunderbird and Apple Mail, fix sync issues, resolve send/receive failures and set up email on phones and tablets. For small businesses, we configure Microsoft 365 or Google Workspace with shared mailboxes, calendars, contacts and cloud storage. We also back up your email archive so you never lose years of important correspondence.",
  },
  {
    icon: Globe,
    title: "NBN, Wi-Fi & Network Setup",
    body: "We fix internet and network issues across the Central Coast and Lake Macquarie. Slow NBN speeds, dead Wi-Fi zones, devices that won't connect, and routers that need replacing — we handle it all. We set up mesh Wi-Fi systems for whole-home coverage, configure business-grade networks with VLANs and guest access, run ethernet cabling for reliable wired connections, and secure your network against unauthorised access. Whether you need a simple home Wi-Fi boost or a full office network overhaul, we're the local experts.",
  },
  {
    icon: Tv,
    title: "Smart TV, Streaming & Home Tech",
    body: "Modern home technology can be confusing. We set up Smart TVs, streaming devices, soundbars, home theatre systems, security cameras, video doorbells and smart home hubs. We configure Netflix, Stan, Disney Plus, Binge, Kayo and every Australian streaming service. We troubleshoot HDMI issues, programme universal remotes, connect your phone to the TV for casting, and integrate your devices into a single, easy-to-use system. If your home tech isn't working the way you want, we'll make it simple again.",
  },
  {
    icon: FolderOpen,
    title: "Software Installation & Troubleshooting",
    body: "We install, configure and troubleshoot virtually any software you use. From Adobe Creative Suite and Microsoft Office to accounting packages like MYOB, QuickBooks and Xero, we make sure everything works together smoothly. We fix programs that crash on startup, resolve software conflicts, update outdated applications, remove stubborn bloatware and configure VPNs for secure remote work. If you need specialised software for your business or hobby, we'll research, install and test it for you.",
  },
];

const onSiteServices = [
  {
    icon: Headphones,
    title: "On-Site Home Computer Repairs",
    body: "Can't bring your computer to us? We'll come to you. Our on-site home repair service covers the entire Central Coast and Lake Macquarie region. We fix slow computers, internet dropouts, printer problems, email issues, network troubles and more — all in the comfort of your own home. We explain everything in plain English, clean up after ourselves, and never make you feel silly for asking questions. Same-day and next-day appointments are usually available.",
  },
  {
    icon: Wrench,
    title: "On-Site Business IT Support",
    body: "Small businesses on the Central Coast rely on us for fast, affordable IT support without the cost of a full-time technician. We set up office networks, maintain servers, configure business email, manage backups, install security software, troubleshoot software issues and keep your technology running smoothly. We offer flexible support arrangements — one-off callouts, scheduled maintenance visits, or ongoing retainer agreements. When your business depends on technology working, you need someone who responds quickly and fixes things properly.",
  },
  {
    icon: Cloud,
    title: "Cloud Setup, Migration & Sync",
    body: "Moving your files, emails and workflows to the cloud makes working from anywhere possible. We set up Google Drive, OneDrive, Dropbox, iCloud and business-grade cloud platforms like Google Workspace and Microsoft 365. We migrate your existing files and emails into the cloud, configure syncing across all your devices, set up shared folders for family or team collaboration, and train you on how to use everything. If you're worried about losing files in the cloud, we configure local backups alongside cloud storage for complete peace of mind.",
  },
  {
    icon: Zap,
    title: "Emergency Same-Day Repairs",
    body: "Some problems can't wait. If your computer has failed before a deadline, your business system is down, or you need a repair completed urgently for any reason, our same-day and priority repair service is here to help. We prioritise urgent jobs, work after hours when necessary, and communicate clearly about realistic timelines. For critical business failures, we offer temporary loan equipment so you can keep working while your main machine is repaired. Call 0493 145 179 and tell us it's urgent — we'll do everything we can.",
  },
  {
    icon: Package,
    title: "New Computer Setup & Data Transfer",
    body: "Bought a new computer? Don't spend hours figuring it out yourself. We set up new desktops and laptops properly — creating your user account, installing essential software, transferring all your files, photos, documents and emails from the old machine, connecting your printer and peripherals, configuring Wi-Fi and email, and making sure everything works exactly as you expect. When we hand it back, your new computer feels instantly familiar — and your old one is securely wiped if you're disposing of it.",
  },
  {
    icon: FileSearch,
    title: "Cyber Security & Privacy Audits",
    body: "Concerned about your online security? We perform comprehensive security audits on home and business computers, checking for vulnerabilities, unauthorised access, weak passwords, outdated software and unsafe browsing habits. We install and configure firewalls, set up two-factor authentication on critical accounts, remove unnecessary remote access tools, secure your router, and educate you on recognising scams and phishing attempts. In an age of increasing cyber threats, a security check is one of the smartest things you can do.",
  },
];

const whyChoose = [
  {
    title: "Free Diagnostics",
    body: "Every repair begins with a no-charge diagnostic. We identify the problem and give you a fixed quote before any work begins.",
  },
  {
    title: "No-Fix, No-Fee Guarantee",
    body: "If we can't fix it, you don't pay. Simple as that. We only charge for results.",
  },
  {
    title: "Local Family-Run Business",
    body: "We're not a chain store. Aaron G. and Larissa G. run Koastal Kollective from Mannering Park with genuine care for every customer.",
  },
  {
    title: "On-Site or In-Store",
    body: "Bring your device to our workshop or book an on-site visit. We cover the entire Central Coast and Lake Macquarie region.",
  },
  {
    title: "10% Pensioner Discount",
    body: "Seniors and pensioners receive a permanent 10% discount on all services. We believe quality IT support should be accessible to everyone.",
  },
  {
    title: "All Brands & All Problems",
    body: "Apple, Windows, Linux, custom builds, business workstations, gaming PCs, laptops, tablets — we fix them all. No problem is too unusual.",
  },
];

const serviceCategories = [
  "Computer Repairs & Diagnostics",
  "Laptop Screen Repairs",
  "Virus & Malware Removal",
  "Data Recovery & Backup",
  "Custom Built Computers",
  "Refurbished Computers",
  "Hardware Upgrades (SSD, RAM, GPU)",
  "Windows, macOS & Linux Installation",
  "Password Recovery & Account Access",
  "Printer & Peripheral Setup",
  "Email, Calendar & Microsoft 365 Setup",
  "NBN, Wi-Fi & Network Configuration",
  "Smart TV & Streaming Setup",
  "Software Installation & Troubleshooting",
  "On-Site Home & Business IT Support",
  "Cloud Setup, Migration & Sync",
  "Emergency Same-Day Repairs",
  "New Computer Setup & Data Transfer",
  "Cyber Security & Privacy Audits",
  "Photo Scanning & VHS to Digital",
  "Photo Restoration",
  "Funeral Slideshows & Memorial Tributes",
];

const majorSuburbs = [
  "Gosford", "Wyong", "Tuggerah", "Lake Haven", "Warnervale",
  "Hamlyn Terrace", "Wadalba", "Toukley", "Budgewoi", "San Remo",
  "Buff Point", "Mannering Park", "Charmhaven", "Gorokan", "Kanwal",
  "Lisarow", "Narara", "Erina", "Terrigal", "Wamberal",
  "Forresters Beach", "Macmasters Beach", "Copacabana", "Avoca Beach",
  "Kincumber", "Green Point", "Point Clare", "West Gosford",
  "North Gosford", "East Gosford", "Springfield", "Niagara Park",
  "Holgate", "Matcham", "Fountaindale", "Mount Elliot",
  "Macquarie Hills", "Cardiff", "Glendale", "Boolaroo",
  "Speers Point", "Eleebana", "Valentine", "Belmont",
  "Swansea", "Caves Beach", "Catherine Hill Bay",
];

export default function AllComputerServicesPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "All Computer Services Central Coast & Lake Macquarie",
    description: "Every IT service in one place — laptop, desktop, Mac, gaming, virus removal, data recovery and on-site support across the Central Coast.",
  });

  useStructuredData(
    pageGraph({
      path: "/computer-services",
      type: "CollectionPage",
      name: "All Computer Services",
      description: "Every IT service Koastal Kollective offers across the Central Coast and Lake Macquarie.",
      breadcrumbName: "Computer Services",
    }),
    "computer-services",
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
              alt="Koastal Kollective All Computer Services Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                All Computer Services · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Every IT Service You Need.<br />
                <em className="text-[#007b7d] not-italic">One Local Team.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                PC Repairs · Laptop Repairs · Mac Repairs · Virus Removal · Data Recovery · Screen Replacement · Custom Builds · NBN &amp; Wi-Fi · On-Site Support
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Koastal Kollective in Mannering Park offers the most comprehensive range of computer repair and IT services on the Central Coast and Lake Macquarie. From virus removal and laptop screen repairs to custom-built gaming PCs, business IT support, data recovery and network setup — if it involves a computer, we fix it, build it or improve it.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#services" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Browse All Services
                </a>
                <a href="tel:+61493145179" className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Call 0493 145 179
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SEO intro paragraph ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            If you're searching for a <strong>computer repair shop on the Central Coast</strong>, a <strong>laptop repair service in Lake Macquarie</strong>, or a <strong>local IT technician</strong> who can visit your home or office, Koastal Kollective is the name local residents and businesses trust. We are a <strong>family-run computer repair business</strong> based in <strong>Mannering Park</strong>, serving the entire <strong>Central Coast region</strong> including <strong>Gosford, Wyong, Tuggerah, Lake Haven, Warnervale, Hamlyn Terrace, Toukley, Budgewoi, Terrigal, Erina, Narara, Lisarow, Kincumber and all surrounding suburbs</strong>, as well as <strong>Lake Macquarie</strong> including <strong>Cardiff, Glendale, Speers Point, Eleebana, Valentine, Belmont, Swansea and Caves Beach</strong>.
          </p>
          <p>
            Our workshop handles everything from <strong>PC repairs, laptop repairs and MacBook servicing</strong> to <strong>virus removal, data recovery, SSD upgrades and screen replacements</strong>. We also offer a full range of <strong>on-site IT services</strong> — we come to your home or workplace to fix internet issues, set up networks, configure printers and resolve any technology problem you're facing. Every service includes a <strong>free diagnostic</strong>, a <strong>no-fix, no-fee guarantee</strong>, and a <strong>10% pensioner discount</strong> for seniors.
          </p>
          <p>
            Whether you need a <strong>same-day emergency repair</strong>, a <strong>custom-built gaming PC</strong>, a <strong>refurbished business computer</strong>, or simply someone to make your Wi-Fi work properly, Koastal Kollective is your local one-stop technology solution. Call us on <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> or drop into our store at <strong>Shop 1/64 Vales Road, Mannering Park, NSW, 2259</strong>.
          </p>
        </div>
      </section>

      {/* ─── Service category quick list ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            22 Services. One Local Workshop.
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {serviceCategories.map((svc) => (
              <span key={svc} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white font-medium text-sm px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7bb8bd]" />
                {svc}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── In-Store Services ─── */}
      <section id="services" className="py-14 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">In-Store Services</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Workshop Repairs &amp; Technical Services</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              Bring your device to our fully equipped Mannering Park workshop. Free diagnostics. No-fix, no-fee. Most repairs completed within 24–48 hours.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {inStoreServices.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── On-Site Services ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">On-Site Services</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">We Come to You — Home &amp; Business</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              Can't make it to the workshop? Our mobile IT technicians visit homes and offices across the Central Coast and Lake Macquarie. No call-out fees for local suburbs.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {onSiteServices.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Choose Us ─── */}
      <section className="py-14">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Koastal Kollective</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">What Makes Us the Central Coast's Trusted IT Repair Shop</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyChoose.map(({ title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Service Areas paragraph ─── */}
      <section className="bg-[#e8f4f5] py-12 border-y border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Servicing Every Suburb on the Central Coast &amp; Lake Macquarie
          </h2>
          <p className="text-gray-700 leading-relaxed text-base md:text-lg mb-6">
            We provide <strong>in-store computer repairs</strong> from our Mannering Park workshop and <strong>on-site IT support</strong> to homes and businesses across the entire region. Whether you're in <strong>Gosford, Wyong, Tuggerah, Terrigal, Erina, Narara, Hamlyn Terrace, Warnervale, Toukley, Budgewoi, Lake Haven, Charmhaven, Gorokan, Kanwal, Kincumber, Green Point, Macmasters Beach, Copacabana, Avoca Beach, Wamberal, Forresters Beach, Springfield, Holgate, Matcham, Fountaindale, Mount Elliot</strong> or anywhere else on the Central Coast — we're your local computer repair experts. We also cover <strong>Lake Macquarie</strong> suburbs including <strong>Macquarie Hills, Cardiff, Glendale, Boolaroo, Speers Point, Eleebana, Valentine, Belmont, Swansea, Caves Beach and Catherine Hill Bay</strong>.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {majorSuburbs.filter(isSuburbPage).map((s) => (
              <Link
                key={s}
                href={suburbPath(s)}
                className="text-sm text-[#007b7d] hover:text-[#005f61] hover:underline font-semibold bg-white px-3 py-1 rounded-full border border-[#c8e0e2] transition-colors"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Long-form SEO paragraphs ─── */}
      <section className="py-14">
        <div className="max-w-5xl mx-auto px-4 space-y-10 text-gray-700 leading-relaxed text-base md:text-lg">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              The Most Complete Computer Repair Service on the Central Coast
            </h2>
            <p>
              When your computer breaks, slows down, gets infected or simply stops doing what you need it to do, you need a repair shop that can handle <em>everything</em> — not just one narrow specialty. Koastal Kollective is that shop. We're the only <strong>computer repair centre on the Central Coast</strong> that genuinely covers the full spectrum of technology needs: from <strong>laptop screen replacements and virus removal</strong> to <strong>custom-built gaming PCs and business server maintenance</strong>, from <strong>home Wi-Fi troubleshooting</strong> to <strong>professional photo restoration and funeral slideshow creation</strong>. No matter what technology challenge you're facing, our Mannering Park workshop has the tools, knowledge and experience to solve it.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              PC Repairs, Laptop Repairs &amp; MacBook Servicing for All Brands
            </h2>
            <p>
              We repair <strong>all major computer brands</strong> including HP, Dell, Lenovo, ASUS, Acer, Toshiba, MSI, Samsung, Microsoft Surface, Apple MacBook, iMac, Mac Mini and every custom-built or white-label machine. Our technicians are experienced with <strong>Windows 10, Windows 11, macOS, ChromeOS and Linux</strong> operating systems. Whether you have a brand new ultrabook with a cracked screen, a 10-year-old desktop that won't boot, a MacBook with water damage, or a gaming PC that overheats under load — we diagnose accurately, quote honestly and repair properly.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Affordable, Transparent Pricing With No Hidden Charges
            </h2>
            <p>
              Technology repair can be expensive — but it doesn't have to be unfair. At Koastal Kollective, we believe in <strong>transparent, upfront pricing</strong> with no nasty surprises. Every repair starts with a free diagnostic. We tell you exactly what's wrong, what it will cost to fix, and how long it will take. If we can't fix it, you don't pay. If a repair isn't worth doing, we'll tell you honestly. Our <strong>refurbished computers start from $199</strong>, our <strong>laptop screen replacements are competitively priced</strong>, and our <strong>on-site visits carry no call-out fee for local Central Coast suburbs</strong>. We also offer a <strong>permanent 10% discount for pensioners and seniors</strong>.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Business IT Support for Small &amp; Medium Enterprises
            </h2>
            <p>
              Small businesses on the Central Coast and Lake Macquarie don't need an in-house IT department — they need a reliable local partner who responds fast and fixes things properly. Koastal Kollective provides <strong>business IT support</strong> including office network setup, server maintenance, Microsoft 365 and Google Workspace configuration, business email setup, data backup strategies, cyber security audits, hardware procurement and ongoing maintenance contracts. Whether you run a retail shop in Gosford, a medical practice in Wyong, a trades business in Lake Macquarie or a professional services firm in Terrigal, we keep your technology working so you can focus on your customers.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Home IT Support That Comes to Your Door
            </h2>
            <p>
              Not everyone can pack up their computer and drive to a repair shop — especially older residents, busy families or people with mobility challenges. Our <strong>on-site home IT support service</strong> brings a qualified technician to your door anywhere on the Central Coast or Lake Macquarie. We fix slow computers, configure new devices, set up Wi-Fi networks, connect printers, resolve email problems, install security software, configure streaming devices and answer every technology question you have — all in the comfort of your own home. We explain everything in plain English, we're patient and respectful, and we never make you feel embarrassed for not understanding technology.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Same-Day &amp; Emergency Repairs When Time Matters
            </h2>
            <p>
              Some situations can't wait. A business server down on a Monday morning. A laptop screen cracked the day before an important presentation. A computer infected with ransomware holding family photos hostage. Our <strong>same-day and emergency repair service</strong> prioritises urgent jobs and delivers fast results. We keep common laptop screens, SSDs, RAM modules and power supplies in stock so we can complete many repairs while you wait. For critical failures, we offer temporary loan equipment so you can keep working. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> and explain the urgency — we'll do everything possible to help.
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Whatever Your Technology Problem, We Can Fix It.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            The Central Coast's most comprehensive computer repair and IT service centre. Free diagnostics. No-fix, no-fee. Local, family-run and genuinely committed to helping.
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
