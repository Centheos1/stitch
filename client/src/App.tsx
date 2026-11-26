import { Switch, Route } from "wouter";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCart } from "@/hooks/use-cart";
import { useProducts } from "@/hooks/use-products";
import NotFound from "@/pages/not-found";

// Layout Components
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { ProblemReportButton } from "./components/layout/ProblemReportButton";
import { ShopFiltersProvider } from "@/contexts/ShopFiltersContext";

// Pages
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import BreakpointPreview from "./pages/BreakpointPreview";

function CartStockSync() {
  const hasItems = useCart((state) => state.items.length > 0);
  const syncStock = useCart((state) => state.syncStock);
  const { data, isSuccess, isFetching } = useProducts();

  useEffect(() => {
    if (hasItems && isSuccess && !isFetching) syncStock(data);
  }, [data, hasItems, isSuccess, isFetching, syncStock]);

  return null;
}

function Router() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={Shop} />
          <Route path="/product/:id" component={ProductDetail} />
          <Route path="/cart" component={Cart} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/admin" component={Admin} />
          
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  const [location] = useLocation();

  if (import.meta.env.DEV && location === "/preview") {
    return <BreakpointPreview />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartStockSync />
        <Toaster />
        <ProblemReportButton />
        <ShopFiltersProvider>
          <Router />
        </ShopFiltersProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
