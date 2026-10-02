import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SiteBanner from "@/components/SiteBanner";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import { MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink } from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import { yearsExperience } from "@/lib/experience";

const services = [
  {
    id: "it-services",
    label: "Leading IT Specialists",
    heading: "Professional IT Services",
    headingLine2: "for PC, Mac, and Laptops",
    subheading: "On The Central Coast and Lake Macquarie",
    intro:
      "Our core focus is delivering high-quality technical repairs tailored to your specific hardware and software needs.",
    points: [
      {
        title: "Comprehensive Computer Repair",
        text: "From broken hinges and cracked laptop screens to complex motherboard issues.",
      },
      {
        title: "Apple Mac Specialists",
        text: "Expert support for MacBook Pro, MacBook Air, and iMac, including battery replacements and OS troubleshooting.",
      },
      {
        title: "System Optimization",
        text: "Is your computer lagging? We specialize in software cleanup and SSD hardware upgrades to make old machines run like new.",
      },
      {
        title: "Security & Recovery",
        text: "Professional virus removal, malware protection, and expert data recovery for failing hard drives.",
      },
    ],
    link: "/computer-services",
    linkText: "All IT Services",
    image: "/images/it-services-section.webp",
    imageAlt: "Professional IT technician repairing a laptop in a modern computer repair shop on the Central Coast",
    imageLeft: false,
  },
  {
    id: "pop-culture",
    label: "Pop Culture",
    heading: "Pop Culture Merchandise & Collectables",
    subheading: "Merchandise, Clothing, Art, TCG, Collectables & Statues",
    intro:
      "A curated Pop Culture range is coming to the Mannering Park store — merchandise, trading cards, collectables and art from your favourite franchises. It is not open yet, but you can tell us what to stock and be first to know when it lands.",
    points: [
      {
        title: "Merchandise & Clothing",
        text: "Officially licensed graphic tees, hoodies, caps and accessories from anime, gaming, movie and TV franchises — in sizes that go well beyond the usual S–XL.",
      },
      {
        title: "Trading Card Games (TCG)",
        text: "Sealed boosters and boxes, a singles cabinet, plus sleeves, toploaders, binders and playmats for Pokémon, Magic: The Gathering and Yu-Gi-Oh!",
      },
      {
        title: "Collectables & Statues",
        text: "Limited edition figures, Funko Pops, resin statues and scale replicas — with special orders and pre-orders for pieces we do not carry on the shelf.",
      },
      {
        title: "Art & Prints",
        text: "Original work from local artists, licensed prints and posters in framing-friendly sizes, so what you buy ends up on the wall instead of in a tube.",
      },
    ],
    link: "/pop-culture",
    linkText: "Pop Culture & Collectables",
    image: "/images/pop-culture.webp",
    imageAlt: "Pop culture merchandise collectables Central Coast",
    imageLeft: true,
  },
  {
    id: "starlink",
    label: "Satellite Internet Installation",
    heading: "Starlink Satellite Internet",
    headingLine2: "Installation & Setup",
    subheading: "Official Starlink Installation Partner — Central Coast & Lake Macquarie",
    intro:
      "As an official Starlink installation partner, we supply, mount, and configure Starlink hardware for homes and businesses across the Central Coast and Lake Macquarie.",
    points: [
      {
        title: "Professional Dish Mounting",
        text: "Roof, wall, or ground mounting with weatherproof cable routing for the cleanest possible installation.",
      },
      {
        title: "Coverage Where NBN Can't Reach",
        text: "Starlink reaches rural and semi-rural properties around Mangrove Mountain, Kulnura, Dooralong, and beyond — where copper, fibre, and fixed wireless simply can't go.",
      },
      {
        title: "Whole-Home Network Setup",
        text: "We integrate your Starlink connection with mesh Wi-Fi to extend coverage across large properties, granny flats, and outbuildings.",
      },
      {
        title: "Supply & Activation",
        text: "We can supply the hardware, handle activation, and configure your router — one call, fully sorted.",
      },
    ],
    link: "/starlink",
    linkText: "Starlink Installation Details",
    image: "/images/starlink-section.webp",
    imageAlt: "Starlink satellite internet dish professionally mounted on an Australian suburban rooftop pointing at a clear blue sky",
    imageLeft: false,
  },
  {
    id: "vhs-digital",
    label: "VHS to DVD or Digital",
    heading: "Legacy Media & Memorial Services",
    subheading: "",
    intro:
      "We also provide specialized technical assistance for preserving family history and honoring loved ones.",
    points: [
      {
        title: "VHS to Digital Conversions",
        text: "We transfer VHS, VHS-C, and Hi8 tapes to high-quality MP4 files on USB.",
      },
      {
        title: "Funeral & Memorial Slideshows",
        text: "Our team creates professional, high-definition video tributes and photo slideshows for memorial services, handling your precious memories with the utmost care and compassion.",
      },
    ],
    link: "/vhs-to-digital",
    linkText: "VHS Conversion Information",
    image: "/images/vhs-digital-section.webp",
    imageAlt: "VHS cassette tapes, DVD discs, and USB flash drives arranged on a clean white surface",
    imageLeft: true,
  },
  {
    id: "web-design",
    label: "Website Design & Hosting",
    heading: "Websites, Domains & Business Email",
    subheading: "Designed, Built & Hosted in Australia",
    intro:
      "The same family-run team that fixes your hardware also builds and hosts your business online — with fixed-price quotes within 24 hours and one local point of contact.",
    points: [
      {
        title: "Website Design & Hosting",
        text: "Mobile-first websites from $750 that load fast, rank well and turn visitors into customers, hosted in Sydney and Melbourne data centres with free SSL, daily backups and a 99.99% uptime SLA.",
      },
      {
        title: "Domains & Business Email",
        text: "Domain registration and DNS from $30 a year with free WHOIS privacy, plus professional email on your own domain through Google Workspace or Microsoft 365.",
      },
      {
        title: "Mobile & Web Apps",
        text: "Custom web apps and native iPhone, iPad and Android apps from $750, including App Store and Google Play submission and ongoing updates.",
      },
    ],
    link: "/media",
    linkText: "All Web & Media Services",
    image: "/images/website-design-section.webp",
    imageAlt: "Desktop monitor displaying a modern small-business website with a hero section, service cards and a call-to-action button",
    imageLeft: false,
  },
  // Not open yet, like Pop Culture: future tense, and the Coming Soon overlay
  // (COMING_SOON below) covers it.
  {
    id: "gaming",
    label: "Gaming & Consoles",
    heading: "Video Games, Consoles",
    headingLine2: "& Trade-Ins",
    subheading: "Coming Soon to Mannering Park",
    intro:
      "A gaming range is coming to the Mannering Park store — new games and consoles, controllers and accessories, and second-hand units cleaned and tested in our own repair workshop.",
    points: [
      {
        title: "Games & Consoles",
        text: "New releases and favourites for PlayStation, Xbox and Nintendo Switch, current-generation consoles and bundles, with pre-orders on upcoming titles.",
      },
      {
        title: "Controllers & Accessories",
        text: "Controllers, headsets, charging docks, storage, cases and cables — the bits that wear out or go missing.",
      },
      {
        title: "Second-Hand & Retro",
        text: "Pre-owned consoles, handhelds and games tested before sale, plus retro titles as they come in through trade-ins.",
      },
      {
        title: "Trade-Ins",
        text: "Trade the consoles, games and accessories you have finished with towards something new or pre-owned.",
      },
    ],
    link: "/gaming",
    linkText: "See What's Coming",
    image: "/images/gaming-playstation-5.webp",
    imageAlt: "PlayStation 5 console with a DualSense controller",
    imageLeft: true,
  },
];

