import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  Shirt, Layers, Boxes, Frame, Bell, Store,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

// The range has not opened yet. Every claim on this page is written in the
// future tense on purpose — nothing here should read as stock you can buy
// today. Revisit the "Coming Soon" badges, the notice band and the FAQ answers
// together when it launches, plus the two overlays on the homepage.
const ranges = [
  {
    icon: Shirt,
    title: "Merchandise & Clothing",
    body: "Officially licensed graphic tees, hoodies, caps and accessories from anime, gaming, movie and TV franchises. We are curating a range that covers the classics people actually ask for alongside current releases, in sizes that go well beyond the usual S–XL. Wearable art you will still want to wear in five years, not fast-fashion prints that crack after three washes.",
  },
  {
    icon: Layers,
    title: "Trading Card Games (TCG)",
    body: "Sealed booster packs, boxes, singles, deck boxes, sleeves and playmats for Pokémon, Magic: The Gathering, Yu-Gi-Oh! and other major games. We will stock current sets as they release, keep a singles cabinet for the cards you need to finish a deck, and carry the protective supplies that keep a collection worth something — sleeves, toploaders, binders and storage.",
  },
  {
    icon: Boxes,
    title: "Collectables & Statues",
    body: "Limited edition figures, Funko Pops, resin statues, scale replicas and display pieces for collectors at every level — from a first vinyl figure on a desk to serious display cabinet centrepieces. We will handle special orders and pre-orders for pieces we do not carry on the shelf, so you are not stuck paying overseas shipping and waiting months.",
  },
  {
    icon: Frame,
    title: "Art & Prints",
    body: "Original artwork from local artists, licensed prints, posters and wall art celebrating iconic characters and stories. We will also carry framing-friendly sizes and can point you at the right mount and frame, so a print you love ends up on the wall instead of in a tube in the cupboard.",
  },
];

const expectations = [
  {
    icon: Store,
    title: "In the Mannering Park store",
    body: "The range is going into our existing shopfront at 1/64 Vales Road — the same counter you already bring your laptop to. Come in for a repair, browse the shelves while you wait.",
  },
  {
    icon: Bell,
    title: "Tell us what to stock",
    body: "We would rather stock what people here actually collect than guess. Call or email with the franchises, games and lines you want to see and it will shape the opening range.",
  },
];

const faqs = [
  {
    q: "When does the Pop Culture range open?",
    a: "We have not locked in an opening date yet. The range is being curated now and will launch at the Mannering Park store. Call 0493 145 179 or email sales@koastal.com.au and we will let you know as soon as it lands, before it is announced publicly.",
  },
  {
    q: "Can I buy anything right now?",
    a: "Not yet. Nothing on this page is currently in stock — it is a preview of what is coming. Our computer repair, data recovery, VHS conversion and web design services are all running as normal in the meantime.",
  },
  {
    q: "Will you take pre-orders or special orders?",
    a: "Yes, that is the plan. For figures, statues and sealed TCG product we do not carry on the shelf, we intend to take special orders and pre-orders so you can get the piece you want locally instead of paying international shipping and waiting months for it to arrive.",
  },
  {
    q: "Which trading card games will you stock?",
    a: "We are planning to carry Pokémon, Magic: The Gathering and Yu-Gi-Oh! as the core lines, with sealed product, singles and protective supplies. If there is another game with a following on the Central Coast that you would like us to carry, tell us — that feedback is genuinely shaping the opening range.",
  },
  {
    q: "Will you buy or trade collections?",
    a: "We are still working out whether we will buy in collections or run trade-ins. If you are thinking of selling or trading a collection, get in touch and we will talk it through with you once the range is closer to opening.",
  },
  {
    q: "Where will the range be?",
    a: "At our Mannering Park store, 1/64 Vales Road, Mannering Park NSW 2259 — serving collectors across the Central Coast and Lake Macquarie. Same location, same family-run team that has been doing repairs here since 2011.",
  },
];

