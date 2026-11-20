import { Link, useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import stitchLogo from "@assets/Screenshot_2026-03-08_at_10.19.25_am_1772925583025.png";

export function Navbar() {
  const [location] = useLocation();
  const cartCount = useCart((state) => state.getCartCount());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-3 group">
              <img 
                src={stitchLogo} 
                alt="STITCH Logo" 
                className="h-12 w-12 object-cover object-left group-hover:scale-110 transition-transform rounded-xl"
              />
              <span className="font-display text-2xl font-bold rainbow-text whitespace-nowrap">STITCH</span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                className={`font-semibold text-lg transition-colors hover:text-green-800 ${
                  location === link.href ? "text-green-600" : "text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Link href="/cart" className="relative group p-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border-2 border-border shadow-sm group-hover:border-green-800/50 group-hover:shadow-md transition-all">
                <ShoppingBag className="h-5 w-5 text-foreground group-hover:text-green-800 transition-colors" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-transparent bg-green-700 font-bold text-xs text-white shadow-md transition-colors group-hover:border-green-800/50 group-hover:bg-green-700 group-hover:text-white animate-in zoom-in">
                    {cartCount}
                  </span>
                )}
              </div>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-white p-4 shadow-xl animate-in slide-in-from-top-4">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-lg font-semibold p-2 rounded-xl transition-colors ${
                  location === link.href
                    ? "bg-[#A8E3BC] text-[#14532D]"
                    : "text-foreground hover:bg-[#A8E3BC] hover:text-[#14532D]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
