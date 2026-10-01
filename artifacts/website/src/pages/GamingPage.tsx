import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  Gamepad2, Tv, Headphones, Recycle, ArrowLeftRight, Joystick, Bell, Store, Cpu,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import { yearsExperience } from "@/lib/experience";

// Like Pop Culture, the gaming range has not opened yet. Every claim on this
// page is written in the future tense on purpose — nothing here should read as
// stock you can buy, or a trade-in you can do, today. Revisit the "Coming
// Soon" badges, the notice band and the FAQ answers together when it launches.
// (Custom gaming PCs are the exception: that service runs today.)
const ranges = [
  {
    icon: Gamepad2,
    title: "Video Games",
    body: "New release and back-catalogue titles for PlayStation, Xbox and Nintendo Switch. We plan to stock the big launches alongside the games people keep coming back to — family favourites, party games and the long-running series — and to take pre-orders on upcoming releases so you can collect on launch day without the queue.",
  },
  {
    icon: Tv,
    title: "Game Consoles",
    body: "Current-generation consoles and bundles from PlayStation, Xbox and Nintendo, ready to take home and set up. If you are not sure which console suits your household, ask us — we would rather talk you into the right one than the most expensive one, and we can help get it connected to your TV, Wi-Fi and accounts.",
  },
  {
    icon: Headphones,
    title: "Controllers & Accessories",
    body: "Controllers, charging docks, headsets, memory and storage expansion, carry cases, screen protectors, cables and adaptors. The everyday bits that wear out or go missing — the spare controller for a visiting friend, the replacement cable, the headset for online play — without a trip out of the area to find them.",
  },
  {
    icon: Recycle,
    title: "Second-Hand Consoles & Games",
    body: "A rotating range of pre-owned consoles, handhelds, games and accessories. As a repair workshop, we will clean and test every second-hand unit before it goes on the shelf, so you get a console that works for a fraction of the new price. It is also a good way to pick up a previous-generation system for the kids or a second room.",
  },
  {
    icon: ArrowLeftRight,
    title: "Trade-Ins",
    body: "Bring in the consoles, games and accessories you have finished with and trade them towards something new or pre-owned in store. Trade-in offers will depend on the item's condition, whether it is complete with its cables and controllers, and current demand. Like any second-hand dealer, we will need to see photo ID for every trade.",
  },
  {
    icon: Joystick,
    title: "Retro Gaming",
    body: "Older consoles, cartridges and games from earlier generations, as they come in through trade-ins. Retro stock is one-of-a-kind by nature, so what is on the shelf will change week to week. If you are hunting for something in particular, tell us and we will keep an eye out for it.",
  },
];

const expectations = [
  {
    icon: Store,
    title: "In the Mannering Park store",
    body: "The gaming range is going into our existing shopfront at 1/64 Vales Road, alongside the Pop Culture range — the same counter you already bring your laptop to.",
  },
  {
    icon: Bell,
    title: "Tell us what to stock",
    body: "We would rather stock what people here actually play than guess. Call or email with the consoles, games and accessories you want to see, or the gear you would like to trade, and it will shape the opening range.",
  },
  {
    icon: Cpu,
    title: "Gaming PCs — available now",
    body: "Prefer to play on PC? We already build custom gaming computers to your budget and the games you play, and upgrade existing machines. That service is running today.",
    link: { href: "/custom-built-computers", label: "Custom built computers" },
  },
];

