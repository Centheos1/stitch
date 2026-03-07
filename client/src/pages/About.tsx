export default function About() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-[3rem] p-8 sm:p-16 shadow-xl border-2 border-border text-center overflow-hidden relative">
          
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

          <h1 className="font-display text-5xl font-bold mb-8 rainbow-text relative z-10">Our Story</h1>
          
          <div className="prose prose-lg mx-auto text-muted-foreground relative z-10">
            <p className="lead text-2xl font-medium text-foreground mb-8">
              Welcome to STITCH, where every stitch, cut, and bead is placed with love.
            </p>
            
            <p className="mb-6">
              We started as a small passion project on a kitchen table, creating little stuffed animals for friends and family. The smiles those handmade gifts brought were so infectious that we decided to share them with the world.
            </p>
            
            <p className="mb-6">
              Today, STITCH represents a colorful collection of handmade bags, quirky hair clips, festive decorations, and our signature stuffed animals. We believe that the things you surround yourself with should bring you joy and a splash of color.
            </p>
            
            <div className="my-12 p-8 bg-secondary/10 rounded-3xl border border-secondary/30">
              <h3 className="font-display text-2xl font-bold text-secondary-foreground mb-4">Our Promise</h3>
              <p className="m-0">
                Quality materials, playful designs, and 100% handcrafted authenticity. We don't do mass production—we do magic.
              </p>
            </div>
            
            <p>
              Thank you for supporting independent crafting and adding a little piece of our heart to your home!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
