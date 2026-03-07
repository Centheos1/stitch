import { HeartHandshake } from "lucide-react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-white border-t border-border mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <span className="font-display text-xl font-bold text-foreground">STI Handmade</span>
            </Link>
            <p className="text-muted-foreground max-w-sm">
              Bringing joy through colorful, craft-inspired handmade items. Every piece is made with love, care, and a sprinkle of magic.
            </p>
          </div>
          
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link href="/shop" className="text-muted-foreground hover:text-primary transition-colors">Shop All</Link></li>
              <li><Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">Our Story</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Categories</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>Animals</li>
              <li>Bags</li>
              <li>Hair Clips</li>
              <li>Decorations</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} STI Handmade. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/admin" className="text-sm hover:text-primary transition-colors">Admin Portal</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
