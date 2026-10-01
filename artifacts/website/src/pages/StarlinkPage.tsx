import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Wifi, Rocket, Globe, Zap, Shield, Download, Tv, Gamepad2,
  Cloud, Home, Wrench, Truck, Headphones, Star, ArrowRight,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const advantages = [
  {
    icon: Wifi,
    title: "Blazing Fast Satellite Internet",
    body: "Starlink delivers download speeds of 50–250 Mbps and upload speeds of 10–40 Mbps — far faster than traditional satellite or fixed wireless. Stream 4K video, download large files, and video conference without buffering, no matter how remote your Central Coast or Lake Macquarie property is.",
  },
  {
    icon: Globe,
    title: "Coverage Where NBN Can't Reach",
    body: "Many rural and semi-rural properties around Mangrove Mountain, Kulnura, Dooralong, and parts of Lake Macquarie simply cannot get reliable NBN. Starlink's low-Earth orbit satellite constellation provides high-speed internet to properties that copper, fibre, and fixed wireless can't service.",
  },
  {
    icon: Zap,
    title: "Low Latency for Real-Time Applications",
    body: "Unlike older geostationary satellite services with 600ms+ latency, Starlink operates at roughly 20–40ms latency. That means smooth online gaming, responsive video calls, and lag-free browsing — comparable to cable or fibre internet.",
  },
  {
    icon: Download,
    title: "Unlimited Data — No Caps",
    body: "Starlink offers truly unlimited data with no fair-use policies or speed throttling after a certain threshold. Download, stream, work, and learn as much as you need without worrying about overage charges or reduced speeds.",
  },
  {
    icon: Shield,
    title: "Reliable in Bad Weather",
    body: "Starlink's dish is designed to melt snow and withstand heavy rain, wind, and extreme temperatures. While all satellite services can experience brief interruptions during severe storms, Starlink's robust hardware and self-aligning dish maintain connection better than any previous satellite option available in Australia.",
  },
  {
    icon: Tv,
    title: "Perfect for Streaming & Smart Homes",
    body: "Run multiple 4K TVs, smart speakers, security cameras, and IoT devices simultaneously without slowdown. Starlink's mesh Wi-Fi capabilities let you extend coverage across large rural properties, barns, granny flats, and outbuildings.",
  },
  {
    icon: Rocket,
    title: "Easy Self-Installation Option",
    body: "Starlink kits come with everything needed for DIY setup: the dish, stand, cable, Wi-Fi router, and power supply. The dish auto-aligns itself using built-in motors — no technician required. However, many customers prefer professional installation for optimal roof mounting and cable routing.",
  },
  {
    icon: Gamepad2,
    title: "Great for Online Gaming",
    body: "With latency low enough for competitive gaming, Starlink supports PlayStation, Xbox, PC, and Nintendo Switch online play. Parents and kids alike can enjoy online multiplayer, game downloads, and streaming without the frustration of high ping or connection drops.",
  },
];

const whyKoastal = [
  "Authorised Starlink reseller — genuine kits with full manufacturer warranty",
  "Professional installation with optimal roof or pole mounting for best signal",
  "Internal cable routing through walls and ceilings — no messy external cables",
  "Mesh Wi-Fi setup to extend coverage across large properties and outbuildings",
  "Network configuration including smart TVs, security cameras, and IoT devices",
  "Ongoing local support — we answer the phone and come to your property",
  "Bundle discounts when combined with computer repairs or IT support services",
  "Available for homes, farms, holiday properties, and small businesses",
];

const useCases = [
  {
    title: "Rural Homes & Acreages",
    desc: "Properties in Kulnura, Mangrove Mountain, Dooralong, and Jilliby where NBN fixed wireless is patchy or unavailable. Starlink provides reliable, fast internet for families who work from home, kids doing online school, and streaming entertainment.",
  },
  {
    title: "Farms & Agricultural Properties",
    desc: "Modern farming depends on internet-connected equipment, weather monitoring, online marketplaces, and remote consultation with agronomists. Starlink keeps your farm office connected even when mobile coverage is non-existent.",
  },
  {
    title: "Holiday Homes & Airbnb Properties",
    desc: "Give your guests the high-speed internet they expect. Starlink is perfect for holiday rentals in remote coastal areas where tourists need reliable Wi-Fi for work, entertainment, and sharing their experience on social media.",
  },
  {
    title: "Home-Based Businesses",
    desc: "Graphic designers, web developers, consultants, and remote workers need reliable internet with low latency. Starlink provides the performance needed for video calls, cloud software, and large file transfers from any location.",
  },
  {
    title: "Seniors & Pensioners in Remote Areas",
    desc: "Stay connected with family via video calls, access telehealth services, stream favourite shows, and shop online safely. We offer a 10% pensioner discount and patient, jargon-free setup assistance.",
  },
  {
    title: "Small Businesses & Offices",
    desc: "Cafes, retail shops, trades offices, and professional services in areas with poor NBN can rely on Starlink for point-of-sale systems, cloud accounting, customer Wi-Fi, and daily operations.",
  },
];

