import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Heart, Music, Film, Images, Shield, Sparkles,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

/* The slideshow service in the online shop (koastal.com.au/shop) — the same id
   in dev and production, so "Order a Slideshow" opens that product's page. The
   shop is a separate app, so these links are plain <a>s (a full page load).
   Worded gently on purpose: families reach this page while grieving. */
const SLIDESHOW_PRODUCT_ID = 1000048;
const slideshowShopUrl = `/shop/product/${SLIDESHOW_PRODUCT_ID}`;

const features = [
  {
    icon: Images,
    title: "Photos Brought Beautifully to Life",
    body: "We carefully select, arrange and enhance your photographs so each one tells part of the story. Every image is timed to flow naturally, creating a seamless visual journey through a life well lived.",
  },
  {
    icon: Music,
    title: "Music That Means Something",
    body: "The right music transforms a slideshow into something deeply moving. We help you choose meaningful songs — a favourite hymn, a cherished track, or something quietly instrumental — and weave them through the presentation with perfect timing.",
  },
  {
    icon: Film,
    title: "Professional Video Editing",
    body: "Smooth transitions, gentle fades, tasteful effects and elegant text overlays for names, dates and captions. Nothing flashy or distracting — just a polished, dignified tribute that does justice to the person being remembered.",
  },
  {
    icon: Sparkles,
    title: "Optional Photo Restoration Included",
    body: "If some of your photos are faded, damaged or discoloured, we can restore them as part of the slideshow. The only image of a loved one shouldn't be held back by age or damage — we can bring it back to clarity.",
  },
  {
    icon: Heart,
    title: "A Keepsake for the Family",
    body: "The finished slideshow is delivered as a high-quality video file on USB — something the family can keep forever, share with relatives overseas, and play again at anniversaries, family gatherings and future memorials.",
  },
  {
    icon: Shield,
    title: "Handled With Sensitivity & Care",
    body: "We understand what you're going through. Every interaction is respectful, patient and understanding. There's no rush, no pressure — just a quiet, professional service designed to ease one small burden during a difficult time.",
  },
];

const process = [
  {
    step: "1",
    title: "Share Your Photos & Wishes",
    body: "Bring your photographs, printed or digital, to our Mannering Park store or send them to us electronically. We'll sit down with you — or speak by phone — to understand what you'd like included, the tone you want, and any music that was special to them.",
  },
  {
    step: "2",
    title: "We Create the Tribute",
    body: "Our technicians carefully assemble your photos into a flowing, elegant slideshow with smooth transitions, tasteful effects and your chosen music. Every choice is made with dignity and respect.",
  },
  {
    step: "3",
    title: "You Review & Approve",
    body: "We show you the slideshow before it's finalised so you can see how it flows and request any changes. We want you to feel completely at peace with the tribute before the day of the service.",
  },
  {
    step: "4",
    title: "Delivered Ready for the Service",
    body: "Your final slideshow is delivered on USB in a format compatible with any funeral venue screen, projector or TV. We can also provide a download link if you need to share it with family or the funeral director ahead of time.",
  },
];

const faqs = [
  {
    q: "How many photos can be included in a funeral slideshow?",
    a: "Most funeral slideshows contain between 30 and 100 photographs, which typically runs for 5 to 15 minutes depending on the pacing and music. We can tailor the length to suit the service programme. Whether you have a small collection or a large archive, we'll help you choose the images that best tell the story.",
  },
  {
    q: "Can we use our own music in the slideshow?",
    a: "Absolutely. In fact, personal music often makes the tribute more meaningful. Bring us the track — on CD, USB, or even as a streaming link — and we'll incorporate it into the slideshow. If you need guidance choosing something appropriate, we can suggest instrumental pieces or well-known tracks that carry the right tone.",
  },
  {
    q: "How quickly can a funeral slideshow be prepared?",
    a: "We understand that funeral arrangements are often made within days. We do our best to complete slideshows within 24–48 hours of receiving your photos, and we offer an express service for urgent requests. Call us on 0493 145 179 as soon as you know the date and we'll prioritise your tribute.",
  },
  {
    q: "What if some of my photos are old or damaged?",
    a: "We can help. Our photo restoration service can repair faded colours, remove creases, reduce mould and water damage, and bring clarity back to old prints. If restoration is needed, let us know when you bring the photos in and we'll assess what's possible.",
  },
  {
    q: "Will the slideshow work at any funeral venue?",
    a: "Yes. We deliver the final video as a standard MP4 file on USB, which plays on virtually any TV, projector, laptop or media player. If your funeral director or venue has specific requirements, let us know and we'll format it accordingly.",
  },
  {
    q: "Can family overseas watch the slideshow too?",
    a: "Yes. Along with the USB, we can provide a secure download link so relatives anywhere in the world can view the tribute. Many families share the link via WhatsApp or email so everyone can be part of remembering, even if they can't attend in person.",
  },
];

