import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Image, Music, Film, Sparkles, Heart, Shield,
  Share2, HardDrive, Download, AlertTriangle, Clock3, ShoppingCart,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

/* The conversion services in the online shop (koastal.com.au/shop) — the same
   ids in dev and production, so Buy Now opens that product's page. The shop is
   a separate app, so these links are plain <a>s (a full page load). Film &
   negative scanning and photo restoration have no shop product of their own,
   so their cards keep the enquiry buttons only. */
const VIDEO_CONVERSION_PRODUCT_ID = 1000046; // DVD / VHS / tape
const PHOTO_CONVERSION_PRODUCT_ID = 1000047; // photos
const shopProductUrl = (id: number) => `/shop/product/${id}`;

const services = [
  {
    image: "/images/old-photo-albums.webp",
    badge: "Most Popular",
    badgeColour: "bg-[#007b7d]",
    badgeText: "text-white",
    icon: Image,
    title: "Photo Scanning & Digitisation",
    shopProductId: PHOTO_CONVERSION_PRODUCT_ID as number | undefined,
    tagline: "Give your printed memories a digital life — forever.",
    description:
      "Boxes of loose prints, old photo albums, school photos, wedding shots, family portraits — we scan them all at high resolution so they're preserved perfectly in digital format. Once scanned, your photos can be shared with family anywhere in the world, printed again, or simply kept safe forever on a USB or in the cloud.",
    features: [
      "High-resolution scanning at 600dpi or higher",
      "All formats: loose prints, albums, wallets and enlargements",
      "Digital files ready to share, print or post online",
      "Colour and black & white photos both handled",
      "Photos returned to you in the same condition",
      "Delivered on USB drive or via download link",
    ],
  },
  {
    image: "/images/cassette-tapes.webp",
    badge: "Save Your Music",
    badgeColour: "bg-[#7bb8bd]",
    badgeText: "text-gray-900",
    icon: Music,
    title: "Cassette Tape to Digital",
    shopProductId: VIDEO_CONVERSION_PRODUCT_ID as number | undefined,
    tagline: "Your mixtapes and recordings deserve to be heard again.",
    description:
      "Whether it's a cherished mixtape from the 80s, a home recording of a family member singing, a live performance, or a spoken word recording, cassette tapes don't last forever. We convert them to high-quality MP3 or WAV files so you can listen on any device — or burn them to CD for the car.",
    features: [
      "Standard audio cassette and compact cassette formats",
      "High-quality MP3 and WAV output",
      "Includes basic audio clean-up to reduce hiss and noise",
      "Home recordings, music, interviews and voice memos",
      "Great for preserving family voices and oral histories",
      "Delivered on USB or via download — your choice",
    ],
  },
  {
    image: "/images/photo-film-negatives.webp",
    badge: "Analogue to Digital",
    badgeColour: "bg-[#005f61]",
    badgeText: "text-white",
    icon: Film,
    title: "Film & Negative Scanning",
    shopProductId: undefined as number | undefined,
    tagline: "Unlock the photos that never made it to a print.",
    description:
      "Old film rolls, negatives and slides contain photos that were never printed — or prints that have since been lost. We scan your film negatives and slides to produce high-quality digital images that can be printed, shared or preserved. Often the resolution from a scanned negative is better than the original print.",
    features: [
      "35mm negatives and slides (most common format)",
      "120mm medium format negatives",
      "Old film rolls that were never developed — bring them in",
      "High-resolution scans that can be printed large",
      "Colour negative, black & white and slide film",
      "Digital files ready to view, share or professionally print",
    ],
  },
  {
    image: "/images/photo-restoration.webp",
    badge: "Restore the Irreplaceable",
    badgeColour: "bg-[#007b7d]",
    badgeText: "text-white",
    icon: Sparkles,
    title: "Photo Restoration",
    shopProductId: undefined as number | undefined,
    tagline: "Torn. Faded. Water-damaged. We bring them back.",
    description:
      "A torn wedding photo. A faded portrait of a grandparent. A water-damaged family photo from a flood. Some photos are the only record of a person or a moment that exists — and when they're damaged, it can feel like losing that memory all over again. Our photo restoration service brings damaged photographs back to life using professional digital tools.",
    features: [
      "Torn, creased and physically damaged photos",
      "Faded and discoloured prints restored to original tones",
      "Water and mould damage carefully repaired",
      "Colour correction for old and aged photographs",
      "Faces and detail brought back from deteriorated prints",
      "High-resolution restored digital file delivered",
    ],
  },
];