const installationSteps = [
  {
    step: "1",
    title: "Consultation & Site Assessment",
    desc: "We assess your property, identify the best mounting location for clear sky visibility, and determine cable routing and mesh Wi-Fi needs.",
  },
  {
    step: "2",
    title: "Kit Supply & Delivery",
    desc: "We supply a genuine Starlink kit with full warranty. No grey-market imports, no second-hand dishes — brand new, sealed, and backed by Starlink.",
  },
  {
    step: "3",
    title: "Professional Installation",
    desc: "Our technicians mount the dish on your roof or a custom pole, route cables neatly through walls, set up the router, and configure your network name and password.",
  },
  {
    step: "4",
    title: "Device Connection & Testing",
    desc: "We connect all your devices — laptops, phones, TVs, printers, cameras — and test speeds throughout your property to ensure full coverage.",
  },
  {
    step: "5",
    title: "Ongoing Local Support",
    desc: "If you ever have issues, slow speeds, or need to add devices, just call us. We're local, we come to you, and we speak plain English.",
  },
];

const faqs = [
  {
    q: "How fast is Starlink compared to NBN?",
    a: "Starlink typically delivers 50–250 Mbps download and 10–40 Mbps upload, which is comparable to or faster than many NBN fibre-to-the-node (FTTN) and fixed wireless connections. Unlike NBN, Starlink speed does not degrade with distance from an exchange or tower.",
  },
  {
    q: "Can I use Starlink if I already have NBN?",
    a: "Yes. Many customers keep their NBN as a backup or switch entirely to Starlink for better performance. We can help you evaluate whether Starlink is the right choice for your property and usage needs.",
  },
  {
    q: "Does Starlink work in heavy rain or storms?",
    a: "Starlink is designed for all-weather operation. The dish heats itself to melt snow and handles heavy rain and wind well. Brief interruptions can occur during severe thunderstorms, but performance generally returns quickly once the weather passes.",
  },
  {
    q: "Do I need a clear view of the sky?",
    a: "Yes. Starlink needs an unobstructed view of the northern sky (in Australia) with no tall trees, buildings, or hills blocking the signal. During our site assessment, we identify the best mounting location to guarantee a clear view.",
  },
  {
    q: "Can you install Starlink on a roof, pole, or wall?",
    a: "Absolutely. We offer roof mounting, custom pole installation, wall brackets, and portable stand setups. Roof mounting generally provides the best performance and keeps the dish out of the way. We handle all installation professionally.",
  },
  {
    q: "What is the monthly cost of Starlink?",
    a: "Starlink's residential plan in Australia costs approximately $139 per month with a one-time hardware fee for the dish and router. Business and mobility plans are also available. Contact us for the most current pricing and any promotions.",
  },
  {
    q: "Do you offer pensioner discounts?",
    a: "Yes. We offer a 10% discount on Starlink installation labour for pensioners and seniors. We also provide patient, friendly setup assistance with no technical jargon.",
  },
  {
    q: "How quickly can you install Starlink?",
    a: "Once your kit arrives, we can typically schedule installation within 2–5 business days across the Central Coast and Lake Macquarie. Rural properties may take slightly longer depending on travel distance, but we prioritise quick turnaround.",
  },
];

