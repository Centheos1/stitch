import { useMutation } from "@tanstack/react-query";
import { api, type OrderInput } from "@shared/routes";

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (data: OrderInput) => {
      const validated = api.orders.create.input.safeParse(data);
      if (!validated.success) {
        throw new Error(validated.error.issues[0].message);
      }
      const res = await fetch(api.orders.create.path, {
        method: api.orders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      });
      
      if (!res.ok) {
        if (res.status === 400 || res.status === 409 || res.status === 503) {
          const error = api.orders.create.responses[res.status].parse(await res.json());
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to create order");
      }
      
      const responseData = await res.json();
      return api.orders.create.responses[201].parse(responseData);
    },
  });
}
