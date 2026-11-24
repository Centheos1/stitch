import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Contact() {
  const contact = api.contact.submit;
  const send = useMutation({
    mutationFn: async (data: FormData) => {
      const input = contact.input.safeParse({
        email: data.get("email"),
        message: data.get("message"),
      });
      if (!input.success) {
        throw new Error(input.error.issues[0].message);
      }
      const response = await fetch(contact.path, {
        method: contact.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      if (response.status !== 204) {
        throw new Error("We couldn't send your message. Please try again.");
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!send.isPending) {
      send.mutate(new FormData(form), { onSuccess: () => form.reset() });
    }
  }

  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="font-display text-5xl font-bold mb-4">Say Hello!</h1>
          <p className="text-lg text-muted-foreground">We'd love to hear from you.</p>
        </div>

        <form onSubmit={submit} className="mx-auto max-w-xl rounded-[2.5rem] border border-border bg-white p-6 shadow-sm sm:p-10">
          <fieldset disabled={send.isPending} className="space-y-5">
            <legend className="mb-5 font-display text-2xl font-bold">Send us a message</legend>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email address</Label>
              <Input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} className="h-12 rounded-xl focus-visible:ring-[#36B960]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea id="contact-message" name="message" rows={7} required maxLength={10000} className="rounded-xl focus-visible:ring-[#36B960]" />
            </div>
            <Button type="submit" size="lg" className="w-full rounded-xl border-[#36B960] bg-[#36B960] text-foreground focus-visible:ring-[#36B960] sm:w-auto">
              {send.isPending ? "Sending…" : "Send message"}
            </Button>
          </fieldset>
          {send.isSuccess && (
            <p role="status" className="mt-5 text-sm text-green-800">Thanks for reaching out! We'll reply by email.</p>
          )}
          {send.isError && (
            <p role="alert" className="mt-5 border-l-2 border-[#36B960] pl-3 text-sm text-foreground">{send.error.message}</p>
          )}
        </form>
      </div>
    </div>
  );
}