const faqs = [
  {
    q: "When does the gaming range open?",
    a: "We have not locked in an opening date yet. The range is being put together now and will launch at the Mannering Park store alongside our Pop Culture range. Call 0493 145 179 or email sales@koastal.com.au and we will let you know as soon as it lands.",
  },
  {
    q: "Can I buy a console or trade something in right now?",
    a: "Not yet. Nothing on this page is in stock today, and trade-ins have not started — this page is a preview of what is coming. Our computer repairs, custom gaming PC builds, data recovery and web design services are all running as normal in the meantime.",
  },
  {
    q: "Which consoles will you stock?",
    a: "We are planning to carry PlayStation, Xbox and Nintendo Switch as the core lines, with games and accessories for each, plus pre-owned and retro systems as they come in through trade-ins.",
  },
  {
    q: "How will trade-ins work?",
    a: "Bring the item in and we will look it over and test it at the counter. What we can offer will depend on its condition, whether it is complete with its cables, controllers and box, and how much demand there is for it. You will need photo ID to trade, as second-hand dealers are required to record who they buy from.",
  },
  {
    q: "Will second-hand consoles be tested?",
    a: "Yes. Repairs are what we do every day, so every pre-owned console, handheld and controller will be cleaned and tested in our workshop before it is put on sale.",
  },
  {
    q: "Will you take pre-orders on new games?",
    a: "That is the plan. We intend to take pre-orders on upcoming releases and consoles so you can collect locally on launch day instead of waiting on a delivery.",
  },
  {
    q: "Where will the range be?",
    a: "At our Mannering Park store, 1/64 Vales Road, Mannering Park NSW 2259 — serving gamers across the Central Coast and Lake Macquarie. Same location, same family-run team that has been doing repairs here since 2011.",
  },
];

