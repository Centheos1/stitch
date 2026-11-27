import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost">
      <Link href={href} aria-label={label}>
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back
      </Link>
    </Button>
  );
}