export default function FuneralSlideshowsPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Funeral & Memorial Slideshows Central Coast",
    description: "Memorial and funeral slideshows made on the Central Coast. Music, photo restoration and chapel-ready formats — handled gently, and quickly.",
  });

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
              alt="Koastal Kollective Funeral Slideshows Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Funeral Slideshows &amp; Memorial Tributes
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                A Dignified Tribute<br />
                <em className="text-[#007b7d] not-italic">to Those We Love.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Beautifully crafted funeral slideshows and memorial video tributes on the Central Coast and Lake Macquarie. We handle your photographs with care, set them to meaningful music, and create something the whole family can treasure forever.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="#contact"
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  Discuss Your Tribute
                </a>
                <a
                  href={slideshowShopUrl}
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                  aria-label="Order a funeral slideshow in our online shop"
                >
                  <Heart className="h-4 w-4" />
                  Order a Slideshow
                </a>
                <a
                  href="tel:+61493145179"
                  className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
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
          src="/images/memorial-candles.webp"
          alt="Warm memorial candlelit scene with photographs"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── Intro ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-8 text-base md:text-lg text-gray-700 leading-relaxed text-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Losing Someone Is Never Easy.
            </h2>
            <p>
              When a loved one passes, the days that follow are some of the hardest anyone will ever face. Between organising the service, notifying family, making arrangements and carrying grief, there is so much to do — and so little energy to do it. Creating a funeral slideshow to honour their life can feel like one more overwhelming task on an already unbearable list. That's where we come in.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              A Slideshow That Honors Their Story.
            </h2>
            <p>
              At Koastal Kollective, we create funeral slideshows and memorial video tributes with the same care and respect we would give our own family. We take your photographs — however old, faded or fragile — and transform them into a flowing, dignified presentation set to music that meant something to them. The result is a tribute that celebrates a life, comforts those who remain, and becomes a keepsake the family will hold onto for years to come.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Local, Compassionate and Here When You Need Us.
            </h2>
            <p>
              We're not a faceless online service. We're Aaron and Larissa — local technicians in Mannering Park who understand how personal this is. You can bring your photos to us in person, talk through what you'd like, and trust that we'll treat every image and every memory with the sensitivity it deserves. Call{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a>{" "}
              at any time — we answer, we listen, and we help.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Slideshow image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/slideshow-montage.webp"
              alt="Elegant photo slideshow montage on a screen"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            A flowing, elegant tribute — set to the music that meant the most.
          </p>
        </div>
      </section>

      {/* ─── What We Create ─── */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Create</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Every Slideshow Is Made With Care</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              Each tribute is crafted individually — no templates, no shortcuts. Just your memories, handled with respect.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, body }) => (
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
            Their Photos Deserve to Be Seen. Their Story Deserves to Be Told.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            A funeral slideshow is more than a presentation — it's a final gift to the person who has passed, and a source of comfort for everyone who loved them. Let us help you create something beautiful, dignified and unforgettable.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={slideshowShopUrl}
              className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-8 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
              aria-label="Order a funeral slideshow in our online shop"
            >
              <Heart className="h-4 w-4" />
              Order a Slideshow
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

      {/* ─── Family memory image ─── */}
      <section className="py-10 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4">
          <div className="rounded-2xl overflow-hidden shadow-md">
            <img
              src="/images/family-memory.webp"
              alt="Warm family memory photograph"
              className="w-full h-64 md:h-80 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            Every photograph holds a memory worth preserving.
          </p>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="process" className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">The Process</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">How It Works</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              We keep it simple, gentle and respectful. You don't need to know anything about video editing.
            </p>
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
            <p className="font-bold text-lg mb-1">Express Service Available</p>
            <p className="text-white/80 text-sm">
              Funerals are often arranged quickly. We offer a 24–48 hour turnaround when time is short. Call us as soon as you have a date.
            </p>
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