export default function PopCulturePage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Pop Culture Collectables Central Coast | Koastal Kollective",
    description:
      "Pop culture merchandise, trading cards, collectables, statues and art — coming soon to Koastal Kollective in Mannering Park, Central Coast & Lake Macquarie.",
  });

  // Deliberately no `offers`: an OfferCatalog would assert these are available
  // to buy, and nothing here has opened yet. The description carries the
  // coming-soon framing instead. Add the offers when the range launches.
  useStructuredData(
    serviceGraph({
      path: "/pop-culture",
      serviceType:
        "Pop culture merchandise, trading card games, collectables, statues, art and prints",
      name: "Pop Culture & Collectables — Koastal Kollective",
      description:
        "Pop culture merchandise, clothing, trading card games, collectables, statues, art and prints coming soon to the Koastal Kollective store in Mannering Park, serving the Central Coast and Lake Macquarie. Not yet open — register your interest on 0493 145 179.",
      breadcrumbName: "Pop Culture & Collectables",
    }),
    "pop-culture",
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
              alt="Koastal Kollective Pop Culture &amp; Collectables Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Pop Culture &amp; Collectables · Central Coast &amp; Lake Macquarie
              </p>
              <span className="inline-block bg-amber-500 text-white font-black text-xs md:text-sm uppercase tracking-[0.15em] px-4 py-2 rounded-full shadow mb-4">
                Coming Soon
              </span>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Pop Culture &amp; Collectables<br />
                <em className="text-[#007b7d] not-italic">Coming to Mannering Park.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Merchandise &amp; Clothing · Trading Card Games · Collectables &amp; Statues · Art &amp; Prints
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                A curated Pop Culture range is coming to the Koastal Kollective store in Mannering Park — trading cards, collectables, figures, statues, apparel and art from your favourite franchises. It is not open yet, but you can tell us what to stock and be first to know when it lands.
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
          src="/images/pop-culture.webp"
          alt="Pop culture merchandise, collectables and trading cards"
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
            today — it is a preview of the range we are building. Our computer repairs, data
            recovery, VHS conversion and web design services are all running as normal. Call{" "}
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
              Four ranges, <em className="not-italic text-[#007b7d]">curated locally</em>
            </h2>
            <p className="mt-4 text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed">
              We are not trying to be everything to everyone. These are the four areas we are
              building out first, chosen because they are what people on the Central Coast keep
              asking us for.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {ranges.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── What to expect ─── */}
      <section className="py-14 bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              How it will work
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {expectations.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-100 rounded-lg p-6">
                <Icon className="h-7 w-7 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
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
            Give us a call or send an email with the franchises and lines you collect. We will add
            you to the list and let you know before the range is announced publicly — and what you
            tell us genuinely shapes what goes on the shelves.
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
            Pop Culture &amp; Collectables — Questions
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
            Pop Culture &amp; Collectables on the Central Coast
          </h2>
          <p>
            Koastal Kollective has been a family-run computer repair shop in Mannering Park since 2011, serving
            the Central Coast and Lake Macquarie. The Pop Culture range is the next thing we are
            building — a curated selection of merchandise, trading card games, collectables, statues,
            art and prints, in the same shopfront at 1/64 Vales Road that people already bring their
            laptops and MacBooks to.
          </p>
          <p>
            It is not open yet. We are still curating the opening range, which is exactly why we want
            to hear from collectors first. If you play Pokémon, Magic: The Gathering or Yu-Gi-Oh! and
            you are tired of driving to Newcastle or Sydney for sealed product and singles, tell us.
            If you collect Funko Pops, resin statues or scale replicas and you would rather order
            through a local shop than pay overseas shipping, tell us that too. The opening range is
            being shaped by what people here actually ask for.
          </p>
          <p>
            When it launches you will be able to browse the shelves while your repair is being
            looked at, place special orders and pre-orders for pieces we do not stock, and pick up
            the protective supplies — sleeves, toploaders, binders, display cases — that keep a
            collection in the condition it deserves. Same local team, same counter, no call centre.
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
