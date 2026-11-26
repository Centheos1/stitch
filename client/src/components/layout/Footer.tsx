import { STITCH_LOGO_PATH } from "@shared/branding";
import { Link } from "wouter";
import { useProducts } from "@/hooks/use-products";

const footerLinkClass = "text-muted-foreground transition-colors hover:text-[#36B960] active:text-[#36B960] focus-visible:text-[#36B960]";

export function Footer() {
  const { data: products } = useProducts();
  const categories = Array.from(new Set((products ?? []).map((p) => p.category))).sort();

  return (
    <footer className="bg-white border-t border-border mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="group mb-4 flex w-fit items-center">
              <img
                src={STITCH_LOGO_PATH}
                alt="STITCH Logo"
                className="h-20 w-auto rounded-lg object-contain group-hover:outline group-hover:outline-[#36B960] group-active:outline group-active:outline-[#36B960]"
              />
            </Link>
            <p className="text-muted-foreground max-w-sm">
              Bringing joy through colourful, handcrafted items. Every piece is made with love, care, and a sprinkle of magic.
            </p>
          </div>
          
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link href="/shop" className={footerLinkClass}>Shop All</Link></li>
              <li><Link href="/about" className={footerLinkClass}>Our Story</Link></li>
              <li><Link href="/contact" className={footerLinkClass}>Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Categories</h3>
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat}>
                  <Link
                    href={`/shop?category=${encodeURIComponent(cat)}&view=items`}
                    className={footerLinkClass}
                    onClick={(event) => {
                      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                        window.scrollTo({ top: 0, behavior: "instant" });
                      }
                    }}
                  >
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} STITCH. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/admin" className={`text-sm ${footerLinkClass}`}>Admin Portal</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
