import { Link } from "wouter";
import { useProducts } from "@/hooks/use-products";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Gift } from "lucide-react";
import { motion } from "framer-motion";

const CATEGORY_META: Record<string, { color: string; icon: string }> = {
  "accessories":          { color: "bg-transparent border-2 border-[#60A5FA]", icon: "cream-bow-image" },
  "animals":              { color: "bg-[#D11C30]", icon: "🦒" },
  "bags":                 { color: "bg-[#FFA06A]", icon: "👜" },
  "hair clips":           { color: "bg-[#FFD93D]", icon: "🎀" },
  "christmas decorations":{ color: "bg-transparent border-2 border-[#36B960]", icon: "stocking-image" },
  "other handmade items": { color: "bg-[#A78BFA]", icon: "✨" },
};

const FALLBACK_COLORS = ["bg-[#60A5FA]","bg-[#D11C30]","bg-[#34D399]","bg-[#FBBF24]","bg-[#D11C30]"];

function getCategoryMeta(name: string, index: number) {
  const key = name.toLowerCase();
  return CATEGORY_META[key] ?? { color: FALLBACK_COLORS[index % FALLBACK_COLORS.length], icon: "🎁" };
}

export default function Home() {
  const { data: products, isLoading } = useProducts();
  const featuredProducts = products?.slice(0, 4) || [];
  const dynamicCategories = Array.from(new Set((products ?? []).map((p) => p.category))).sort();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-24 lg:pt-24 lg:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border-2 border-[#2D9950]/20 text-[#2D9950] font-bold text-sm mb-6 shadow-sm">
                <Sparkles className="h-4 w-4" />
                Handmade with Love
              </div>
              <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
                Colourful <span className="rainbow-text">Handmade</span> Treasures
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Discover unique, craft-inspired animals, bags, hair clips, and decorations made to bring joy to your everyday life.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/shop">
                  <Button size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold bg-[#2D9950] hover:bg-[#2D9950] shadow-lg shadow-[#2D9950]/25 hover:-translate-y-1 transition-all">
                    Shop Now
                  </Button>
                </Link>
                <Link href="/about">
                  <Button variant="outline" size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold border-2 border-[#2D9950] text-[#2D9950] hover:bg-[#2D9950]/5">
                    Our Story
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-secondary/20 rounded-full blur-3xl -z-10 transform translate-x-10 translate-y-10"></div>
              {/* landing page hero colorful yarn crafts */}
              <img 
                src="/images/da76d455c0fbc1cd2a27d2f046814a2428073b7e53ecb5c136349dba21317122.png"
                alt="Handmade felt nativity scene"
                className="w-full h-auto rounded-[3rem] bg-white shadow-2xl border-4 border-white rotate-3"
              />
              
            </motion.div>

          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 bg-white border-y border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">Shop by Category</h2>
            <p className="text-lg text-muted-foreground">Find exactly what makes your heart smile.</p>
          </div>

          {dynamicCategories.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {dynamicCategories.map((name, i) => {
                const { color, icon } = getCategoryMeta(name, i);
                const isStockingImage = icon === "stocking-image";
                const isCreamBowImage = icon === "cream-bow-image";
                return (
                  <Link key={name} href={`/shop?category=${encodeURIComponent(name)}`}>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="h-64 cursor-pointer group flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-background border-2 border-border hover:border-transparent hover:shadow-xl transition-all"
                    >
                      <div className={`h-20 w-20 rounded-full ${color} flex items-center justify-center text-4xl shadow-inner mb-4 group-hover:-translate-y-2 transition-transform`}>
                        {isStockingImage ? (
                          <img src="/images/86c2d1952da6364dd0a079b988f82c6b63cd0ebf2aa01b98a832506bdb6479e3.png" alt="" className="h-16 w-16 rounded-full object-cover object-[center_70%]" />
                        ) : isCreamBowImage ? (
                          <img src="/images/1f3c64870f8c96079086acadeeedcfc3444df418213f2d8ca1c5cf59ffc89ae8.png" alt="" className="h-16 w-16 rounded-full object-cover object-center" />
                        ) : icon}
                      </div>
                      <h3 className="font-display font-bold text-xl text-center">{name}</h3>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">No categories yet — add some products to get started!</div>
          )}
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="font-display text-4xl font-bold mb-2">New Arrivals</h2>
              <p className="text-lg text-muted-foreground">The latest handmade goodies straight from the workshop.</p>
            </div>
            <Link href="/shop">
              <Button variant="ghost" className="hidden sm:flex font-bold text-black hover:bg-gray-100 hover:text-black rounded-xl">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-[400px] rounded-3xl bg-muted animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-8">
              {featuredProducts.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} showCategoryBadge={false} />
              ))}
            </div>
          )}
          
          <div className="mt-8 text-center sm:hidden">
            <Link href="/shop">
              <Button variant="outline" className="font-bold text-black border-primary hover:bg-gray-100 hover:text-black rounded-xl">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
