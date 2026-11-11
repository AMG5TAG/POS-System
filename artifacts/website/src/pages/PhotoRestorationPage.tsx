import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Images, Wand2, Palette, ScanLine, Heart,
  FolderOpen, Monitor, FileImage, Sparkles,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const services = [
  {
    icon: Palette,
    title: "Faded Colour Photo Restoration",
    body: "Old photographs naturally fade over time as dyes break down and paper yellows. We digitally restore faded photos by analysing the original colour balance, reconstructing lost tones, correcting yellowing and bringing back the vibrancy the photograph originally had. The result looks like the photo was taken yesterday — while keeping its authentic character.",
  },
  {
    icon: Wand2,
    title: "Tear, Crease & Water Damage Repair",
    body: "Photographs that have been torn, creased, water-damaged or eaten by mould can often be fully restored. We digitally repair tears and creases by reconstructing missing image data from surrounding areas. For water damage and mould, we carefully clean the physical print first, then digitally remove stains, spots and discolouration. Even photos you thought were beyond saving can be brought back.",
  },
  {
    icon: ScanLine,
    title: "Professional Photo Scanning & Digitisation",
    body: "We scan your original photographs at high resolution (600 DPI or higher) using professional flatbed scanners with colour calibration. Every scan captures the maximum detail from the original print. We output digital files in your preferred format — JPEG for sharing, TIFF for archival quality, or PNG for lossless preservation. Multiple photos can be batch-scanned efficiently.",
  },
  {
    icon: Monitor,
    title: "Scratch & Dust Removal",
    body: "Old prints stored in albums or boxes often accumulate scratches, dust spots and surface damage. We digitally remove these imperfections while preserving the underlying image detail. Fine scratches on faces, dust on backgrounds and surface marks are carefully retouched so the focus returns to the people and memories in the photograph.",
  },
  {
    icon: FileImage,
    title: "Black & White to Colour Conversion",
    body: "Transform your black and white family photographs into beautiful colour versions. Using advanced colourisation techniques and historical research, we add realistic, historically accurate colour to monochrome photos. Skin tones, clothing, backgrounds and objects are all carefully colour-matched to create a natural result that honours the original moment.",
  },
  {
    icon: Sparkles,
    title: "Photo Enhancement & Sharpening",
    body: "Blurry, out-of-focus or low-resolution photographs can often be significantly improved. We use professional sharpening techniques, detail enhancement and noise reduction to bring clarity back to soft images. While we can't create detail that isn't there, we can maximise what's present — often producing dramatically improved results from photos you thought were too blurry to use.",
  },
];

const process = [
  {
    step: "1",
    title: "Bring or Send Your Photos",
    body: "Bring your photographs to our Mannering Park workshop or mail them to us securely. We handle originals with extreme care and return them undamaged. For large collections, we offer collection and return services within the Central Coast area.",
  },
  {
    step: "2",
    title: "Assessment & Quote",
    body: "We assess each photograph's condition and the level of restoration required. You receive a fixed quote before any work begins. We also advise which photos will benefit most from restoration and which are already in good condition.",
  },
  {
    step: "3",
    title: "High-Resolution Scanning",
    body: "Your photographs are scanned at 600 DPI or higher using professional equipment with colour calibration. We capture every detail from the original print before any digital work begins. The original is then safely stored.",
  },
  {
    step: "4",
    title: "Digital Restoration",
    body: "Our technicians perform careful digital restoration — colour correction, damage repair, enhancement and retouching. Every restoration is done by hand, not by automated software, ensuring the result looks natural and authentic.",
  },
  {
    step: "5",
    title: "Review & Delivery",
    body: "You review the restored images and can request adjustments. Once approved, we deliver high-resolution digital files on USB and can also arrange professional-quality reprints on archival paper if desired.",
  },
];

const faqs = [
  {
    q: "How much does photo restoration cost?",
    a: "Pricing depends on the condition of the original and the level of restoration needed. Minor colour correction and dust removal starts from $25 per photo. Moderate restoration (tears, creases, significant fading) ranges from $50 to $100 per photo. Complex restoration (severe damage, reconstruction of missing areas, colourisation of B&W photos) is quoted individually. We always provide a fixed quote before starting work.",
  },
  {
    q: "Will my original photographs be damaged during restoration?",
    a: "No. We treat originals with the utmost care. The restoration process is entirely digital — we scan the original at high resolution and work on the digital file. Your physical photographs are returned to you exactly as they arrived, undamaged and unaltered. For fragile or extremely damaged originals, we take additional precautions.",
  },
  {
    q: "How long does photo restoration take?",
    a: "Simple restorations are often completed within 2–3 business days. Moderate restoration takes 3–5 days. Complex projects or large collections may take 1–2 weeks. We keep you updated on progress and prioritise urgent requests when time is sensitive — such as for funeral slideshows or anniversary gifts.",
  },
  {
    q: "Can you restore photos that are torn in half?",
    a: "In most cases, yes. Even photographs torn into multiple pieces can often be digitally reassembled. We scan each fragment, align them precisely, and reconstruct the missing image data where the tear passes through important areas. We've restored wedding photos, baby photos and family portraits that were torn decades ago.",
  },
  {
    q: "Can you print restored photos?",
    a: "Yes. We can arrange professional-quality reprints on archival paper that will last for generations. These prints are chemically stable, fade-resistant and suitable for framing, albums or gifting. We can print at any size from small wallet prints to large canvas enlargements.",
  },
  {
    q: "Do you restore digital photos too?",
    a: "Absolutely. If you have digital photos that are blurry, poorly exposed, have unwanted objects or people, or need general improvement, we can enhance them digitally. We also recover and restore corrupted digital image files when possible.",
  },
];

