import { Link } from "wouter";
import { useProducts } from "@/hooks/use-products";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Heart, Gift } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { data: products, isLoading } = useProducts();
  const featuredProducts = products?.slice(0, 4) || [];

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
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border-2 border-primary/20 text-primary font-bold text-sm mb-6 shadow-sm">
                <Sparkles className="h-4 w-4" />
                Handmade with Love
              </div>
              <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
                Colorful <span className="rainbow-text">Handmade</span> Treasures
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Discover unique, craft-inspired animals, bags, hair clips, and decorations made to bring joy to your everyday life.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/shop">
                  <Button size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 hover:-translate-y-1 transition-all">
                    Shop Now
                  </Button>
                </Link>
                <Link href="/about">
                  <Button variant="outline" size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold border-2 border-primary text-primary hover:bg-primary/5">
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
                src="https://pixabay.com/get/g075a820d5cf41cb960edef6b236b31756127fdc972ba5bb5e0f966aa593615c5c9d4cb67b5742510503dfafad18abd1614819c3669f455ba44b7d17d79b3ebc5_1280.jpg" 
                alt="Colorful handmade crafts" 
                className="w-full h-auto rounded-[3rem] shadow-2xl border-4 border-white rotate-3"
              />
              
              <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-3xl shadow-xl border-2 border-border flex items-center gap-4 animate-bounce hover:animate-none">
                <div className="bg-red-100 p-3 rounded-2xl text-red-500">
                  <Heart className="h-8 w-8 fill-current" />
                </div>
                <div>
                  <p className="font-bold font-display text-xl">100%</p>
                  <p className="text-sm text-muted-foreground font-semibold">Handcrafted</p>
                </div>
              </div>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {[
              { name: "Animals", color: "bg-[#FF6B6B]", icon: "🦒" },
              { name: "Bags", color: "bg-[#FFA06A]", icon: "👜" },
              { name: "Hair Clips", color: "bg-[#FFD93D]", icon: "🎀" },
              { name: "Decorations", color: "bg-[#6BCB77]", icon: "✨" },
            ].map((cat, i) => (
              <Link key={cat.name} href={`/shop?category=${cat.name}`}>
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  className="cursor-pointer group flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-background border-2 border-border hover:border-transparent hover:shadow-xl transition-all"
                >
                  <div className={`h-20 w-20 rounded-full ${cat.color} flex items-center justify-center text-4xl shadow-inner mb-4 group-hover:-translate-y-2 transition-transform`}>
                    {cat.icon}
                  </div>
                  <h3 className="font-display font-bold text-xl">{cat.name}</h3>
                </motion.div>
              </Link>
            ))}
          </div>
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
              <Button variant="ghost" className="hidden sm:flex font-bold text-primary hover:bg-primary/10 rounded-xl">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-[400px] rounded-3xl bg-muted animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {featuredProducts.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          )}
          
          <div className="mt-8 text-center sm:hidden">
            <Link href="/shop">
              <Button variant="outline" className="font-bold text-primary border-primary rounded-xl">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
