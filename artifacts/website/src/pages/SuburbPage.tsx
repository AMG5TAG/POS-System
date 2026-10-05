import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { useRoute, Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink, ChevronDown,
  ShieldCheck, Zap, Wrench, Home, Wifi, Monitor, Code, Tv,
  MessageSquare, Printer, Smartphone, ShoppingCart, CheckCircle2,
  Globe, Server, Shirt, Layers, Boxes, Frame,
  Gamepad2, Headphones, Recycle, ArrowLeftRight, Joystick,
} from "lucide-react";
import {
  findSuburbBySlug, suburbs, suburbPath, suburbDistance, nearbySuburbs, alsoCovering,
} from "@/data/suburbs";
import { suburbContent } from "@/data/suburb-content";
import { REGIONS } from "@/data/regions";
import NotFound from "@/pages/not-found";
import { useSeo } from "@/lib/useSeo";
import { suburbGraph, useStructuredData } from "@/lib/structuredData";
import { useLocation } from "wouter";
import { yearsExperience } from "@/lib/experience";

const repairServices = [
  {
    icon: ShieldCheck,
    title: "Virus Removal",
    body: "With 560,000 new malware threats detected daily, professional expertise is crucial. We'll remove viruses and safeguard your valuable data.",
  },
  {
    icon: Zap,
    title: "Optimisation",
    body: "Is your computer slow or freezing? We'll optimize your system for peak performance, making it run like new or even better.",
  },
  {
    icon: Wrench,
    title: "Hardware Repairs",
    body: "When hardware fails, we'll ensure you don't. Leveraging our supplier network, we offer competitive pricing on replacements.",
  },
  {
    icon: Home,
    title: "Smart Home Setups",
    body: "Whether you use Apple HomeKit, Google Home, or Amazon Alexa, we'll expertly configure your system and automation.",
  },
  {
    icon: Wifi,
    title: "Network Installs",
    body: "We can set up your NBN connection and provide network-boosting equipment for reliable, wall-to-wall Wi-Fi.",
  },
  {
    icon: Monitor,
    title: "Refurbished PC's",
    body: "We stock quality refurbished desktops, gaming computers, laptops, Apple iMacs, MacBooks, Mac Minis, Android phones, and iPhones.",
  },
  {
    icon: Code,
    title: "Software Repairs",
    body: "Need new software installed or existing software fixed? We'll ensure your software runs smoothly and stably.",
  },
  {
    icon: Tv,
    title: "Smart TVs",
    body: "Enjoy your new smart TV with ease. We'll configure all your favourite streaming services, including Netflix, Stan, Prime Video, and YouTube.",
  },
  {
    icon: MessageSquare,
    title: "General Advice",
    body: "Aaron and the team are committed to providing clients with comprehensive information and welcome inquiries to facilitate a thorough understanding of all things I.T.",
  },
  {
    icon: Printer,
    title: "All Printers Setups",
    body: "From new to old printers, we'll expertly set up your device for wireless or Ethernet network connectivity.",
  },
  {
    icon: Smartphone,
    title: "Phones and Tablets",
    body: "Get the most out of your new mobile device. We'll handle the setup and seamless data transfer, including Android-to-iPhone and vice-versa.",
  },
  {
    icon: ShoppingCart,
    title: "Purchasing Advice",
    body: "Looking to buy a new computer, laptop, or TV? We offer free professional advice to help you find the best deal and the right product for your needs.",
  },
];

// Absorbed from the retired /media/web-services/:suburb pages — every suburb
// page now carries the web & app offering alongside the repair services.
const webServices = [
  {
    icon: Globe,
    title: "Website Design & Hosting",
    href: "/media/website-design",
    body: "Mobile-first websites that load fast, rank well and convert visitors into customers. Packages from $750.",
  },
  {
    icon: Server,
    title: "Domain Hosting",
    href: "/media/domains",
    body: "Australian-managed domain registration and DNS with free WHOIS privacy and email forwarding — $30/year.",
  },
  {
    icon: Smartphone,
    title: "iOS & Android App Creation",
    href: "/media/apps",
    body: "Custom web apps, native iPhone, iPad and Android apps, plus App Store and Google Play submission — from $750.",
  },
  {
    icon: Mail,
    title: "Email Hosting",
    href: "/media/email-hosting",
    body: "Professional business email on your own domain via Google Workspace or Microsoft 365 — set up and supported locally.",
  },
];