export default function PhotoRestorationPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Photo Restoration Central Coast | Old Photo Repair",
    description: "Faded, torn and water-damaged photo restoration on the Central Coast. Skilled retouching, colour correction and reprints of your family photos.",
  });

  useStructuredData(
    serviceGraph({
      path: "/photo-restoration",
      serviceType: "Photo Restoration",
      name: "Photo Restoration Central Coast",
      description: "Restoration of faded, torn and water-damaged photos, with colour correction and reprints.",
      breadcrumbName: "Photo Restoration",
    }),
    "photo-restoration",
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
              alt="Koastal Kollective Photo Restoration Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Photo Restoration &amp; Digitisation · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Bringing Old Photos<br />
                <em className="text-[#007b7d] not-italic">Back to Life.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                Faded Photo Repair · Tear &amp; Crease Restoration · Colour Correction · Scanning &amp; Digitisation · B&amp;W to Colour · Photo Enhancement
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Professional photo restoration services on the Central Coast and Lake Macquarie. We repair faded, torn, water-damaged and creased photographs — digitally restoring colour, fixing damage and creating beautiful digital versions you can treasure forever.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#services" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Restoration Services
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
          src="/images/photo-restoration.webp"
          alt="Photo restoration before and after on screen"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── SEO intro ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            Old photographs are some of the most precious possessions a family owns — but time is unkind to them. Colours fade, paper yellows, creases deepen into tears, water stains bloom across faces, and mould slowly eats away at memories. If you have <strong>damaged, faded or deteriorating family photographs</strong> in albums, boxes or frames, Koastal Kollective in Mannering Park offers <strong>professional photo restoration</strong> on the Central Coast and Lake Macquarie that can bring them back to life.
          </p>
          <p>
            We restore <strong>faded colours, repair tears and creases, remove water damage and mould stains, sharpen blurry images, convert black and white photos to colour</strong>, and create <strong>high-resolution digital scans</strong> that preserve your memories for generations. Every restoration is done by hand with careful attention to detail — not by automated software. The result is a restored photograph that looks natural, authentic and emotionally true to the original moment.
          </p>
          <p>
            Whether you need a single treasured portrait restored for framing, a whole box of family photos digitised and repaired, or old photographs enhanced for a <strong>funeral slideshow or memorial tribute</strong>, we handle every image with the care it deserves. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> or bring your photographs to our workshop for a free assessment.
          </p>
        </div>
      </section>

      {/* ─── Old photos image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/old-photos.webp"
              alt="Collection of old vintage family photographs"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            Every photograph holds a story worth preserving.
          </p>
        </div>
      </section>

      {/* ─── Services ─── */}
      <section id="services" className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Do</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Photo Restoration Services</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              Every restoration is done by hand with professional tools. No automated shortcuts. Just careful, respectful work.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {services.map(({ icon: Icon, title, body }) => (
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

      {/* ─── Process ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">The Process</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">How Photo Restoration Works</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              Simple, careful and respectful. Your originals are safe in our hands.
            </p>
          </div>
          <div className="space-y-4">
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
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Heart className="h-12 w-12 text-[#7bb8bd] mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Your Family's Memories Deserve to Be Preserved.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            Old photographs are irreplaceable. Every year they fade a little more. The best time to restore them is now — before more detail is lost forever.
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

      {/* ─── FAQ ─── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Photo Restoration Questions</h2>
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
              Why Old Photographs Deteriorate — And Why Restoration Matters
            </h2>
            <p>
              Photographs are fragile. Colour dyes fade when exposed to light. Paper yellows and becomes brittle with age. Humidity causes mould and water damage. Physical handling creates creases, tears and fingerprints. Even photographs stored carefully in albums slowly degrade over decades. The result is a gradual loss of the visual record of your family's history — faces become harder to recognise, colours lose their warmth, and details that once felt vivid become muted ghosts. <strong>Photo restoration</strong> halts this decay by creating high-quality digital versions that preserve every remaining detail, then digitally repairing the damage to restore the photograph's original appearance.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Photo Scanning &amp; Digitisation for the Central Coast
            </h2>
            <p>
              Before any restoration work begins, we <strong>professionally scan your photographs</strong> at high resolution. This serves two purposes: it creates a digital backup that can never deteriorate, and it provides the working file for restoration. Our scans capture every detail from the original print — grain, texture, tonal range and subtle colour shifts. We use professional flatbed scanners with colour calibration, not consumer-grade equipment. The result is archival-quality digital files that you can store on USB, share with family, print at any size, or include in <strong>digital slideshows and memorial tributes</strong>. For families with large collections, we offer batch scanning services that efficiently digitise entire albums and shoeboxes of photographs.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Restoring Photos for Funeral Slideshows &amp; Memorial Tributes
            </h2>
            <p>
              One of the most meaningful uses of photo restoration is creating <strong>funeral slideshows and memorial video tributes</strong>. When a loved one passes, family members often want to gather every photograph they can find — but many are faded, damaged or poorly preserved. We restore these photographs to their best possible condition, then incorporate them into flowing, dignified slideshows set to meaningful music. This service combines our photo restoration expertise with our <strong>funeral slideshow creation service</strong>. If you're preparing a memorial tribute, bring us your photographs — however faded or damaged — and we'll restore them and create something beautiful to honour their memory.
            </p>
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