export default function StarlinkPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Starlink Installation Central Coast | Satellite Internet",
    description: "Starlink satellite internet supply and installation on the Central Coast. Genuine kit, professional roof mount and full home network setup.",
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
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Starlink Satellite Internet
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                High-Speed Internet, <em className="text-[#007b7d] not-italic">Anywhere</em>.
              </h1>
              <p className="text-gray-600 leading-relaxed mt-4 max-w-2xl mx-auto">
                Starlink brings blazing-fast satellite internet to homes, farms, and businesses across the Central Coast and Lake Macquarie — even where NBN can't reach. Buy your Starlink kit from Koastal Kollective for genuine hardware, expert installation, and ongoing local support.
              </p>
              <div className="flex flex-wrap gap-4 justify-center mt-6">
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
          </div>
        </div>
      </section>

      {/* ─── Hero Image ─── */}
      <section className="py-0">
        <img
          src="/images/starlink-hero.webp"
          alt="Starlink satellite dish on a rural Australian property"
          className="w-full h-56 md:h-80 object-cover"
        />
      </section>

      {/* ─── SEO Intro Paragraph ─── */}
      <section className="bg-white py-10 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-gray-600 leading-relaxed text-lg">
            If you live on the Central Coast, Lake Macquarie, or in surrounding rural areas and struggle with slow, unreliable, or unavailable internet, Starlink is the game-changing solution you've been waiting for. Unlike traditional satellite internet that relies on a single geostationary satellite 35,000 kilometres away, Starlink uses a constellation of thousands of low-Earth orbit satellites — just 550 kilometres above the ground. This revolutionary technology delivers fibre-like speeds and low latency to properties that copper lines, fibre cables, and fixed wireless towers simply cannot reach. Koastal Kollective is your local, trusted partner for Starlink sales, professional installation, and ongoing support across the entire Central Coast and Lake Macquarie region. We supply genuine Starlink hardware, handle roof and pole mounting, configure your home network, connect all your devices, and provide local after-sales support you can count on. Whether you're on an acreage in Kulnura, a farm in Mangrove Mountain, a holiday home in Macmasters Beach, or a home office in Terrigal, we make getting online fast, easy, and stress-free.
          </p>
        </div>
      </section>

      {/* ─── Advantages ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Why Starlink
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-10">
            The Advantages of <em className="text-[#007b7d] not-italic">Starlink</em> Satellite Internet
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {advantages.map((a) => (
              <div
                key={a.title}
                className="flex gap-4 bg-white border border-gray-100 rounded-lg p-5"
              >
                <div className="flex-shrink-0 mt-1">
                  <a.icon className="h-6 w-6 text-[#007b7d]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{a.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use Cases ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Who Needs Starlink
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-10">
            Perfect For Every Type of Property
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {useCases.map((u) => (
              <div key={u.title} className="bg-gray-50 border border-gray-100 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{u.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Buy From Koastal Kollective ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#006a6c]">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Local Advantage
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-10">
            Why Buy Starlink from <em className="text-[#7bb8bd] not-italic">Koastal Kollective</em>?
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {whyKoastal.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#7bb8bd] flex-shrink-0 mt-0.5" />
                <p className="text-white/90 text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <a
              href="tel:+61493145179"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-[#007b7d] font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <Phone className="h-4 w-4" />
              Get a Free Site Assessment
            </a>
          </div>
        </div>
      </section>

      {/* ─── Installation Process ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            How It Works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-10">
            Our Starlink Installation Process
          </h2>
          <div className="grid md:grid-cols-5 gap-4">
            {installationSteps.map((s) => (
              <div key={s.step} className="bg-white border border-gray-100 rounded-lg p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-[#007b7d] text-white font-bold flex items-center justify-center mx-auto mb-3">
                  {s.step}
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-2">{s.title}</h3>
                <p className="text-gray-600 text-xs leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

            <MediaPromo />

      {/* ─── About Us ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">
            About Us
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
            Your Local Starlink Experts
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-3xl mx-auto">
            Koastal Kollective has been serving the Central Coast and Lake Macquarie community since 2011. We understand the unique connectivity challenges faced by rural and semi-rural property owners — because we live here too. From Mangrove Mountain to Macmasters Beach, we know which areas have poor NBN coverage and how Starlink can transform your internet experience. When you buy Starlink from us, you get genuine hardware, professional installation by local technicians, and ongoing support from a team that answers the phone and comes to your door.
          </p>
          <div className="flex flex-wrap justify-center gap-10 mt-8">
            {[
              { value: `${yearsExperience}`, label: "Years Local Experience" },
              { value: "Central Coast", label: "Service Area" },
              { value: "Local", label: "Genuine Support" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-[#007b7d]">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            FAQ
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Starlink Questions & Answers
          </h2>
          <div className="space-y-5">
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