const popCultureRanges = [
  { icon: Shirt,  title: "Merchandise & Clothing", text: "Officially licensed tees, hoodies, caps and accessories from anime, gaming, movie and TV franchises." },
  { icon: Layers, title: "Trading Card Games",     text: "Sealed boosters and boxes, a singles cabinet, plus sleeves, toploaders and binders for Pokémon, Magic and Yu-Gi-Oh!" },
  { icon: Boxes,  title: "Collectables & Statues", text: "Limited edition figures, Funko Pops, resin statues and replicas — with special orders for pieces we do not shelf." },
  { icon: Frame,  title: "Art & Prints",           text: "Original work from local artists, licensed prints and posters in framing-friendly sizes." },
];

// Like Pop Culture, not open yet: future tense throughout (see GamingPage).
const gamingRanges = [
  { icon: Gamepad2,       title: "Video Games",              text: "New releases and favourites for PlayStation, Xbox and Nintendo Switch, with pre-orders on upcoming titles." },
  { icon: Tv,             title: "Game Consoles",            text: "Current-generation consoles and bundles — and help choosing the right one and getting it set up." },
  { icon: Headphones,     title: "Controllers & Accessories", text: "Controllers, headsets, charging docks, storage, cases and cables — the bits that wear out or go missing." },
  { icon: Recycle,        title: "Second-Hand Units",        text: "Pre-owned consoles, handhelds and games, cleaned and tested in our own repair workshop before sale." },
  { icon: ArrowLeftRight, title: "Trade-Ins",                text: "Trade the consoles, games and accessories you have finished with towards something new or pre-owned." },
  { icon: Joystick,       title: "Retro Gaming",             text: "Older consoles, cartridges and games as they come in through trade-ins — one-of-a-kind and always changing." },
];

const webWhyUs = [
  { icon: Zap, title: "Fixed-price quotes", body: "Clear scope, fixed price — no surprise invoices and no scope creep." },
  { icon: ShieldCheck, title: "Australian team", body: "All work done locally on the Central Coast and Lake Macquarie — no overseas outsourcing." },
  { icon: Code, title: "Built to last", body: "Modern tech stack, hand-written code, mobile-first and search-engine friendly." },
  { icon: CheckCircle2, title: "Local support", body: "Real humans on the phone for setup, training and ongoing changes." },
];

const aboutStats = [
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
];


/** Localities this page covers, and the nearest other suburb pages. */
function SuburbCoverage({ suburb }: { suburb: string }) {
  const covering = alsoCovering(suburb);
  const nearby = nearbySuburbs(suburb);
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
        Around {suburb}
      </h2>
      {covering.length > 0 && (
        <p>
          This page also covers {covering.length === 1 ? covering[0] : `${covering.slice(0, -1).join(", ")} and ${covering[covering.length - 1]}`}
          {" "}— the same free diagnostic, no-fix no-fee guarantee and free pickup apply.
        </p>
      )}
      <p className="text-base">
        Nearby:{" "}
        {nearby.map((name, i) => (
          <span key={name}>
            {i > 0 && " · "}
            <Link href={suburbPath(name)} className="font-semibold text-[#007b7d] hover:underline">{name}</Link>
          </span>
        ))}
      </p>
    </div>
  );
}