const advantages = [
  {
    icon: Heart,
    title: "Relive Moments You'd Forgotten",
    body: "Digitising your photos, tapes and film brings back moments that have been locked away for decades — a child's first birthday, a grandparent's laugh, a holiday that felt like a lifetime ago. Once digital, those moments are yours again.",
  },
  {
    icon: Share2,
    title: "Share With Every Generation",
    body: "Digital memories can be shared instantly with family anywhere in the world. Children and grandchildren can see what their parents and grandparents looked like as kids. Old recordings can be played at family gatherings, funerals and celebrations.",
  },
  {
    icon: Shield,
    title: "Protect Against Loss Forever",
    body: "Prints fade. Tapes deteriorate. Albums get damaged in fires, floods and house moves. A digital copy stored on a USB and in the cloud is effectively indestructible — your memories protected against anything life throws at them.",
  },
  {
    icon: Clock3,
    title: "Act Before the Damage Is Done",
    body: "Photographic prints fade noticeably within 30–50 years without archival storage. Cassette tapes degrade every year. Colour negatives shift in hue. The longer you wait, the more detail is permanently lost. Now is always the right time.",
  },
  {
    icon: HardDrive,
    title: "Watch and Listen on Any Device",
    body: "Digital files play on phones, laptops, tablets, smart TVs and computers. No special equipment, no rewinding, no tracking lines — just instant access to your memories on whatever screen you're holding.",
  },
  {
    icon: Download,
    title: "Easy to Back Up and Store",
    body: "Once digital, your memories can be copied to multiple devices and backed up to cloud services like Google Photos or iCloud. No single point of failure — your memories exist in as many places as you choose.",
  },
];

const process = [
  {
    step: "1",
    title: "Bring Your Items In",
    body: "Drop your photos, tapes, albums or film into our Mannering Park store. We'll assess them, give you a quote and let you know what we can achieve.",
  },
  {
    step: "2",
    title: "We Scan or Convert",
    body: "Each item is handled with care. Photos are scanned at high resolution, tapes are converted to clean digital audio, and film is digitised frame by frame.",
  },
  {
    step: "3",
    title: "Restoration if Needed",
    body: "For damaged photos, we apply professional digital restoration — removing tears, fading, mould and water damage to bring the image back to life.",
  },
  {
    step: "4",
    title: "Your Originals Come Home",
    body: "We return every original item to you in the same condition we received it, along with your digital files on USB, DVD or via download link.",
  },
];

const faqs = [
  {
    q: "What types of photos can you scan?",
    a: "We scan loose prints in any size, photos in albums (we can scan with the album or remove pages), wallet-sized prints, school photos, enlargements and polaroids. Both colour and black & white.",
  },
  {
    q: "Can you scan really old or damaged photos?",
    a: "Yes — in fact these are the most important ones to scan. Bring them in and we'll let you know what's possible. Very fragile items are handled with extra care. For severely damaged photos, our restoration service can repair them digitally after scanning.",
  },
  {
    q: "What cassette tape formats do you handle?",
    a: "Standard compact audio cassettes (the most common format from the 70s, 80s and 90s). If you have a different format, bring it in and we'll take a look.",
  },
  {
    q: "I have old film negatives — are they worth scanning?",
    a: "Absolutely. Negatives often contain far more detail than the prints made from them, and scanned negatives can produce outstanding large-format prints. If you have negatives from rolls you never had developed, those can sometimes be scanned too — bring them in.",
  },
  {
    q: "How does photo restoration work?",
    a: "We scan the original damaged photo at high resolution, then use professional digital tools to repair tears, remove stains and mould, restore faded colour, rebuild missing areas and sharpen blurred detail. The result is a digital file that looks as good as — or better than — the original photo did when it was new.",
  },
  {
    q: "What format will my digital files be in?",
    a: "Photos are delivered as high-resolution JPG or TIFF files. Audio is delivered as MP3 or WAV. All formats are compatible with phones, computers, tablets and smart TVs.",
  },
  {
    q: "How long does it take?",
    a: "Turnaround depends on the volume and type of work. A small batch of photos can often be done within a few days. Larger jobs, restorations or film scanning may take longer. We'll give you an estimate when you drop items in.",
  },
];

