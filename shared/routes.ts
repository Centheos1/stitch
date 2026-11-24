import { z } from "zod";
import { insertProductSchema, insertOrderSchema, productSchema, orderSchema } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

const contactInput = z.object({
  email: z.string().trim().max(254).email("Enter a valid email address."),
  message: z.string().trim().min(1, "Enter a message.").max(10000, "Use 10,000 characters or fewer."),
});

export const api = {
  contact: {
    submit: {
      method: "POST" as const,
      path: "/api/contact" as const,
      input: contactInput,
    },
    report: {
      method: "POST" as const,
      path: "/api/contact/report" as const,
      input: contactInput.extend({
        page: z.string().max(500).startsWith("/"),
      }),
    },
  },
  products: {
    list: {
      method: "GET" as const,
      path: "/api/products" as const,
      input: z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
      responses: {
        200: z.array(productSchema),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/products/:id" as const,
      responses: {
        200: productSchema,
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/products" as const,
      input: insertProductSchema,
      responses: {
        201: productSchema,
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/products/:id" as const,
      input: insertProductSchema.partial(),
      responses: {
        200: productSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/products/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  orders: {
    create: {
      method: "POST" as const,
      path: "/api/orders" as const,
      input: insertOrderSchema.omit({ totalAmount: true }).extend({
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive().safe(),
            options: z.array(z.object({
              name: z.string(),
              choice: z.string(),
            })).refine(
              (options) => new Set(options.map(({ name }) => name)).size === options.length,
              "Choose one option per group.",
            ).optional(),
          }),
        ).min(1).max(99, "An order can contain up to 99 cart lines."),
      }),
      responses: {
        201: orderSchema,
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ProductInput = z.input<typeof api.products.create.input>;
export type ProductResponse = z.infer<typeof api.products.create.responses[201]>;
export type OrderInput = z.infer<typeof api.orders.create.input>;
export type OrderResponse = z.infer<typeof api.orders.create.responses[201]>;
