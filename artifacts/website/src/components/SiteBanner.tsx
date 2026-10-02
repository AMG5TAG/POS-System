import { useState } from "react";

/* The promotional banner shown under the hero on the home page and the
   Website Design page: Banner.jpg in object storage, served live by the API
   (/api/site-banner.jpg), so swapping the file in storage changes it with no
   publish. If the file is gone the section hides itself rather than showing
   a broken image. `href` makes it a link — leave it off on the page the
   banner would link to. */
export default function SiteBanner({ href }: { href?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const img = (
    <img
      src="/api/site-banner.jpg"
      alt="Get a new website — Koastal Kollective website design offer. Call 0493 145 179."
      width={1920}
      height={600}
      className="block w-full h-auto"
      onError={() => setFailed(true)}
    />
  );
  return (
    <section className="bg-gray-50 border-b border-gray-100">
      {href ? (
        <a href={href} className="block" aria-label="Website design offer — find out more">{img}</a>
      ) : img}
    </section>
  );
}