/* Ranges that have not opened: their blocks carry the Coming Soon overlay. */
const COMING_SOON = new Set(["pop-culture", "gaming"]);

export default function HomePage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Computer Repairs Central Coast | Koastal Kollective",
    description: "Family-run computer, Mac and laptop repairs plus website design, hosting and app development on the Central Coast & Lake Macquarie since 2011. Pop Culture merchandise & collectables coming soon. Free diagnostics, no-fix no-fee. Call 0493 145 179.",
    ogImage: "https://koastal.com.au/api/share-image.png",
  });

  useStructuredData(
    serviceGraph({
      path: "/",
      serviceType:
        "Computer repair, Mac repair, laptop repair, virus removal, data recovery, website design, website hosting, domain hosting, email hosting, mobile app development, pop culture merchandise and collectables",
      name: "Koastal Kollective",
      description:
        "Family-run computer repair and web development business on the Central Coast and Lake Macquarie. PC, Mac, laptop repairs, custom gaming computers, VHS to digital, NBN setup, website design and hosting, domain and email hosting, iOS and Android apps. Pop culture merchandise, trading cards, collectables, statues and art coming soon to the Mannering Park store. Free diagnostics.",
      breadcrumbName: "Home",
      offers: [
        "Computer Repairs",
        "MacBook & Apple Repairs",
        "Laptop Screen Repairs",
        "Virus Removal",
        "Data Recovery",
        "NBN & Wi-Fi Setup",
        "VHS to Digital Conversion",
        "Custom Built Gaming PCs",
        "Website Design & Hosting",
        "Domain Registration & Hosting",
        "Business Email Hosting",
        "iOS & Android App Development",
      ],
    }),
    "homepage",
  );

  useEffect(() => {
    const container = reviewsRef.current;
    if (!container) return;
    const existingScript = container.querySelector(
      'script[src*="cdn.trustindex.io"]'
    );
    if (existingScript) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.defer = true;
    script.async = true;
    container.appendChild(script);
  }, []);

  return (
    <main>
      {/* ─── Hero Section ─── */}
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-shrink-0 flex justify-center md:justify-start">
              <img
                src="/images/logo.png"
                alt="Koastal Kollective logo — family-run computer repairs Central Coast & Lake Macquarie"
                title="Koastal Kollective"
                className="w-56 h-56 md:w-64 md:h-64 object-contain"
              />
            </div>
            <div className="text-center md:text-left">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                KOASTAL KOLLECTIVE
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight text-balance">
                Computers and Media
                <br />
                Pop Culture and Gaming
                <br />
                on the Central Coast & Lake Macquarie
              </h1>
              <p className="mt-4 text-base md:text-lg text-gray-700 leading-relaxed max-w-2xl">
                PC, Mac and laptop repairs, virus removal, data recovery and NBN setup —
                plus website design and hosting, domain registration, business email and{" "}
                <a href="/media" className="font-bold text-[#007b7d] hover:underline">
                  iOS &amp; Android apps
                </a>. Pop Culture merchandise, trading cards and collectables are{" "}
                <a href="/pop-culture" className="font-bold text-[#007b7d] hover:underline">
                  coming soon
                </a>{" "}
                to the Mannering Park store.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SiteBanner href="/media/website-design" />

      {/* ─── About Section ─── */}
      <section className="bg-white py-8 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-[15px]">
          <p>
            Koastal Kollective is the trusted local choice for professional computer repairs, laptop
            repairs, and MacBook servicing on the Central Coast and Lake Macquarie. Established in
            2011, our family-run repair shop in Mannering Park delivers expert PC repairs, Apple
            Mac repairs, iMac servicing, and Microsoft Surface repairs for all major brands. Our
            certified technicians specialise in laptop screen replacements, keyboard repairs, battery
            replacements, virus and malware removal, operating system reinstalls, data recovery from
            failing hard drives, SSD upgrades, RAM upgrades, thermal paste replacement, and full
            system tune-ups. We offer free diagnostics with no obligation, a strict no-fix, no-fee
            guarantee, and zero call-out fees for on-site IT support across the Central Coast
            and Lake Macquarie.
          </p>
          <p>
            Preserve your family history with our professional VHS to digital conversion services,
            transferring old VHS tapes, camcorder recordings, and home videos into high-quality digital
            MP4 files on USB or DVD. We convert VHS, VHS-C, Hi8, and MiniDV formats for
            families across the Central Coast and Lake Macquarie. We also create compassionate funeral
            memorial slideshows and video tributes, honoring your loved ones with dignity. Seniors
            receive a 10% pension discount on all services. For
            fast, local, jargon-free IT support and computer repairs in Mannering Park, Lake Macquarie,
            and the Central Coast, contact Koastal Kollective today at{" "}
            <a href="tel:+61493145179" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              0493 145 179
            </a>{" "}
            for reliable tech solutions.
          </p>
          <p>
            The same family-run team also builds and hosts your business online.{" "}
            <a href="/media/website-design" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              Website design
            </a>{" "}
            starts from $750 — mobile-first sites that load fast, rank well and turn visitors
            into customers, whether that is a single-page site for a tradie or a full e-commerce
            store, with SEO built in from the first line of code rather than bolted on afterwards.
            We register and manage{" "}
            <a href="/media/domains" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              domain names
            </a>{" "}
            from $30 a year with free WHOIS privacy, DNS handled for you, and hosting in Sydney
            and Melbourne data centres with free SSL, daily backups, DDoS protection and a 99.99%
            uptime SLA. We set up professional{" "}
            <a href="/media/email-hosting" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              business email
            </a>{" "}
            on your own domain through Google Workspace or Microsoft 365, migrate your existing
            mailboxes across, and support them locally afterwards. We also build custom web apps
            and native iPhone, iPad and{" "}
            <a href="/media/apps" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              Android apps
            </a>{" "}
            from $750, including App Store and Google Play submission. Everything stays in
            Australia — domain, hosting, mailboxes and source code — with fixed-price quotes
            within 24 hours and one local point of contact.{" "}
            <a href="/media" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              See all web &amp; media services
            </a>{" "}
            or call{" "}
            <a href="tel:+61493145179" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
              0493 145 179
            </a>.
          </p>
          <div className="relative overflow-hidden rounded-xl">
            <p>
              A Pop Culture and gaming range is coming to the Mannering Park store, in the same
              shopfront at 1/64 Vales Road where you already bring your laptop for repair. Fans
              will find trading cards, collectables, statues, figures, apparel and art from their
              favourite franchises, alongside new video games, game consoles and gaming
              accessories for PlayStation, Xbox and Nintendo Switch.
            </p>
            <p className="mt-4">
              There will also be a range of second-hand consoles, handhelds and games, so gamers
              can pick up a bargain or fill a gap in their collection. Because repairs are what we
              do every day, every pre-owned unit will be cleaned and tested in our own workshop
              before it goes on the shelf. You will be able to trade in the consoles, games and
              accessories you have finished with towards something new or pre-owned, and retro
              titles will turn up as they come in through trade-ins.
            </p>
            <p className="mt-4">
              We would rather stock what people here actually collect and play than guess, so tell
              us what you would like to see on the shelves.{" "}
              <a href="/pop-culture" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
                See the Pop Culture range
              </a>{" "}
              and{" "}
              <a href="/gaming" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
                what&apos;s coming in gaming
              </a>
              , or call{" "}
              <a href="tel:+61493145179" className="font-bold text-gray-900 hover:text-[#007b7d] transition-colors">
                0493 145 179
              </a>{" "}
              to be told when it lands.
            </p>
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="bg-amber-500 text-white font-black text-2xl md:text-4xl uppercase tracking-[0.15em] px-8 py-4 rounded-2xl shadow-2xl border-4 border-white/30 rotate-[-3deg] animate-pulse">
                Coming Soon
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Services Header ─── */}
      <section className="bg-[#007b7d] py-16 text-center">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#7bb8bd] font-bold tracking-[0.18em] text-xs uppercase mb-3">
            JUST SOME OF OUR KEY SERVICES WE OFFER
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Leading IT Specialists for PC, Mac, and Laptops
          </h2>
          <h2 className="text-3xl md:text-4xl font-bold mt-1 italic text-[#e8f4f5]">
            Central Coast &amp; Lake Macquarie
          </h2>
        </div>
      </section>

      {/* ─── Service Blocks ─── */}
      {services.map((service, idx) => (
        <section
          key={service.id}
          id={service.id}
          className={`py-10 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} border-b border-gray-100 relative overflow-hidden`}
        >
          <div className="max-w-7xl mx-auto px-4">
            <div
              className={`flex flex-col ${service.imageLeft ? "md:flex-row-reverse" : "md:flex-row"} items-center gap-12`}
            >
              {/* Text */}
              <div className="flex-1 space-y-5">
                <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase">
                  {service.label}
                </p>
                <h3 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                  {service.heading}
                  {"headingLine2" in service && service.headingLine2 && (
                    <>
                      <br />
                      {service.headingLine2}
                    </>
                  )}
                  {service.subheading && (
                    <>
                      <br />
                      <span className="text-[#007b7d]">{service.subheading}</span>
                    </>
                  )}
                </h3>
                <p className="text-gray-600 leading-relaxed">{service.intro}</p>
                <ul className="space-y-3">
                  {service.points.map((point) => (
                    <li key={point.title} className="text-gray-700 leading-relaxed">
                      <strong className="text-gray-900">{point.title}:</strong> {point.text}
                    </li>
                  ))}
                </ul>
                <div>
                  <a
                    href={service.link}
                    className="inline-block bg-[#7bb8bd] hover:bg-[#007b7d] text-white font-bold px-6 py-2.5 rounded-full text-sm transition-colors"
                  >
                    {service.linkText}
                  </a>
                </div>
              </div>

              {/* Image */}
              <div className="flex-1 flex justify-center relative">
                <img
                  src={service.image}
                  alt={service.imageAlt}
                  title={service.imageAlt}
                  className="w-full max-w-md max-h-[36rem] object-contain rounded-lg"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          {/* Coming Soon full overlay (Pop Culture, Gaming) */}
          {COMING_SOON.has(service.id) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none">
              <div className="bg-amber-500 text-white font-black text-3xl md:text-5xl uppercase tracking-[0.15em] px-10 py-6 rounded-2xl shadow-2xl border-4 border-white/30 rotate-[-3deg] animate-pulse">
                Coming Soon
              </div>
            </div>
          )}
        </section>
      ))}


      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

      {/* ─── About Us ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#006a6c] overflow-hidden relative">
        {/* Decorative corner shapes */}
        <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rotate-45 -translate-x-12 -translate-y-12" />
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rotate-45 translate-x-8 -translate-y-8" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rotate-45 translate-x-12 translate-y-12" />

        <div className="max-w-5xl mx-auto px-4 relative">
          <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3">
            About Us
          </p>
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

      {/* ─── Contact Section ─── */}
      <section id="contact" className="bg-[#007b7d] py-8 border-b border-[#006a6c]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <p className="text-[#7bb8bd] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              Contact Us
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-white">Koastal Kollective</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            {/* Contact Info */}
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

            {/* Operating Hours */}
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

      {/* ─── Service Areas ─── */}
      <section id="service-areas" className="bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
              Servicing and Supplying Every Suburb
            </h2>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">
              on the Central Coast &amp; Lake Macquarie
            </h3>
            <p className="text-gray-600 text-sm mt-3 max-w-2xl mx-auto">
              Looking for your area?{" "}
              <Link href="/computer-repairs/central-coast" className="text-[#007b7d] font-bold hover:underline">
                Central Coast computer repairs
              </Link>{" "}
              or{" "}
              <Link href="/computer-repairs/lake-macquarie" className="text-[#007b7d] font-bold hover:underline">
                Lake Macquarie computer repairs
              </Link>
              .
            </p>
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
                        className="text-sm text-[#007b7d] hover:text-[#005f61] hover:underline font-semibold transition-colors"
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
    </main>
  );
}
