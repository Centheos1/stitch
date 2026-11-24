import { Link, useLocation, useSearch } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { ShoppingBag, Menu, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShopPriceFilters } from "@/components/ShopPriceFilters";
import { StitchWordmark } from "@/components/layout/StitchWordmark";

export function Navbar() {
  const [location, navigate] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const searchQuery = location === "/shop" ? searchParams.get("search") ?? "" : "";
  const cartCount = useCart((state) => state.getCartCount());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  function updateSearch(query: string) {
    const params = location === "/shop" ? new URLSearchParams(searchParams) : new URLSearchParams();
    if (query) params.set("search", query);
    else params.delete("search");
    const nextSearch = params.toString();
    navigate(nextSearch ? `/shop?${nextSearch}` : "/shop", { replace: location === "/shop" });
  }

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !mobileMenuRef.current?.contains(event.target) &&
        !mobileMenuToggleRef.current?.contains(event.target)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, [mobileMenuOpen]);

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
                src="/images/a7743f4f390fa640fca3080b6c24866bd29d883428d06bd008b09edd6ee26a20.png"
                alt="STITCH Logo" 
                className="h-12 w-auto object-contain transition-transform group-hover:scale-105 sm:h-16"
              />
              <StitchWordmark className="font-display text-2xl font-bold whitespace-nowrap" />
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
          <div className="flex items-center gap-1 sm:gap-4">
            <Button
              ref={searchToggleRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Search products"
              aria-expanded={searchOpen}
              aria-controls={searchOpen ? "header-search" : undefined}
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOpen(!searchOpen);
              }}
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Link href="/cart" className="relative group p-1 sm:p-2">
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
              ref={mobileMenuToggleRef}
              variant="ghost"
              size="icon"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => {
                setSearchOpen(false);
                setMobileMenuOpen(!mobileMenuOpen);
              }}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div id="header-search" role="search" className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
          <div className="mx-auto rounded-3xl border border-border bg-white p-4 shadow-sm md:w-[calc(100%_-_2in)]">
            <label htmlFor="header-search-input" className="mb-3 block font-display text-lg font-bold">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="header-search-input"
                type="search"
                autoFocus
                placeholder="Search items..."
                className="rounded-xl border-border bg-background pl-10 focus-visible:ring-[#36B960]"
                value={searchQuery}
                onChange={(event) => updateSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSearchOpen(false);
                    searchToggleRef.current?.focus();
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div ref={mobileMenuRef} className="absolute left-0 right-0 top-full z-50 max-h-[calc(100vh-5rem)] overflow-y-auto border-t border-border bg-white p-4 shadow-xl animate-in slide-in-from-top-4 md:left-auto md:right-8 md:mt-2 md:w-[min(24rem,calc(100vw-4rem))] md:rounded-2xl md:border">
          <nav className="flex flex-col gap-4 md:hidden">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-lg font-semibold p-2 rounded-xl transition-colors ${
                  location === link.href
                    ? "bg-[#36B960] text-[#14532D]"
                    : "text-foreground hover:bg-[#36B960] hover:text-[#14532D]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 border-t border-border pt-4 md:mt-0 md:border-t-0 md:pt-0">
            <ShopPriceFilters idPrefix="mobile-shop-price" />
          </div>
        </div>
      )}
    </header>
  );
}