export default function SuburbPage() {
  const [, params] = useRoute<{ suburb: string }>("/computer-repairs/:suburb");
  const slug = params?.suburb ?? "";
  const suburb = findSuburbBySlug(slug);

  const reviewsRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const content = (suburb && suburbContent[suburb]) || {};
  const distance = suburb ? suburbDistance(suburb) : null;
  // The workshop's own suburb has no meaningful "N km away".
  const atWorkshop = !!distance && distance.km < 1;
  const whereFromUs = distance
    ? atWorkshop
      ? "home of our workshop"
      : `${Math.round(distance.km)} km from our Mannering Park workshop`
    : "";

  useSeo({
    title: suburb
      ? content.title ?? `Computer Repairs ${suburb} | Free Diagnostic`
      : "Page Not Found | Koastal Kollective",
    description: suburb
      ? content.description ??
        `Computer, laptop & Mac repairs in ${suburb}, ${whereFromUs}. Free diagnostic, no fix no fee, no call-out fee. Call 0493 145 179.`
      : "That page doesn't exist. Head back to Koastal Kollective for computer repairs across the Central Coast & Lake Macquarie.",
    ogImage: "https://koastal.com.au/api/share-image.png",
    // An unresolved slug renders <NotFound />, but hooks cannot be conditional
    // so this effect still runs — and runs *after* the child's, overwriting it.
    // Give the invalid case real 404 metadata instead of the parent's fallback
    // title plus a canonical pointing at a URL that does not exist.
    noindex: !suburb,
  });

  useStructuredData(suburb ? suburbGraph(suburb, location) : null, "suburb");

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

  if (!suburb) return <NotFound />;

  // Which region does this suburb sit in? Used for the breadcrumb and the
  // link up to the region hub.
  const region = REGIONS.find((r) =>
    r.groups.some((g) => g.suburbs.includes(suburb)),
  );

  return (
    <div className="bg-white text-gray-900">
      {/* ─── Hero ─── */}
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt={`Koastal Kollective logo - computer repairs in ${suburb}`}
              title={`Koastal Kollective computer repairs in ${suburb}`}
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                {suburb.toUpperCase()}
              </p>
              <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-3">
                <Link href="/" className="hover:text-[#007b7d]">Home</Link>
                <span className="mx-2">/</span>
                <Link href="/computer-repairs" className="hover:text-[#007b7d]">Computer Repairs</Link>
                {region && (
                  <>
                    <span className="mx-2">/</span>
                    <Link href={`/computer-repairs/${region.slug}`} className="hover:text-[#007b7d]">
                      {region.name}
                    </Link>
                  </>
                )}
                <span className="mx-2">/</span>
                <span className="text-gray-900 font-semibold">{suburb}</span>
              </nav>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
                Computer, Mac and Laptop Repairs in {suburb}
              </h1>
              {distance && (
                <p className="mt-3 text-gray-600 flex items-center justify-center gap-1.5">
                  <MapPin className="h-4 w-4 text-[#007b7d]" />
                  {atWorkshop
                    ? `${suburb} is home to our workshop at 1/64 Vales Road`
                    : `${Math.round(distance.km)} km ${distance.direction} of our Mannering Park workshop`}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-10 text-base md:text-lg text-gray-700 leading-relaxed">

          {content.intro ? (
            <div className="space-y-4 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                Local Computer Repairs for {suburb}
              </h2>
              {content.intro.map((para, i) => <p key={i}>{para}</p>)}
            </div>
          ) : (
          <div className="space-y-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Trusted Computer and Laptop Repairs for {suburb}
            </h2>
            <p>
              Koastal Kollective provides expert technology solutions for home users and local
              businesses throughout {suburb}. Our commitment to the community is built on a
              foundation of trust, offering a completely free diagnostic service and a strict
              no-fix, no-fee guarantee to ensure you only pay for results. We prioritize local
              accessibility by providing professional IT support with zero cost call-out fees and
              a dedicated 10% pension discount for our senior customers.
            </p>
          </div>
          )}

          {content.sections?.map((sec) => (
            <div key={sec.heading} className="space-y-4 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{sec.heading}</h2>
              {sec.body.map((para, i) => <p key={i}>{para}</p>)}
            </div>
          ))}

          {content.review && (
            <figure className="text-center">
              <blockquote className="italic text-gray-700">&ldquo;{content.review.quote}&rdquo;</blockquote>
              <figcaption className="mt-2 text-sm font-bold text-gray-900">– {content.review.author}</figcaption>
            </figure>
          )}

          <SuburbCoverage suburb={suburb} />

          <div className="space-y-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Local IT Specialists for PC, Mac, and Laptop Repairs
            </h2>
            <p>
              As your premier local IT specialists, we deliver a comprehensive range of technical
              services tailored to your specific needs. We are the go-to experts for professional
              computer repair, laptop repair, and desktop PC repair, as well as specialized Mac
              repair for all Apple devices. Our technicians are highly skilled in critical services
              such as virus removal, system optimization, and expert data recovery. If your device
              is lagging or broken, we offer high-quality hardware upgrades and precision laptop
              screen replacements to extend the life of your technology.
            </p>
          </div>

          <div className="space-y-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              NBN, Wi-Fi, and Smart Home Connectivity Solutions
            </h2>
            <p>
              In addition to traditional hardware fixes, Koastal Kollective ensures your entire
              home or office stays connected. We provide professional assistance with smart TV
              setups and optimize NBN and Wi-Fi networks to maximize both reach and reliability
              across your property. Whether you need gaming computer repairs for peak performance
              or help setting up your latest mobile device, we support all major brands across
              Android and Apple platforms. From tablets and phones to high-end workstations, we
              pride ourselves on providing clear, jargon-free explanations for every client.
            </p>
          </div>

          <div className="space-y-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Serving {suburb} for Over {yearsExperience} Years
            </h2>
            <p>
              For more than {yearsExperience} years, our family-run business has supported the Central Coast and
              Lake Macquarie communities with a focus on professionalism and local expertise. We
              are dedicated to helping our neighbors, from volunteering for local charities to
              assisting seniors with their day-to-day tech challenges. For fast, reliable computer
              repair and expert guidance from a local technician, contact us today at{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">
                0493 145 179
              </a>{" "}
              and experience why our customers consistently recommend Koastal Kollective for
              knowledgeable and reliable tech support.
            </p>
            <p className="italic text-gray-500 text-base">
              &ldquo;Knowledgeable and Reliable Computer Repairs. Thanks to Koastal Kollective.&rdquo;
            </p>
          </div>

        </div>
      </section>

      {/* ─── About / Team Section ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              About Koastal Kollective
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              We are professional IT technicians specialising in all things I.T
            </h2>
            <p className="text-gray-700 leading-relaxed mb-8">
              Hello, our names are Aaron and Larissa Gregory. For over {yearsExperience} years, we&rsquo;ve served as
              computer technicians, assisting residents, retirees, and business owners in and around{" "}
              {suburb}. We prioritise respect for our clients and understand the value of their time.
              You can rely on us for prompt, professional, and reliable service.
            </p>

            <div className="space-y-5">
              {[
                { label: "REPAIRS", pct: 100 },
                { label: "DATA RECOVERIES", pct: 90 },
                { label: "INSTALLATIONS", pct: 100 },
              ].map(({ label, pct }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-900 tracking-wide">{label}</span>
                    <span className="text-xs font-bold text-white bg-[#007b7d] rounded-full px-2 py-0.5">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#007b7d] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:flex justify-center">
            <img
              src="/images/computer-repair-technician-laptop.webp"
              alt={`Professional computer repair technician fixing a laptop in ${suburb} for Koastal Kollective`}
              title={`IT technician laptop repair service in ${suburb}`}
              className="rounded-2xl w-full max-w-sm object-cover shadow-lg"
              style={{ maxHeight: "480px" }}
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ─── Repairs & Services Grid ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              Repairs
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
              We <em className="not-italic text-[#007b7d]">always</em> strive to get{" "}
              <br className="hidden md:block" />
              your machine working 100%
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto">
              We provide a comprehensive suite of installation and repairs on the Central Coast and Lake Macquarie.
              We offer complimentary pickup and delivery and can also perform most services on-site, whether at your
              residence, business or at our fully stocked service centre in Mannering Park.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {repairServices.map(({ icon: Icon, title, body }) => (
              <div key={title} className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#007b7d] text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-sm font-bold text-[#007b7d] mb-2">{title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <a
              href="#contact"
              className="inline-flex items-center gap-2 bg-[#007b7d] text-white font-bold rounded-full px-8 py-3 hover:bg-[#005f61] transition-colors"
            >
              ALL IT SERVICES <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Websites & Apps ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              Websites &amp; Apps
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
              Everything {suburb} needs to{" "}
              <em className="not-italic text-[#007b7d]">get online</em>
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Koastal Kollective serves {suburb} and the wider Central Coast and Lake Macquarie. We design and build fast, modern websites, register
              and host domains, run business email on Google Workspace and Microsoft 365, and create
              native mobile apps for the App Store and Google Play — the same local team you already
              trust with your hardware.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {webServices.map(({ icon: Icon, title, body, href }) => (
              <Link
                key={title}
                href={href}
                className="group bg-white border border-gray-200 hover:border-[#007b7d] rounded-xl p-6 transition-colors block"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1 group-hover:text-[#007b7d] transition-colors">
                      {title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {webWhyUs.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-gray-50 border border-gray-100 rounded-lg p-5">
                <Icon className="h-7 w-7 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-600 mt-10 max-w-3xl mx-auto leading-relaxed">
            Whether you&apos;re a {suburb} tradie needing a new website, a small business after
            professional email on your own domain, or a local team with an idea for an iOS or Android
            app, we cover it end-to-end — one local contact, one fixed-price quote within 24 hours,
            and everything stays in Australia. Call{" "}
            <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">
              0493 145 179
            </a>{" "}
            or email{" "}
            <a href="mailto:sales@koastal.com.au" className="font-bold text-[#007b7d] hover:underline">
              sales@koastal.com.au
            </a>.
          </p>
        </div>
      </section>

      {/* ─── Pop Culture & Collectables (not open yet — see the overlay) ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              Pop Culture &amp; Collectables
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
              Coming soon for{" "}
              <em className="not-italic text-[#007b7d]">{suburb}</em>
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed">
              A curated Pop Culture range is coming to the Koastal Kollective store in Mannering Park —
              trading cards, collectables, statues, figures, apparel and art from your favourite
              franchises, a short drive from {suburb}. It is not open yet, but you can tell us
              what to stock and be first to know when it lands.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {popCultureRanges.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/pop-culture"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              See What&apos;s Coming
            </Link>
          </div>
        </div>

        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none">
          <div className="bg-amber-500 text-white font-black text-3xl md:text-5xl uppercase tracking-[0.15em] px-10 py-6 rounded-2xl shadow-2xl border-4 border-white/30 rotate-[-3deg] animate-pulse">
            Coming Soon
          </div>
        </div>
      </section>

      {/* ─── Gaming & Consoles (not open yet — see the overlay) ─── */}
      <section className="bg-white py-14 border-b border-gray-100 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              Gaming &amp; Consoles
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
              Coming soon for{" "}
              <em className="not-italic text-[#007b7d]">{suburb}</em>
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed">
              A gaming range is coming to the Koastal Kollective store in Mannering Park, a short
              drive from {suburb} — new games and consoles, controllers and accessories, and
              second-hand units tested in our own workshop. You will also be able to trade in the
              games and gear you have finished with. It is not open yet, but you can tell us what
              to stock and be first to know when it lands.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gamingRanges.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/gaming"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              See What&apos;s Coming
            </Link>
          </div>
        </div>

        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none">
          <div className="bg-amber-500 text-white font-black text-3xl md:text-5xl uppercase tracking-[0.15em] px-10 py-6 rounded-2xl shadow-2xl border-4 border-white/30 rotate-[-3deg] animate-pulse">
            Coming Soon
          </div>
        </div>
      </section>

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs area={suburb} />

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
            {aboutStats.map(({ icon, value, label }) => (
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
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">
            Koastal Kollective Team
          </p>
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
                  <img
                    src={image}
                    alt={`${name}, IT technician at Koastal Kollective, computer repair specialist`}
                    title={`${name} — Koastal Kollective IT technician`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
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

      {/* ─── Guarantees ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              "Free Diagnostics",
              "No-Fix No-Fee Guarantee",
              "Zero Call-Out Fees",
            ].map((g) => (
              <div
                key={g}
                className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <CheckCircle2 className="h-6 w-6 text-[#007b7d] flex-shrink-0" />
                <span className="font-bold text-gray-900">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3">
            Testimonials
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our real reviews from clients
          </h2>
          <blockquote className="text-lg md:text-xl italic text-gray-700 max-w-3xl mx-auto leading-relaxed">
            <p>
              &ldquo;We are committed to delivering the highest level of{" "}
              <a href="/computer-services" className="text-[#007b7d] hover:underline font-semibold not-italic">
                service
              </a>{" "}
              for our clients on the{" "}
              <a href="/computer-repairs/central-coast" className="text-[#007b7d] hover:underline font-semibold not-italic">
                Central Coast
              </a>{" "}
              and{" "}
              <a href="/computer-repairs/lake-macquarie" className="text-[#007b7d] hover:underline font-semibold not-italic">
                Lake Macquarie
              </a>
              .&rdquo;
            </p>
            <footer className="mt-2 text-base font-bold not-italic text-gray-900">
              – Aaron and the Koastal Kollective Team
            </footer>
          </blockquote>
        </div>
        <div className="mt-6 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="bg-[#007b7d] py-10 border-b border-[#006a6c]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Contact Us
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Visit:</p>
                  <a
                    href="https://maps.app.goo.gl/V6MedKW2n1fCybob7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    1/64 Vales Road, Mannering Park, NSW, 2259
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Email:</p>
                  <a
                    href="mailto:sales@koastal.com.au"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    sales@koastal.com.au
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Call:</p>
                  <a
                    href="tel:+61493145179"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    0493 145 179
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">WhatsApp Message:</p>
                  <a
                    href="https://wa.me/61493145179"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
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
                    <img
                      src="/images/vcard-aaron.webp"
                      alt="QR code to add Aaron Gregory — Koastal Kollective IT technician — to your contacts"
                      title="Scan to save Aaron Gregory contact details"
                      className="w-28 h-28 rounded"
                      loading="lazy"
                    />
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
                    <span className={`font-bold ${hours === "Closed" ? "text-white/50" : "text-white"}`}>
                      {hours}
                    </span>
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
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
            Visit Us
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Fully Stocked Retail Store and Repair Centre
          </h2>
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

      {/* ─── Service Areas (links back to other suburbs) ─── */}
      <section id="service-areas" className="bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
              Our Suburb Pages
            </h2>
            <p className="text-[#007b7d] text-sm mt-2 font-semibold">
              CLICK A SUBURB TO LEARN MORE
            </p>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-6">
            {Object.entries(suburbs).map(([letter, names]) => (
              <div key={letter} className="break-inside-avoid mb-4">
                <h4 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1 mb-1.5">
                  {letter}
                </h4>
                <ul className="space-y-0.5">
                  {names.map((name) => (
                    <li key={name}>
                      <Link
                        href={suburbPath(name)}
                        className={`text-sm hover:underline font-semibold transition-colors ${
                          name === suburb
                            ? "text-gray-900 underline"
                            : "text-[#007b7d] hover:text-[#005f61]"
                        }`}
                      >
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
        className="fixed bottom-6 left-6 z-50 whatsapp-float flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-2.5 rounded-full shadow-lg transition-colors group"
        aria-label="WhatsApp"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span className="text-sm font-bold">Need Help?</span>
      </a>
    </div>
  );
}
