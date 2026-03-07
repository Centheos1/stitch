import { Mail, MapPin, Sparkles } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="font-display text-5xl font-bold mb-4">Say Hello! 👋</h1>
          <p className="text-lg text-muted-foreground">We'd love to hear from you. Drop us a line.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-10 rounded-[2.5rem] border border-border shadow-sm text-center hover:shadow-xl transition-all">
            <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
              <Mail className="h-8 w-8" />
            </div>
            <h3 className="font-display text-2xl font-bold mb-2">Email Us</h3>
            <p className="text-muted-foreground mb-4">For questions, custom orders, or just to say hi!</p>
            <a href="mailto:hello@stihandmade.com" className="font-bold text-xl text-primary hover:underline">
              hello@stihandmade.com
            </a>
          </div>

          <div className="bg-white p-10 rounded-[2.5rem] border border-border shadow-sm text-center hover:shadow-xl transition-all">
            <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="font-display text-2xl font-bold mb-2">Social Magic</h3>
            <p className="text-muted-foreground mb-4">Follow our crafting journey and see behind the scenes.</p>
            <p className="font-bold text-xl text-accent-foreground text-green-600 cursor-pointer hover:underline">
              @stihandmade
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