export default function DigitalConversionsPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Digital Conversions Central Coast | Photo, Film & Tape",
    description: "Photos, slides, cassettes, vinyl, VHS & cine film converted to digital on the Central Coast. Restoration available — keep your family memories alive.",
  });

  useStructuredData(
    serviceGraph({
      path: "/digital-conversions",
      serviceType: "Media Digitisation",
      name: "Digital Conversions Central Coast",
      description: "Photos, slides, cassettes, vinyl, VHS and cine film converted to digital.",
      breadcrumbName: "Digital Conversions",
    }),
    "digital-conversions",
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
              alt="Koastal Kollective Digital Conversions Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Digital Conversions · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Your Memories Are Fading.<br />
                <em className="text-[#007b7d] not-italic">We Can Save Them.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Photos · Cassette Tapes · Film &amp; Negatives · Photo Restoration
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                We convert and preserve your irreplaceable analogue memories into high-quality digital files — so you can relive, share and protect them forever.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="#services"
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  Our Services
                </a>
                <a
                  href={shopProductUrl(VIDEO_CONVERSION_PRODUCT_ID)}
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                  aria-label="Buy video and tape conversion now in our online shop"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Buy Video &amp; Tape
                </a>
                <a
                  href={shopProductUrl(PHOTO_CONVERSION_PRODUCT_ID)}
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                  aria-label="Buy photo conversion now in our online shop"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Buy Photos
                </a>
                <a
                  href="tel:+61493145179"
                  className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  Call 0493 145 179
                </a>
                <a
                  href="https://wa.me/61493145179"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  WhatsApp Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Urgency banner ─── */}
      <section className="bg-amber-50 border-y border-amber-200 py-5">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-amber-900 text-base">Your analogue memories are degrading right now.</p>
            <p className="text-amber-800 text-sm">
              Printed photos fade within decades. Cassette tapes lose quality every year. Film negatives shift in colour over time. Once the detail is gone — it's gone forever.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Hero image ─── */}
      <section>
        <img
          src="/images/old-photo-albums.webp"
          alt="Old photo albums and printed photographs ready for digitisation"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── Intro copy ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-8 text-base md:text-lg text-gray-700 leading-relaxed text-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              There Are Memories in That Box You Haven't Seen in Years.
            </h2>
            <p>
              Most Australian families have boxes of old photos stored in wardrobes and garages. Albums full of printed memories from the 70s, 80s and 90s. Cassette tapes of recordings that can no longer be played because there's no player left in the house. Film rolls that were never developed. A damaged photo that's the only image anyone has of a loved one who has passed. All of these things carry irreplaceable value — and all of them are slowly deteriorating.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Digital Means Safe, Shareable and Alive Again.
            </h2>
            <p>
              Once your photos, tapes and film are digital, they're protected. They can be backed up to the cloud, shared with family via WhatsApp, displayed at family events, printed as gifts and passed down through generations without losing any quality. A digital file doesn't fade, doesn't warp and doesn't get damaged in a flood. It just sits there, perfect, waiting for the moment you want to relive it.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Handled With Care by Local Technicians You Can Trust.
            </h2>
            <p>
              You don't post your irreplaceable memories to a faceless service overseas. You bring them to Aaron and the team at our Mannering Park store, hand them over in person, and collect them — with your new digital files — when they're ready. Every original item is returned in the same condition we received it. Call us on{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a>{" "}
              or drop in to get started.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Services ─── */}
      <section id="services" className="bg-gray-50 py-14 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Convert</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Four Ways We Preserve Your Past</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              Each service is handled carefully and returned with high-quality digital files you can share, print and keep forever.
            </p>
          </div>

          <div className="space-y-16">
            {services.map((svc, i) => (
              <div
                key={svc.title}
                className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} gap-8 items-center bg-white rounded-2xl shadow-md overflow-hidden`}
              >
                <div className="md:w-1/2 w-full flex-shrink-0">
                  <img
                    src={svc.image}
                    alt={svc.title}
                    className="w-full h-72 md:h-96 object-cover"
                  />
                </div>
                <div className="md:w-1/2 px-6 pb-8 md:py-8 md:px-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${svc.badgeColour} ${svc.badgeText}`}>
                      {svc.badge}
                    </span>
                    <div className="w-9 h-9 rounded-full bg-[#007b7d]/10 text-[#007b7d] flex items-center justify-center flex-shrink-0">
                      <svc.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{svc.title}</h3>
                  <p className="text-[#007b7d] font-semibold text-base">{svc.tagline}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{svc.description}</p>
                  <ul className="space-y-1.5">
                    {svc.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-[#007b7d] flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {svc.shopProductId !== undefined && (
                      <a
                        href={shopProductUrl(svc.shopProductId)}
                        className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                        aria-label={`Buy ${svc.title} now in our online shop`}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy Now
                      </a>
                    )}
                    <a
                      href="#contact"
                      className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Enquire Now
                    </a>
                    <a
                      href="tel:+61493145179"
                      className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Call Us
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Convert ─── */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Convert</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">6 Reasons to Act Now</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              Every year you wait, a little more detail is permanently lost. Here's why converting your memories to digital is one of the most important things you can do.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {advantages.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Emotional CTA ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Heart className="h-12 w-12 text-[#7bb8bd] mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            The Photos of People Who Are No Longer With You.<br />
            The Voice on That Cassette. The Negatives in the Drawer.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            These things cannot be recreated. But they can be preserved — and they can be shared with the generations who come after. Don't leave it until it's too late. Let Koastal Kollective help you bring them back.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={shopProductUrl(VIDEO_CONVERSION_PRODUCT_ID)}
              className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-8 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
              aria-label="Buy video and tape conversion now in our online shop"
            >
              <ShoppingCart className="h-4 w-4" />
              Buy Video &amp; Tape
            </a>
            <a
              href={shopProductUrl(PHOTO_CONVERSION_PRODUCT_ID)}
              className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-8 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
              aria-label="Buy photo conversion now in our online shop"
            >
              <ShoppingCart className="h-4 w-4" />
              Buy Photos
            </a>
            <a href="tel:+61493145179" className="border-2 border-white text-white hover:bg-white hover:text-[#007b7d] font-bold px-8 py-3 rounded-full text-sm transition-colors">
              Call 0493 145 179
            </a>
            <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="process" className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">The Process</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">How It Works</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">Simple, straightforward and handled entirely in-store by our local team.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {process.map(({ step, title, body }) => (
              <div key={step} className="bg-white border border-gray-200 rounded-xl p-6 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#007b7d] text-white font-bold flex items-center justify-center text-lg">
                  {step}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-[#007b7d] text-white rounded-xl p-6 text-center">
            <p className="font-bold text-lg mb-1">Drop In at Our Mannering Park Store</p>
            <p className="text-white/80 text-sm">Shop 1/64 Vales Road, Mannering Park, NSW, 2259 · Open Monday–Friday 10am–5pm</p>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Frequently Asked Questions</h2>
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
