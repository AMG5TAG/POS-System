import SocialLinks from "@/components/SocialLinks";

// The site footer, shared by every page.
//
// Previously hand-copied into each page, which let them drift: the operating
// hours, the social row and the brand name all had to be changed in ~28 places
// and some copies were missed. One definition now.
export default function SiteFooter() {
  return (
    <footer className="bg-white text-gray-900 py-12 border-t border-gray-200">
      <div className="max-w-3xl mx-auto px-4 text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/images/logo.png"
            alt="Koastal Kollective logo — family-run computer repairs Central Coast & Lake Macquarie"
            title="Koastal Kollective"
            className="h-24 w-auto"
          />
        </div>

        {/* Social Links */}
        <SocialLinks />

        {/* Operating Hours */}
        <div className="space-y-1 text-sm">
          <p className="font-bold text-base">Operating Hours</p>
          <p><span className="font-bold">Monday:</span> 10am to 2:00pm</p>
          <p><span className="font-bold">Tuesday to Friday:</span> 10am to 5pm</p>
          <p><span className="font-bold">Saturday and Sunday:</span> Closed</p>
          <p><span className="font-bold">Public Holidays:</span> Closed</p>
          <p>
            <span className="font-bold">Call:</span>{" "}
            <a
              href="tel:+61493145179"
              className="font-bold hover:text-[#007b7d] transition-colors"
            >
              0493 145 179
            </a>
          </p>
        </div>

        {/* ABN & Copyright */}
        <p className="text-sm text-gray-600">
          <span className="font-bold">ABN:</span> 45647467738 © Copyright {new Date().getFullYear()}. All Rights Reserved.
        </p>

        {/* Designed & Hosted */}
        <p className="text-sm text-gray-500">
          Proudly Australian. 🇦🇺 Designed and Hosted by{" "}
          <a
            href="https://koastal.com.au"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-gray-700 hover:text-[#007b7d] transition-colors"
          >
            Koastal Kollective – Web Design, Software and App Development
          </a>
        </p>
      </div>
    </footer>
  );
}