export default function GamingPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Gaming, Consoles & Trade-Ins Central Coast | Koastal Kollective",
    description:
      "Video games, game consoles, accessories, tested second-hand units and trade-ins coming soon to Koastal Kollective in Mannering Park — serving gamers across the Central Coast & Lake Macquarie.",
  });

  // Deliberately no `offers`: an OfferCatalog would assert these are available
  // to buy, and nothing here has opened yet. Add them when the range launches.
  useStructuredData(
    serviceGraph({
      path: "/gaming",
      serviceType:
        "Video games, game consoles, gaming accessories, second-hand consoles and trade-ins",
      name: "Gaming & Consoles — Koastal Kollective",
      description:
        "Video games, game consoles, controllers and accessories, tested second-hand units, retro gaming and trade-ins coming soon to the Koastal Kollective store in Mannering Park, serving the Central Coast and Lake Macquarie. Not yet open — register your interest on 0493 145 179.",
      breadcrumbName: "Gaming & Consoles",
    }),
    "gaming",
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
              alt="Koastal Kollective Gaming &amp; Consoles Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Gaming &amp; Consoles · Central Coast &amp; Lake Macquarie
              </p>
              <span className="inline-block bg-amber-500 text-white font-black text-xs md:text-sm uppercase tracking-[0.15em] px-4 py-2 rounded-full shadow mb-4">
                Coming Soon
              </span>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Gaming &amp; Consoles<br />
                <em className="text-[#007b7d] not-italic">Coming to Mannering Park.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Video Games · Consoles · Accessories · Second-Hand Units · Trade-Ins · Retro
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                A gaming range is coming to the Koastal Kollective store in Mannering Park — new
                games and consoles for PlayStation, Xbox and Nintendo, controllers and accessories,
                and a range of second-hand units cleaned and tested in our own workshop. You will
                also be able to trade in the games and gear you have finished with. It is not open
                yet, but you can tell us what to stock and be first to know when it lands.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#ranges" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  What&apos;s Coming
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
      <section className="relative">
        <img
          src="/images/custom-gaming-pc.webp"
          alt="Gaming setup with consoles, controllers and accessories"
          className="w-full h-72 md:h-96 object-cover"
        />
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 pointer-events-none">
          <div className="bg-amber-500 text-white font-black text-2xl md:text-4xl uppercase tracking-[0.15em] px-8 py-4 rounded-2xl shadow-2xl border-4 border-white/30 rotate-[-3deg]">
            Coming Soon
          </div>
        </div>
      </section>

      {/* ─── Not open yet notice ─── */}
      <section className="bg-amber-50 border-b border-amber-200 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-amber-900 text-sm md:text-base leading-relaxed">
            <strong className="font-bold">Not open yet.</strong> Nothing on this page is in stock
            today and trade-ins have not started — it is a preview of the range we are building.
            Our computer repairs, custom gaming PC builds, data recovery and web design services
            are all running as normal. Call{" "}
            <a href="tel:+61493145179" className="font-bold underline hover:text-amber-700">
              0493 145 179
            </a>{" "}
            to register your interest and be told first when it lands.
          </p>
        </div>
      </section>

      {/* ─── Ranges ─── */}
      <section id="ranges" className="py-14">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
              What&apos;s Coming
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
              New, pre-owned and <em className="not-italic text-[#007b7d]">traded locally</em>
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed">
              From the latest console to a tested second-hand one for the kids&apos; room, and the
              games, controllers and accessories to go with it — plus somewhere local to trade in
              what you no longer play.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ranges.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="w-12 h-12 rounded-full bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── What to expect ─── */}
      <section className="py-14 bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              How it will work
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {expectations.map(({ icon: Icon, title, body, link }) => (
              <div key={title} className="bg-white border border-gray-100 rounded-lg p-6">
                <Icon className="h-7 w-7 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
                {link && (
                  <Link href={link.href} className="inline-block mt-3 text-sm font-bold text-[#007b7d] hover:underline">
                    {link.label} &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4 leading-tight">
            Want to be told the moment it opens?
          </h2>
          <p className="text-white/80 leading-relaxed mb-8 max-w-2xl mx-auto">
            Give us a call or send an email with the consoles and games you play, or the gear you
            are thinking of trading in. We will add you to the list and let you know before the
            range is announced publicly — and what you tell us genuinely shapes what goes on the
            shelves.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="tel:+61493145179" className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2">
              <Phone className="h-4 w-4" /> Call 0493 145 179
            </a>
            <a href="mailto:sales@koastal.com.au" className="border-2 border-white text-white hover:bg-white hover:text-[#007b7d] font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2">
              <Mail className="h-4 w-4" /> sales@koastal.com.au
            </a>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
            Gaming &amp; Consoles — Questions
          </h2>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SEO long-form ─── */}
      <section className="py-14">
        <div className="max-w-4xl mx-auto px-4 space-y-5 text-[15px] text-gray-700 leading-relaxed">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-6">
            Gaming, Consoles &amp; Trade-Ins on the Central Coast
          </h2>
          <p>
            Koastal Kollective has been a family-run computer repair shop in Mannering Park since
            2011, serving the Central Coast and Lake Macquarie. The gaming range is the next thing
            we are building, alongside our{" "}
            <Link href="/pop-culture" className="font-bold text-[#007b7d] hover:underline">
              Pop Culture range
            </Link>{" "}
            — new games and consoles, controllers and accessories, second-hand units and trade-ins,
            in the same shopfront at 1/64 Vales Road that people already bring their laptops to.
          </p>
          <p>
            Second-hand is where a repair workshop has an edge. Every pre-owned console, handheld
            and controller will be cleaned and tested by the same people who fix computers here
            every day before it is put on sale. That means a working PlayStation, Xbox or Nintendo
            system for a fraction of the new price, and a local counter to come back to if you have
            a question about it.
          </p>
          <p>
            Trade-ins will close the loop. Instead of a console sitting unused in a cupboard or a
            stack of finished games gathering dust, you will be able to bring them in and put their
            value towards something new or pre-owned. Offers will depend on condition,
            completeness and demand, and you will need photo ID to trade.
          </p>
          <p>
            It is not open yet. If you play on the Central Coast and are tired of driving to
            Newcastle or Sydney for consoles, accessories or pre-owned games, tell us what you want
            to see — the opening range is being shaped by what people here actually ask for. If you
            would rather play on PC, our{" "}
            <Link href="/custom-built-computers" className="font-bold text-[#007b7d] hover:underline">
              custom gaming PC builds
            </Link>{" "}
            are available today.
          </p>
          <p>
            To register your interest or tell us what to stock, call{" "}
            <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">
              0493 145 179
            </a>{" "}
            or email{" "}
            <a href="mailto:sales@koastal.com.au" className="font-bold text-[#007b7d] hover:underline">
              sales@koastal.com.au
            </a>
            . In the meantime, our{" "}
            <Link href="/computer-repairs" className="font-bold text-[#007b7d] hover:underline">
              computer repair
            </Link>{" "}
            and{" "}
            <Link href="/media" className="font-bold text-[#007b7d] hover:underline">
              web design
            </Link>{" "}
            services are running as normal.
          </p>
        </div>
      </section>

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
